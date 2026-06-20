/** Shared PDF editing types — single source of truth */

export type OperationGroup = 'organize' | 'convert' | 'edit' | 'optimize' | 'protect' | 'analyze';
export type MenuCategoryKey = 'organize' | 'convert' | 'edit' | 'more';
export type OverlayKind = 'text' | 'rectangle' | 'signature' | 'highlight' | 'image' | 'ellipse' | 'line';
export type ToolOptionType = 'text' | 'password' | 'number' | 'range' | 'select' | 'textarea';
export type ToolOptionValue = string | number;

export interface PageItem {
  id: string;
  sourceIndex: number;
  rotation: number;
  selected: boolean;
  thumb?: string;
  width: number;
  height: number;
  blank?: boolean;
}

export interface OverlayItem {
  id: string;
  pageId: string;
  kind: OverlayKind;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  color: string;
  fillColor?: string;
  borderColor?: string;
  fillEnabled?: boolean;
  borderWidth?: number;
  opacity: number;
  imageData?: string;
  imageType?: 'png' | 'jpg';
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  locked?: boolean;
  generatedFromText?: boolean;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  rotation?: number;
}

export interface PdfTool {
  name: string;
  group: OperationGroup;
  action: string;
}

export interface ToolOptionField {
  key: string;
  label: string;
  type: ToolOptionType;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  wide?: boolean;
  options?: { label: string; value: ToolOptionValue }[];
}

export interface ToolOptionModal {
  action: string;
  title: string;
  fields: ToolOptionField[];
}

export interface FileRecord {
  name: string;
  bytes: Uint8Array<ArrayBufferLike>;
}

export interface InspectTextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  color?: string;
  textDecoration?: string;
}

export interface HtmlTextItem extends InspectTextItem {
  pageId: string;
  backgroundColor: string;
  originalText: string;
  originalSize: number;
  originalColor?: string;
  originalFontWeight?: string;
  originalFontStyle?: string;
  textAlign?: 'left' | 'center';
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  listMarker?: string;
  verticalShift?: 'super' | 'sub';
}

export interface EditorSnapshot {
  pages: PageItem[];
  overlays: OverlayItem[];
  htmlTextItems: HtmlTextItem[];
  htmlPageBackgrounds: Record<string, string>;
  activePageId: string;
  selectedOverlayId: string;
  selectedHtmlTextId: string;
}

export interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

export interface PdfTextStyleLike {
  fontFamily?: string;
}

export interface PdfViewportLike {
  transform: number[];
  convertToViewportRectangle?: (rect: number[]) => number[];
}

export interface PdfAnnotationLike {
  subtype?: string;
  annotationType?: number;
  rect?: number[];
  url?: string;
  unsafeUrl?: string;
}

export interface LinkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageHandle {
  getViewport: (options: { scale: number; rotation?: number }) => PdfViewportLike;
  getTextContent: (options?: { normalizeWhitespace?: boolean }) => Promise<{ items: unknown[]; styles?: Record<string, PdfTextStyleLike> }>;
  getAnnotations: (options?: { intent: string }) => Promise<unknown[]>;
}

export interface PdfDocumentHandle {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageHandle>;
}

export const FONT_FAMILY_ALIASES = {
  helvetica: ['helvetica', 'arial', 'sans-serif', 'sans serif'],
  times: ['times', 'times new roman', 'georgia', 'serif'],
  courier: ['courier', 'courier new', 'mono', 'monospace'],
} as const;
