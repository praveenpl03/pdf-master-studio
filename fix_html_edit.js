const fs = require('fs');

const mainscreenPath = 'src/app/layout/mainscreen/mainscreen.ts';
const pdfconvertPath = 'src/app/layout/services/pdfconvert.ts';

// Read with explicit handling - Node preserves \r\n from file
let mainscreen = fs.readFileSync(mainscreenPath, 'utf8');

// Helper: match with either \r\n or \n
function r(s) { return s.replace(/\n/g, '\r\n'); }

// --- Fix 1: Add whitenTextOnCanvas method after htmlItemsFromTextContent in mainscreen.ts ---
const whitenMethod = r(`
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
`);

// Insert after htmlItemsFromTextContent method
const insertAfter = r(`  private htmlItemsFromTextContent(content: { items: unknown[]; styles?: Record<string, PdfTextStyleLike> }, viewport: PdfViewportLike, pageId: string, links: LinkRect[] = []): HtmlTextItem[] {\r\n    return PdfToHtmlConverter.htmlItemsFromTextContent(content, viewport, pageId, links);\r\n  }\r\n`);

if (!mainscreen.includes('whitenTextOnCanvas')) {
  if (mainscreen.includes(insertAfter)) {
    mainscreen = mainscreen.replace(insertAfter, insertAfter + whitenMethod);
    console.log('SUCCESS: Added whitenTextOnCanvas method');
  } else {
    console.log('WARNING: insert target not found, trying alternative');
    // Try without \r\n
    const altTarget = `  private htmlItemsFromTextContent(content: { items: unknown[]; styles?: Record<string, PdfTextStyleLike> }, viewport: PdfViewportLike, pageId: string, links: LinkRect[] = []): HtmlTextItem[] {\r\n    return PdfToHtmlConverter.htmlItemsFromTextContent(content, viewport, pageId, links);\r\n  }`;
    mainscreen = mainscreen.replace(altTarget, altTarget + whitenMethod);
    console.log('Added via alternative pattern');
  }
} else {
  console.log('SKIP: whitenTextOnCanvas already exists');
}

// --- Fix 2: Add the call to whitenTextOnCanvas in reconstructHtmlPageItem ---
if (!mainscreen.includes('whitenTextOnCanvas(backgroundCanvas')) {
  const beforeCall = r(`    const backgroundUrl = await this.canvasToBlobUrl(backgroundCanvas);\r\n    this.htmlPageBackgrounds[pageItem.id] = backgroundUrl;`);
  if (mainscreen.includes(beforeCall)) {
    mainscreen = mainscreen.replace(beforeCall, r(
      `    // Whitens text regions on the background canvas so the original PDF text\r\n    // is invisible and only the HTML text overlay is visible to the user.\r\n    this.whitenTextOnCanvas(backgroundCanvas, content, viewport, rebuildScale);\r\n\r\n    const backgroundUrl = await this.canvasToBlobUrl(backgroundCanvas);\r\n    this.htmlPageBackgrounds[pageItem.id] = backgroundUrl;`
    ));
    console.log('SUCCESS: Added whitenTextOnCanvas call');
  } else {
    console.log('WARNING: backgroundUrl call pattern not found');
  }
} else {
  console.log('SKIP: whitenTextOnCanvas call already exists');
}

fs.writeFileSync(mainscreenPath, mainscreen, 'utf8');
console.log('mainscreen.ts written, new length:', mainscreen.length);

// --- Fix 3: Improve pdfconvert.ts ---
let pdfconvert = fs.readFileSync(pdfconvertPath, 'utf8');

// The pdfconvert.ts likely also uses \r\n, let's check
const lineEnding = pdfconvert.includes('\r\n') ? '\r\n' : '\n';
function rn(s) { return s.replace(/\n/g, lineEnding); }

// Improve line clustering threshold
const old1 = rn('        const threshold = Math.max(lineSize * 0.4, run.size * 0.4, 3);');
const new1 = rn('        const threshold = Math.max(lineSize * 0.45, run.size * 0.45, 4);');
if (pdfconvert.includes(old1)) {
  pdfconvert = pdfconvert.replace(old1, new1);
  console.log('SUCCESS: Updated clustering threshold');
}

// Improve column break threshold
const old2 = rn('        const colThreshold = Math.max(lineSize * 0.8, avgCharWidth * 3);');
const new2 = rn('        const colThreshold = Math.max(lineSize * 0.8, avgCharWidth * 2.5);');
if (pdfconvert.includes(old2)) {
  pdfconvert = pdfconvert.replace(old2, new2);
  console.log('SUCCESS: Updated column threshold');
}

// Improve spacing between words in segments
const old3Pattern = pdfconvert.includes(rn("      if (text && gap > avgCharWidth * 0.35) {\r\n        text += ' '.repeat(Math.max(1, Math.min(8, Math.round(gap / avgCharWidth))));"));
if (old3Pattern) {
  pdfconvert = pdfconvert.replace(
    rn("      if (text && gap > avgCharWidth * 0.35) {\r\n        text += ' '.repeat(Math.max(1, Math.min(8, Math.round(gap / avgCharWidth))));"),
    rn("      if (text && gap > avgCharWidth * 0.3) {\r\n        const spaceCount = Math.max(1, Math.min(6, Math.round(gap / avgCharWidth)));\r\n        text += ' '.repeat(spaceCount);")
  );
  console.log('SUCCESS: Updated spacing');
} else {
  console.log('SKIP: spacing pattern not found in pdfconvert.ts');
}

fs.writeFileSync(pdfconvertPath, pdfconvert, 'utf8');
console.log('pdfconvert.ts written');
console.log('ALL DONE');
