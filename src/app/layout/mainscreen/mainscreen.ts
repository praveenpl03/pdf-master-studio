import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, ViewChild, ViewChildren, QueryList } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

type OperationGroup = 'organize' | 'convert' | 'edit' | 'optimize' | 'protect' | 'analyze';
type OverlayKind = 'text' | 'rectangle' | 'signature' | 'highlight' | 'image' | 'ellipse' | 'line';

interface PageItem {
  id: string;
  sourceIndex: number;
  rotation: number;
  selected: boolean;
  thumb?: string;
  width: number;
  height: number;
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
  opacity: number;
  imageData?: string;
  imageType?: 'png' | 'jpg';
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

  pages: PageItem[] = [];
  overlays: OverlayItem[] = [];
  extraFiles: FileRecord[] = [];
  activePageId = '';
  status = 'Load a PDF to begin, or use the sample file.';
  fileName = 'document.pdf';
  currentBytes: Uint8Array<ArrayBufferLike> = new Uint8Array();
  busy = false;
  busyLabel = '';
  zoom = 1;
  rangeText = '';
  stampText = 'APPROVED';
  watermarkText = 'Confidential';
  editText = 'New text';
  author = 'TheConvertor';
  title = 'Edited PDF';
  subject = 'PDF processed in browser';
  keywords = 'pdf, convertor, editor';
  compression = 0.72;
  compressionLevel = 3;
  compressionScale = 1.15;
  jpegQuality = 0.86;
  pageNumberPosition: 'bottom' | 'top' = 'bottom';
  searchTerm = '';
  selectedOverlayId = '';
  textInspectMode = false;
  inspectedTextItems: InspectTextItem[] = [];
  htmlEditMode = true;
  htmlTextItems: HtmlTextItem[] = [];
  htmlPageBackgrounds: Record<string, string> = {};
  selectedHtmlTextId = '';
  shapeMenuOpen = false;
  private dragState?: { id: string; startX: number; startY: number; originalX: number; originalY: number };
  private resizeState?: { id: string; startX: number; startY: number; originalWidth: number; originalHeight: number };

