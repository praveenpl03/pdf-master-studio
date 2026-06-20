const fs = require('fs');
let t = fs.readFileSync('src/app/layout/mainscreen/mainscreen.ts', 'utf8');
const NL = '\r\n';
let changes = 0;

// 1. Find the reconstructHtmlPageItem method and extract it properly
const methodStart = t.indexOf('private async reconstructHtmlPageItem(');
if (methodStart < 0) { console.log('ERROR: reconstructHtmlPageItem not found'); process.exit(1); }

// The method body is corrupted - other methods got inserted inside it.
// Let's find the TRUE end by looking for the NEXT method at the same indentation level.
const afterStart = t.slice(methodStart + 'private async reconstructHtmlPageItem('.length);
// Find `): Promise<HtmlTextItem[]> {`
const sigEnd = afterStart.indexOf('): Promise<HtmlTextItem[]> {');
if (sigEnd < 0) { console.log('ERROR: signature end not found'); process.exit(1); }

const bodyStart = methodStart + 'private async reconstructHtmlPageItem('.length + sigEnd + '): Promise<HtmlTextItem[]> {'.length;
console.log('bodyStart at', bodyStart);

// Scan for the CORRECT end: find the closing brace at depth 0
// But we need to handle the corruption. Let's find the next standalone method.
let depth = 1; // We're inside the first {
let trueEnd = bodyStart;
let found = false;

for (let i = bodyStart; i < t.length && !found; i++) {
  if (t[i] === '{') depth++;
  else if (t[i] === '}') {
    depth--;
    if (depth === 0) {
      // This is a possible end. Check if what follows is a valid continuation
      const next = t.slice(i + 1, i + 20).replace(/\r?\n\s*/, '').trim();
      // If next is another method or class end, we've gone too far
      // The real end should be followed by a newline then a new private/ method
      const afterBrace = t.slice(i + 1).replace(/^\r?\n\s*/, '');
      if (afterBrace.startsWith('private ') || afterBrace.startsWith('async ') || afterBrace.startsWith('  }\r\n') || i - methodStart < 200) {
        console.log('Found true end at', i + 1, 'method length:', i + 1 - methodStart);
        trueEnd = i + 1;
        found = true;
      }
    }
  }
}

if (!found) {
  // Fallback: look for where createHtmlEditedPdf or similar would start
  const nextMethod = t.indexOf(NL + '  private async createHtmlEditedPdf', methodStart + 100);
  if (nextMethod > 0) {
    console.log('Using fallback: next method at', nextMethod);
    trueEnd = nextMethod;
  } else {
    console.log('ERROR: could not find end of reconstructHtmlPageItem');
    process.exit(1);
  }
}

console.log('Current method body length:', trueEnd - methodStart);
const oldMethod = t.slice(methodStart, trueEnd);
console.log('Has OCR fallback comment:', oldMethod.includes('OCR fallback'));

// Build the fixed method with OCR fallback using OcrService
const fixedMethod = `  private async reconstructHtmlPageItem(
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

    // Set default properties
    extractedItems = extractedItems.map((item) => ({
      ...item,
      color: item.color ?? '#111111',
      originalColor: item.color ?? '#111111',
      backgroundColor: '#ffffff',
      textAlign: 'left' as const,
    }));

    // Use a mobile-safe render scale for background
    const rebuildScale = this.isMobileScreen()
      ? Math.min(this.effectiveHtmlBackgroundScale(), this.safePdfRenderScale(pageItem.width, pageItem.height, 1.15))
      : this.effectiveHtmlBackgroundScale();

    // Render background canvas
    const backgroundCanvas = await this.runPdfOutsideAngular(() => this.renderPageCanvas(pageItem, rebuildScale));

    // OCR fallback for scanned or image-heavy pages on mobile when text extraction is empty
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

    // Whiten text regions on the background canvas
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

t = t.slice(0, methodStart) + fixedMethod + t.slice(trueEnd);
changes++;
console.log('1. Replaced reconstructHtmlPageItem with OcrService-based fallback');

// 2. Clean up: remove OcrService static import (keep dynamic import in method)
// Check if the import is still needed
const staticImport = "import { OcrService } from '../services/pdf-ocr.service';" + NL;
if (t.includes(staticImport)) {
  t = t.replace(staticImport, '');
  changes++;
  console.log('2. Removed static OcrService import (now uses dynamic import)');
}

// 3. Verify there are no leftover createWorker imports
const tessImport = "import { createWorker, createScheduler } from 'tesseract.js';" + NL;
if (t.includes(tessImport)) {
  console.log('3. Found tesseract.js import - checking if still needed...');
  // Check if createWorker is still used
  if (!t.includes('createWorker(')) {
    t = t.replace(tessImport, '');
    changes++;
    console.log('   Removed unused tesseract.js import');
  }
}

// Clean up the _check_ocr script
try { fs.unlinkSync('_check_ocr.js'); } catch(e) {}

fs.writeFileSync('src/app/layout/mainscreen/mainscreen.ts', t, 'utf8');
console.log(NL + changes + ' changes applied.');
