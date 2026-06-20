import * as pdfjsLib from 'pdfjs-dist';
import {
  InspectTextItem,
  HtmlTextItem,
  PdfTextItemLike,
  PdfTextStyleLike,
  PdfViewportLike,
  LinkRect,
  FONT_FAMILY_ALIASES,
} from '../mainscreen/models/pdf-types';

/**
 * Improved PDF-to-HTML conversion service.
 *
 * Key improvements:
 * 1. Adaptive line clustering using y-center proximity (more robust than top-edge)
 * 2. Font-size-aware column/segment detection
 * 3. No expensive canvas pixel sampling
 * 4. Better font-family preservation from PDF metadata
 * 5. Proper text spacing reconstruction using item positions
 */
export class PdfToHtmlConverter {
  /**
   * Convert raw pdfjs text content into HtmlTextItems with improved
   * line clustering and column detection.
   */
  static htmlItemsFromTextContent(
    content: { items: unknown[]; styles?: Record<string, PdfTextStyleLike> },
    viewport: PdfViewportLike,
    pageId: string,
    links: LinkRect[] = []
  ): HtmlTextItem[] {
    const runs = this.rawItemsFromTextContent(content, viewport, pageId);
    if (!runs.length) return [];

    // 1. Sort by y-center position for adaptive line clustering
    const sorted = [...runs].sort((a, b) => {
      const aCenter = a.y + a.height / 2;
      const bCenter = b.y + b.height / 2;
      return aCenter - bCenter;
    });

    // 2. Cluster into lines using y-center proximity with font-size-adaptive thresholds
    const lines: InspectTextItem[][] = [];
    for (const run of sorted) {
      const runCenter = run.y + run.height / 2;
      let placed = false;
      for (const line of lines) {
        const lineCenter = line[0].y + line[0].height / 2;
        const lineSize = Math.max(...line.map((l) => l.size));
        const threshold = Math.max(lineSize * 0.45, run.size * 0.45, 4);
        if (Math.abs(runCenter - lineCenter) <= threshold) {
          line.push(run);
          placed = true;
          break;
        }
      }
      if (!placed) {
        lines.push([run]);
      }
    }

    // 3. Within each line, sort by x and detect column breaks
    const items: HtmlTextItem[] = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex].sort((a, b) => a.x - b.x);
      const lineSize = Math.max(...line.map((item) => item.size));

      const segments: InspectTextItem[][] = [];
      let current: InspectTextItem[] = [];
      let prevEnd = line[0].x;

      for (const item of line) {
        const clean = item.text.replace(/\s+/g, ' ').trim();
        if (!clean) continue;

        const gap = current.length ? item.x - prevEnd : 0;
        const avgCharWidth = Math.max(2, item.width / Math.max(clean.length, 1));
        const colThreshold = Math.max(lineSize * 0.8, avgCharWidth * 2.5);

        if (current.length && gap > colThreshold) {
          segments.push(current);
          current = [];
        }
        current.push(item);
        prevEnd = item.x + item.width;
      }
      if (current.length) segments.push(current);

