import { rgb } from 'pdf-lib';
import type { HtmlTextItem, PageItem, OverlayItem } from '../mainscreen/models/pdf-types';

// Re-export types used by the service layer
export type { PageItem, OverlayItem };

/** Pure utility functions extracted from Mainscreen for reuse and testability. */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function asBlobPart(data: Uint8Array | ArrayBuffer | string): BlobPart {
  if (typeof data === 'string' || data instanceof ArrayBuffer) return data;
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

export function downloadBlob(
  data: Blob | Uint8Array | ArrayBuffer | string,
  name: string,
  type: string
): void {
  const blob = data instanceof Blob ? data : new Blob([asBlobPart(data)], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function createId(): string {
  return crypto.randomUUID();
}

export function parseRangeText(rangeText: string): number[] {
  try {
    return [...new Set(
      rangeText.split(',')
        .flatMap(part => {
          const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
          if (!match) return [];
          const start = Math.max(1, parseInt(match[1], 10));
          const end = match[2] ? Math.max(start, parseInt(match[2], 10)) : start;
          return Array.from({ length: end - start + 1 }, (_, i) => start + i - 1);
        })
    )].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

export function hexToRgbValues(hex: string): [number, number, number] | undefined {
  const value = hex.replace('#', '');
  if (value.length < 6) return undefined;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return undefined;
  return [r, g, b];
}

export function isWhiteColor(color?: string): boolean {
  if (!color) return false;
  const c = color.toLowerCase();
  return c === '#ffffff' || c === '#fff' || c === 'white' || c === 'transparent';
}

export function isTransparentColor(color?: string): boolean {
  if (!color) return false;
  const c = color.toLowerCase();
  return c === 'transparent' || c === 'rgba(255,255,255,0)' || c === '#00000000' || c === '#fff0';
}

export function htmlFontWeight(fontWeight?: string): string {
  const value = String(fontWeight ?? '').toLowerCase();
  if (/bold|black|heavy|semibold|demi|extra|bolder/.test(value)) return '700';
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 600 ? '700' : '400';
}

/**
 * Uses an off-screen canvas to measure the width of any text string
 * using the font metrics of the user's browser.
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

/**
 * Uses an off-screen canvas to measure the width of any text string
 * using the font metrics of the user's browser, with optional fontWeight.
 */
export function getAccurateTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string = 'Helvetica, Arial, sans-serif',
  fontWeight: string = '400',
): number {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) return text.length * fontSize * 0.6; // Fallback estimate

  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const metrics = context.measureText(text);
  console.log(`Measured text width for "${text}" with font ${fontWeight} ${fontSize}px ${fontFamily}: ${metrics.width}`);
  return Math.ceil(metrics.width);
}

export function measureHtmlTextWidth(item: Pick<HtmlTextItem, 'text' | 'size' | 'fontFamily' | 'fontWeight'>): number {
  const lines = item.text.split(/\r?\n/);
  const maxWidth = Math.max(
    ...lines.map((line) => getAccurateTextWidth(
      line || ' ',
      item.size,
      item.fontFamily ?? 'Arial, sans-serif',
      htmlFontWeight(item.fontWeight),
    )),
  );
  return Math.max(1, maxWidth);
}

export function normalizeCssColor(value: string): string | undefined {
  const match = value.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return undefined;
  const r = Number(match[1]).toString(16).padStart(2, '0');
  const g = Number(match[2]).toString(16).padStart(2, '0');
  const b = Number(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export function getImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas to Blob failed'))),
      type,
      quality,
    );
  });
}

export function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          reject(new Error('Canvas to Blob conversion failed'));
        }
      },
      'image/jpeg',
      0.8,
    );
  });
}

// --- ZIP utilities ---

