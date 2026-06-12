import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, ViewChild, ViewChildren, QueryList } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts, degrees, rgb, PDFFont } from 'pdf-lib';
import { FONT_CHOICES } from './fonts/font-catalog';

type OperationGroup = 'organize' | 'convert' | 'edit' | 'optimize' | 'protect' | 'analyze';
type MenuCategoryKey = 'organize' | 'convert' | 'edit' | 'more';
type OverlayKind = 'text' | 'rectangle' | 'signature' | 'highlight' | 'image' | 'ellipse' | 'line';

interface PageItem {
  id: string;
  sourceIndex: number;
  rotation: number;
  selected: boolean;
  thumb?: string;
  width: number;
  height: number;
  blank?: boolean;
}

interface OverlayItem {
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

interface PdfTool {
  name: string;
  group: OperationGroup;
  action: string;
}

type ToolOptionType = 'text' | 'password' | 'number' | 'range' | 'select' | 'textarea';
type ToolOptionValue = string | number;

interface ToolOptionField {
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

interface ToolOptionModal {
  action: string;
  title: string;
  fields: ToolOptionField[];
}

interface FileRecord {
  name: string;
  bytes: Uint8Array<ArrayBufferLike>;
}

interface InspectTextItem {
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

interface HtmlTextItem extends InspectTextItem {
  pageId: string;
  backgroundColor: string;
  originalText: string;
  originalSize: number;
  originalColor?: string;
  originalFontWeight?: string;
  originalFontStyle?: string;
  textAlign?: 'left' | 'center';
}

interface EditorSnapshot {
  pages: PageItem[];
  overlays: OverlayItem[];
  htmlTextItems: HtmlTextItem[];
  htmlPageBackgrounds: Record<string, string>;
  activePageId: string;
  selectedOverlayId: string;
  selectedHtmlTextId: string;
}

interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

interface PdfTextStyleLike {
  fontFamily?: string;
}

interface PdfViewportLike {
  transform: number[];
  convertToViewportRectangle?: (rect: number[]) => number[];
}

interface PdfAnnotationLike {
  subtype?: string;
  annotationType?: number;
  rect?: number[];
  url?: string;
  unsafeUrl?: string;
}

interface LinkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-pdf-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './mainscreen.html',
  styleUrls: ['./mainscreen.css'],
})
export class Mainscreen implements AfterViewInit {
  @ViewChild('mainCanvas') mainCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('nativeTextLayer') nativeTextLayer?: ElementRef<HTMLDivElement>;
  @ViewChildren('thumbCanvas') thumbCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;
// Look near line 30-40 inside your mainscreen.ts class variables:
public isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  pages: PageItem[] = [];
  overlays: OverlayItem[] = [];
  extraFiles: FileRecord[] = [];
  activePageId = '';
  status = 'Open a PDF to begin.';
  fileName = 'document.pdf';
  currentBytes: Uint8Array<ArrayBufferLike> = new Uint8Array();
  busy = false;
  busyLabel = '';
  zoom = this.isMobileScreen() ? 1.0 : 1.7
  rangeText = '';
  stampText = 'APPROVED';
  watermarkText = 'Confidential';
  editText = 'New text';
  author = 'TheConvertor';
  title = 'Edited PDF';
  subject = 'PDF processed in browser';
  keywords = 'pdf, convertor, editor';
  openPassword = '';
  pdfPassword = '';
  ownerPassword = '';
  compression = 0.72;
  compressionLevel = 3;
  compressionScale = 1.15;
  jpegQuality = 0.96;
  imageExportScale = 5;
  pageNumberPosition: 'bottom' | 'top' = 'bottom';
  searchTerm = '';
  toolSearchTerm = '';
  readonly fontChoices = FONT_CHOICES;
  activeToolGroup: MenuCategoryKey | undefined;
  selectedOverlayId = '';
  textInspectMode = false;
  inspectedTextItems: InspectTextItem[] = [];
  htmlEditMode = true;
  htmlTextItems: HtmlTextItem[] = [];
  htmlPageBackgrounds: Record<string, string> = {};
  selectedHtmlTextId = '';
  shapeMenuOpen = false;
  toolOptions?: ToolOptionModal;
  toolOptionValues: Record<string, ToolOptionValue> = {};
  undoStack: EditorSnapshot[] = [];
  redoStack: EditorSnapshot[] = [];
  private dragState?: { id: string; startX: number; startY: number; originalX: number; originalY: number };
  private resizeState?: { id: string; startX: number; startY: number; originalWidth: number; originalHeight: number };
  private trackingHtmlEditId = '';
  private trackingOverlayEditId = '';
  private lastWheelPageTurn = 0;
  private readonly htmlBackgroundScale =   this.isMobileScreen() ? 1.0 : 2.4;;
  private activeRenderToken = 0;
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private activeRenderTask?: { cancel: () => void; promise: Promise<unknown> };

  constructor(private ngZone: NgZone, private changeDetector: ChangeDetectorRef) {}

  readonly toolGroups: { key: MenuCategoryKey; title: string; hint?: string }[] = [
    { key: 'organize', title: 'Organize' },
    { key: 'convert', title: 'Convert' },
    { key: 'edit', title: 'Edit' },
    { key: 'more', title: 'More', hint: 'Optimize' },
  ];

  readonly tools: PdfTool[] = [
    { name: 'Merge PDFs', group: 'organize', action: 'merge' },
    { name: 'Split selected pages', group: 'organize', action: 'splitSelected' },
    { name: 'Extract range', group: 'organize', action: 'extractRange' },
    { name: 'Delete selected', group: 'organize', action: 'deleteSelected' },
    { name: 'Duplicate selected', group: 'organize', action: 'duplicateSelected' },
    { name: 'Move selected first', group: 'organize', action: 'moveFirst' },
    { name: 'Move selected last', group: 'organize', action: 'moveLast' },
    { name: 'Reverse pages', group: 'organize', action: 'reversePages' },
    { name: 'Sort odd then even', group: 'organize', action: 'oddEven' },
    { name: 'Sort even then odd', group: 'organize', action: 'evenOdd' },
    { name: 'Rotate left', group: 'organize', action: 'rotateLeft' },
    { name: 'Rotate right', group: 'organize', action: 'rotateRight' },
    { name: 'Rotate 180', group: 'organize', action: 'rotate180' },
    { name: 'Select all', group: 'organize', action: 'selectAll' },
    { name: 'Clear selection', group: 'organize', action: 'clearSelection' },
    { name: 'Select odd pages', group: 'organize', action: 'selectOdd' },
    { name: 'Select even pages', group: 'organize', action: 'selectEven' },
    { name: 'Keep selected only', group: 'organize', action: 'keepSelected' },
    { name: 'Remove blank-like pages', group: 'organize', action: 'removeBlank' },
    { name: 'Reset from source', group: 'organize', action: 'reset' },
    { name: 'Export PDF', group: 'convert', action: 'downloadPdf' },
    { name: 'Convert page to PNG', group: 'convert', action: 'downloadPng' },
    { name: 'Convert page to JPEG', group: 'convert', action: 'downloadJpeg' },
    { name: 'PDF to Word (.docx)', group: 'convert', action: 'exportDocx' },
    { name: 'PDF to DOC', group: 'convert', action: 'exportDoc' },
    { name: 'PDF to Excel', group: 'convert', action: 'exportExcel' },
    { name: 'PDF to Text', group: 'convert', action: 'exportText' },
    { name: 'Export selected as PDFs', group: 'convert', action: 'downloadSelected' },
    { name: 'Export selected images ZIP', group: 'convert', action: 'downloadSelectedImagesZip' },
    { name: 'Export all images ZIP', group: 'convert', action: 'downloadAllImagesZip' },
    { name: 'Make booklet order', group: 'convert', action: 'booklet' },
    { name: 'A4 fit copy', group: 'convert', action: 'a4Fit' },
    { name: 'US Letter fit copy', group: 'convert', action: 'letterFit' },
    { name: 'Flatten edits', group: 'convert', action: 'downloadFlattened' },
    { name: 'Rebuild visual PDF', group: 'convert', action: 'visualRebuild' },
    { name: 'Export HTML rebuild', group: 'convert', action: 'htmlRebuildPdf' },
    { name: 'Generate watermarked PDF', group: 'convert', action: 'watermarkedPdf' },
    { name: 'Generate bookmarks', group: 'convert', action: 'generateBookmarks' },
    { name: 'Reconstruct HTML page', group: 'edit', action: 'reconstructHtml' },
    { name: 'Inspect text layer', group: 'edit', action: 'inspectText' },
    { name: 'Add text', group: 'edit', action: 'addText' },
    { name: 'Add image', group: 'edit', action: 'chooseImage' },
    { name: 'Add signature', group: 'edit', action: 'addSignature' },
    { name: 'Add highlight', group: 'edit', action: 'addHighlight' },
    { name: 'Add ellipse', group: 'edit', action: 'addEllipse' },
    { name: 'Add line', group: 'edit', action: 'addLine' },
    { name: 'Add redaction box', group: 'edit', action: 'addRedaction' },
    { name: 'Stamp page', group: 'edit', action: 'stampPage' },
    { name: 'Watermark all', group: 'edit', action: 'watermarkAll' },
    { name: 'Page numbers', group: 'edit', action: 'pageNumbers' },
    { name: 'Clear page edits', group: 'edit', action: 'clearPageEdits' },
    { name: 'Clear all edits', group: 'edit', action: 'clearAllEdits' },
    { name: 'Apply metadata', group: 'edit', action: 'metadata' },
    { name: 'Optimize structure', group: 'optimize', action: 'optimize' },
    { name: 'Compress preview export', group: 'optimize', action: 'compressedPdf' },
    { name: 'Downsample page image', group: 'optimize', action: 'downsampleActive' },
    { name: 'Remove embedded edits', group: 'optimize', action: 'clearAllEdits' },
    { name: 'Fast web save', group: 'optimize', action: 'optimize' },
    { name: 'Sanitize metadata', group: 'protect', action: 'sanitizeMetadata' },
    { name: 'Add password', group: 'protect', action: 'encryptPdf' },
    { name: 'Owner note stamp', group: 'protect', action: 'ownerStamp' },
    { name: 'Redact selected page', group: 'protect', action: 'addRedaction' },
    { name: 'Lock visual copy', group: 'protect', action: 'downloadFlattened' },
    { name: 'Read document info', group: 'analyze', action: 'docInfo' },
    { name: 'Count pages', group: 'analyze', action: 'countPages' },
    { name: 'Find page by text', group: 'analyze', action: 'findText' },
    { name: 'Audit dimensions', group: 'analyze', action: 'auditDimensions' },
    { name: 'List selected pages', group: 'analyze', action: 'listSelected' },
  ];

  async ngAfterViewInit(): Promise<void> {
    this.configureMobileRendering();
    (pdfjsLib.GlobalWorkerOptions as { workerSrc: string }).workerSrc = '/pdf.worker.mjs';
    this.thumbCanvases.changes.subscribe(() => this.queueThumbRender());
  }

  get activePage(): PageItem | undefined {
    return this.pages.find((page) => page.id === this.activePageId) ?? this.pages[0];
  }

  get selectedPages(): PageItem[] {
    return this.pages.filter((page) => page.selected);
  }

  get pageOverlays(): OverlayItem[] {
    const id = this.activePage?.id;
    return id ? this.overlays.filter((item) => item.pageId === id) : [];
  }

  get activeHtmlTextItems(): HtmlTextItem[] {
    const id = this.activePage?.id;
    return id ? this.htmlTextItems.filter((item) => item.pageId === id) : [];
  }

  get activeHtmlBackground(): string {
    const id = this.activePage?.id;
    return id ? this.htmlPageBackgrounds[id] ?? '' : '';
  }

  get selectedHtmlText(): HtmlTextItem | undefined {
    return this.htmlTextItems.find((item) => item.id === this.selectedHtmlTextId);
  }

  get selectedOverlay(): OverlayItem | undefined {
    return this.overlays.find((item) => item.id === this.selectedOverlayId);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  shapeFillColor(item: OverlayItem): string | null {
    if (item.kind === 'highlight') return item.fillColor ?? item.color;
    if (item.kind === 'rectangle' || item.kind === 'ellipse') {
      return item.fillEnabled ? item.fillColor ?? item.color : 'transparent';
    }
    return null;
  }

  shapeBorderColor(item: OverlayItem): string | null {
    return item.kind === 'rectangle' || item.kind === 'ellipse'
      ? item.borderColor ?? item.color
      : null;
  }

  shapeBorderWidth(item: OverlayItem): number | null {
    return item.kind === 'rectangle' || item.kind === 'ellipse'
      ? item.borderWidth ?? 2
      : null;
  }

  get visibleTools(): PdfTool[] {
    return this.tools;
  }

  toolsFor(group: OperationGroup): PdfTool[] {
    return this.visibleTools.filter((tool) => tool.group === group && tool.action !== 'reconstructHtml');
  }

  toolsForCategory(group: MenuCategoryKey): PdfTool[] {
    const term = this.toolSearchTerm.trim().toLowerCase();
    const base = term
      ? this.visibleTools
      : group === 'more'
      ? this.visibleTools.filter((tool) => ['optimize', 'protect', 'analyze'].includes(tool.group))
      : this.visibleTools.filter((tool) => tool.group === group);
    return base
      .filter((tool) => tool.action !== 'reconstructHtml')
      .filter((tool) => !term || tool.name.toLowerCase().includes(term) || tool.action.toLowerCase().includes(term));
  }

  get activeMenuTools(): PdfTool[] {
    return this.activeToolGroup ? this.toolsForCategory(this.activeToolGroup) : [];
  }

  activeMenuTitle(): string {
    return this.toolGroups.find((group) => group.key === this.activeToolGroup)?.title ?? 'Tools';
  }

  toggleToolMenu(group: MenuCategoryKey): void {
    this.activeToolGroup = this.activeToolGroup === group ? undefined : group;
    this.toolSearchTerm = '';
  }

  closeToolMenu(): void {
    this.activeToolGroup = undefined;
    this.toolSearchTerm = '';
  }

  async runMenuTool(action: string): Promise<void> {
    this.closeToolMenu();
    await this.run(action);
  }

  iconForGroup(group: MenuCategoryKey): string {
    const icons: Record<MenuCategoryKey, string> = {
      organize: 'fa-table-cells-large',
      convert: 'fa-right-left',
      edit: 'fa-pen-to-square',
      more: 'fa-ellipsis',
    };
    return icons[group];
  }

  @HostListener('window:resize')
  handleWindowResize(): void {
    this.fitZoomForMobile();
    if (this.currentBytes.length) this.queueActiveRender();
  }

  iconForAction(action: string): string {
    const icons: Record<string, string> = {
      merge: 'fa-object-group',
      splitSelected: 'fa-scissors',
      extractRange: 'fa-filter',
      deleteSelected: 'fa-trash',
      duplicateSelected: 'fa-copy',
      moveFirst: 'fa-angles-up',
      moveLast: 'fa-angles-down',
      reversePages: 'fa-arrow-right-arrow-left',
      oddEven: 'fa-arrow-down-1-9',
      evenOdd: 'fa-arrow-down-9-1',
      rotateLeft: 'fa-rotate-left',
      rotateRight: 'fa-rotate-right',
      rotate180: 'fa-arrows-rotate',
      selectAll: 'fa-check-double',
      clearSelection: 'fa-ban',
      selectOdd: 'fa-list-ol',
      selectEven: 'fa-list',
      keepSelected: 'fa-box-archive',
      removeBlank: 'fa-eraser',
      reset: 'fa-clock-rotate-left',
      downloadPdf: 'fa-floppy-disk',
      downloadPng: 'fa-file-image',
      downloadJpeg: 'fa-image',
      exportDocx: 'fa-file-word',
      exportDoc: 'fa-file-word',
      exportExcel: 'fa-file-excel',
      exportText: 'fa-file-lines',
      downloadSelected: 'fa-file-export',
      downloadSelectedImagesZip: 'fa-file-zipper',
      downloadAllImagesZip: 'fa-images',
      booklet: 'fa-book-open',
      a4Fit: 'fa-file-lines',
      letterFit: 'fa-file',
      downloadFlattened: 'fa-layer-group',
      visualRebuild: 'fa-wand-magic-sparkles',
      htmlRebuildPdf: 'fa-code',
      generateBookmarks: 'fa-bookmark',
      inspectText: 'fa-magnifying-glass',
      addText: 'fa-font',
      chooseImage: 'fa-image',
      addSignature: 'fa-signature',
      addHighlight: 'fa-highlighter',
      addEllipse: 'fa-circle',
      addLine: 'fa-minus',
      addRedaction: 'fa-square',
      stampPage: 'fa-stamp',
      watermarkAll: 'fa-droplet',
      watermarkedPdf: 'fa-file-shield',
      pageNumbers: 'fa-hashtag',
      clearPageEdits: 'fa-broom',
      clearAllEdits: 'fa-soap',
      metadata: 'fa-tags',
      optimize: 'fa-gauge-high',
      compressedPdf: 'fa-compress',
      downsampleActive: 'fa-minimize',
      sanitizeMetadata: 'fa-user-shield',
      encryptPdf: 'fa-lock',
      ownerStamp: 'fa-id-badge',
      docInfo: 'fa-circle-info',
      countPages: 'fa-calculator',
      findText: 'fa-search',
      auditDimensions: 'fa-ruler-combined',
      listSelected: 'fa-list-check',
    };
    return icons[action] ?? 'fa-wand-magic-sparkles';
  }

  handleViewerWheel(event: WheelEvent): void {
    if (!this.pages.length || Math.abs(event.deltaY) < 16) return;
    const shell = event.currentTarget as HTMLElement;
    const currentIndex = this.pages.findIndex((page) => page.id === this.activePageId);
    if (currentIndex < 0) return;
    const now = Date.now();
    if (now - this.lastWheelPageTurn < 420) return;

    const atBottom = shell.scrollTop + shell.clientHeight >= shell.scrollHeight - 6;
    const atTop = shell.scrollTop <= 6;
    if (event.deltaY > 0 && atBottom && currentIndex < this.pages.length - 1) {
      event.preventDefault();
      this.lastWheelPageTurn = now;
      this.setActive(this.pages[currentIndex + 1]);
      setTimeout(() => shell.scrollTop = 0);
    } else if (event.deltaY < 0 && atTop && currentIndex > 0) {
      event.preventDefault();
      this.lastWheelPageTurn = now;
      this.setActive(this.pages[currentIndex - 1]);
      setTimeout(() => shell.scrollTop = shell.scrollHeight);
    }
  }

  async loadMainFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.loadBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    input.value = '';
  }