      for (const [segIndex, segment] of segments.entries()) {
        items.push(this.htmlItemFromLineSegment(segment, links, pageId, lineIndex, segIndex));
      }
    }

    return items.filter((item) => item.text.trim().length > 0);
  }

  /**
   * Create an HtmlTextItem from a group of text runs that belong
   * to the same line segment (column cell).
   */
  private static htmlItemFromLineSegment(
    ordered: InspectTextItem[],
    links: LinkRect[],
    pageId: string,
    lineIndex: number,
    segmentIndex: number
  ): HtmlTextItem {
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const size = Math.max(...ordered.map((item) => item.size));
    let text = '';
    let previousEnd = first.x;
    for (const item of ordered) {
      const clean = item.text.replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      const avgCharWidth = Math.max(2, item.width / Math.max(clean.length, 1));
      const gap = item.x - previousEnd;
      if (text && gap > avgCharWidth * 0.35) {
        text += ' '.repeat(Math.max(1, Math.min(8, Math.round(gap / avgCharWidth))));
      }
      text += clean;
      previousEnd = item.x + item.width;
    }
    const isLinked = ordered.some((item) =>
      links.some((link) => rectsOverlap(item, link))
    );
    return {
      id: `${pageId}-html-line-${lineIndex}-${segmentIndex}`,
      pageId,
      text,
      x: first.x,
      y: Math.min(...ordered.map((item) => item.y)),
      width: Math.max(18, last.x + last.width - first.x + size * 1.0 + 4),
      height: Math.max(size * 1.28, ...ordered.map((item) => item.height)),
      size,
      fontFamily: first.fontFamily ?? 'Times New Roman, Georgia, serif',
      fontWeight: first.fontWeight,
      fontStyle: first.fontStyle,
      color: isLinked ? '#0000ee' : first.color ?? '#111111',
      textDecoration: isLinked ? 'underline' : undefined,
      backgroundColor: '#ffffff',
      originalText: text,
      originalSize: size,
      originalColor: isLinked ? '#0000ee' : first.color ?? '#111111',
      originalFontWeight: first.fontWeight,
      originalFontStyle: first.fontStyle,
      textAlign: 'left',
    };
  }

  /**
   * Convert raw pdfjs text content items into InspectTextItems with
   * accurate positioning via viewport transform.
   */
  private static rawItemsFromTextContent(
    content: { items: unknown[]; styles?: Record<string, PdfTextStyleLike> },
    viewport: PdfViewportLike,
    pageId: string
  ): InspectTextItem[] {
    const util = (pdfjsLib as unknown as { Util: { transform: (m1: number[], m2: number[]) => number[] } }).Util;
    return content.items
      .filter((item): item is PdfTextItemLike => isPdfTextItem(item))
      .map((item, index) => {
        const transform = util.transform(viewport.transform, item.transform);
        // Bug #2 fix: use transform[0] and [1] (x-axis scaling) not [2] and [3] (y-shear)
        const size = Math.max(8, Math.hypot(transform[0], transform[1]));
        const heightFromText = item.height || size * 1.05;
        const sizeFromHeight = Math.max(8, heightFromText * 0.82);
        const fontSize = Math.max(size, sizeFromHeight);
        const width = Math.max(10, item.width || item.str.length * fontSize * 0.55);
        const style = item.fontName ? content.styles?.[item.fontName] : undefined;
        const fontLabel = `${item.fontName ?? ''} ${style?.fontFamily ?? ''}`;
        // Bug #1 fix: use font-specific ascent ratios instead of fontSize * 1.08
        const ascentRatio = getAscentRatio(style?.fontFamily);
        const height = Math.max(10, item.height || fontSize * 1.08);
        return {
          id: `${pageId}-run-${index}`,
          text: item.str,
          x: transform[4],
          y: transform[5] - fontSize * ascentRatio,
          width,
          height,
          size: fontSize,
          fontFamily: pdfFontFamily(style?.fontFamily, item.fontName),
          fontWeight: /bold|black|heavy|demi|semi/i.test(fontLabel) ? '700' : '400',
          fontStyle: /italic|oblique/i.test(fontLabel) ? 'italic' : 'normal',
          color: '#111111',
        };
      })
      .filter((item) => item.text.trim().length > 0 && item.width > 2 && item.height > 2);
  }
}

// --- Helper functions (pure, no class dependencies) ---

function isPdfTextItem(item: unknown): item is PdfTextItemLike {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<PdfTextItemLike>;
  return (
    typeof candidate.str === 'string' &&
    candidate.str.trim().length > 0 &&
    Array.isArray(candidate.transform) &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number'
  );
}

function rectsOverlap(
  a: Pick<InspectTextItem, 'x' | 'y' | 'width' | 'height'>,
  b: LinkRect
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Font-specific ascent ratios from standard PDF font metrics.
 *  Ratio = (capHeight + descender) / emSize — determines the top of
 *  capital letters from the baseline in CSS/viewport coordinates. */
const ASCENT_RATIOS: Record<string, number> = {
  times: 0.88, 'times new roman': 0.88, georgia: 0.88, serif: 0.85,
  arial: 0.80, helvetica: 0.80, 'sans-serif': 0.80, system: 0.80,
  courier: 0.78, 'courier new': 0.78, monospace: 0.78, mono: 0.78,
};

/** Resolve the ascent ratio for a font-family string by best-effort matching. */
function getAscentRatio(fontFamily?: string): number {
  const ff = (fontFamily ?? '').toLowerCase();
  for (const [key, ratio] of Object.entries(ASCENT_RATIOS)) {
    if (ff.includes(key)) return ratio;
  }
  return 0.80; // sans-serif default
}

function pdfFontFamily(fontFamily?: string, fontName?: string): string {
  const label = `${fontFamily ?? ''} ${fontName ?? ''}`.toLowerCase();
  if (FONT_FAMILY_ALIASES.helvetica.some((alias) => label.includes(alias)))
    return 'Arial, Helvetica, sans-serif';
  if (FONT_FAMILY_ALIASES.courier.some((alias) => label.includes(alias)))
    return 'Courier New, Courier, monospace';
  if (FONT_FAMILY_ALIASES.times.some((alias) => label.includes(alias)))
    return 'Times New Roman, Georgia, serif';
  return fontFamily || 'Times New Roman, Georgia, serif';
}