function zipHeader(
  signature: number,
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  offset: number,
): Uint8Array {
  const isCentral = signature === 0x02014b50;
  const header = new Uint8Array((isCentral ? 46 : 30) + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, signature, true);
  if (isCentral) {
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint32(42, offset, true);
    header.set(nameBytes, 46);
  } else {
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
  }
  return header;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

// Set of Unicode codepoints outside Latin-1 that the standard 14 PDF fonts
// (Helvetica, Times, Courier) can render via WinAnsiEncoding.
// These occupy the 0x80-0x9F C1 control positions in the encoding.
const WINANSI_EXTRA = new Set([
  0x0152, 0x0153, // OE / oe ligature
  0x0160, 0x0161, // S / s with caron
  0x0178,          // Y with diaeresis
  0x017d, 0x017e, // Z / z with caron
  0x0192,          // florin
  0x02c6,          // modifier circumflex
  0x02dc,          // small tilde
  0x2013, 0x2014, // en dash, em dash
  0x2018, 0x2019, 0x201a, // left/right/low single quotation
  0x201c, 0x201d, 0x201e, // left/right/low double quotation
  0x2020, 0x2021, 0x2022, // dagger, double dagger, bullet
  0x2026,          // ellipsis
  0x2030,          // per mille
  0x2039, 0x203a, // angle quotation marks
  0x2122,          // trademark
]);

/**
 * Check if text contains characters that the 14 standard PDF fonts
 * (Helvetica, Times, Courier) cannot render.
 *
 * These fonts only support:
 * - ASCII printable (U+0020-U+007E)
 * - Latin-1 Supplement (U+00A0-U+00FF)
 * - A handful of WinAnsi-encoded characters from outside Latin-1
 *   (OE/S-caron/Z-caron/Y-diaeresis/florin, smart quotes, dashes,
 *    dagger/bullet, per mille, trademark, some diacritics)
 *
 * Everything else — CJK, Arabic, Hebrew, Devanagari, Thai, Greek,
 * Cyrillic, Latin Extended-B, mathematical symbols, etc. — will
 * produce tofu (missing glyph boxes) or throw pdf-lib encoding errors.
 */
export function containsNonLatinChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Allow common whitespace (tab, LF, CR)
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    // Allow printable ASCII (U+0020 to U+007E)
    if (code >= 0x20 && code <= 0x7e) continue;
    // Allow Latin-1 Supplement (U+00A0 to U+00FF)
    if (code >= 0xa0 && code <= 0xff) continue;
    // Allow WinAnsi-encoded characters outside Latin-1
    if (WINANSI_EXTRA.has(code)) continue;
    // Any other character is not renderable by standard PDF fonts
    return true;
  }
  return false;
}

// --- Canvas rendering helpers ---

/**
 * Clears a canvas and resets its dimensions to 1x1 to free GPU memory.
 */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  context?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 1;
  canvas.height = 1;
}

/**
 * Paints a blank white canvas at the given scale.
 * Returns the canvas context for further drawing.
 */
