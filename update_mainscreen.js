const fs = require('fs');
let content = fs.readFileSync('src/app/layout/mainscreen/mainscreen.ts', 'utf8');

// 1. Add import for PdfToHtmlConverter
const importLine = "import { FONT_CHOICES } from './fonts/font-catalog';";
const newImportLine = "import { FONT_CHOICES } from './fonts/font-catalog';\nimport { PdfToHtmlConverter } from './services/pdfconvert';";
content = content.replace(importLine, newImportLine);

// 2. Replace htmlItemsFromTextContent method with delegating version
const oldHtmlItemsMethod = content.match(/  private htmlItemsFromTextContent\([^)]+\): HtmlTextItem\[\] \{[\s\S]*?\n  \}/);
if (oldHtmlItemsMethod) {
  const newHtmlItemsMethod = `  private htmlItemsFromTextContent(content: { items: unknown[]; styles?: Record<string, PdfTextStyleLike> }, viewport: PdfViewportLike, pageId: string, links: LinkRect[] = []): HtmlTextItem[] {
    return PdfToHtmlConverter.htmlItemsFromTextContent(content, viewport, pageId, links);
  }`;
  content = content.replace(oldHtmlItemsMethod[0], newHtmlItemsMethod);
}

// 3. Simplify reconstructHtmlPageItem - remove canvas color sampling
const oldReconstruct = content.match(/private async reconstructHtmlPageItem\(\s*pdf: any,[\s\S]*?private async ocrCanvasToHtmlItems/);
if (oldReconstruct) {
  const newReconstruct = `private async reconstructHtmlPageItem(
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

    // Set default properties (no expensive canvas color sampling)
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

    // Render background canvas (visual reference only, no per-item sampling)
    const backgroundCanvas = await this.runPdfOutsideAngular(() => this.renderPageCanvas(pageItem, rebuildScale));

    // OCR fallback for scanned or image-heavy pages on mobile
    if (!extractedItems.length && this.isMobileScreen()) {
      extractedItems = await this.ocrCanvasToHtmlItems(backgroundCanvas, pageItem.id);
    }

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
}

private async ocrCanvasToHtmlItems`;
  content = content.replace(oldReconstruct[0], newReconstruct);
}

fs.writeFileSync('src/app/layout/mainscreen/mainscreen.ts', content, 'utf8');
console.log('maincreen.ts updated successfully');
console.log('New file size:', content.length);