  readonly toolGroups: { key: OperationGroup; title: string }[] = [
    { key: 'organize', title: 'Organize' },
    { key: 'convert', title: 'Convert' },
    { key: 'edit', title: 'Edit' },
    { key: 'optimize', title: 'Optimize' },
    { key: 'protect', title: 'Protect' },
    { key: 'analyze', title: 'Analyze' },
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
    { name: 'Export selected as PDFs', group: 'convert', action: 'downloadSelected' },
    { name: 'Export selected images ZIP', group: 'convert', action: 'downloadSelectedImagesZip' },
    { name: 'Export all images ZIP', group: 'convert', action: 'downloadAllImagesZip' },
    { name: 'Make booklet order', group: 'convert', action: 'booklet' },
    { name: 'A4 fit copy', group: 'convert', action: 'a4Fit' },
    { name: 'US Letter fit copy', group: 'convert', action: 'letterFit' },
    { name: 'Flatten edits', group: 'convert', action: 'downloadFlattened' },
    { name: 'Rebuild visual PDF', group: 'convert', action: 'visualRebuild' },
    { name: 'Export HTML rebuild', group: 'convert', action: 'htmlRebuildPdf' },
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
    (pdfjsLib.GlobalWorkerOptions as { workerSrc: string }).workerSrc = '/pdf.worker.mjs';
    this.thumbCanvases.changes.subscribe(() => this.queueThumbRender());
    this.status = 'Open a PDF to begin.';
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

  get visibleTools(): PdfTool[] {
    const term = this.searchTerm.trim().toLowerCase();
    return term ? this.tools.filter((tool) => tool.name.toLowerCase().includes(term)) : this.tools;
  }

  toolsFor(group: OperationGroup): PdfTool[] {
    return this.visibleTools.filter((tool) => tool.group === group);
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
    for (const file of files) {
      this.extraFiles.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    this.status = `${this.extraFiles.length} merge file(s) ready.`;
    input.value = '';
  }

  async run(action: string): Promise<void> {
    try {
      this.busy = true;
      this.busyLabel = this.busyMessageFor(action);
      switch (action) {
        case 'merge': await this.mergePdfs(); break;
        case 'splitSelected': await this.downloadSelectedAsOne(); break;
        case 'extractRange': await this.extractRange(); break;
        case 'deleteSelected': this.pages = this.pages.filter((page) => !page.selected); this.afterPageChange('Selected pages deleted.'); break;
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
        case 'downloadPdf': await this.downloadPdf(false, 'edited.pdf'); break;
        case 'downloadPng': await this.downloadActiveImage('image/png', 'page.png'); break;
        case 'downloadJpeg': await this.downloadActiveImage('image/jpeg', 'page.jpg', this.jpegQuality); break;
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
        case 'reconstructHtml': await this.reconstructAllHtmlFromCurrentPdf(); break;
        case 'inspectText': await this.inspectTextLayer(); break;
        case 'addText': this.addOverlay('text'); break;
        case 'chooseImage': document.getElementById('imageUpload')?.click(); break;
        case 'addSignature': this.addOverlay('signature'); break;
        case 'addHighlight': this.addOverlay('highlight'); break;
        case 'addEllipse': this.addOverlay('ellipse'); break;
        case 'addLine': this.addOverlay('line'); break;
        case 'addRedaction': this.addOverlay('rectangle'); break;
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
        case 'ownerStamp': this.stampPage('Owner copy'); break;
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

  setActive(page: PageItem): void {
    this.activePageId = page.id;
    this.selectedOverlayId = '';
    this.selectedHtmlTextId = '';
    this.inspectedTextItems = [];
    this.textInspectMode = false;
    this.queueActiveRender();
  }

  togglePage(page: PageItem, event: Event): void {
    event.stopPropagation();
    page.selected = !page.selected;
  }

  movePage(index: number, direction: -1 | 1, event: Event): void {
    event.stopPropagation();
    const target = index + direction;
    if (target < 0 || target >= this.pages.length) return;
    const [page] = this.pages.splice(index, 1);
    this.pages.splice(target, 0, page);
    this.status = `Moved page ${index + 1} to ${target + 1}.`;
  }

  deletePage(index: number, event: Event): void {
    event.stopPropagation();
    const [removed] = this.pages.splice(index, 1);
    if (removed) {
      this.overlays = this.overlays.filter((item) => item.pageId !== removed.id);
      this.htmlTextItems = this.htmlTextItems.filter((item) => item.pageId !== removed.id);
      delete this.htmlPageBackgrounds[removed.id];
    }
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
  }

  closeActiveEditing(): void {
    if (this.textInspectMode) return;
    this.selectedOverlayId = '';
    this.selectedHtmlTextId = '';
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
    const clone: OverlayItem = { ...item, id: crypto.randomUUID(), x: item.x + 14, y: item.y + 14 };
    this.overlays = [...this.overlays, clone];
    this.selectedOverlayId = clone.id;
    this.status = 'Selected edit duplicated.';
  }

  rotateSelectedOverlay(amount: number): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    item.rotation = ((item.rotation ?? 0) + amount + 360) % 360;
  }

  removeSelectedOverlay(): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    this.removeOverlay(item);
    this.status = item.generatedFromText ? 'Replacement removed. Original covered text stays hidden.' : 'Selected edit removed.';
  }

  revealOriginalForSelectedOverlay(): void {
    const item = this.selectedOverlay;
    if (!item || !item.generatedFromText) return;
    this.overlays = this.overlays.filter((overlay) => overlay.id !== item.id && !(overlay.locked && overlay.pageId === item.pageId && Math.abs(overlay.x - item.x) < 2 && Math.abs(overlay.y - item.y) < 2));
    this.selectedOverlayId = '';
    this.status = 'Replacement and its whiteout removed. Original text is visible again.';
  }

  toggleSelectedBold(): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    item.fontWeight = Number(item.fontWeight) >= 600 || item.fontWeight === 'bold' ? '400' : '700';
  }

  toggleSelectedItalic(): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    item.fontStyle = item.fontStyle === 'italic' ? 'normal' : 'italic';
  }

  resizeSelectedText(amount: number): void {
    const item = this.selectedOverlay;
    if (!item || item.locked) return;
    item.size = Math.max(6, item.size + amount);
    item.height = Math.max(item.height, item.size + 8);
  }

  toggleSelectedHtmlBold(): void {
    const item = this.selectedHtmlText;
    if (!item) return;
    item.fontWeight = Number(item.fontWeight) >= 600 || item.fontWeight === 'bold' ? '400' : '700';
  }

  toggleSelectedHtmlItalic(): void {
    const item = this.selectedHtmlText;
    if (!item) return;
    item.fontStyle = item.fontStyle === 'italic' ? 'normal' : 'italic';
  }

  resizeSelectedHtmlText(amount: number): void {
    const item = this.selectedHtmlText;
    if (!item) return;
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
    const dataUrl = await this.readFileAsDataUrl(file);
    const size = await this.getImageSize(dataUrl);
    const maxWidth = page.width * 0.42;
    const scale = Math.min(1, maxWidth / size.width);
    const overlay: OverlayItem = {
      id: crypto.randomUUID(),
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
    this.dragState = { id: item.id, startX: event.clientX, startY: event.clientY, originalX: item.x, originalY: item.y };
  }

  startResize(item: OverlayItem, event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
    if (item.locked) return;
    this.selectOverlay(item, event);
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
    const pdf = await pdfjsLib.getDocument({ data: this.currentBytes.slice() }).promise;
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
    const pdf = await pdfjsLib.getDocument({ data: this.currentBytes.slice() }).promise;
    const page = await pdf.getPage(active.sourceIndex + 1);
    const viewport = page.getViewport({ scale: 1, rotation: active.rotation });
    const content = await page.getTextContent();
    const annotations = await page.getAnnotations({ intent: 'display' });
    const items = this.htmlItemsFromTextContent(content, viewport, active.id, this.linkRectsFromAnnotations(annotations, viewport));

    this.htmlTextItems = [
      ...this.htmlTextItems.filter((item) => item.pageId !== active.id),
      ...items,
    ];
    this.htmlPageBackgrounds[active.id] = await this.renderPageCanvas(active, 1.5).then((canvas) => canvas.toDataURL('image/jpeg', 0.9));
    this.htmlEditMode = true;
    this.selectedOverlayId = '';
    this.selectedHtmlTextId = '';
    this.clearInspectLayer();
    this.status = items.length
      ? `HTML edit mode rebuilt ${items.length} editable line(s). Edit directly on the page, then export HTML rebuild.`
      : 'This page has no extractable text, so HTML edit mode will keep it as an image.';
  }

  async reconstructAllHtmlFromCurrentPdf(): Promise<void> {
    if (!this.currentBytes.length) throw new Error('Load a PDF first.');
    const pdf = await pdfjsLib.getDocument({ data: this.currentBytes.slice() }).promise;
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
  }

  removeSelectedHtmlText(): void {
    if (!this.selectedHtmlTextId) return;
    this.htmlTextItems = this.htmlTextItems.filter((item) => item.id !== this.selectedHtmlTextId);
    this.selectedHtmlTextId = '';
    this.status = 'HTML text fragment removed from reconstructed page.';
  }

  addShape(kind: 'rectangle' | 'highlight' | 'ellipse' | 'line'): void {
    this.addOverlay(kind);
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
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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
        const tableGap = Math.max(size * 1.6, averageCharWidth * 4);
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
      };
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
    this.currentBytes = bytes;
    this.fileName = name;
    this.overlays = [];
    this.htmlTextItems = [];
    this.htmlPageBackgrounds = {};
    this.selectedHtmlTextId = '';
    this.htmlEditMode = true;
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    this.pages = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      this.pages.push({
        id: crypto.randomUUID(),
        sourceIndex: index - 1,
        rotation: 0,
        selected: false,
        width: viewport.width,
        height: viewport.height,
      });
    }
    this.activePageId = this.pages[0]?.id ?? '';
    this.busyLabel = 'Converting PDF';
    const rebuilt = await this.reconstructAllHtmlPages(pdf);
    this.status = `${name} loaded with ${this.pages.length} page(s). HTML rebuilt ${rebuilt} editable line(s).`;
    this.busy = false;
    this.busyLabel = '';
    this.queueActiveRender();
    this.queueThumbRender();
  }