export function paintBlankCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  page: { width: number; height: number },
  scale: number,
  displayZoom?: number,
): void {
  canvas.width = Math.max(1, Math.floor(page.width * scale));
  canvas.height = Math.max(1, Math.floor(page.height * scale));
  if (displayZoom !== undefined) {
    canvas.style.width = `${page.width * displayZoom}px`;
    canvas.style.height = `${page.height * displayZoom}px`;
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Creates a blank thumbnail data URL for a page.
 */
export function createBlankThumb(page: { width: number; height: number }): string {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return '';
  paintBlankCanvas(canvas, context, page, 0.24);
  return canvas.toDataURL('image/jpeg', 0.68);
}

/**
 * Limits render scale on mobile to avoid out-of-memory crashes.
 */
export function safePdfRenderScale(
  width: number,
  height: number,
  requestedScale: number,
  isMobile: boolean,
): number {
  if (!isMobile) return requestedScale;
  const maxPixels = 3_200_000;
  const maxSide = 2048;
  const pixelScale = Math.sqrt(maxPixels / Math.max(1, width * height));
  const sideScale = maxSide / Math.max(width, height, 1);
  return Math.max(0.6, Math.min(requestedScale, pixelScale, sideScale, 1.35));
}

/**
 * Returns the scale factor for HTML background canvas rendering.
 */
export function effectiveHtmlBackgroundScale(
  isMobile: boolean,
  defaultScale: number,
): number {
  if (isMobile) return Math.min(1.35, Math.max(1, window.devicePixelRatio * 0.8));
  return defaultScale;
}

/**
 * Draws an HTML text item onto a canvas context using browser font rendering.
 */
export function paintHtmlTextToCanvas(
  context: CanvasRenderingContext2D,
  item: HtmlTextItem,
  scale: number,
): void {
  context.save();
  const x = item.x * scale;
  const y = item.y * scale;
  const w = Math.max(1, item.width * scale);
  const h = Math.max(1, item.height * scale);
  const fontSize = Math.max(8, item.size * scale);
  const fontWeight = htmlFontWeight(item.fontWeight);
  const fontStyle = item.fontStyle === 'italic' ? 'italic ' : '';
  context.font = `${fontStyle}${fontWeight} ${fontSize}px ${item.fontFamily ?? 'Arial, sans-serif'}`;
  context.textBaseline = 'top';
  context.fillStyle = '#ffffff';
  context.fillRect(x, y, w, h);
  context.fillStyle = item.color ?? '#111111';
  const lines = item.text.split(/\r?\n/);
  let cursorY = y + Math.max(1, fontSize * 0.04);
  const lineHeight = fontSize * 1.06;
  for (const line of lines) {
    if (cursorY + fontSize > y + h) break;
    context.fillText(line || ' ', x + Math.max(1, fontSize * 0.1), cursorY);
    cursorY += lineHeight;
  }
  context.restore();
}

// --- HTML text export helpers ---

/**
 * Describes a rectangle that must be drawn on a PDF page to correctly
 * render an edited HTML text item.  The first rectangle is always white
 * (to mask the original PDF text underneath).  An optional second
 * rectangle carries the item's custom background colour.
 */
export interface BackgroundRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/**
 * Determine which background rectangles must be drawn on a PDF page for
 * the given HTML text item so that the original PDF text is fully
 * covered.
 *
 * The **first** rectangle is always white and covers the text area.
 * A second coloured rectangle is appended only when the item has a
 * non-white, non-transparent `backgroundColor`.
 *
 * This function is intentionally pure so it can be unit-tested without
 * mocking PDFDocument.
 */
export function computeHtmlTextBackgroundRects(
  item: HtmlTextItem,
  boxWidth: number,
  boxHeight: number,
  boxY: number,
  x: number,
  isLinkedText: boolean,
): BackgroundRect[] {
  const rects: BackgroundRect[] = [];

  // Only draw backgrounds when the item is not a purely linked
  // (underlined) text that still matches its original content.
  const shouldDraw = !isLinkedText || item.text !== item.originalText;
  if (!shouldDraw) return rects;

  // 1. White rectangle — ALWAYS drawn so the original PDF text is
  //    fully masked regardless of the item's background color.
  rects.push({
    x: x - 1,
    y: boxY - 1,
    width: boxWidth + 2,
    height: boxHeight + 2,
    color: '#ffffff',
  });

  // 2. Optional coloured background (only when non-white/non-transparent).
  const hasBackground =
    !isTransparentColor(item.backgroundColor) && !isWhiteColor(item.backgroundColor);
  if (hasBackground) {
    rects.push({
      x: x - 1,
      y: boxY - 1,
      width: boxWidth + 2,
      height: boxHeight + 2,
      color: item.backgroundColor || '#ffffff',
    });
  }

  return rects;
}

export function postProcessHtmlTextItems(items: HtmlTextItem[], pageWidth: number): HtmlTextItem[] {
  if (!items.length) return items;

  // 1. Filter out garbage: empty text, single non-alphanumeric chars, whitespace-only
  const cleaned = items.filter((item) => {
    const text = item.text.replace(/\s+/g, '').trim();
    if (text.length === 0) return false;
    // Single character that is not alphanumeric or common punctuation
    if (text.length === 1 && !/[a-zA-Z0-9\u00C0-\u024F!@#$%&*()\-+=\[\]{}<>]/.test(text)) return false;
    // Extremely small text that is likely noise (less than 4px height)
    if (item.height < 4) return false;
    // Text positioned entirely outside the page bounds (with generous margin)
    if (item.x > pageWidth + 20 && item.text.trim().length < 3) return false;
    return true;
  });

  // 2. Remove duplicates: if two items overlap heavily and have the same text,
  //    keep the one with the larger bounding box (more reliable positioning).
  const deduped: HtmlTextItem[] = [];
  for (const item of cleaned) {
    const duplicateIndex = deduped.findIndex((existing) => {
      if (existing.text !== item.text) return false;
      // Check spatial overlap: if >60% of the smaller item's area overlaps
      const overlapX = Math.max(0, Math.min(existing.x + existing.width, item.x + item.width) - Math.max(existing.x, item.x));
      const overlapY = Math.max(0, Math.min(existing.y + existing.height, item.y + item.height) - Math.max(existing.y, item.y));
      const overlapArea = overlapX * overlapY;
      const smallerArea = Math.min(existing.width * existing.height, item.width * item.height);
      return smallerArea > 0 && overlapArea / smallerArea > 0.6;
    });
    if (duplicateIndex >= 0) {
      // Keep the one with the larger bounding box
      const existing = deduped[duplicateIndex];
      if (item.width * item.height > existing.width * existing.height) {
        deduped[duplicateIndex] = item;
      }
    } else {
      deduped.push(item);
    }
  }

  // 3. Remove ghost text: lines that are suspiciously garbled.
  //    A line is considered ghost text if >40% of its characters are
  //    non-printable or unusual Unicode that doesn't appear in normal text.
  return deduped.filter((item) => {
    const text = item.text.trim();
    if (text.length < 2) return true; // Short items pass (already filtered single chars)
    let unusualCount = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // Allow ASCII printable, Latin-1, common whitespace, smart quotes, dashes
      if (code >= 0x20 && code <= 0x7e) continue;
      if (code >= 0xa0 && code <= 0xff) continue;
      if (code === 0x2013 || code === 0x2014 || code === 0x2018 || code === 0x2019 || code === 0x201c || code === 0x201d || code === 0x2026 || code === 0x2022) continue;
      unusualCount++;
    }
    return unusualCount / text.length <= 0.4;
  });
}

// --- Formatting detection helpers ---

/** Bullet/prefix characters that indicate a list item. */
const BULLET_CHARS = /^[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF\u25CB\u25A0\u25B6\u25BA\u2713\u2714\u2717\u2718\u203A\u2039\u2192\u2190\u21D2\u00BB\u00AB\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2026\u25CF\u25CB\u25A1\u25A2\u25B4\u25BE\u25C0\u25B6\u2BC8\u2BC6\u25C6\u25CA\u25C9\u25CE\u25CF\u25CB\u25B8\u25B9\u25BA\u25BB\u25C4\u25C5]/;

/** Detect if text begins with a bullet/list marker. */
export function detectListMarker(text: string): string | undefined {
  const trimmed = text.trimStart();
  // Unicode bullets
  if (BULLET_CHARS.test(trimmed.charAt(0))) {
    // Return the bullet and any trailing space/dot
    const match = trimmed.match(/^[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF\u25CB\u25A0\u25B6\u25BA\u2713\u2714\u2717\u2718\u203A\u2039\u2192\u2190\u21D2\u00BB\u00AB\u25CF\u25CB\u25A1\u25A2\u25B4\u25BE\u25C0\u25B6\u2BC8\u2BC6\u25C6\u25CA\u25C9\u25CE\u25CF\u25CB\u25B8\u25B9\u25BA\u25BB\u25C4\u25C5][.\u00A0 ]?/);
    return match ? match[0] : trimmed.charAt(0);
  }
  // ASCII bullets: -, *, +, ●, ◆, ▸, ▹, ▶
  if (/^[-*+\u25CF\u25C6\u25B8\u25B9\u25B6]/.test(trimmed)) {
    return trimmed.match(/^[-*+\u25CF\u25C6\u25B8\u25B9\u25B6][.\u00A0 ]?/)?.[0] ?? trimmed.charAt(0);
  }
  // Numbered: "1.", "1)", "(1)", "1.", "1)", "a.", "a)", "i.", "i)", etc.
  const numberedMatch = trimmed.match(/^\(?([0-9]{1,4}|[a-zA-Z]{1,4}|[ivxIVX]{1,6})[.)\]]\s/);
  if (numberedMatch) {
    return numberedMatch[0];
  }
  // Roman numerals: I., II., etc.
  const romanMatch = trimmed.match(/^(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{03})[.)\]]\s/i);
  if (romanMatch && romanMatch[0].length > 1) {
    return romanMatch[0];
  }
  return undefined;
}

