const fs = require('fs');

const mainscreenPath = 'src/app/layout/mainscreen/mainscreen.ts';
let mainscreen = fs.readFileSync(mainscreenPath, 'utf8');

// Check if whitenTextOnCanvas method already exists
if (mainscreen.includes('whitenTextOnCanvas')) {
  console.log('whitenTextOnCanvas method already exists in file');
} else {
  console.log('Adding whitenTextOnCanvas method...');
  // Find the end of htmlItemsFromTextContent method
  const methodEnd = mainscreen.indexOf('private linkRectsFromAnnotations');
  if (methodEnd < 0) {
    console.error('ERROR: Could not find linkRectsFromAnnotations');
    process.exit(1);
  }
  
  // Insert whitenTextOnCanvas before linkRectsFromAnnotations
  const whitenMethod = `
  /**
   * Paints white rectangles over every text region on the rendered background
   * canvas so the original PDF text is invisible. The HTML text overlay items
   * then appear as the only visible text, eliminating double-vision artifacts.
   */
  private whitenTextOnCanvas(
    canvas: HTMLCanvasElement,
    content: { items: unknown[]; styles?: Record<string, PdfTextStyleLike> },
    viewport: PdfViewportLike,
    scale: number
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const util = (pdfjsLib as unknown as { Util: { transform: (m1: number[], m2: number[]) => number[] } }).Util;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (const raw of content.items) {
      if (!this.isPdfTextItem(raw)) continue;
      const item = raw as PdfTextItemLike;
      const clean = item.str.replace(/\\s+/g, ' ').trim();
      if (!clean) continue;
      const transform = util.transform(viewport.transform, item.transform);
      const size = Math.max(8, Math.hypot(transform[2], transform[3]));
      const height = Math.max(10, item.height || size * 1.08);
      const width = Math.max(10, item.width || clean.length * size * 0.55);
      const x = transform[4] * scale;
      const y = (transform[5] - height) * scale;
      const w = width * scale;
      const h = height * scale;
      const padY = Math.max(1, h * 0.08);
      ctx.fillRect(x - 1, y - padY, w + 2, h + padY * 2);
    }
    ctx.restore();
  }

`;
  mainscreen = mainscreen.slice(0, methodEnd) + whitenMethod + mainscreen.slice(methodEnd);
  console.log('Added whitenTextOnCanvas method');
}

// Add call to whitenTextOnCanvas in reconstructHtmlPageItem
if (!mainscreen.includes('whitenTextOnCanvas(backgroundCanvas')) {
  console.log('Adding whitenTextOnCanvas call...');
  // Find the exact position to insert the call - before canvasToBlobUrl
  const insertBefore = '    const backgroundUrl = await this.canvasToBlobUrl(backgroundCanvas);';
  const idx = mainscreen.indexOf(insertBefore);
  if (idx < 0) {
    console.error('ERROR: Could not find canvasToBlobUrl call');
    process.exit(1);
  }
  const callBlock = `    // Whitens text regions on the background canvas so the original PDF text
    // is invisible and only the HTML text overlay is visible to the user.
    this.whitenTextOnCanvas(backgroundCanvas, content, viewport, rebuildScale);

`;
  mainscreen = mainscreen.slice(0, idx) + callBlock + mainscreen.slice(idx);
  console.log('Added whitenTextOnCanvas call');
} else {
  console.log('whitenTextOnCanvas call already exists');
}

fs.writeFileSync(mainscreenPath, mainscreen, 'utf8');
console.log('mainscreen.ts saved. Size:', mainscreen.length);