  private async reconstructAllHtmlPages(pdf: { getPage: (pageNumber: number) => Promise<{ getViewport: (options: { scale: number; rotation?: number }) => PdfViewportLike; getTextContent: () => Promise<{ items: unknown[]; styles?: Record<string, PdfTextStyleLike> }>; getAnnotations: (options?: { intent: string }) => Promise<unknown[]> }> }): Promise<number> {
    const allItems: HtmlTextItem[] = [];
    for (const pageItem of this.pages) {
      try {
        const page = await pdf.getPage(pageItem.sourceIndex + 1);
        const viewport = page.getViewport({ scale: 1, rotation: pageItem.rotation });
        const content = await page.getTextContent();
        const annotations = await page.getAnnotations({ intent: 'display' });
        allItems.push(...this.htmlItemsFromTextContent(content, viewport, pageItem.id, this.linkRectsFromAnnotations(annotations, viewport)));
        this.htmlPageBackgrounds[pageItem.id] = await this.renderPageCanvas(pageItem, 1.5).then((canvas) => canvas.toDataURL('image/jpeg', 0.9));
      } catch {
        this.htmlPageBackgrounds[pageItem.id] = await this.renderPageCanvas(pageItem, 1).then((canvas) => canvas.toDataURL('image/jpeg', 0.86));
      }
    }
    this.htmlTextItems = allItems;
    return allItems.length;
  }