/**
 * Detect heading level based on font size relative to the page's body text size.
 *
 * Strategy: find the most common (median) font size on the page as the
 * "body" size.  Any line whose size is significantly larger gets classified
 * as a heading.  A size 1.3x the body → h4, 1.5x → h3, 1.8x → h2, 2.2x+ → h1.
 */
export function detectHeadingLevel(
  item: { size: number; text: string },
  allItemSizes: number[],
): 1 | 2 | 3 | 4 | 5 | 6 | undefined {
  if (!allItemSizes.length || item.text.trim().length < 2) return undefined;
  // Median font size as body baseline
  const sorted = [...allItemSizes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const bodySize = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  if (bodySize < 4) return undefined;
  const ratio = item.size / bodySize;
  if (ratio >= 2.2) return 1;
  if (ratio >= 1.8) return 2;
  if (ratio >= 1.5) return 3;
  if (ratio >= 1.3) return 4;
  if (ratio >= 1.15) return 5;
  return undefined;
}

/**
 * Detect subscript or superscript based on vertical position relative
 * to the dominant baseline on the same line.
 *
 * A text run whose y-center is significantly above the line's median
 * y-center is superscript; significantly below is subscript.
 */
export function detectVerticalShift(
  itemY: number,
  itemHeight: number,
  siblingYCenters: number[],
): 'super' | 'sub' | undefined {
  if (siblingYCenters.length < 2) return undefined;
  const myCenter = itemY + itemHeight / 2;
  // Median y-center of siblings
  const sorted = [...siblingYCenters].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianCenter = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  const threshold = Math.max(itemHeight * 0.18, 2);
  if (myCenter < medianCenter - threshold) return 'super';
  if (myCenter > medianCenter + threshold) return 'sub';
  return undefined;
}

/**
 * Extract per-text-item fill colors from a PDF operator list.
 *
 * Walks the operator list tracking graphics state (rg operators for
 * fill color).  Each text-showing operator (Tj, TJ, ', ") is assigned
 * the most recent fill color.
 *
 * Returns an array of hex colors parallel to the text content items.
 * A value of `undefined` means no color was extracted for that item.
 */
// Define command sets for clarity
/** PDF operator codes for pdf.js v6 */
const OP = {
  // Fill color operators
  setFillRGBColor: 59,     // rg
  setFillColor: 54,        // sc
  setFillColorN: 55,       // scn
  setFillCMYKColor: 61,    // k
  setFillGray: 57,         // g
  // Text showing operators (pdf.js v6 OPS)
  showText: 44,            // Tj
  showSpacedText: 45,      // TJ
  nextLineShowText: 46,    // '
  nextLineSetSpacingShowText: 47, // "
};

export function extractTextColorsFromOperatorList(
  operatorList: { fnArray: number[]; argsArray: unknown[][] },
  textItemCount: number,
): (string | undefined)[] {
  const colors: (string | undefined)[] = new Array(textItemCount).fill(undefined);
  let currentColor = '#111111';
  let textIndex = 0;

  const { fnArray, argsArray } = operatorList;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    // DEFENSIVE CHECK: Ensure args exists and is an array
    if (!args || !Array.isArray(args)) continue;

    // Handle Fill RGB Color 'rg' (OPS 59)
    if (fn === OP.setFillRGBColor && args.length >= 3 && typeof args[0] === 'number') {
      currentColor = rgbToHex(args[0] as number, args[1] as number, args[2] as number);
    }
    // Handle Fill Gray 'g' (OPS 57)
    else if (fn === OP.setFillGray && args.length >= 1 && typeof args[0] === 'number') {
      const g = args[0] as number;
      currentColor = rgbToHex(g, g, g);
    }
    // Handle Fill CMYK 'k' (OPS 61)
    else if (fn === OP.setFillCMYKColor && args.length === 4) {
      currentColor = cmykToHex(args[0] as number, args[1] as number, args[2] as number, args[3] as number);
    }
    // Handle Fill Color 'sc' (OPS 54) - device-dependent colors
    else if (fn === OP.setFillColor && args.length >= 1) {
      if (args.length >= 3 && typeof args[0] === 'number') {
        currentColor = rgbToHex(args[0] as number, args[1] as number, args[2] as number);
      } else if (args.length === 1 && typeof args[0] === 'number') {
        const g = args[0] as number;
        currentColor = rgbToHex(g, g, g);
      }
    }
    // Handle 'scn' (OPS 55)
    else if (fn === OP.setFillColorN && args.length >= 1) {
      if (args.length >= 3 && typeof args[0] === 'number') {
        currentColor = rgbToHex(args[0] as number, args[1] as number, args[2] as number);
      } else if (args.length === 1 && typeof args[0] === 'number') {
        const g = args[0] as number;
        currentColor = rgbToHex(g, g, g);
      }
    }
    // Handle Text Showing Operators (44=Tj, 45=TJ, 46=', 47=")
    else if (fn === OP.showText || fn === OP.showSpacedText || 
             fn === OP.nextLineShowText || fn === OP.nextLineSetSpacingShowText) {
      if (textIndex < textItemCount) {
        colors[textIndex] = currentColor;
      }
      textIndex++;
    }
  }
  return colors;
}

