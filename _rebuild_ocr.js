const fs = require('fs');
let t = fs.readFileSync('src/app/layout/mainscreen/mainscreen.ts', 'utf8');
const NL = '\r\n';

// 1. Find the full corrupted reconstructHtmlPageItem method
const ms = t.indexOf('private async reconstructHtmlPageItem(');
if (ms < 0) { console.log('ERROR: method not found'); process.exit(1); }

// Find opening brace
const ob = t.indexOf('{', ms);
if (ob < 0) { console.log('ERROR: no opening brace'); process.exit(1); }

// Find closing brace by depth counting from opening brace
let depth = 1;
let ce = ob + 1;
for (let i = ob + 1; i < t.length; i++) {
  if (t[i] === '{') depth++;
  else if (t[i] === '}') {
    depth--;
    if (depth === 0) { ce = i + 1; break; }
  }
}

console.log(`Method from ${ms} to ${ce} (${ce - ms} chars)`);

// 2. Build the clean replacement method with OCR fallback
const cleanMethod = `  private async reconstructHtmlPageItem(
  pdf: any,
  pageItem: PageItem
): Promise<HtmlTextItem[]> {
  let extractedItems: HtmlTextItem[] = [];
  
  try {
    const { viewport, content, annotations } = await this.runPdfOutsideAngular(async () => {
      const page = await pdf.getPage(pageItem.sourceIndex + 1);
      return {
        viewport: page.getViewport({ scale: 1, rotation: pageItem.rotation }),
        content: await page.getTextContent(),
        annotations: await page.getAnnotations({ intent: 'display' }),
      };
    });

    extractedItems = PdfToHtmlConverter.htmlItemsFromTextContent(
      content,
      viewport,
      pageItem.id,
      this.linkRectsFromAnnotations(annotations, viewport)
    );

    extractedItems = extractedItems.map((item) => ({
      ...item,
      color: item.color ?? '#111111',
      originalColor: item.color ?? '#111111',
      backgroundColor: '#ffffff',
      textAlign: 'left' as const,
    }));

    const rebuildScale = this.isMobileScreen()
      ? Math.min(this.effectiveHtmlBackgroundScale(), this.safePdfRenderScale(pageItem.width, pageItem.height, 1.15))
      : this.effectiveHtmlBackgroundScale();

    const backgroundCanvas = await this.runPdfOutsideAngular(() =>
      this.renderPageCanvas(pageItem, rebuildScale)
    );

    // OCR fallback for scanned / image-only pages on mobile
    if (!extractedItems.length && this.isMobileScreen()) {
      try {
        if (!this.ocrService) {
          const { OcrService } = await import('../services/pdf-ocr.service');
          this.ocrService = new OcrService();
        }
        extractedItems = await this.ocrService.recognize(backgroundCanvas, pageItem.id);
      } catch (ocrError) {
        console.warn('OCR fallback failed:', ocrError);
      }
    }

    this.whitenTextOnCanvas(backgroundCanvas, content, viewport, rebuildScale);

    const backgroundUrl = await this.canvasToBlobUrl(backgroundCanvas);
    this.htmlPageBackgrounds[pageItem.id] = backgroundUrl;

    backgroundCanvas.width = 0;
    backgroundCanvas.height = 0;

    return extractedItems;

  } catch (error) {
    console.error('Failed to reconstruct HTML page item:', error);
    delete this.htmlPageBackgrounds[pageItem.id];
    return extractedItems;
  }
}`;

// 3. Replace the corrupted method with the clean one
t = t.slice(0, ms) + cleanMethod + t.slice(ce);
console.log('Replaced reconstructHtmlPageItem with clean implementation');

// 4. Remove static OcrService import (using dynamic import now)
const staticImport = "import { OcrService } from '../services/pdf-ocr.service';";
if (t.includes(staticImport)) {
  t = t.replace(staticImport + NL, '');
  console.log('Removed static OcrService import');
}

// 5. Clean up diagnostics
try { fs.unlinkSync('_fix_ocr_final.js'); } catch(e) {}

fs.writeFileSync('src/app/layout/mainscreen/mainscreen.ts', t, 'utf8');
console.log('File saved');