  private async renderActivePage(): Promise<void> {
    const active = this.activePage;
    const canvas = this.mainCanvas?.nativeElement;
    if (!active || !canvas || !this.currentBytes.length) return;
    const pdf = await pdfjsLib.getDocument({ data: this.currentBytes.slice() }).promise;
    const page = await pdf.getPage(active.sourceIndex + 1);
    const renderScale = Math.max(2.75, window.devicePixelRatio * 2);
    const viewport = page.getViewport({ scale: renderScale, rotation: active.rotation });
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${active.width * this.zoom}px`;
    canvas.style.height = `${active.height * this.zoom}px`;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
  }

  private async renderThumbs(): Promise<void> {
    if (!this.currentBytes.length) return;
    const pdf = await pdfjsLib.getDocument({ data: this.currentBytes.slice() }).promise;
    const canvases = this.thumbCanvases.toArray();
    for (let index = 0; index < this.pages.length; index += 1) {
      const item = this.pages[index];
      const canvas = canvases[index]?.nativeElement;
      if (!canvas) continue;
      const page = await pdf.getPage(item.sourceIndex + 1);
      const viewport = page.getViewport({ scale: 0.24, rotation: item.rotation });
      const context = canvas.getContext('2d');
      if (!context) continue;
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      item.thumb = canvas.toDataURL('image/jpeg', 0.68);
    }
  }

  private queueActiveRender(): void {
    setTimeout(() => void this.renderActivePage(), 80);
  }

  private queueThumbRender(): void {
    setTimeout(() => void this.renderThumbs(), 140);
  }

  private async createPdfDocument(applyMetadata = false): Promise<PDFDocument> {
    if (!this.currentBytes.length) throw new Error('Load a PDF first.');
    const source = await PDFDocument.load(this.currentBytes);
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
          const imageBytes = await fetch(overlay.imageData).then((response) => response.arrayBuffer());
          const image = overlay.imageType === 'png' ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
          page.drawImage(image, { x, y, width: overlay.width * scaleX, height: overlay.height * scaleY, opacity: overlay.opacity });
        } else if (overlay.kind === 'rectangle' || overlay.kind === 'highlight' || overlay.kind === 'ellipse' || overlay.kind === 'line') {
          const color = overlay.kind === 'rectangle' ? this.hexToRgb(overlay.color) : rgb(1, 0.88, 0.18);
          if (overlay.kind === 'line') {
            page.drawLine({ start: { x, y: y + overlay.height * scaleY / 2 }, end: { x: x + overlay.width * scaleX, y: y + overlay.height * scaleY / 2 }, thickness: Math.max(1, overlay.height * scaleY), color: this.hexToRgb(overlay.color), opacity: overlay.opacity });
          } else if (overlay.kind === 'ellipse') {
            page.drawEllipse({ x: x + overlay.width * scaleX / 2, y: y + overlay.height * scaleY / 2, xScale: overlay.width * scaleX / 2, yScale: overlay.height * scaleY / 2, color: this.hexToRgb(overlay.color), opacity: overlay.opacity });
          } else {
            page.drawRectangle({ x, y, width: overlay.width * scaleX, height: overlay.height * scaleY, color, opacity: overlay.opacity });
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
    const pdf = await pdfjsLib.getDocument({ data: this.currentBytes.slice() }).promise;
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

  private async downloadPdf(applyMetadata: boolean, name: string, forceMetadata = false): Promise<void> {
    const pdf = await this.createPdfDocument(applyMetadata || forceMetadata);
    const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    this.downloadBlob(bytes, name, 'application/pdf');
    this.status = `${name} exported.`;
  }

  private async mergePdfs(): Promise<void> {
    if (!this.extraFiles.length) throw new Error('Choose extra PDFs to merge first.');
    const output = await this.createPdfDocument(true);
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
    const source = await PDFDocument.load(this.currentBytes);
    for (let index = 0; index < selected.length; index += 1) {
      const output = await PDFDocument.create();
      const [copied] = await output.copyPages(source, [selected[index].sourceIndex]);
      copied.setRotation(degrees((copied.getRotation().angle + selected[index].rotation + 360) % 360));
      output.addPage(copied);
      this.downloadBlob(await output.save({ useObjectStreams: true }), `page-${index + 1}.pdf`, 'application/pdf');
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
    const additions = this.selectedPages.map((page) => ({ ...page, id: crypto.randomUUID(), selected: false }));
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
    const source = await this.createPdfDocument(true);
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

  private addOverlay(kind: OverlayKind): void {
    const page = this.activePage;
    if (!page) throw new Error('Load a PDF first.');
    this.overlays = [...this.overlays, {
      id: crypto.randomUUID(),
      pageId: page.id,
      kind,
      text: kind === 'signature' ? 'Signed' : this.editText,
      x: Math.round(page.width * 0.16),
      y: Math.round(page.height * 0.18),
      width: kind === 'text' || kind === 'signature' ? 160 : kind === 'line' ? 180 : 220,
      height: kind === 'text' || kind === 'signature' ? 42 : kind === 'line' ? 4 : 58,
      size: kind === 'signature' ? 28 : 18,
      color: kind === 'rectangle' ? '#050505' : kind === 'highlight' ? '#facc15' : kind === 'signature' ? '#14532d' : '#111827',
      opacity: kind === 'highlight' ? 0.35 : 1,
      rotation: 0,
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
        id: crypto.randomUUID(),
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

  private pageNumbers(): void {
    this.pages.forEach((page, index) => {
      this.overlays.push({
        id: crypto.randomUUID(),
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
    const pdf = await PDFDocument.load(this.currentBytes);
    this.status = `Title: ${pdf.getTitle() || 'none'} | Author: ${pdf.getAuthor() || 'none'} | Pages: ${pdf.getPageCount()}`;
  }

  private async findText(): Promise<void> {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) throw new Error('Type a search term first.');
    const pdf = await pdfjsLib.getDocument({ data: this.currentBytes.slice() }).promise;
    const matches: number[] = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const text = await (await pdf.getPage(index)).getTextContent();
      const pageText = text.items.map((item) => 'str' in item ? item.str : '').join(' ').toLowerCase();
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

  private async downloadActiveImage(type: 'image/png' | 'image/jpeg', name: string, quality = 0.92): Promise<void> {
    const canvas = await this.renderActivePageCanvas(type === 'image/png' ? 2 : 1.6);
    canvas.toBlob((blob) => {
      if (blob) this.downloadBlob(blob, name, type);
    }, type, quality);
    this.status = `${name} exported.`;
  }

  private async downloadImagesZip(targets: PageItem[], name: string): Promise<void> {
    if (!targets.length) throw new Error('Select at least one page first.');
    const files: { name: string; data: Uint8Array }[] = [];
    for (const page of targets) {
      const pageIndex = this.pages.indexOf(page) + 1;
      this.busyLabel = `Converting page ${pageIndex}`;
      const canvas = await this.renderCompositePageCanvas(page, 1.8);
      const blob = await this.canvasToBlob(canvas, 'image/jpeg', this.jpegQuality);
      files.push({
        name: `page-${String(pageIndex).padStart(3, '0')}.jpg`,
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
      const canvas = await this.renderCompositePageCanvas(page, scale);
      const blob = await this.canvasToBlob(canvas, 'image/jpeg', quality);
      const bytes = await blob.arrayBuffer();
      const image = await output.embedJpg(bytes);
      const target = output.addPage([page.width, page.height]);
      target.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
    }
    this.downloadBlob(await output.save({ useObjectStreams: true }), name, 'application/pdf');
    this.status = `Compressed PDF exported at level ${this.compressionLevel}.`;
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
      const canvas = await this.renderCompositePageCanvas(page, 2);
      const bytes = await fetch(canvas.toDataURL('image/jpeg', this.jpegQuality)).then((response) => response.arrayBuffer());
      const image = await output.embedJpg(bytes);
      const target = output.addPage([page.width, page.height]);
      target.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
    }
    this.downloadBlob(await output.save({ useObjectStreams: true }), 'visual-rebuild.pdf', 'application/pdf');
    this.status = 'Visual PDF rebuilt from canvas. Placement matches the screen, but text is flattened.';
  }

  private async downloadHtmlRebuildPdf(): Promise<void> {
    const output = await PDFDocument.create();
    for (const page of this.pages) {
      const htmlItems = this.htmlTextItems.filter((item) => item.pageId === page.id);
      const canvas = htmlItems.length
        ? await this.renderHtmlPageCanvas(page, htmlItems, 2)
        : await this.renderCompositePageCanvas(page, 2);
      const bytes = await fetch(canvas.toDataURL('image/jpeg', this.jpegQuality)).then((response) => response.arrayBuffer());
      const image = await output.embedJpg(bytes);
      const target = output.addPage([page.width, page.height]);
      target.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
    }
    this.downloadBlob(await output.save({ useObjectStreams: true }), 'html-rebuild.pdf', 'application/pdf');
    this.status = 'HTML rebuilt PDF exported. Reconstructed pages use editable text placement; image-only pages were preserved as page images.';
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

  private paintHtmlTextToCanvas(context: CanvasRenderingContext2D, item: HtmlTextItem, scale: number): void {
    context.save();
    const weight = Number(item.fontWeight) >= 600 || item.fontWeight === 'bold' ? '700' : '400';
    const style = item.fontStyle === 'italic' ? 'italic' : 'normal';
    const family = item.fontFamily || 'Times New Roman, Georgia, serif';
    const lineHeight = item.size * 1.05 * scale;
    context.font = `${style} ${weight} ${item.size * scale}px ${family}`;
    context.fillStyle = item.color ?? '#111111';
    context.textBaseline = 'top';
    item.text.split(/\r?\n/).forEach((line, index) => {
      const x = item.x * scale;
      const y = item.y * scale + index * lineHeight;
      context.fillStyle = '#ffffff';
      context.fillRect(item.x * scale - 1, y - 1, item.width * scale + 2, lineHeight + 2);
      context.fillStyle = item.color ?? '#111111';
      context.fillText(line, x, y, item.width * scale);
      if (item.textDecoration === 'underline') {
        const underlineY = y + item.size * scale * 1.02;
        context.beginPath();
        context.moveTo(x, underlineY);
        context.lineTo(x + Math.min(context.measureText(line).width, item.width * scale), underlineY);
        context.lineWidth = Math.max(1, scale * 0.5);
        context.strokeStyle = item.color ?? '#0000ee';
        context.stroke();
      }
    });
    context.restore();
  }

  private async renderPageCanvas(pageItem: PageItem, scale: number): Promise<HTMLCanvasElement> {
    const pdf = await pdfjsLib.getDocument({ data: this.currentBytes.slice() }).promise;
    const sourcePage = await pdf.getPage(pageItem.sourceIndex + 1);
    const viewport = sourcePage.getViewport({ scale, rotation: pageItem.rotation });
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
      context.drawImage(image, 0, 0, width, height);
    } else if (overlay.kind === 'rectangle' || overlay.kind === 'highlight') {
      context.fillStyle = overlay.kind === 'highlight' ? '#facc15' : overlay.color;
      context.fillRect(0, 0, width, height);
    } else if (overlay.kind === 'ellipse') {
      context.fillStyle = overlay.color;
      context.beginPath();
      context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      context.fill();
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

  private async renderActivePageCanvas(scale: number): Promise<HTMLCanvasElement> {
    const active = this.activePage;
    if (!active) throw new Error('No active page.');
    const pdf = await pdfjsLib.getDocument({ data: this.currentBytes.slice() }).promise;
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
    const value = hex.replace('#', '');
    const red = parseInt(value.slice(0, 2), 16) / 255;
    const green = parseInt(value.slice(2, 4), 16) / 255;
    const blue = parseInt(value.slice(4, 6), 16) / 255;
    return rgb(red, green, blue);
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
