import { describe, it, expect } from 'vitest';
import {
  computeHtmlTextBackgroundRects,
  isWhiteColor,
  isTransparentColor,
  hexToRgbValues,
  parseRangeText,
  containsNonLatinChars,
  htmlFontWeight,
  type BackgroundRect,
} from './pdf-utils';
import type { HtmlTextItem } from '../mainscreen/models/pdf-types';

// ---------------------------------------------------------------------------
// Helper: build a minimal HtmlTextItem with sensible defaults
// ---------------------------------------------------------------------------
function makeItem(overrides: Partial<HtmlTextItem> = {}): HtmlTextItem {
  return {
    id: 'test-item-1',
    pageId: 'page-1',
    text: 'Hello world',
    x: 10,
    y: 20,
    width: 200,
    height: 24,
    size: 12,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontWeight: '400',
    fontStyle: 'normal',
    color: '#111111',
    backgroundColor: '#ffffff',
    originalText: 'Hello world',
    originalSize: 12,
    originalColor: '#111111',
    originalFontWeight: '400',
    originalFontStyle: 'normal',
    textAlign: 'left',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeHtmlTextBackgroundRects — the core fix under test
// ---------------------------------------------------------------------------
describe('computeHtmlTextBackgroundRects', () => {
  const PAGE_HEIGHT = 842;

  it('regression: always covers original text even when backgroundColor is white (#ffffff)', () => {
    // This is the exact bug scenario: before the fix, a white backgroundColor
    // caused hasBackground=false, so the white masking rectangle was skipped
    // and original text bled through behind edited text.
    const item = makeItem({ text: 'Edited text', backgroundColor: '#ffffff' });
    const boxWidth = 200;
    const boxHeight = 24;
    const boxY = PAGE_HEIGHT - 20 - 24;
    const x = 10;
    const isLinkedText = false;

    const rects = computeHtmlTextBackgroundRects(item, boxWidth, boxHeight, boxY, x, isLinkedText);

    // Exactly 1 rectangle: the white mask (no colored overlay since bg is white)
    expect(rects).toHaveLength(1);
    expect(rects[0].color).toBe('#ffffff');
    // Dimensions must cover the text area (with 1px padding)
    expect(rects[0].x).toBe(x - 1);
    expect(rects[0].y).toBe(boxY - 1);
    expect(rects[0].width).toBe(boxWidth + 2);
    expect(rects[0].height).toBe(boxHeight + 2);
  });

  it('returns white + colored rectangles when backgroundColor is non-white', () => {
    const item = makeItem({ text: 'Highlighted', backgroundColor: '#ffff00' });
    const rects = computeHtmlTextBackgroundRects(item, 200, 24, 800, 10, false);

    expect(rects.length).toBe(2);
    expect(rects[0].color).toBe('#ffffff');
    expect(rects[1].color).toBe('#ffff00');
  });

  it('does not draw any rectangle for unchanged linked text', () => {
    const item = makeItem({
      text: 'Original text',
      originalText: 'Original text',
      textDecoration: 'underline',
    });
    const rects = computeHtmlTextBackgroundRects(item, 200, 24, 800, 10, true);

    expect(rects).toHaveLength(0);
  });

  it('draws white rectangle for linked text when content has changed', () => {
    const item = makeItem({
      text: 'New link text',
      originalText: 'Old link text',
      textDecoration: 'underline',
    });
    const rects = computeHtmlTextBackgroundRects(item, 200, 24, 800, 10, true);

    expect(rects.length).toBeGreaterThanOrEqual(1);
    expect(rects[0].color).toBe('#ffffff');
  });

  it('returns white rectangle even when backgroundColor is white (#ffffff)', () => {
    const item = makeItem({ backgroundColor: '#ffffff' });
    const rects = computeHtmlTextBackgroundRects(item, 100, 16, 500, 50, false);

    // Exactly one rectangle (white only — no colored overlay for white bg)
    expect(rects).toHaveLength(1);
    expect(rects[0].color).toBe('#ffffff');
  });

  it('returns white rectangle when backgroundColor is transparent', () => {
    const item = makeItem({ backgroundColor: 'transparent' });
    const rects = computeHtmlTextBackgroundRects(item, 100, 16, 500, 50, false);

    expect(rects).toHaveLength(1);
    expect(rects[0].color).toBe('#ffffff');
  });

  it('returns white + colored for rgba background that is not fully transparent', () => {
    const item = makeItem({ backgroundColor: 'rgba(255,0,0,0.5)' });
    const rects = computeHtmlTextBackgroundRects(item, 100, 16, 500, 50, false);

    expect(rects).toHaveLength(2);
    expect(rects[0].color).toBe('#ffffff');
    expect(rects[1].color).toBe('rgba(255,0,0,0.5)');
  });

  it('returns two rectangles for empty backgroundColor (hasBackground is true)', () => {
    const item = makeItem({ backgroundColor: '' });
    const rects = computeHtmlTextBackgroundRects(item, 100, 16, 500, 50, false);

    // Empty string is not white/transparent, so hasBackground is true
    // producing two rects: white mask + fallback white (#ffffff)
    expect(rects).toHaveLength(2);
    expect(rects[0].color).toBe('#ffffff');
    expect(rects[1].color).toBe('#ffffff'); // item.backgroundColor || '#ffffff'
  });

  it('rectangle coordinates include 1px padding around the text area', () => {
    const item = makeItem();
    const rects = computeHtmlTextBackgroundRects(item, 150, 20, 600, 30, false);
    const r = rects[0];

    // x-1, y-1, width+2, height+2
    expect(r.x).toBe(29);
    expect(r.y).toBe(599);
    expect(r.width).toBe(152);
    expect(r.height).toBe(22);
  });
});

// ---------------------------------------------------------------------------
// isWhiteColor / isTransparentColor — used by the rectangle logic
// ---------------------------------------------------------------------------
describe('isWhiteColor', () => {
  it('returns true for #ffffff', () => expect(isWhiteColor('#ffffff')).toBe(true));
  it('returns true for #fff', () => expect(isWhiteColor('#fff')).toBe(true));
  it('returns true for white', () => expect(isWhiteColor('white')).toBe(true));
  it('returns true for transparent (treated as white background)', () => expect(isWhiteColor('transparent')).toBe(true));
  it('returns false for #000000', () => expect(isWhiteColor('#000000')).toBe(false));
  it('returns false for undefined', () => expect(isWhiteColor(undefined)).toBe(false));
});

describe('isTransparentColor', () => {
  it('returns true for transparent', () => expect(isTransparentColor('transparent')).toBe(true));
  it('returns true for rgba(255,255,255,0)', () => expect(isTransparentColor('rgba(255,255,255,0)')).toBe(true));
  it('returns false for #ffffff', () => expect(isTransparentColor('#ffffff')).toBe(false));
  it('returns false for undefined', () => expect(isTransparentColor(undefined)).toBe(false));
});

// ---------------------------------------------------------------------------
// hexToRgbValues
// ---------------------------------------------------------------------------
describe('hexToRgbValues', () => {
  it('parses #ff0000 to [255, 0, 0]', () => {
    expect(hexToRgbValues('#ff0000')).toEqual([255, 0, 0]);
  });
  it('parses #00ff00 to [0, 255, 0]', () => {
    expect(hexToRgbValues('#00ff00')).toEqual([0, 255, 0]);
  });
  it('returns undefined for invalid hex', () => {
    expect(hexToRgbValues('not-a-color')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseRangeText
// ---------------------------------------------------------------------------
describe('parseRangeText', () => {
  it('parses single page', () => {
    expect(parseRangeText('3')).toEqual([2]);
  });
  it('parses range', () => {
    expect(parseRangeText('1-3')).toEqual([0, 1, 2]);
  });
  it('parses mixed range and pages', () => {
    expect(parseRangeText('1-3, 8')).toEqual([0, 1, 2, 7]);
  });
  it('deduplicates', () => {
    expect(parseRangeText('1, 1, 2')).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// containsNonLatinChars
// ---------------------------------------------------------------------------
describe('containsNonLatinChars', () => {
  it('returns false for pure ASCII', () => {
    expect(containsNonLatinChars('Hello World')).toBe(false);
  });
  it('returns false for Latin-1 characters', () => {
    expect(containsNonLatinChars('café')).toBe(false);
  });
  it('returns true for CJK characters', () => {
    expect(containsNonLatinChars('日本語')).toBe(true);
  });
  it('returns true for emoji', () => {
    expect(containsNonLatinChars('🎉')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// htmlFontWeight
// ---------------------------------------------------------------------------
describe('htmlFontWeight', () => {
  it('returns 700 for bold', () => expect(htmlFontWeight('bold')).toBe('700'));
  it('returns 700 for 700', () => expect(htmlFontWeight('700')).toBe('700'));
  it('returns 400 for normal', () => expect(htmlFontWeight('normal')).toBe('400'));
  it('returns 400 for undefined', () => expect(htmlFontWeight(undefined)).toBe('400'));
});