/** Converts 0-1 CMYK values to hex */
function cmykToHex(c: number, m: number, y: number, k: number): string {
  // Using the standard conversion formula
  const r = 255 * (1 - c) * (1 - k);
  const g = 255 * (1 - m) * (1 - k);
  const b = 255 * (1 - y) * (1 - k);
  return rgbToHex(r / 255, g / 255, b / 255);
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}
/**
 * Apply formatting detection (bullets, headings, sub/superscript)
 * to an array of HtmlTextItems.  Returns new items with the optional
 * `listMarker`, `headingLevel`, and `verticalShift` fields populated.
 */
export function applyFormattingDetection(
  items: HtmlTextItem[],
): HtmlTextItem[] {
  if (!items.length) return items;
  // Collect all font sizes on this page for heading detection
  const allSizes = items.map((item) => item.size);
  // Group items by approximate y-position (same line)
  const lines: HtmlTextItem[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    const line = lines.find((l) => Math.abs(l[0].y - item.y) <= Math.max(l[0].size, item.size) * 0.5);
    if (line) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }
  return items.map((item) => {
    const marker = detectListMarker(item.text);
    const heading = detectHeadingLevel(item, allSizes);
    // Find siblings on the same line for sub/superscript detection
    const siblingLine = lines.find((l) => l.some((s) => s.id === item.id));
    const siblingYCenters = siblingLine
      ? siblingLine.map((s) => s.y + s.height / 2)
      : [];
    const verticalShift = detectVerticalShift(item.y, item.height, siblingYCenters);
    return {
      ...item,
      ...(marker ? { listMarker: marker } : {}),
      ...(heading ? { headingLevel: heading as 1 | 2 | 3 | 4 | 5 | 6 } : {}),
      ...(verticalShift ? { verticalShift } : {}),
    };
  });
}

export function createZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = zipHeader(0x04034b50, nameBytes, file.data.length, crc, offset);
    localParts.push(local, file.data);
    centralParts.push(zipHeader(0x02014b50, nameBytes, file.data.length, crc, offset));
    offset += local.length + file.data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return concatBytes([...localParts, ...centralParts, end]);
}