  async addMergeFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    this.recordHistory();
    for (const file of files) {
      this.extraFiles.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    this.status = `${this.extraFiles.length} merge file(s) ready. Adding pages to workspace...`;
    input.value = '';
    await this.mergePdfs();
  }

  async run(action: string, optionsConfirmed = false): Promise<void> {
    if (!optionsConfirmed && this.openToolOptions(action)) return;
    try {
      if (this.shouldRecordHistory(action)) this.recordHistory();
      this.busy = true;
      this.busyLabel = this.busyMessageFor(action);
      switch (action) {
        case 'merge': await this.mergePdfs(); break;
        case 'splitSelected': await this.downloadSelectedAsOne(); break;
        case 'extractRange': await this.extractRange(); break;
        case 'deleteSelected': this.deleteSelectedPages(); break;
        case 'duplicateSelected': this.duplicateSelected(); break;
        case 'moveFirst': this.moveSelected(true); break;
        case 'moveLast': this.moveSelected(false); break;
        case 'reversePages': this.pages.reverse(); this.afterPageChange('Page order reversed.'); break;
        case 'oddEven': this.sortByParity(true); break;
        case 'evenOdd': this.sortByParity(false); break;
        case 'rotateLeft': this.rotateSelected(-90); break;
        case 'rotateRight': this.rotateSelected(90); break;
        case 'rotate180': this.rotateSelected(180); break;
        case 'selectAll': this.pages.forEach((page) => page.selected = true); this.status = 'All pages selected.'; break;
        case 'clearSelection': this.pages.forEach((page) => page.selected = false); this.status = 'Selection cleared.'; break;
        case 'selectOdd': this.selectParity(true); break;
        case 'selectEven': this.selectParity(false); break;
        case 'keepSelected': this.keepSelected(); break;
        case 'removeBlank': this.removeBlankLikePages(); break;
        case 'reset': await this.loadBytes(this.currentBytes, this.fileName); break;
        case 'downloadPdf': await this.downloadPdf(true, 'edited.pdf'); break;
        case 'downloadPng': await this.downloadActiveImage('image/png', 'page.png'); break;
        case 'downloadJpeg': await this.downloadActiveImage('image/jpeg', 'page.jpg', this.jpegQuality); break;
        case 'exportDocx': await this.exportDocx(); break;
        case 'exportDoc': await this.exportDoc(); break;
        case 'exportExcel': await this.exportExcel(); break;
        case 'exportText': await this.exportText(); break;
        case 'downloadSelected': await this.downloadSelectedSeparately(); break;
        case 'downloadSelectedImagesZip': await this.downloadImagesZip(this.selectedPages, 'selected-page-images.zip'); break;
        case 'downloadAllImagesZip': await this.downloadImagesZip(this.pages, 'all-page-images.zip'); break;
        case 'booklet': this.bookletOrder(); break;
        case 'a4Fit': await this.downloadFittedPdf(595.28, 841.89, 'a4-fit.pdf'); break;
        case 'letterFit': await this.downloadFittedPdf(612, 792, 'letter-fit.pdf'); break;
        case 'downloadFlattened': await this.downloadPdf(true, 'flattened.pdf'); break;
        case 'visualRebuild': await this.downloadVisualRebuildPdf(); break;
        case 'htmlRebuildPdf': await this.downloadHtmlRebuildPdf(); break;
        case 'generateBookmarks': await this.generateBookmarks(); break;
        case 'watermarkedPdf': await this.downloadWatermarkedPdf(); break;
        case 'reconstructHtml': await this.reconstructAllHtmlFromCurrentPdf(); break;
        case 'inspectText': await this.inspectTextLayer(); break;
        case 'addText': this.addOverlay('text'); break;
        case 'chooseImage': document.getElementById('imageUpload')?.click(); break;
        case 'addSignature': this.addOverlay('signature'); break;
        case 'addHighlight': this.addOverlay('highlight'); break;
        case 'addEllipse': this.addOverlay('ellipse'); break;
        case 'addLine': this.addOverlay('line'); break;
        case 'addRedaction': this.addWhiteout(); break;
        case 'stampPage': this.stampPage(); break;
        case 'watermarkAll': this.watermarkAll(); break;
        case 'pageNumbers': this.pageNumbers(); break;
        case 'clearPageEdits': this.clearPageEdits(); break;
        case 'clearAllEdits': this.overlays = []; this.status = 'All edit overlays cleared.'; break;
        case 'metadata': await this.downloadPdf(true, 'metadata-applied.pdf', true); break;
        case 'optimize': await this.downloadPdf(true, 'optimized.pdf', true); break;
        case 'compressedPdf': await this.downloadRasterPdf('compressed-preview.pdf'); break;
        case 'downsampleActive': await this.downloadActiveImage('image/jpeg', 'downsampled-page.jpg', this.compression); break;
        case 'sanitizeMetadata': await this.sanitizeMetadata(); break;
        case 'encryptPdf': await this.downloadEncryptedPdf(); break;
        case 'ownerStamp': this.stampPage(this.stampText || 'Owner copy'); break;
        case 'docInfo': await this.docInfo(); break;
        case 'countPages': this.status = `${this.pages.length} page(s) in current document.`; break;
        case 'findText': await this.findText(); break;
        case 'auditDimensions': this.auditDimensions(); break;
        case 'listSelected': this.status = this.selectedPages.length ? `Selected: ${this.selectedPages.map((p) => this.pages.indexOf(p) + 1).join(', ')}` : 'No pages selected.'; break;
      }
    } catch (error) {
      this.status = error instanceof Error ? error.message : 'Operation failed.';
    } finally {
      this.busy = false;
      this.busyLabel = '';
    }
  }

  closeToolOptions(): void {
    this.toolOptions = undefined;
    this.toolOptionValues = {};
  }

  async confirmToolOptions(): Promise<void> {
    const action = this.toolOptions?.action;
    if (!action) return;
    this.applyToolOptionValues();
    this.closeToolOptions();
    await this.run(action, true);
  }

  toolActionLabel(action: string): string {
    if (/^add|stampPage|ownerStamp|pageNumbers/i.test(action)) return 'Insert';
    if (/findText/i.test(action)) return 'Search';
    return 'Generate';
  }

  private openToolOptions(action: string): boolean {
    const fields = this.optionFieldsFor(action);
    if (!fields.length) return false;
    this.toolOptions = {
      action,
      title: this.tools.find((tool) => tool.action === action)?.name ?? 'Options',
      fields,
    };
    this.toolOptionValues = Object.fromEntries(fields.map((field) => [field.key, this.valueForOption(field.key)]));
    return true;
  }

  private optionFieldsFor(action: string): ToolOptionField[] {
    const quality: ToolOptionField = { key: 'jpegQuality', label: 'JPEG quality', type: 'range', min: 0.35, max: 1, step: 0.01 };
    const imageScale: ToolOptionField = { key: 'imageExportScale', label: 'Export resolution', type: 'range', min: 2, max: 7, step: 0.25 };
    const compression: ToolOptionField = { key: 'compression', label: 'Compression', type: 'range', min: 0.25, max: 0.95, step: 0.01 };
    const openPassword: ToolOptionField = { key: 'openPassword', label: 'Open password', type: 'password', placeholder: 'Only for locked source PDFs', wide: true };
    const compressionLevel: ToolOptionField = {
      key: 'compressionLevel',
      label: 'Compress level',
      type: 'select',
      options: [
        { label: '1 - light', value: 1 },
        { label: '2', value: 2 },
        { label: '3 - balanced', value: 3 },
        { label: '4', value: 4 },
        { label: '5 - smallest', value: 5 },
      ],
    };
    const rasterScale: ToolOptionField = { key: 'compressionScale', label: 'Raster scale', type: 'range', min: 0.55, max: 2, step: 0.05 };

    switch (action) {
      case 'extractRange':
        return [{ key: 'rangeText', label: 'Range', type: 'text', placeholder: '1-3, 8, 10', wide: true }];
      case 'findText':
        return [{ key: 'searchTerm', label: 'Find text', type: 'text', placeholder: 'Word or phrase', wide: true }];
      case 'addText':
        return [{ key: 'editText', label: 'Edit text', type: 'textarea', placeholder: 'Text to place on the page', wide: true }];
      case 'stampPage':
      case 'ownerStamp':
        return [{ key: 'stampText', label: 'Stamp', type: 'text', placeholder: action === 'ownerStamp' ? 'Owner copy' : 'APPROVED', wide: true }];
      case 'watermarkAll':
      case 'watermarkedPdf':
        return [{ key: 'watermarkText', label: 'Watermark', type: 'text', placeholder: 'Confidential', wide: true }];
      case 'downloadJpeg':
        return [quality, imageScale];
      case 'downloadPng':
      case 'downloadSelectedImagesZip':
      case 'downloadAllImagesZip':
        return [imageScale];
      case 'visualRebuild':
        return [quality];
      case 'compressedPdf':
        return [openPassword, compression, compressionLevel, rasterScale];
      case 'downsampleActive':
        return [compression];
      case 'pageNumbers':
        return [{
          key: 'pageNumberPosition',
          label: 'Numbering',
          type: 'select',
          options: [
            { label: 'Bottom', value: 'bottom' },
            { label: 'Top', value: 'top' },
          ],
        }];
      case 'downloadPdf':
      case 'encryptPdf':
        return [
          openPassword,
          { key: 'pdfPassword', label: 'PDF password', type: 'password', placeholder: action === 'downloadPdf' ? 'Optional' : 'Required' },
          { key: 'ownerPassword', label: 'Owner password', type: 'password', placeholder: 'Optional' },
        ];
      case 'metadata':
        return [
          openPassword,
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Title', wide: true },
          { key: 'author', label: 'Author', type: 'text', placeholder: 'Author', wide: true },
          { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Subject', wide: true },
          { key: 'keywords', label: 'Keywords', type: 'textarea', placeholder: 'Comma-separated keywords', wide: true },
        ];
      default:
        return [];
    }
  }

  private valueForOption(key: string): ToolOptionValue {
    const values: Record<string, ToolOptionValue> = {
      rangeText: this.rangeText,
      searchTerm: this.searchTerm,
      editText: this.editText,
      stampText: this.stampText,
      watermarkText: this.watermarkText,
      jpegQuality: this.jpegQuality,
      imageExportScale: this.imageExportScale,
      compression: this.compression,
      compressionLevel: this.compressionLevel,
      compressionScale: this.compressionScale,
      pageNumberPosition: this.pageNumberPosition,
      openPassword: this.openPassword,
      pdfPassword: this.pdfPassword,
      ownerPassword: this.ownerPassword,
      title: this.title,
      author: this.author,
      subject: this.subject,
      keywords: this.keywords,
    };
    return values[key] ?? '';
  }

  private applyToolOptionValues(): void {
    const hasValue = (key: string) => Object.prototype.hasOwnProperty.call(this.toolOptionValues, key);
    const stringValue = (key: string) => String(this.toolOptionValues[key] ?? '');
    const numberValue = (key: string) => Number(this.toolOptionValues[key]);
    if (hasValue('rangeText')) this.rangeText = stringValue('rangeText');
    if (hasValue('searchTerm')) this.searchTerm = stringValue('searchTerm');
    if (hasValue('editText')) this.editText = stringValue('editText');
    if (hasValue('stampText')) this.stampText = stringValue('stampText') || this.stampText;
    if (hasValue('watermarkText')) this.watermarkText = stringValue('watermarkText') || this.watermarkText;
    if (hasValue('openPassword')) this.openPassword = stringValue('openPassword');
    if (hasValue('pdfPassword')) this.pdfPassword = stringValue('pdfPassword');
    if (hasValue('ownerPassword')) this.ownerPassword = stringValue('ownerPassword');
    if (hasValue('title')) this.title = stringValue('title') || this.title;
    if (hasValue('author')) this.author = stringValue('author') || this.author;
    if (hasValue('subject')) this.subject = stringValue('subject') || this.subject;
    if (hasValue('keywords')) this.keywords = stringValue('keywords') || this.keywords;
    if (hasValue('jpegQuality') && Number.isFinite(numberValue('jpegQuality'))) this.jpegQuality = numberValue('jpegQuality');
    if (hasValue('imageExportScale') && Number.isFinite(numberValue('imageExportScale'))) this.imageExportScale = numberValue('imageExportScale');
    if (hasValue('compression') && Number.isFinite(numberValue('compression'))) this.compression = numberValue('compression');
    if (hasValue('compressionLevel') && Number.isFinite(numberValue('compressionLevel'))) this.compressionLevel = numberValue('compressionLevel');
    if (hasValue('compressionScale') && Number.isFinite(numberValue('compressionScale'))) this.compressionScale = numberValue('compressionScale');
    const numbering = stringValue('pageNumberPosition');
    if (hasValue('pageNumberPosition') && (numbering === 'top' || numbering === 'bottom')) this.pageNumberPosition = numbering;
  }

  undo(): void {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return;
    this.redoStack.push(this.createSnapshot());
    this.restoreSnapshot(snapshot);
    this.status = 'Undo applied.';
  }

  redo(): void {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return;
    this.undoStack.push(this.createSnapshot());
    this.restoreSnapshot(snapshot);
    this.status = 'Redo applied.';
  }

  setActive(page: PageItem): void {
    this.activePageId = page.id;
    this.selectedOverlayId = '';
    this.selectedHtmlTextId = '';
    this.inspectedTextItems = [];
    this.textInspectMode = false;
    if (this.isMobileScreen()) {
      this.htmlPageBackgrounds = {};
      this.releaseCanvasMemory();
    }
    this.fitZoomForMobile();
    this.queueActiveRender();
    if (this.isMobileScreen()) void this.ensureActiveHtmlRebuild();
  }

  insertBlankPageBeforeActive(): void {
    const active = this.activePage;
    if (!active) throw new Error('Load a PDF first.');
    this.recordHistory();
    const page: PageItem = {
      id: this.createId(),
      sourceIndex: -1,
      rotation: 0,
      selected: false,
      width: active.width,
      height: active.height,
      blank: true,
    };
    page.thumb = this.createBlankThumb(page);
    const index = Math.max(0, this.pages.findIndex((item) => item.id === active.id));
    this.pages = [...this.pages.slice(0, index), page, ...this.pages.slice(index)];
    this.activePageId = page.id;
    this.closeActiveEditing();
    this.status = 'Blank page inserted before the current page.';
    this.refreshView();
    this.queueActiveRender();
    this.queueThumbRender();
  }

  togglePage(page: PageItem, event: Event): void {
    event.stopPropagation();
    this.recordHistory();
    page.selected = !page.selected;
  }

  movePage(index: number, direction: -1 | 1, event: Event): void {
    event.stopPropagation();
    const target = index + direction;
    if (target < 0 || target >= this.pages.length) return;
    this.recordHistory();
    const [page] = this.pages.splice(index, 1);
    this.pages.splice(target, 0, page);
    this.activePageId = page.id;
    this.status = `Moved page ${index + 1} to ${target + 1}.`;
    this.queueActiveRender();
    this.queueThumbRender();
  }

  deletePage(index: number, event: Event): void {
    event.stopPropagation();
    this.recordHistory();
    const [removed] = this.pages.splice(index, 1);
    if (removed) {
      this.overlays = this.overlays.filter((item) => item.pageId !== removed.id);
      this.htmlTextItems = this.htmlTextItems.filter((item) => item.pageId !== removed.id);
      delete this.htmlPageBackgrounds[removed.id];
    }
    this.activePageId = this.pages[Math.min(index, this.pages.length - 1)]?.id ?? '';
    this.afterPageChange(`Deleted page ${index + 1}.`);
  }

  removeOverlay(item: OverlayItem, event?: Event): void {
    event?.stopPropagation();
    this.overlays = this.overlays.filter((overlay) => overlay.id !== item.id);
    if (this.selectedOverlayId === item.id) this.selectedOverlayId = '';
  }

  selectOverlay(item: OverlayItem, event?: Event): void {
    event?.stopPropagation();
    if (item.locked) return;
    this.selectedOverlayId = item.id;
    this.selectedHtmlTextId = '';
    this.trackingOverlayEditId = '';
    this.trackingHtmlEditId = '';
  }

  closeActiveEditing(): void {
    if (this.textInspectMode) return;
    this.selectedOverlayId = '';
    this.selectedHtmlTextId = '';
    this.trackingOverlayEditId = '';
    this.trackingHtmlEditId = '';
    this.clearInspectLayer();
    this.status = 'Editing applied on the page. Save or flatten to export changes.';
  }

  private clearInspectLayer(): void {
    this.textInspectMode = false;
    this.inspectedTextItems = [];
    this.nativeTextLayer?.nativeElement.replaceChildren();
  }

  selectAllOverlayText(): void {
    const field = document.querySelector('.precision-panel textarea, .precision-panel input') as HTMLInputElement | HTMLTextAreaElement | null;
    field?.focus();
    field?.select();
  }

  duplicateSelectedOverlay(): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    this.recordHistory();
    const clone: OverlayItem = { ...item, id: this.createId(), x: item.x + 14, y: item.y + 14 };
    this.overlays = [...this.overlays, clone];
    this.selectedOverlayId = clone.id;
    this.status = 'Selected edit duplicated.';
  }

  rotateSelectedOverlay(amount: number): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    this.recordHistory();
    item.rotation = ((item.rotation ?? 0) + amount + 360) % 360;
  }

  removeSelectedOverlay(): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    this.recordHistory();
    this.removeOverlay(item);
    this.status = item.generatedFromText ? 'Replacement removed. Original covered text stays hidden.' : 'Selected edit removed.';
  }

  revealOriginalForSelectedOverlay(): void {
    const item = this.selectedOverlay;
    if (!item || !item.generatedFromText) return;
    this.recordHistory();
    this.overlays = this.overlays.filter((overlay) => overlay.id !== item.id && !(overlay.locked && overlay.pageId === item.pageId && Math.abs(overlay.x - item.x) < 2 && Math.abs(overlay.y - item.y) < 2));
    this.selectedOverlayId = '';
    this.status = 'Replacement and its whiteout removed. Original text is visible again.';
  }

  toggleSelectedBold(): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    this.recordHistory();
    item.fontWeight = Number(item.fontWeight) >= 600 || item.fontWeight === 'bold' ? '400' : '700';
  }

  toggleSelectedItalic(): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    this.recordHistory();
    item.fontStyle = item.fontStyle === 'italic' ? 'normal' : 'italic';
  }

  resizeSelectedText(amount: number): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    this.recordHistory();
    item.size = Math.max(6, item.size + amount);
    item.height = Math.max(item.height, item.size + 8);
  }

  toggleSelectedHtmlBold(): void {
    const item = this.selectedHtmlText;
    if (!item) return;
    this.recordHistory();
    item.fontWeight = Number(item.fontWeight) >= 600 || item.fontWeight === 'bold' ? '400' : '700';
  }

  toggleSelectedHtmlItalic(): void {
    const item = this.selectedHtmlText;
    if (!item) return;
    this.recordHistory();
    item.fontStyle = item.fontStyle === 'italic' ? 'normal' : 'italic';
  }

  resizeSelectedHtmlText(amount: number): void {
    const item = this.selectedHtmlText;
    if (!item) return;
    this.recordHistory();
    item.size = Math.max(6, item.size + amount);
    item.height = Math.max(item.height, item.size * 1.25);
  }

  htmlToolbarTop(item: HtmlTextItem): number {
    return Math.max(8, item.y * this.zoom - 46);
  }

  htmlToolbarLeft(item: HtmlTextItem): number {
    return Math.max(8, item.x * this.zoom);
  }

  nudgeSelected(dx: number, dy: number): void {
    const item = this.selectedOverlay;
    const page = this.activePage;
    if (!item || !page || item.locked) return;
    this.recordHistory();
    item.x = Math.max(0, Math.min(page.width - item.width, item.x + dx));
    item.y = Math.max(0, Math.min(page.height - item.height, item.y + dy));
  }

  toolbarTop(item: OverlayItem): number {
    return Math.max(8, item.y * this.zoom - 58);
  }

  toolbarLeft(item: OverlayItem): number {
    return Math.max(8, item.x * this.zoom);
  }

  async addImageOverlay(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const page = this.activePage;
    if (!file || !page) return;
    this.recordHistory();
    const dataUrl = await this.readFileAsDataUrl(file);
    const size = await this.getImageSize(dataUrl);
    const maxWidth = page.width * 0.42;
    const scale = Math.min(1, maxWidth / size.width);
    const overlay: OverlayItem = {
      id: this.createId(),
      pageId: page.id,
      kind: 'image',
      text: file.name,
      x: Math.round(page.width * 0.18),
      y: Math.round(page.height * 0.18),
      width: Math.max(80, Math.round(size.width * scale)),
      height: Math.max(60, Math.round(size.height * scale)),
      size: 12,
      color: '#111827',
      opacity: 1,
      imageData: dataUrl,
      imageType: file.type.includes('png') ? 'png' : 'jpg',
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
    };
    this.overlays = [...this.overlays, overlay];
    this.selectedOverlayId = overlay.id;
    this.status = 'Image added. Drag it on the page, then save or flatten.';
    input.value = '';
  }

  startDrag(item: OverlayItem, event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('input,button,textarea,.resize-handle')) return;
    if (item.locked) return;
    event.preventDefault();
    this.selectOverlay(item, event);
    this.recordHistory();
    this.dragState = { id: item.id, startX: event.clientX, startY: event.clientY, originalX: item.x, originalY: item.y };
  }

  startResize(item: OverlayItem, event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
    if (item.locked) return;
    this.selectOverlay(item, event);
    this.recordHistory();
    this.resizeState = { id: item.id, startX: event.clientX, startY: event.clientY, originalWidth: item.width, originalHeight: item.height };
  }

  dragOverlay(event: PointerEvent): void {
    const page = this.activePage;
    if (!page) return;
    if (this.resizeState) {
      const item = this.overlays.find((overlay) => overlay.id === this.resizeState?.id);
      if (!item) return;
      const nextWidth = this.resizeState.originalWidth + (event.clientX - this.resizeState.startX) / this.zoom;
      const nextHeight = this.resizeState.originalHeight + (event.clientY - this.resizeState.startY) / this.zoom;
      item.width = Math.max(16, Math.min(Math.round(nextWidth), Math.round(page.width - item.x)));
      item.height = Math.max(16, Math.min(Math.round(nextHeight), Math.round(page.height - item.y)));
      return;
    }
    if (!this.dragState) return;
    const item = this.overlays.find((overlay) => overlay.id === this.dragState?.id);
    if (!item) return;
    const nextX = this.dragState.originalX + (event.clientX - this.dragState.startX) / this.zoom;
    const nextY = this.dragState.originalY + (event.clientY - this.dragState.startY) / this.zoom;
    item.x = Math.max(0, Math.min(Math.round(nextX), Math.round(page.width - item.width)));
    item.y = Math.max(0, Math.min(Math.round(nextY), Math.round(page.height - item.height)));
  }

  stopDrag(): void {
    this.dragState = undefined;
    this.resizeState = undefined;
  }

  async inspectTextLayer(): Promise<void> {
    const active = this.activePage;
    const host = this.nativeTextLayer?.nativeElement;
    if (!active) throw new Error('Load a PDF first.');
    if (!host) throw new Error('Text layer is not ready.');
    const pdf = await this.openPdfJsDocument();
    const page = await pdf.getPage(active.sourceIndex + 1);
    const viewport = page.getViewport({ scale: 1, rotation: active.rotation });
    const content = await page.getTextContent();
    const items = this.inspectItemsFromTextContent(content, viewport, active.id);
    host.replaceChildren();
    this.inspectedTextItems = items;
    this.textInspectMode = true;
    this.selectedOverlayId = '';
    this.status = `${this.inspectedTextItems.length} text item(s) found. Click a word/fragment to edit it inline.`;
  }

  async reconstructHtmlPage(): Promise<void> {
    const active = this.activePage;
    if (!active) throw new Error('Load a PDF first.');
    const pdf = await this.openPdfJsDocument();
    const editableItems = await this.reconstructHtmlPageItem(pdf, active);

    this.htmlTextItems = [
      ...this.htmlTextItems.filter((item) => item.pageId !== active.id),
      ...editableItems,
    ];
    this.refreshView();
    this.htmlEditMode = true;
    this.selectedOverlayId = '';
    this.selectedHtmlTextId = '';
    this.clearInspectLayer();
    this.status = editableItems.length
      ? `HTML edit mode rebuilt ${editableItems.length} editable line(s). Edit directly on the page, then export HTML rebuild.`
      : 'This page has no extractable text, so HTML edit mode will keep it as an image.';
  }

  async reconstructAllHtmlFromCurrentPdf(): Promise<void> {
    if (!this.currentBytes.length) throw new Error('Load a PDF first.');
    const pdf = await this.openPdfJsDocument();
    const rebuilt = await this.reconstructAllHtmlPages(pdf);
    this.htmlEditMode = true;
    this.selectedOverlayId = '';
    this.selectedHtmlTextId = '';
    this.clearInspectLayer();
    this.status = `HTML edit mode rebuilt all pages with ${rebuilt} editable line(s).`;
  }

  selectHtmlText(item: HtmlTextItem, event?: Event): void {
    event?.stopPropagation();
    this.selectedOverlayId = '';
    this.selectedHtmlTextId = item.id;
    this.trackingHtmlEditId = '';
    this.trackingOverlayEditId = '';
  }

  focusTextField(event: Event): void {
    event.stopPropagation();
    const field = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) return;
    this.focusEditableField(field);
    this.showVirtualKeyboard();
    const length = field.value.length;
    try {
      field.setSelectionRange(length, length);
    } catch {
      // Some input types do not support selection ranges.
    }
    setTimeout(() => {
      this.focusEditableField(field);
      this.showVirtualKeyboard();
      try {
        field.setSelectionRange(length, length);
      } catch {
        // Some input types do not support selection ranges.
      }
    });
  }

  private focusEditableField(field: HTMLInputElement | HTMLTextAreaElement): void {
    try {
      field.focus({ preventScroll: true });
    } catch {
      field.focus();
    }
  }

  private showVirtualKeyboard(): void {
    const nav = navigator as Navigator & {
      virtualKeyboard?: {
        overlaysContent?: boolean;
        show?: () => void;
      };
    };
    if (!nav.virtualKeyboard) return;
    try {
      nav.virtualKeyboard.overlaysContent = true;
      nav.virtualKeyboard.show?.();
    } catch {
      // The Virtual Keyboard API is optional and varies across mobile browsers.
    }
  }

  markHtmlTextEdit(item: HtmlTextItem): void {
    if (this.trackingHtmlEditId === item.id) return;
    this.recordHistory();
    this.trackingHtmlEditId = item.id;
  }

  markOverlayEdit(item: OverlayItem): void {
    if (this.trackingOverlayEditId === item.id) return;
    this.recordHistory();
    this.trackingOverlayEditId = item.id;
  }

  resetSelectedImageCrop(): void {
    const item = this.selectedOverlay;
    if (!item || item.kind !== 'image') return;
    this.recordHistory();
    item.cropX = 0;
    item.cropY = 0;
    item.cropWidth = 100;
    item.cropHeight = 100;
    this.status = 'Image crop reset.';
  }

  adjustSelectedImageCrop(amount: number): void {
    const item = this.selectedOverlay;
    if (!item || item.kind !== 'image') return;
    this.recordHistory();
    const nextX = Math.max(0, Math.min(45, (item.cropX ?? 0) + amount));
    const nextY = Math.max(0, Math.min(45, (item.cropY ?? 0) + amount));
    const nextWidth = Math.max(10, Math.min(100 - nextX, (item.cropWidth ?? 100) - amount * 2));
    const nextHeight = Math.max(10, Math.min(100 - nextY, (item.cropHeight ?? 100) - amount * 2));
    item.cropX = nextX;
    item.cropY = nextY;
    item.cropWidth = nextWidth;
    item.cropHeight = nextHeight;
    this.status = 'Image crop adjusted. Drag to move, corner handle to resize, Delete to remove.';
  }

  removeSelectedHtmlText(): void {
    const item = this.selectedHtmlText;
    if (!item) return;
    this.recordHistory();
    item.text = '';
    this.selectedHtmlTextId = '';
    this.status = 'HTML text fragment cleared and will be removed when saved.';
  }

  addShape(kind: 'rectangle' | 'square' | 'highlight' | 'ellipse' | 'line'): void {
    this.recordHistory();
    this.addOverlay(kind === 'square' ? 'rectangle' : kind, kind === 'square' ? 'square' : undefined);
    this.shapeMenuOpen = false;
  }

  addWhiteout(): void {
    this.recordHistory();
    this.addOverlay('rectangle', 'whiteout');
    this.shapeMenuOpen = false;
  }

  private isPdfTextItem(item: unknown): item is PdfTextItemLike {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Partial<PdfTextItemLike>;
    return typeof candidate.str === 'string'
      && candidate.str.trim().length > 0
      && Array.isArray(candidate.transform)
      && typeof candidate.width === 'number'
      && typeof candidate.height === 'number';
  }

  openInspectPopup(item: InspectTextItem, event: Event): void {
    event.stopPropagation();
    this.createInlineTextReplacement(item);
    this.clearInspectLayer();
    this.status = `Editing "${item.text}" at x:${Math.round(item.x)} y:${Math.round(item.y)}.`;
  }

  replaceInspectedText(item: InspectTextItem, event: Event): void {
    this.openInspectPopup(item, event);
  }

  private createInlineTextReplacement(item: InspectTextItem): void {
    const page = this.activePage;
    if (!page) return;
    const cover: OverlayItem = {
      id: this.createId(),
      pageId: page.id,
      kind: 'rectangle',
      text: '',
      x: Math.max(0, Math.round(item.x)),
      y: Math.max(0, Math.round(item.y)),
      width: Math.round(item.width),
      height: Math.round(item.height),
      size: item.size,
      color: '#ffffff',
      opacity: 1,
      locked: true,
    };
    const replacement: OverlayItem = {
      id: this.createId(),
      pageId: page.id,
      kind: 'text',
      text: item.text,
      x: Math.round(item.x),
      y: Math.max(0, Math.round(item.y)),
      width: Math.round(Math.max(24, item.width)),
      height: Math.round(Math.max(14, item.height)),
      size: Math.round(item.size),
      color: item.color ?? '#111827',
      opacity: 1,
      generatedFromText: true,
      fontFamily: item.fontFamily,
      fontWeight: item.fontWeight,
      fontStyle: item.fontStyle,
    };
    this.overlays = [...this.overlays, cover, replacement];
    this.selectedOverlayId = replacement.id;
  }

  private splitTextForInspection(text: string, x: number, y: number, width: number, height: number, size: number, id: string): InspectTextItem[] {
    const words = text.match(/\S+/g);
    if (!words || words.length <= 1) return [{ id, text, x, y, width, height, size }];
    const totalChars = Math.max(1, text.length);
    let cursor = x;
    return words.map((word, index) => {
      const leadingSpaces = index === 0 ? 0 : 1;
      cursor += width * (leadingSpaces / totalChars);
      const wordWidth = Math.max(4, width * (word.length / totalChars));
      const item = { id: `${id}-${index}`, text: word, x: cursor, y, width: wordWidth, height, size };
      cursor += wordWidth;
      return item;
    });
  }

  private inspectItemsFromRenderedTextLayer(host: HTMLElement, pageId: string): InspectTextItem[] {
    const hostRect = host.getBoundingClientRect();
    return Array.from(host.querySelectorAll<HTMLElement>('span[role="presentation"], span'))
      .map((span, index) => {
        const text = span.textContent?.trim() ?? '';
        const rect = span.getBoundingClientRect();
        const style = getComputedStyle(span);
        const color = this.normalizedCssColor(style.color);
        const width = rect.width;
        const height = rect.height;
        return {
          id: `${pageId}-native-${index}`,
          text,
          x: rect.left - hostRect.left,
          y: rect.top - hostRect.top,
          width,
          height,
          size: Math.max(8, height * 0.82),
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          color,
        };
      })
      .filter((item) => item.text.length > 0 && item.width > 2 && item.height > 2);
  }

  private inspectItemsFromTextContent(content: { items: unknown[]; styles?: Record<string, PdfTextStyleLike> }, viewport: PdfViewportLike, pageId: string): InspectTextItem[] {
    return this.rawItemsFromTextContent(content, viewport, pageId)
      .flatMap((item) => this.splitTextForInspection(item.text, item.x, item.y, item.width, item.height, item.size, item.id));
  }

  private rawItemsFromTextContent(content: { items: unknown[]; styles?: Record<string, PdfTextStyleLike> }, viewport: PdfViewportLike, pageId: string): InspectTextItem[] {
    const util = (pdfjsLib as unknown as { Util: { transform: (m1: number[], m2: number[]) => number[] } }).Util;
    return content.items
      .filter((item): item is PdfTextItemLike => this.isPdfTextItem(item))
      .map((item, index) => {
        const transform = util.transform(viewport.transform, item.transform);
        const size = Math.max(8, Math.hypot(transform[2], transform[3]));
        const width = Math.max(10, item.width || item.str.length * size * 0.45);
        const height = Math.max(10, item.height || size);
        const style = item.fontName ? content.styles?.[item.fontName] : undefined;
        const fontLabel = `${item.fontName ?? ''} ${style?.fontFamily ?? ''}`;
        return {
          id: `${pageId}-run-${index}`,
          text: item.str,
          x: transform[4],
          y: transform[5] - height,
          width,
          height,
          size,
          fontFamily: this.pdfFontFamily(style?.fontFamily, item.fontName),
          fontWeight: /bold|black|heavy|demi|semi/i.test(fontLabel) ? '700' : '400',
          fontStyle: /italic|oblique/i.test(fontLabel) ? 'italic' : 'normal',
          color: '#111111',
        };
      })
      .filter((item) => item.text.trim().length > 0 && item.width > 2 && item.height > 2);
  }

  private htmlItemsFromTextContent(content: { items: unknown[]; styles?: Record<string, PdfTextStyleLike> }, viewport: PdfViewportLike, pageId: string, links: LinkRect[] = []): HtmlTextItem[] {
    const runs = this.rawItemsFromTextContent(content, viewport, pageId)
      .sort((a, b) => Math.abs(a.y - b.y) < Math.max(a.size, b.size) * 0.45 ? a.x - b.x : a.y - b.y);
    const lines: InspectTextItem[][] = [];

    for (const run of runs) {
      const line = lines.find((items) => Math.abs(items[0].y - run.y) <= Math.max(items[0].size, run.size) * 0.55);
      if (line) {
        line.push(run);
      } else {
        lines.push([run]);
      }
    }

    return lines.flatMap((line, lineIndex) => {
      const ordered = line.sort((a, b) => a.x - b.x);
      const size = Math.max(...ordered.map((item) => item.size));
      const segments: InspectTextItem[][] = [];
      let current: InspectTextItem[] = [];
      let previousEnd = ordered[0]?.x ?? 0;

      for (const item of ordered) {
        const clean = item.text.replace(/\s+/g, ' ').trim();
        if (!clean) continue;
        const averageCharWidth = Math.max(2, item.width / Math.max(clean.length, 1));
        const gap = current.length ? item.x - previousEnd : 0;
        const tableGap = Math.max(size * 0.85, averageCharWidth * 2.2);
        if (current.length && gap > tableGap) {
          segments.push(current);
          current = [];
        }
        current.push(item);
        previousEnd = item.x + item.width;
      }
      if (current.length) segments.push(current);

      return segments.map((segment, segmentIndex) => this.htmlItemFromLineSegment(segment, links, pageId, lineIndex, segmentIndex));
    }).filter((item) => item.text.trim().length > 0);
  }

  private htmlItemFromLineSegment(ordered: InspectTextItem[], links: LinkRect[], pageId: string, lineIndex: number, segmentIndex: number): HtmlTextItem {
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const size = Math.max(...ordered.map((item) => item.size));
      let text = '';
      let previousEnd = first.x;
      for (const item of ordered) {
        const clean = item.text.replace(/\s+/g, ' ').trim();
        if (!clean) continue;
        const averageCharWidth = Math.max(2, item.width / Math.max(clean.length, 1));
        const gap = item.x - previousEnd;
        if (text && gap > averageCharWidth * 0.35) {
          text += ' '.repeat(Math.max(1, Math.min(8, Math.round(gap / averageCharWidth))));
        }
        text += clean;
        previousEnd = item.x + item.width;
      }
      const isLinked = ordered.some((item) => links.some((link) => this.rectsOverlap(item, link)));
      return {
        id: `${pageId}-html-line-${lineIndex}-${segmentIndex}`,
        pageId,
        text,
        x: first.x,
        y: Math.min(...ordered.map((item) => item.y)),
        width: Math.max(18, last.x + last.width - first.x),
        height: Math.max(size * 1.25, ...ordered.map((item) => item.height)),
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

  private applyHtmlItemBackgrounds(items: HtmlTextItem[], canvas: HTMLCanvasElement, scale: number): HtmlTextItem[] {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return items;
    return items.map((item) => {
      const backgroundColor = item.textDecoration === 'underline' || this.isColoredText(item.color)
        ? '#ffffff'
        : this.sampleCanvasColor(context, item, scale);
      const darkBackground = this.isDarkColor(backgroundColor);
      const textColor = darkBackground ? '#ffffff' : item.color;
      return {
        ...item,
        color: textColor,
        originalColor: textColor,
        backgroundColor,
        textAlign: darkBackground ? 'center' : 'left',
      };
    });
  }

  private isColoredText(color?: string): boolean {
    const value = (color ?? '').toLowerCase();
    return !!value && !['#000000', '#111111', '#172033'].includes(value);
  }

  private replaceGraphicHtmlItemsWithImages(pageItem: PageItem, items: HtmlTextItem[], canvas: HTMLCanvasElement, scale: number): HtmlTextItem[] {
    const imageItems = items
      .filter((item) => this.shouldRenderHtmlItemAsImage(item))
      .flatMap((item) => [
        this.createGraphicCoverOverlay(pageItem, item),
        this.createImageOverlayFromCanvasArea(pageItem, item, canvas, scale),
      ]);
    if (imageItems.length) {
      this.overlays = [
        ...this.overlays.filter((overlay) => !(overlay.pageId === pageItem.id && overlay.generatedFromText && (overlay.text === 'Rendered object' || overlay.text === 'Rendered object cover'))),
        ...imageItems,
      ];
    }
    return items.filter((item) => !this.shouldRenderHtmlItemAsImage(item));
  }

  private createGraphicCoverOverlay(pageItem: PageItem, item: HtmlTextItem): OverlayItem {
    const padding = Math.max(3, Math.round(item.size * 0.18));
    return {
      id: this.createId(),
      pageId: pageItem.id,
      kind: 'rectangle',
      text: 'Rendered object cover',
      x: Math.max(0, item.x - padding),
      y: Math.max(0, item.y - padding),
      width: Math.max(8, item.width + padding * 2),
      height: Math.max(8, item.height + padding * 2),
      size: item.size,
      color: item.backgroundColor,
      opacity: 1,
      locked: true,
      generatedFromText: true,
    };
  }

  private createImageOverlayFromCanvasArea(pageItem: PageItem, item: HtmlTextItem, canvas: HTMLCanvasElement, scale: number): OverlayItem {
    const padding = Math.max(3, Math.round(item.size * 0.18));
    const sx = Math.max(0, Math.floor((item.x - padding) * scale));
    const sy = Math.max(0, Math.floor((item.y - padding) * scale));
    const sw = Math.min(canvas.width - sx, Math.ceil((item.width + padding * 2) * scale));
    const sh = Math.min(canvas.height - sy, Math.ceil((item.height + padding * 2) * scale));
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, sw);
    crop.height = Math.max(1, sh);
    const context = crop.getContext('2d');
    context?.drawImage(canvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    return {
      id: this.createId(),
      pageId: pageItem.id,
      kind: 'image',
      text: 'Rendered object',
      x: Math.max(0, item.x - padding),
      y: Math.max(0, item.y - padding),
      width: Math.max(8, item.width + padding * 2),
      height: Math.max(8, item.height + padding * 2),
      size: item.size,
      color: '#111827',
      opacity: 1,
      imageData: crop.toDataURL('image/png'),
      imageType: 'png',
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
      generatedFromText: true,
    };
  }

  private shouldRenderHtmlItemAsImage(item: HtmlTextItem): boolean {
    if (item.textDecoration === 'underline') return false;
    if (this.isDarkColor(item.backgroundColor)) return false;
    const textColor = this.hexToRgbValues(item.color ?? '');
    if (textColor && textColor[2] > 140 && textColor[0] < 80) return false;
    return this.isGraphicBackground(item.backgroundColor);
  }

  private isDarkColor(color: string): boolean {
    const rgbValue = this.hexToRgbValues(color);
    if (!rgbValue) return false;
    const [red, green, blue] = rgbValue;
    return (red * 299 + green * 587 + blue * 114) / 1000 < 138;
  }

  private isGraphicBackground(color: string): boolean {
    const rgbValue = this.hexToRgbValues(color);
    if (!rgbValue) return false;
    const [red, green, blue] = rgbValue;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
    return brightness < 242 && max - min > 18;
  }

  private sampleCanvasColor(context: CanvasRenderingContext2D, item: Pick<HtmlTextItem, 'x' | 'y' | 'width' | 'height'>, scale: number): string {
    const canvas = context.canvas;
    const samplePoints: [number, number][] = [];
    for (const xRatio of [0.08, 0.22, 0.5, 0.78, 0.92]) {
      for (const yRatio of [0.08, 0.22, 0.5, 0.78, 0.92]) {
        samplePoints.push([item.x + item.width * xRatio, item.y + item.height * yRatio]);
      }
    }
    const colors = samplePoints.map(([x, y]) => {
      const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x * scale)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y * scale)));
      return Array.from(context.getImageData(px, py, 1, 1).data).slice(0, 3);
    });
    const colored = colors.filter(([red, green, blue]) => {
      const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
      return brightness > 30 && brightness < 245 && Math.max(red, green, blue) - Math.min(red, green, blue) > 18;
    });
    const candidates = colored.length >= 3 ? colored : colors;
    const [red, green, blue] = candidates
      .sort((a, b) => this.colorScore(b) - this.colorScore(a))[0];
    return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
  }

  private colorScore([red, green, blue]: number[]): number {
    const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    return saturation > 18 && brightness < 245 ? saturation * 3 + brightness : brightness;
  }

  private linkRectsFromAnnotations(annotations: unknown[], viewport: PdfViewportLike): LinkRect[] {
    return annotations
      .filter((annotation): annotation is PdfAnnotationLike => {
        const item = annotation as PdfAnnotationLike;
        return Array.isArray(item.rect) && (item.subtype === 'Link' || item.annotationType === 2 || !!item.url || !!item.unsafeUrl);
      })
      .map((annotation) => {
        const rect = viewport.convertToViewportRectangle ? viewport.convertToViewportRectangle(annotation.rect ?? []) : annotation.rect ?? [];
        const [x1, y1, x2, y2] = rect;
        return {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
  }

  private rectsOverlap(a: Pick<InspectTextItem, 'x' | 'y' | 'width' | 'height'>, b: LinkRect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  private pdfFontFamily(fontFamily?: string, fontName?: string): string {
    const label = `${fontFamily ?? ''} ${fontName ?? ''}`;
    if (/arial|helvetica/i.test(label)) return 'Arial, Helvetica, sans-serif';
    if (/courier|mono/i.test(label)) return 'Courier New, Courier, monospace';
    if (/times|serif|georgia/i.test(label)) return 'Times New Roman, Georgia, serif';
    return fontFamily || 'Times New Roman, Georgia, serif';
  }

  private normalizedCssColor(value: string): string | undefined {
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return undefined;
    const red = Number(match[1]).toString(16).padStart(2, '0');
    const green = Number(match[2]).toString(16).padStart(2, '0');
    const blue = Number(match[3]).toString(16).padStart(2, '0');
    return `#${red}${green}${blue}`;
  }

  async loadFromUrl(url: string, name: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load sample PDF.');
    await this.loadBytes(new Uint8Array(await response.arrayBuffer()), name);
  }

  private async loadBytes(bytes: Uint8Array, name: string): Promise<void> {
    this.busy = true;
    this.busyLabel = 'Loading PDF';
    this.status = 'Loading PDF...';
    this.refreshView();
    this.releaseCanvasMemory();
    this.currentBytes = bytes;
    this.fileName = name;
    this.overlays = [];
    this.htmlTextItems = [];
    this.htmlPageBackgrounds = {};
    this.undoStack = [];
    this.redoStack = [];
    this.selectedHtmlTextId = '';
    this.htmlEditMode = true;
    const pdf = await this.openPdfJsDocument(bytes);
    this.pages = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      this.pages.push({
        id: this.createId(),
        sourceIndex: index - 1,
        rotation: 0,
        selected: false,
        width: viewport.width,
        height: viewport.height,
      });
    }
    this.activePageId = this.pages[0]?.id ?? '';
    this.busyLabel = 'Converting PDF';
    this.status = 'Converting PDF and preparing editable text...';
    this.refreshView();
    const rebuilt = this.isMobileScreen()
      ? await this.reconstructActiveHtmlPage(pdf)
      : await this.reconstructAllHtmlPages(pdf);
    this.status = `${name} loaded with ${this.pages.length} page(s). HTML rebuilt ${rebuilt} editable line(s).`;
    this.busy = false;
    this.busyLabel = '';
    this.fitZoomForMobile();
    this.queueActiveRender();
    this.queueThumbRender();
    this.trackingHtmlEditId = '';
    this.trackingOverlayEditId = '';
  }

  private async reconstructAllHtmlPages(pdf: { getPage: (pageNumber: number) => Promise<{ getViewport: (options: { scale: number; rotation?: number }) => PdfViewportLike; getTextContent: () => Promise<{ items: unknown[]; styles?: Record<string, PdfTextStyleLike> }>; getAnnotations: (options?: { intent: string }) => Promise<unknown[]> }> }): Promise<number> {
    const allItems: HtmlTextItem[] = [];
    for (const pageItem of this.pages) {
      allItems.push(...await this.reconstructHtmlPageItem(pdf, pageItem));
    }
    this.htmlTextItems = allItems;
    this.refreshView();
    return allItems.length;
  }

  private async reconstructActiveHtmlPage(pdf: { getPage: (pageNumber: number) => Promise<{ getViewport: (options: { scale: number; rotation?: number }) => PdfViewportLike; getTextContent: () => Promise<{ items: unknown[]; styles?: Record<string, PdfTextStyleLike> }>; getAnnotations: (options?: { intent: string }) => Promise<unknown[]> }> }): Promise<number> {
    const active = this.activePage;
    if (!active) return 0;
    const items = await this.reconstructHtmlPageItem(pdf, active);
    this.htmlTextItems = [
      ...this.htmlTextItems.filter((item) => item.pageId !== active.id),
      ...items,
    ];
    this.refreshView();
    return items.length;
  }

  private async ensureActiveHtmlRebuild(): Promise<void> {
    const active = this.activePage;
    if (!active || this.htmlTextItems.some((item) => item.pageId === active.id)) return;
    try {
      const pdf = await this.openPdfJsDocument();
      const rebuilt = await this.reconstructActiveHtmlPage(pdf);
      if (rebuilt) this.status = `HTML edit mode rebuilt ${rebuilt} editable line(s) on this page.`;
      this.refreshView();
    } catch {
      this.status = 'This page rendered visually, but no editable text layer could be extracted.';
      this.refreshView();
    }
  }

  private async reconstructHtmlPageItem(pdf: { getPage: (pageNumber: number) => Promise<{ getViewport: (options: { scale: number; rotation?: number }) => PdfViewportLike; getTextContent: () => Promise<{ items: unknown[]; styles?: Record<string, PdfTextStyleLike> }>; getAnnotations: (options?: { intent: string }) => Promise<unknown[]> }> }, pageItem: PageItem): Promise<HtmlTextItem[]> {
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
      extractedItems = this.htmlItemsFromTextContent(content, viewport, pageItem.id, this.linkRectsFromAnnotations(annotations, viewport));
      if (this.isMobileScreen()) {
        delete this.htmlPageBackgrounds[pageItem.id];
        return extractedItems;
      }
      const rebuildScale = this.effectiveHtmlBackgroundScale();
      const backgroundCanvas = await this.runPdfOutsideAngular(() => this.renderPageCanvas(pageItem, rebuildScale));
      const items = this.applyHtmlItemBackgrounds(extractedItems, backgroundCanvas, rebuildScale);
      const graphicFilteredItems = this.replaceGraphicHtmlItemsWithImages(pageItem, items, backgroundCanvas, rebuildScale);
      this.htmlPageBackgrounds[pageItem.id] = backgroundCanvas.toDataURL('image/png');
      return graphicFilteredItems;
    } catch {
      delete this.htmlPageBackgrounds[pageItem.id];
      return extractedItems;
    }
  }

  private async renderActivePage(): Promise<void> {
    const token = ++this.activeRenderToken;
    const active = this.activePage;
    const canvas = this.mainCanvas?.nativeElement;
    if (!active || !canvas || !this.currentBytes.length) return;
    this.activeRenderTask?.cancel();
    if (this.isMobileScreen()) this.clearCanvas(canvas);
    const requestedScale = window.innerWidth <= 760
      ? Math.min(2, Math.max(1.25, window.devicePixelRatio))
      : Math.min(4, Math.max(2.4, window.devicePixelRatio * 1.6));
    const renderScale = this.safePdfRenderScale(active.width, active.height, requestedScale);
    const context = canvas.getContext('2d');
    if (!context) return;
    if (token !== this.activeRenderToken) return;
    if (active.blank) {
      this.paintBlankCanvas(canvas, context, active, renderScale);
      return;
    }
    const pdf = await this.openPdfJsDocument();
    const page = await this.runPdfOutsideAngular(() => pdf.getPage(active.sourceIndex + 1));
    const viewport = page.getViewport({ scale: renderScale, rotation: active.rotation });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${active.width * this.zoom}px`;
    canvas.style.height = `${active.height * this.zoom}px`;
    const renderTask = page.render({ canvas, canvasContext: context, viewport });
    this.activeRenderTask = renderTask;
    try {
      await this.runPdfOutsideAngular(() => renderTask.promise);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (token === this.activeRenderToken && name !== 'RenderingCancelledException') {
        this.status = error instanceof Error ? error.message : 'Could not render this PDF page on this screen.';
      }
    } finally {
      if (this.activeRenderTask === renderTask) this.activeRenderTask = undefined;
    }
  }

private async renderThumbs(scale = 0.24): Promise<void> {
  if (!this.currentBytes.length) return;

  const pdf = await this.openPdfJsDocument();
  const canvases = this.thumbCanvases.toArray();

  for (let index = 0; index < this.pages.length; index += 1) {
    const item = this.pages[index];
    const canvas = canvases[index]?.nativeElement;
    if (!canvas) continue;

    const context = canvas.getContext('2d');
    if (!context) continue;

    if (item.blank) {
      this.paintBlankCanvas(canvas, context, item, scale, false);
      item.thumb = canvas.toDataURL('image/jpeg', 0.68);
      continue;
    }

    const page = await this.runPdfOutsideAngular(
      () => pdf.getPage(item.sourceIndex + 1)
    );

    const viewport = page.getViewport({
      scale,
      rotation: item.rotation
    });

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    await this.runPdfOutsideAngular(
      () => page.render({
        canvas,
        canvasContext: context,
        viewport
      }).promise
    );

    item.thumb = canvas.toDataURL('image/jpeg', 0.68);
  }
}
  private queueActiveRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      void this.renderActivePage();
    }, 120);
  }



  private effectiveHtmlBackgroundScale(): number {
    if (this.isMobileScreen()) return Math.min(1.35, Math.max(1, window.devicePixelRatio * 0.8));
    return this.htmlBackgroundScale;
  }

 

  private safePdfRenderScale(width: number, height: number, requestedScale: number): number {
    if (!this.isMobileScreen()) return requestedScale;
    const maxPixels = 3_200_000;
    const maxSide = 2048;
    const pixelScale = Math.sqrt(maxPixels / Math.max(1, width * height));
    const sideScale = maxSide / Math.max(width, height, 1);
    return Math.max(0.6, Math.min(requestedScale, pixelScale, sideScale, 1.35));
  }

/**
   * PREMIUM AMERICAN SAAS BREAKPOINT OVERHAUL
   * Configures absolute viewport constraints and high-performance layout adapters for touch views.
   */
  private configureMobileRendering(): void {
    this.fitZoomForMobile();
    
    // Setup explicit CSS viewport variable to bypass dynamic browser chrome address bar jitter
    const updateViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);
    updateViewportHeight();
  }

  private isMobileScreen(): boolean {
    return window.innerWidth <= 760;
  }

  private fitZoomForMobile(): void {
    if (!this.isMobileScreen() || !this.pages.length) return;
    
    // Explicit dynamic safety scaling for narrow device widths
    const active = this.activePage;
    if (!active) return;
    
    const availableWidth = window.innerWidth - 32; // Generous 16px lateral padding
    const pageBaseWidth = active.width || 595; // Handle default fallback A4 boundaries
    
    // Compute strict percentage scale matching device width limits
    const safeZoom = Number((availableWidth / pageBaseWidth).toFixed(2));
    this.zoom = Math.min(Math.max(safeZoom, 0.45), 1.25);
    this.changeDetector.markForCheck();
  }
  private releaseCanvasMemory(): void {
    this.activeRenderTask?.cancel();
    this.activeRenderTask = undefined;
    const main = this.mainCanvas?.nativeElement;
    if (main) this.clearCanvas(main);
    for (const item of this.thumbCanvases?.toArray?.() ?? []) {
      this.clearCanvas(item.nativeElement);
    }
  }

  private clearCanvas(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 1;
    canvas.height = 1;
  }

  private paintBlankCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, page: PageItem, scale: number, applyDisplaySize = true): void {
    canvas.width = Math.max(1, Math.floor(page.width * scale));
    canvas.height = Math.max(1, Math.floor(page.height * scale));
    if (applyDisplaySize) {
      canvas.style.width = `${page.width * this.zoom}px`;
      canvas.style.height = `${page.height * this.zoom}px`;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  private createBlankThumb(page: PageItem): string {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return '';
    this.paintBlankCanvas(canvas, context, page, 0.24, false);
    return canvas.toDataURL('image/jpeg', 0.68);
  }

  private runPdfOutsideAngular<T>(work: () => Promise<T>): Promise<T> {
    return this.ngZone.runOutsideAngular(work);
  }

  private refreshView(): void {
    this.ngZone.run(() => this.changeDetector.detectChanges());
  }

private queueThumbRender(): void {
  setTimeout(() => {
    this.renderThumbs(
      this.isMobileScreen() ? 0.12 : 0.24
    );
  }, 140);
}

  private async openPdfJsDocument(bytes = this.currentBytes): Promise<{ numPages: number; getPage: (pageNumber: number) => Promise<any> }> {
    return this.runPdfOutsideAngular(async () => {
      const loadingTask = pdfjsLib.getDocument({
        data: bytes.slice(),
        password: this.openPassword || undefined,
        disableWorker: false,
      } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]);
      loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
        const password = window.prompt(
          reason === 2 ? 'Incorrect PDF password. Enter it again:' : 'Enter the PDF open password:',
          this.openPassword,
        );
        if (password === null) throw new Error('PDF password required.');
        this.openPassword = password;
        updatePassword(password);
      };
      return loadingTask.promise as Promise<{ numPages: number; getPage: (pageNumber: number) => Promise<any> }>;
    });
  }

  private async loadSourcePdfDocument(): Promise<PDFDocument> {
    if (this.openPassword && this.isMobileScreen()) {
      throw new Error('Password-protected PDF processing is disabled on mobile to avoid browser memory limits. Use desktop for encrypted PDFs.');
    }
    const bytes = this.openPassword
      ? await this.runQpdf(this.currentBytes, [`--password=${this.openPassword}`, '--decrypt'])
      : this.currentBytes;
    return PDFDocument.load(bytes, { ignoreEncryption: true });
  }

  private async runQpdf(inputBytes: Uint8Array<ArrayBufferLike>, args: string[]): Promise<Uint8Array> {
    if (this.isMobileScreen()) {
      throw new Error('qpdf-wasm operations are disabled on mobile to avoid browser memory limits.');
    }
    if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('PDF password tools need cross-origin isolation. Restart the dev server so COOP/COEP headers are applied, then reload the page.');
    }
    const init = (await import('qpdf-wasm')).default;
    const wasmBinary = await this.loadQpdfWasm();
    const errors: string[] = [];
    const qpdf = await init({
      wasmBinary,
      locateFile: (path: string) => path.startsWith('qpdf.') ? `/assets/${path}` : path,
      printErr: (message: string) => errors.push(message),
    });
    const inputPath = '/input.pdf';
    const outputPath = '/output.pdf';
    qpdf.FS.writeFile(inputPath, inputBytes);
    const exitCode = qpdf.callMain([...args, inputPath, outputPath]);
    if (exitCode !== 0) {
      throw new Error(errors.at(-1) || 'PDF password operation failed.');
    }
    return qpdf.FS.readFile(outputPath);
  }

  private async loadQpdfWasm(): Promise<Uint8Array> {
    const candidates = ['/assets/qpdf.wasm', 'assets/qpdf.wasm', './assets/qpdf.wasm'];
    const failures: string[] = [];
    for (const path of candidates) {
      try {
        const response = await fetch(path);
        if (response.ok) return new Uint8Array(await response.arrayBuffer());
        failures.push(`${path}: ${response.status}`);
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : 'failed'}`);
      }
    }
    throw new Error(`Could not load PDF password engine. Restart the dev server if assets were just added. ${failures.join(' | ')}`);
  }

  private async createPdfDocument(applyMetadata = false): Promise<PDFDocument> {
    if (!this.currentBytes.length) throw new Error('Load a PDF first.');
    const source = await this.loadSourcePdfDocument();
    const output = await PDFDocument.create();
    for (const page of this.pages) {
      const [copied] = await output.copyPages(source, [page.sourceIndex]);
      copied.setRotation(degrees((copied.getRotation().angle + page.rotation + 360) % 360));
      output.addPage(copied);
    }
    await this.applyOverlays(output);
    if (applyMetadata) this.writeMetadata(output);
    return output;
  }

  private async createHtmlEditedPdf(applyMetadata = true): Promise<PDFDocument> {
    if (!this.currentBytes.length) throw new Error('Load a PDF first.');
    const source = await this.loadSourcePdfDocument();
    const output = await PDFDocument.create();
    for (const page of this.pages) {
      const [copied] = await output.copyPages(source, [page.sourceIndex]);
      copied.setRotation(degrees((copied.getRotation().angle + page.rotation + 360) % 360));
      output.addPage(copied);
    }
    await this.applyHtmlTextEdits(output);
    await this.applyOverlays(output);
    if (applyMetadata) this.writeMetadata(output);
    return output;
  }

  private async createExportPdf(applyMetadata = true): Promise<PDFDocument> {
    return this.createHtmlEditedPdf(applyMetadata);
  }

  private async applyHtmlTextEdits(pdf: PDFDocument): Promise<void> {
    const fonts = {
      helvetica: await pdf.embedFont(StandardFonts.Helvetica),
      helveticaBold: await pdf.embedFont(StandardFonts.HelveticaBold),
      helveticaItalic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      helveticaBoldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
      times: await pdf.embedFont(StandardFonts.TimesRoman),
      timesBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
      timesItalic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
      timesBoldItalic: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
      courier: await pdf.embedFont(StandardFonts.Courier),
      courierBold: await pdf.embedFont(StandardFonts.CourierBold),
      courierItalic: await pdf.embedFont(StandardFonts.CourierOblique),
      courierBoldItalic: await pdf.embedFont(StandardFonts.CourierBoldOblique),
    };
    const pdfPages = pdf.getPages();
    for (const [pageIndex, pageItem] of this.pages.entries()) {
      const page = pdfPages[pageIndex];
      const { width, height } = page.getSize();
      const scaleX = width / pageItem.width;
      const scaleY = height / pageItem.height;
      const editedItems = this.htmlTextItems
        .filter((item) => item.pageId === pageItem.id && this.htmlTextChanged(item));
      for (const item of editedItems) {
        const isLinkedText = item.textDecoration === 'underline';
        const x = item.x * scaleX;
        const topY = item.y * scaleY;
        const boxWidth = Math.max(1, item.width * scaleX);
        const boxHeight = Math.max(item.size * 1.25, item.height) * scaleY;
        const boxY = height - topY - boxHeight;
        if (!isLinkedText || item.text !== item.originalText) {
          page.drawRectangle({
            x: x - 1,
            y: boxY - 1,
            width: boxWidth + 2,
            height: boxHeight + 2,
            color: this.hexToRgb(item.backgroundColor || '#ffffff'),
            opacity: 1,
          });
        }
        const textFont = this.fontForHtmlItem(item, fonts);
        const fontSize = Math.max(5, item.size * Math.min(scaleX, scaleY));
        const lineHeight = fontSize * 1.08;
        item.text.split(/\r?\n/).forEach((line, lineIndex) => {
          const y = boxY + boxHeight - (fontSize * 0.86) - lineIndex * lineHeight;
          if (y < boxY - lineHeight) return;
          const textWidth = Math.min(boxWidth, textFont.widthOfTextAtSize(line, fontSize));
          const textX = item.textAlign === 'center' ? x + boxWidth / 2 - textWidth / 2 : x;
          page.drawText(line || ' ', {
            x: textX,
            y,
            size: fontSize,
            font: textFont,
            color: this.hexToRgb(item.color ?? '#111111'),
            maxWidth: boxWidth,
          });
          if (item.textDecoration === 'underline') {
            const underlineY = y - Math.max(1, fontSize * 0.12);
            page.drawLine({
              start: { x: textX, y: underlineY },
              end: { x: textX + textWidth, y: underlineY },
              thickness: Math.max(0.5, fontSize * 0.04),
              color: this.hexToRgb(item.color ?? '#0000ee'),
            });
          }
        });
      }
    }
  }

  htmlTextChanged(item: HtmlTextItem): boolean {
    return item.text !== item.originalText
      || (item.textDecoration !== 'underline' && (
        Math.abs(item.size - item.originalSize) > 0.2
        || (item.color ?? '#111111').toLowerCase() !== (item.originalColor ?? '#111111').toLowerCase()
        || (item.fontWeight ?? '400') !== (item.originalFontWeight ?? '400')
        || (item.fontStyle ?? 'normal') !== (item.originalFontStyle ?? 'normal')
      ));
  }

  private fontForHtmlItem(item: HtmlTextItem, fonts: Record<string, PDFFont>): PDFFont {
    const family = (item.fontFamily ?? '').toLowerCase();
    const bold = Number(item.fontWeight) >= 600 || item.fontWeight === 'bold';
    const italic = item.fontStyle === 'italic';
    const prefix = family.includes('courier') || family.includes('mono')
      ? 'courier'
      : family.includes('times') || family.includes('serif') || family.includes('georgia')
        ? 'times'
        : 'helvetica';
    if (bold && italic) return fonts[`${prefix}BoldItalic`];
    if (bold) return fonts[`${prefix}Bold`];
    if (italic) return fonts[`${prefix}Italic`];
    return fonts[prefix];
  }

  private async applyOverlays(pdf: PDFDocument): Promise<void> {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
    const pdfPages = pdf.getPages();
    for (const [pageIndex, pageItem] of this.pages.entries()) {
      const page = pdfPages[pageIndex];
      const { width, height } = page.getSize();
      const scaleX = width / pageItem.width;
      const scaleY = height / pageItem.height;
      for (const overlay of this.overlays.filter((item) => item.pageId === pageItem.id)) {
        const x = overlay.x * scaleX;
        const y = height - (overlay.y + overlay.height) * scaleY;
        if (overlay.kind === 'image' && overlay.imageData) {
          const imageData = await this.croppedImageDataUrl(overlay);
          const imageBytes = await fetch(imageData).then((response) => response.arrayBuffer());
          const image = overlay.imageType === 'png' ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
          page.drawImage(image, { x, y, width: overlay.width * scaleX, height: overlay.height * scaleY, opacity: overlay.opacity });
        } else if (overlay.kind === 'rectangle' || overlay.kind === 'highlight' || overlay.kind === 'ellipse' || overlay.kind === 'line') {
          if (overlay.kind === 'line') {
            page.drawLine({ start: { x, y: y + overlay.height * scaleY / 2 }, end: { x: x + overlay.width * scaleX, y: y + overlay.height * scaleY / 2 }, thickness: Math.max(1, overlay.height * scaleY), color: this.hexToRgb(overlay.color), opacity: overlay.opacity });
          } else if (overlay.kind === 'ellipse') {
            page.drawEllipse({
              x: x + overlay.width * scaleX / 2,
              y: y + overlay.height * scaleY / 2,
              xScale: overlay.width * scaleX / 2,
              yScale: overlay.height * scaleY / 2,
              color: overlay.fillEnabled ? this.hexToRgb(overlay.fillColor ?? overlay.color) : undefined,
              borderColor: this.hexToRgb(overlay.borderColor ?? overlay.color),
              borderWidth: Math.max(0, overlay.borderWidth ?? 2),
              opacity: overlay.opacity,
              borderOpacity: overlay.opacity,
            });
          } else if (overlay.kind === 'rectangle') {
            page.drawRectangle({
              x,
              y,
              width: overlay.width * scaleX,
              height: overlay.height * scaleY,
              color: overlay.fillEnabled ? this.hexToRgb(overlay.fillColor ?? overlay.color) : undefined,
              borderColor: this.hexToRgb(overlay.borderColor ?? overlay.color),
              borderWidth: Math.max(0, overlay.borderWidth ?? 2),
              opacity: overlay.opacity,
              borderOpacity: overlay.opacity,
            });
          } else {
            page.drawRectangle({ x, y, width: overlay.width * scaleX, height: overlay.height * scaleY, color: rgb(1, 0.88, 0.18), opacity: overlay.opacity });
          }
        } else {
          const isBold = overlay.kind === 'signature' || Number(overlay.fontWeight) >= 600 || overlay.fontWeight === 'bold';
          const isItalic = overlay.fontStyle === 'italic';
          const textFont = isBold && isItalic ? boldItalic : isBold ? bold : isItalic ? italic : font;
          page.drawText(overlay.text, { x, y: y + 8, size: overlay.size, font: textFont, color: this.hexToRgb(overlay.color), opacity: overlay.opacity });
        }
      }
    }
  }

  private writeMetadata(pdf: PDFDocument): void {
    pdf.setTitle(this.title || this.fileName);
    pdf.setAuthor(this.author || 'TheConvertor');
    pdf.setSubject(this.subject);
    pdf.setKeywords(this.keywords.split(',').map((item) => item.trim()).filter(Boolean));
    pdf.setProducer('TheConvertor browser PDF workbench');
    pdf.setCreator('TheConvertor');
    pdf.setModificationDate(new Date());
  }

  private async generateBookmarks(): Promise<void> {
    const pdf = await this.openPdfJsDocument();
    const bookmarks: { title: string; page: number }[] = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      const title = (content.items as unknown[])
        .filter((item): item is PdfTextItemLike => this.isPdfTextItem(item))
        .map((item) => item.str.trim())
        .find((text) => text.length >= 4 && text.length <= 90) ?? `Page ${index}`;
      bookmarks.push({ title, page: index });
    }
    const text = bookmarks.map((bookmark) => `${bookmark.page}. ${bookmark.title}`).join('\n');
    this.downloadBlob(text, 'pdf-bookmarks.txt', 'text/plain');
    this.status = `${bookmarks.length} bookmark title(s) generated.`;
  }

  private async exportText(): Promise<void> {
    const pages = await this.structuredTextPages();
    const text = pages
      .map((page) => [`Page ${page.page}`, ...page.rows.map((row) => row.cells.map((cell) => cell.text).join('\t'))].join('\n'))
      .join('\n\n');
    this.downloadBlob(text, 'converted.txt', 'text/plain;charset=utf-8');
    this.status = 'Text exported.';
  }

  private async exportDoc(): Promise<void> {
    const pages = await this.structuredTextPages();
    const body = pages.map((page) => `
      <h2>Page ${page.page}</h2>
      ${page.rows.map((row) => `<p>${row.cells.map((cell) => this.escapeHtml(cell.text)).join(' ')}</p>`).join('')}
    `).join('<br style="page-break-before:always">');
    const html = `<!doctype html>
      <html><head><meta charset="utf-8"><title>${this.escapeHtml(this.title || this.fileName)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.35}h2{font-size:13pt}p{margin:0 0 6pt}</style>
      </head><body>${body}</body></html>`;
    this.downloadBlob(html, 'converted.doc', 'application/msword;charset=utf-8');
    this.status = 'Word-compatible DOC exported.';
  }

  private async exportDocx(): Promise<void> {
    const pages = await this.structuredTextPages();
    const paragraphs = pages.flatMap((page, index) => [
      this.docxParagraph(`Page ${page.page}`, index > 0),
      ...page.rows.map((row) => this.docxParagraph(row.cells.map((cell) => cell.text).join(' '))),
    ]).join('');
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body>
      </w:document>`;
    const files = [
      { name: '[Content_Types].xml', data: this.utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`) },
      { name: '_rels/.rels', data: this.utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
      { name: 'word/document.xml', data: this.utf8(documentXml) },
    ];
    this.downloadBlob(this.createZip(files), 'converted.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    this.status = 'DOCX exported.';
  }

  private async exportExcel(): Promise<void> {
    const pages = await this.structuredTextPages();
    const sheets = pages.map((page) => `
      <h2>Page ${page.page}</h2>
      <table>
        ${page.rows.map((row) => `<tr>${row.cells.map((cell) => `<td>${this.escapeHtml(cell.text)}</td>`).join('')}</tr>`).join('')}
      </table>
    `).join('<br>');
    const html = `<!doctype html>
      <html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:10pt}
        table{border-collapse:collapse;margin-bottom:18px}
        td{border:1px solid #999;padding:4px 8px;vertical-align:top;mso-number-format:"\\@";}
        h2{font-size:12pt}
      </style></head><body>${sheets}</body></html>`;
    this.downloadBlob(html, 'converted.xls', 'application/vnd.ms-excel;charset=utf-8');
    this.status = 'Excel-compatible XLS exported.';
  }

  private async downloadPdf(applyMetadata: boolean, name: string, forceMetadata = false): Promise<void> {
    const pdf = await this.createExportPdf(applyMetadata || forceMetadata);
    const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    const protectedBytes = await this.protectPdfBytes(new Uint8Array(bytes));
    this.downloadBlob(protectedBytes, name, 'application/pdf');
    this.status = this.pdfPassword.trim()
      ? `${name} exported with password protection.`
      : `${name} exported.`;
  }

  private async downloadEncryptedPdf(): Promise<void> {
    const userPassword = this.pdfPassword.trim();
    if (!userPassword) throw new Error('Enter a PDF password first.');
    const pdf = await this.createExportPdf(true);
    const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    const encrypted = await this.protectPdfBytes(new Uint8Array(bytes), true);
    this.downloadBlob(encrypted, 'password-protected.pdf', 'application/pdf');
    this.status = 'Password-protected PDF exported.';
  }

  private async protectPdfBytes(bytes: Uint8Array, requirePassword = false): Promise<Uint8Array> {
    const userPassword = this.pdfPassword.trim();
    if (!userPassword) {
      if (requirePassword) throw new Error('Enter a PDF password first.');
      return bytes;
    }
    if (this.isMobileScreen()) {
      throw new Error('Password encryption uses qpdf-wasm and is disabled on mobile. Export without password or use desktop.');
    }
    const ownerPassword = this.ownerPassword.trim() || userPassword;
    return this.runQpdf(bytes, ['--encrypt', userPassword, ownerPassword, '256', '--']);
  }

  private async mergePdfs(): Promise<void> {
    if (!this.extraFiles.length) throw new Error('Choose extra PDFs to merge first.');
    const output = this.currentBytes.length ? await this.createExportPdf(true) : await PDFDocument.create();
    for (const file of this.extraFiles) {
      const incoming = await PDFDocument.load(file.bytes);
      const copied = await output.copyPages(incoming, incoming.getPageIndices());
      copied.forEach((page) => output.addPage(page));
    }
    const bytes = await output.save({ useObjectStreams: true });
    await this.loadBytes(new Uint8Array(bytes), 'merged.pdf');
    this.extraFiles = [];
    this.status = 'Merged PDFs into the workspace.';
  }

  private async downloadSelectedAsOne(): Promise<void> {
    const selected = this.selectedPages;
    if (!selected.length) throw new Error('Select pages first.');
    const original = this.pages;
    this.pages = selected;
    await this.downloadPdf(true, 'selected-pages.pdf');
    this.pages = original;
  }

  private async downloadSelectedSeparately(): Promise<void> {
    const selected = this.selectedPages;
    if (!selected.length) throw new Error('Select pages first.');
    for (let index = 0; index < selected.length; index += 1) {
      const original = this.pages;
      this.pages = [selected[index]];
      await this.downloadPdf(true, `page-${index + 1}.pdf`);
      this.pages = original;
    }
    this.status = `${selected.length} selected page PDF(s) exported.`;
  }

  private async extractRange(): Promise<void> {
    const indexes = this.parseRange();
    if (!indexes.length) throw new Error('Enter a range like 1-3, 7, 9-10.');
    const original = this.pages;
    this.pages = indexes.map((index) => original[index]).filter(Boolean);
    await this.downloadPdf(true, 'range.pdf');
    this.pages = original;
  }

  private duplicateSelected(): void {
    const additions = this.selectedPages.map((page) => ({ ...page, id: this.createId(), selected: false }));
    this.pages.splice(this.pages.length, 0, ...additions);
    this.afterPageChange(`${additions.length} page(s) duplicated.`);
  }

  private moveSelected(first: boolean): void {
    const selected = this.selectedPages;
    const rest = this.pages.filter((page) => !page.selected);
    this.pages = first ? [...selected, ...rest] : [...rest, ...selected];
    this.afterPageChange(first ? 'Selected pages moved to the front.' : 'Selected pages moved to the end.');
  }

  private sortByParity(oddFirst: boolean): void {
    const odd = this.pages.filter((_, index) => index % 2 === 0);
    const even = this.pages.filter((_, index) => index % 2 === 1);
    this.pages = oddFirst ? [...odd, ...even] : [...even, ...odd];
    this.afterPageChange(oddFirst ? 'Odd pages moved before even pages.' : 'Even pages moved before odd pages.');
  }

  private rotateSelected(amount: number): void {
    const targets = this.selectedPages.length ? this.selectedPages : this.activePage ? [this.activePage] : [];
    targets.forEach((page) => page.rotation = (page.rotation + amount + 360) % 360);
    this.afterPageChange(`Rotated ${targets.length} page(s).`);
  }

  private selectParity(odd: boolean): void {
    this.pages.forEach((page, index) => page.selected = odd ? index % 2 === 0 : index % 2 === 1);
    this.status = odd ? 'Odd pages selected.' : 'Even pages selected.';
  }

  private keepSelected(): void {
    if (!this.selectedPages.length) throw new Error('Select pages to keep.');
    this.pages = this.selectedPages.map((page) => ({ ...page, selected: false }));
    this.afterPageChange('Kept selected pages only.');
  }

  private deleteSelectedPages(): void {
    const removedIds = new Set(this.selectedPages.map((page) => page.id));
    if (!removedIds.size) throw new Error('Select pages to delete.');
    this.pages = this.pages.filter((page) => !removedIds.has(page.id));
    this.overlays = this.overlays.filter((item) => !removedIds.has(item.pageId));
    this.htmlTextItems = this.htmlTextItems.filter((item) => !removedIds.has(item.pageId));
    for (const id of removedIds) delete this.htmlPageBackgrounds[id];
    this.afterPageChange('Selected pages deleted.');
  }

  private removeBlankLikePages(): void {
    const before = this.pages.length;
    this.pages = this.pages.filter((page) => page.width * page.height > 10000);
    this.afterPageChange(`${before - this.pages.length} blank-like page(s) removed.`);
  }

  private bookletOrder(): void {
    const ordered: PageItem[] = [];
    let left = 0;
    let right = this.pages.length - 1;
    while (left <= right) {
      if (right >= left) ordered.push(this.pages[right]);
      if (left !== right) ordered.push(this.pages[left]);
      left += 1;
      right -= 1;
    }
    this.pages = ordered;
    this.afterPageChange('Booklet order created.');
  }

  private async downloadFittedPdf(width: number, height: number, name: string): Promise<void> {
    const source = await this.createExportPdf(true);
    const output = await PDFDocument.create();
    const embedded = await output.embedPdf(await source.save());
    embedded.forEach((page) => {
      const target = output.addPage([width, height]);
      const scale = Math.min(width / page.width, height / page.height) * 0.94;
      target.drawPage(page, { x: (width - page.width * scale) / 2, y: (height - page.height * scale) / 2, xScale: scale, yScale: scale });
    });
    this.downloadBlob(await output.save({ useObjectStreams: true }), name, 'application/pdf');
    this.status = `${name} exported.`;
  }

  private addOverlay(kind: OverlayKind, preset?: 'square' | 'whiteout'): void {
    const page = this.activePage;
    if (!page) throw new Error('Load a PDF first.');
    const isShape = kind === 'rectangle' || kind === 'ellipse' || kind === 'line';
    const isWhiteout = preset === 'whiteout';
    const shapeColor = isWhiteout ? '#ffffff' : '#dc2626';
    this.overlays = [...this.overlays, {
      id: this.createId(),
      pageId: page.id,
      kind,
      text: kind === 'signature' ? 'Signed' : this.editText,
      x: Math.round(page.width * 0.16),
      y: Math.round(page.height * 0.18),
      width: kind === 'text' || kind === 'signature' ? 160 : kind === 'line' ? 180 : preset === 'square' ? 96 : 220,
      height: kind === 'text' || kind === 'signature' ? 42 : kind === 'line' ? 4 : preset === 'square' ? 96 : 58,
      size: kind === 'signature' ? 28 : 18,
      color: isShape ? shapeColor : kind === 'highlight' ? '#facc15' : kind === 'signature' ? '#14532d' : '#111827',
      fillColor: kind === 'rectangle' || kind === 'ellipse' ? '#ffffff' : kind === 'highlight' ? '#facc15' : undefined,
      borderColor: kind === 'rectangle' || kind === 'ellipse' ? shapeColor : undefined,
      fillEnabled: kind === 'highlight' || isWhiteout,
      borderWidth: kind === 'rectangle' || kind === 'ellipse' ? (isWhiteout ? 0 : 2) : undefined,
      opacity: kind === 'highlight' ? 0.35 : 1,
      rotation: 0,
      fontFamily: kind === 'text' ? this.fontChoices[0].value : undefined,
    }];
    this.selectedOverlayId = this.overlays[this.overlays.length - 1].id;
    this.status = `${kind} added to active page.`;
  }

  private stampPage(label = this.stampText): void {
    this.editText = label;
    this.addOverlay('signature');
  }

  private watermarkAll(): void {
    for (const page of this.pages) {
      this.overlays.push({
        id: this.createId(),
        pageId: page.id,
        kind: 'text',
        text: this.watermarkText,
        x: Math.round(page.width * 0.28),
        y: Math.round(page.height * 0.45),
        width: 300,
        height: 60,
        size: 36,
        color: '#64748b',
        opacity: 0.25,
      });
    }
    this.status = 'Watermark added to every page.';
  }

  private async downloadWatermarkedPdf(): Promise<void> {
    const before = this.cloneData(this.overlays);
    this.watermarkAll();
    await this.downloadPdf(true, 'watermarked.pdf');
    this.overlays = before;
    this.status = 'Watermarked PDF generated with metadata.';
  }

  private pageNumbers(): void {
    this.pages.forEach((page, index) => {
      this.overlays.push({
        id: this.createId(),
        pageId: page.id,
        kind: 'text',
        text: `${index + 1} / ${this.pages.length}`,
        x: Math.round(page.width / 2 - 24),
        y: this.pageNumberPosition === 'bottom' ? Math.round(page.height - 42) : 24,
        width: 80,
        height: 24,
        size: 11,
        color: '#111827',
        opacity: 0.75,
      });
    });
    this.status = 'Page numbers added.';
  }

  private clearPageEdits(): void {
    const id = this.activePage?.id;
    this.overlays = id ? this.overlays.filter((item) => item.pageId !== id) : this.overlays;
    this.status = 'Active page edits cleared.';
  }

  private async sanitizeMetadata(): Promise<void> {
    const pdf = await this.createPdfDocument(false);
    pdf.setTitle('');
    pdf.setAuthor('');
    pdf.setSubject('');
    pdf.setKeywords([]);
    this.downloadBlob(await pdf.save({ useObjectStreams: true }), 'sanitized.pdf', 'application/pdf');
    this.status = 'Metadata sanitized and exported.';
  }

  private async docInfo(): Promise<void> {
    const pdf = await this.loadSourcePdfDocument();
    this.status = `Title: ${pdf.getTitle() || 'none'} | Author: ${pdf.getAuthor() || 'none'} | Pages: ${pdf.getPageCount()}`;
  }

  private async structuredTextPages(): Promise<{ page: number; rows: { y: number; cells: { x: number; text: string }[] }[] }[]> {
    if (!this.pages.length) throw new Error('Load a PDF first.');
    if (this.htmlTextItems.length) {
      return this.pages.map((page, index) => ({
        page: index + 1,
        rows: this.rowsFromPositionedItems(this.htmlTextItems.filter((item) => item.pageId === page.id)),
      }));
    }

    const pdf = await this.openPdfJsDocument();
    const results: { page: number; rows: { y: number; cells: { x: number; text: string }[] }[] }[] = [];
    for (const [index, pageItem] of this.pages.entries()) {
      const page = await pdf.getPage(pageItem.sourceIndex + 1);
      const viewport = page.getViewport({ scale: 1, rotation: pageItem.rotation });
      const content = await page.getTextContent();
      results.push({
        page: index + 1,
        rows: this.rowsFromPositionedItems(this.htmlItemsFromTextContent(content, viewport, pageItem.id)),
      });
    }
    return results;
  }

  private rowsFromPositionedItems(items: Pick<HtmlTextItem, 'x' | 'y' | 'text' | 'size' | 'height'>[]): { y: number; cells: { x: number; text: string }[] }[] {
    const rows: { y: number; cells: { x: number; text: string }[] }[] = [];
    for (const item of [...items].sort((a, b) => Math.abs(a.y - b.y) < Math.max(a.size, b.size) * 0.5 ? a.x - b.x : a.y - b.y)) {
      const text = item.text.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(item.height, item.size) * 0.65);
      if (row) {
        row.cells.push({ x: item.x, text });
      } else {
        rows.push({ y: item.y, cells: [{ x: item.x, text }] });
      }
    }
    return rows.map((row) => ({ ...row, cells: row.cells.sort((a, b) => a.x - b.x) }));
  }

  private async findText(): Promise<void> {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) throw new Error('Type a search term first.');
    const pdf = await this.openPdfJsDocument();
    const matches: number[] = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const text = await (await pdf.getPage(index)).getTextContent();
      const pageText = (text.items as unknown[]).map((item) => this.isPdfTextItem(item) ? item.str : '').join(' ').toLowerCase();
      if (pageText.includes(term)) matches.push(index);
    }
    this.status = matches.length ? `Found "${term}" on page(s): ${matches.join(', ')}.` : `No matches for "${term}".`;
  }

  private auditDimensions(): void {
    this.status = this.pages.map((page, index) => `P${index + 1}: ${Math.round(page.width)}x${Math.round(page.height)}`).join(' | ');
  }

  private busyMessageFor(action: string): string {
    if (/download|export|zip|rebuild/i.test(action)) return 'Converting';
    if (/compress|optimize|downsample/i.test(action)) return 'Compressing';
    if (/html|inspect|find/i.test(action)) return 'Reading PDF';
    return 'Working';
  }

  private shouldRecordHistory(action: string): boolean {
    return !/download|export|docInfo|countPages|findText|auditDimensions|listSelected/i.test(action);
  }

  private recordHistory(): void {
    this.undoStack.push(this.createSnapshot());
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }

  private createSnapshot(): EditorSnapshot {
    return {
      pages: this.cloneData(this.pages),
      overlays: this.cloneData(this.overlays),
      htmlTextItems: this.cloneData(this.htmlTextItems),
      htmlPageBackgrounds: { ...this.htmlPageBackgrounds },
      activePageId: this.activePageId,
      selectedOverlayId: this.selectedOverlayId,
      selectedHtmlTextId: this.selectedHtmlTextId,
    };
  }

  private restoreSnapshot(snapshot: EditorSnapshot): void {
    this.pages = this.cloneData(snapshot.pages);
    this.overlays = this.cloneData(snapshot.overlays);
    this.htmlTextItems = this.cloneData(snapshot.htmlTextItems);
    this.htmlPageBackgrounds = { ...snapshot.htmlPageBackgrounds };
    this.activePageId = snapshot.activePageId;
    this.selectedOverlayId = snapshot.selectedOverlayId;
    this.selectedHtmlTextId = snapshot.selectedHtmlTextId;
    if (!this.pages.some((page) => page.id === this.activePageId)) {
      this.activePageId = this.pages[0]?.id ?? '';
    }
    this.queueActiveRender();
    this.queueThumbRender();
  }

  private cloneData<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private createId(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      const values = new Uint32Array(4);
      cryptoApi.getRandomValues(values);
      return Array.from(values, (value) => value.toString(36).padStart(7, '0')).join('-');
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  private async downloadActiveImage(type: 'image/png' | 'image/jpeg', name: string, quality = this.jpegQuality): Promise<void> {
    const active = this.activePage;
    if (!active) throw new Error('No active page.');
    const canvas = await this.renderPageImageForExport(active, this.effectiveImageExportScale());
    const blob = await this.canvasToBlob(canvas, type, type === 'image/jpeg' ? this.effectiveJpegQuality() : undefined);
    this.downloadBlob(blob, name, type);
    this.status = `${name} exported.`;
  }

  private async downloadImagesZip(targets: PageItem[], name: string): Promise<void> {
    if (!targets.length) throw new Error('Select at least one page first.');
    const files: { name: string; data: Uint8Array }[] = [];
    for (const page of targets) {
      const pageIndex = this.pages.indexOf(page) + 1;
      this.busyLabel = `Converting page ${pageIndex}`;
      const canvas = await this.renderPageImageForExport(page, this.effectiveImageExportScale());
      const blob = await this.canvasToBlob(canvas, 'image/png');
      files.push({
        name: `page-${String(pageIndex).padStart(3, '0')}.png`,
        data: new Uint8Array(await blob.arrayBuffer()),
      });
    }
    this.downloadBlob(this.createZip(files), name, 'application/zip');
    this.status = `${targets.length} page image(s) exported in ${name}.`;
  }

  private async downloadRasterPdf(name: string): Promise<void> {
    const output = await PDFDocument.create();
    const scale = this.effectiveCompressionScale();
    const quality = this.effectiveCompressionQuality();
    for (const page of this.pages) {
      this.busyLabel = `Compressing page ${this.pages.indexOf(page) + 1}`;
      const canvas = await this.renderEditedPageCanvas(page, scale);
      const blob = await this.canvasToBlob(canvas, 'image/jpeg', quality);
      const bytes = await blob.arrayBuffer();
      const image = await output.embedJpg(bytes);
      const target = output.addPage([page.width, page.height]);
      target.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
    }
    this.writeMetadata(output);
    this.downloadBlob(await output.save({ useObjectStreams: true }), name, 'application/pdf');
    this.status = `Compressed PDF exported at level ${this.compressionLevel}.`;
  }

  private effectiveImageExportScale(): number {
    return Math.max(2, Math.min(7, this.imageExportScale));
  }

  private effectiveJpegQuality(): number {
    return Math.max(0.35, Math.min(1, this.jpegQuality));
  }

  private effectiveCompressionScale(): number {
    const levelScale = 1.8 - (Math.min(5, Math.max(1, this.compressionLevel)) - 1) * 0.28;
    return Math.max(0.55, Math.min(2.2, Math.min(this.compressionScale, levelScale)));
  }

  private effectiveCompressionQuality(): number {
    const levelQuality = 0.9 - (Math.min(5, Math.max(1, this.compressionLevel)) - 1) * 0.12;
    return Math.max(0.25, Math.min(0.95, Math.min(this.compression, levelQuality)));
  }

  private async downloadVisualRebuildPdf(): Promise<void> {
    const output = await PDFDocument.create();
    for (const page of this.pages) {
      const canvas = await this.renderEditedPageCanvas(page, 2);
      const bytes = await fetch(canvas.toDataURL('image/jpeg', this.effectiveJpegQuality())).then((response) => response.arrayBuffer());
      const image = await output.embedJpg(bytes);
      const target = output.addPage([page.width, page.height]);
      target.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
    }
    this.writeMetadata(output);
    this.downloadBlob(await output.save({ useObjectStreams: true }), 'visual-rebuild.pdf', 'application/pdf');
    this.status = 'Visual PDF rebuilt from canvas. Placement matches the screen, but text is flattened.';
  }

  private async downloadHtmlRebuildPdf(): Promise<void> {
    const output = await this.createVisualHtmlRebuildPdf();
    this.downloadBlob(await output.save({ useObjectStreams: true, addDefaultPage: false }), 'html-rebuild.pdf', 'application/pdf');
    const editedCount = this.htmlTextItems.filter((item) => this.htmlTextChanged(item)).length;
    this.status = editedCount
      ? `HTML rebuilt PDF exported with ${editedCount} edited text fragment(s). Reconstructed chart pages were exported as structured visuals.`
      : 'HTML rebuilt PDF exported with reconstructed page structure preserved visually.';
  }

  private async createVisualHtmlRebuildPdf(): Promise<PDFDocument> {
    const output = await PDFDocument.create();
    for (const page of this.pages) {
      const htmlItems = this.htmlTextItems.filter((item) => item.pageId === page.id);
      const hasRebuild = !!this.htmlPageBackgrounds[page.id] || htmlItems.length > 0;
      if (hasRebuild) {
        const canvas = await this.renderHtmlPageCanvas(page, htmlItems.filter((item) => this.htmlTextChanged(item)), this.effectiveHtmlBackgroundScale());
        const imageBytes = await fetch(canvas.toDataURL('image/png')).then((response) => response.arrayBuffer());
        const image = await output.embedPng(imageBytes);
        const target = output.addPage([page.width, page.height]);
        target.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
      } else {
        const source = await this.loadSourcePdfDocument();
        const [copied] = await output.copyPages(source, [page.sourceIndex]);
        copied.setRotation(degrees((copied.getRotation().angle + page.rotation + 360) % 360));
        output.addPage(copied);
      }
    }
    this.writeMetadata(output);
    return output;
  }

  private async renderHtmlPageCanvas(pageItem: PageItem, htmlItems: HtmlTextItem[], scale: number): Promise<HTMLCanvasElement> {
    const canvas = await this.renderPageCanvas(pageItem, scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');

    for (const item of htmlItems) {
      this.paintHtmlTextToCanvas(context, item, scale);
    }
    for (const overlay of this.overlays.filter((item) => item.pageId === pageItem.id)) {
      await this.paintOverlayToCanvas(context, overlay, scale);
    }
    return canvas;
  }

  private async renderEditedPageCanvas(pageItem: PageItem, scale: number): Promise<HTMLCanvasElement> {
    const htmlItems = this.htmlTextItems.filter((item) => item.pageId === pageItem.id && this.htmlTextChanged(item));
    return htmlItems.length
      ? this.renderHtmlPageCanvas(pageItem, htmlItems, scale)
      : this.renderCompositePageCanvas(pageItem, scale);
  }

  private async renderPageImageForExport(pageItem: PageItem, scale: number): Promise<HTMLCanvasElement> {
    return this.pageHasEdits(pageItem)
      ? this.renderEditedPageCanvas(pageItem, scale)
      : this.renderPageCanvas(pageItem, scale);
  }

  private pageHasEdits(pageItem: PageItem): boolean {
    return this.overlays.some((item) => item.pageId === pageItem.id)
      || this.htmlTextItems.some((item) => item.pageId === pageItem.id && this.htmlTextChanged(item));
  }

  private paintHtmlTextToCanvas(context: CanvasRenderingContext2D, item: HtmlTextItem, scale: number): void {
    context.save();
    const weight = Number(item.fontWeight) >= 600 || item.fontWeight === 'bold' ? '700' : '400';
    const style = item.fontStyle === 'italic' ? 'italic' : 'normal';
    const family = item.fontFamily || 'Times New Roman, Georgia, serif';
    const lineHeight = item.size * 1.08 * scale;
    context.font = `${style} ${weight} ${item.size * scale}px ${family}`;
    context.fillStyle = item.color ?? '#111111';
    context.textBaseline = 'top';
    context.textAlign = item.textAlign === 'center' ? 'center' : 'left';
    item.text.split(/\r?\n/).forEach((line, index) => {
      const x = item.textAlign === 'center' ? (item.x + item.width / 2) * scale : item.x * scale;
      const y = item.y * scale + index * lineHeight;
      context.fillStyle = item.backgroundColor || '#ffffff';
      context.fillRect(item.x * scale - 1, y - 1, item.width * scale + 2, lineHeight + 2);
      context.fillStyle = item.color ?? '#111111';
      context.fillText(line, x, y, item.width * scale);
      if (item.textDecoration === 'underline') {
        const underlineY = y + item.size * scale * 1.02;
        const textWidth = Math.min(context.measureText(line).width, item.width * scale);
        const underlineStart = item.textAlign === 'center' ? x - textWidth / 2 : x;
        context.beginPath();
        context.moveTo(underlineStart, underlineY);
        context.lineTo(underlineStart + textWidth, underlineY);
        context.lineWidth = Math.max(1, scale * 0.5);
        context.strokeStyle = item.color ?? '#0000ee';
        context.stroke();
      }
    });
    context.restore();
  }

  private async renderPageCanvas(pageItem: PageItem, scale: number): Promise<HTMLCanvasElement> {
    if (pageItem.blank) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable.');
      this.paintBlankCanvas(canvas, context, pageItem, scale, false);
      return canvas;
    }
    const pdf = await this.openPdfJsDocument();
    const sourcePage = await pdf.getPage(pageItem.sourceIndex + 1);
    const safeScale = this.safePdfRenderScale(pageItem.width, pageItem.height, scale);
    const viewport = sourcePage.getViewport({ scale: safeScale, rotation: pageItem.rotation });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await sourcePage.render({ canvas, canvasContext: context, viewport }).promise;
    return canvas;
  }

  private async renderCompositePageCanvas(pageItem: PageItem, scale: number): Promise<HTMLCanvasElement> {
    const canvas = await this.renderPageCanvas(pageItem, scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');

    for (const overlay of this.overlays.filter((item) => item.pageId === pageItem.id)) {
      await this.paintOverlayToCanvas(context, overlay, scale);
    }
    return canvas;
  }

  private async paintOverlayToCanvas(context: CanvasRenderingContext2D, overlay: OverlayItem, scale: number): Promise<void> {
    context.save();
    context.globalAlpha = overlay.opacity;
    const x = overlay.x * scale;
    const y = overlay.y * scale;
    const width = overlay.width * scale;
    const height = overlay.height * scale;
    context.translate(x + width / 2, y + height / 2);
    context.rotate(((overlay.rotation ?? 0) * Math.PI) / 180);
    context.translate(-width / 2, -height / 2);

    if (overlay.kind === 'image' && overlay.imageData) {
      const image = await this.loadImageElement(overlay.imageData);
      const cropX = ((overlay.cropX ?? 0) / 100) * image.naturalWidth;
      const cropY = ((overlay.cropY ?? 0) / 100) * image.naturalHeight;
      const cropWidth = ((overlay.cropWidth ?? 100) / 100) * image.naturalWidth;
      const cropHeight = ((overlay.cropHeight ?? 100) / 100) * image.naturalHeight;
      context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
    } else if (overlay.kind === 'rectangle' || overlay.kind === 'highlight') {
      if (overlay.kind === 'highlight' || overlay.fillEnabled) {
        context.fillStyle = overlay.kind === 'highlight' ? overlay.fillColor ?? '#facc15' : overlay.fillColor ?? overlay.color;
        context.fillRect(0, 0, width, height);
      }
      if (overlay.kind === 'rectangle') {
        context.strokeStyle = overlay.borderColor ?? overlay.color;
        context.lineWidth = Math.max(0, (overlay.borderWidth ?? 2) * scale);
        if (context.lineWidth > 0) context.strokeRect(0, 0, width, height);
      }
    } else if (overlay.kind === 'ellipse') {
      context.beginPath();
      context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      if (overlay.fillEnabled) {
        context.fillStyle = overlay.fillColor ?? overlay.color;
        context.fill();
      }
      context.strokeStyle = overlay.borderColor ?? overlay.color;
      context.lineWidth = Math.max(0, (overlay.borderWidth ?? 2) * scale);
      if (context.lineWidth > 0) context.stroke();
    } else if (overlay.kind === 'line') {
      context.strokeStyle = overlay.color;
      context.lineWidth = Math.max(1, height);
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();
    } else {
      const weight = Number(overlay.fontWeight) >= 600 || overlay.fontWeight === 'bold' ? '700' : '400';
      const style = overlay.fontStyle === 'italic' ? 'italic' : 'normal';
      const family = overlay.fontFamily || 'Arial, Helvetica, sans-serif';
      context.font = `${style} ${weight} ${overlay.size * scale}px ${family}`;
      context.fillStyle = overlay.color;
      context.textBaseline = 'top';
      context.fillText(overlay.text, 0, 0);
    }

    context.restore();
  }

  private loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not render image overlay.'));
      image.src = src;
    });
  }

  private canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode page image.')), type, quality);
    });
  }

  private async croppedImageDataUrl(overlay: OverlayItem): Promise<string> {
    if (!overlay.imageData || (
      (overlay.cropX ?? 0) <= 0
      && (overlay.cropY ?? 0) <= 0
      && (overlay.cropWidth ?? 100) >= 100
      && (overlay.cropHeight ?? 100) >= 100
    )) {
      return overlay.imageData ?? '';
    }
    const image = await this.loadImageElement(overlay.imageData);
    const cropX = ((overlay.cropX ?? 0) / 100) * image.naturalWidth;
    const cropY = ((overlay.cropY ?? 0) / 100) * image.naturalHeight;
    const cropWidth = Math.max(1, ((overlay.cropWidth ?? 100) / 100) * image.naturalWidth);
    const cropHeight = Math.max(1, ((overlay.cropHeight ?? 100) / 100) * image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cropWidth);
    canvas.height = Math.round(cropHeight);
    const context = canvas.getContext('2d');
    if (!context) return overlay.imageData;
    context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(overlay.imageType === 'jpg' ? 'image/jpeg' : 'image/png', this.effectiveJpegQuality());
  }

  private async renderActivePageCanvas(scale: number): Promise<HTMLCanvasElement> {
    const active = this.activePage;
    if (!active) throw new Error('No active page.');
    const pdf = await this.openPdfJsDocument();
    const sourcePage = await pdf.getPage(active.sourceIndex + 1);
    const viewport = sourcePage.getViewport({ scale, rotation: active.rotation });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await sourcePage.render({ canvas, canvasContext: context, viewport }).promise;
    return canvas;
  }

  private parseRange(): number[] {
    const values = new Set<number>();
    for (const part of this.rangeText.split(',')) {
      const clean = part.trim();
      if (!clean) continue;
      const [startRaw, endRaw] = clean.split('-').map((value) => Number(value.trim()));
      const start = Number.isFinite(startRaw) ? startRaw : 0;
      const end = Number.isFinite(endRaw) ? endRaw : start;
      for (let index = Math.max(1, start); index <= Math.min(this.pages.length, end); index += 1) values.add(index - 1);
    }
    return [...values].sort((a, b) => a - b);
  }

  private afterPageChange(message: string): void {
    if (!this.pages.length) {
      this.activePageId = '';
      this.status = 'No pages left in workspace.';
      return;
    }
    if (!this.pages.some((page) => page.id === this.activePageId)) {
      this.activePageId = this.pages[0].id;
    }
    this.status = message;
    this.queueActiveRender();
    this.queueThumbRender();
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.readAsDataURL(file);
    });
  }

  private getImageSize(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Could not load image.'));
      image.src = src;
    });
  }

  private hexToRgb(hex: string): ReturnType<typeof rgb> {
    const [redRaw, greenRaw, blueRaw] = this.hexToRgbValues(hex) ?? [255, 255, 255];
    const red = redRaw / 255;
    const green = greenRaw / 255;
    const blue = blueRaw / 255;
    return rgb(red, green, blue);
  }

  private hexToRgbValues(hex: string): [number, number, number] | undefined {
    const value = hex.replace('#', '').trim();
    if (!/^[0-9a-f]{6}$/i.test(value)) return undefined;
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
    ];
  }

  private downloadBlob(data: Blob | Uint8Array<ArrayBufferLike> | ArrayBuffer | string, name: string, type: string): void {
    const blob = data instanceof Blob ? data : new Blob([this.asBlobPart(data)], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  private asBlobPart(data: Uint8Array<ArrayBufferLike> | ArrayBuffer | string): BlobPart {
    if (typeof data === 'string' || data instanceof ArrayBuffer) return data;
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy;
  }

  private utf8(value: string): Uint8Array {
    return new TextEncoder().encode(value);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private docxParagraph(text: string, pageBreak = false): string {
    const breakXml = pageBreak ? '<w:r><w:br w:type="page"/></w:r>' : '';
    return `<w:p>${breakXml}<w:r><w:t xml:space="preserve">${this.escapeHtml(text)}</w:t></w:r></w:p>`;
  }

  private createZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const crc = this.crc32(file.data);
      const local = this.zipHeader(0x04034b50, nameBytes, file.data.length, crc, offset);
      localParts.push(local, file.data);
      centralParts.push(this.zipHeader(0x02014b50, nameBytes, file.data.length, crc, offset));
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
    return this.concatBytes([...localParts, ...centralParts, end]);
  }

  private zipHeader(signature: number, nameBytes: Uint8Array, size: number, crc: number, offset: number): Uint8Array {
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

  private crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private concatBytes(parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) {
      output.set(part, cursor);
      cursor += part.length;
    }
    return output;
  }
}
