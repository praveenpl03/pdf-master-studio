import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { Mainscreen } from '../mainscreen/mainscreen';

interface EditableTextRun {
  id: string;
  page: number;
  text: string;
  originalText: string;
  x: number;
  y: number;
  originalX: number;
  originalY: number;
  width: number;
  originalWidth: number;
  height: number;
  originalHeight: number;
  fontSize: number;
  originalFontSize: number;
  fontFamily: string;
  originalFontFamily: string;
  color: string;
  originalColor: string;
  bold: boolean;
  originalBold: boolean;
  italic: boolean;
  originalItalic: boolean;
  textAlign: 'left' | 'center' | 'right';
  originalTextAlign: 'left' | 'center' | 'right';
}

interface LayerImage {
  id: string;
  page: number;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface LayerShape {
  id: string;
  page: number;
  kind: 'rectangle' | 'ellipse' | 'line' | 'highlight' | 'whiteout';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  borderColor: string;
  borderWidth: number;
}

type PointerEdit =
  | { kind: 'text-resize'; id: string; startX: number; startY: number; width: number; height: number; startFontSize: number; historyRecorded?: boolean }
  | { kind: 'text-move'; id: string; startX: number; startY: number; x: number; y: number; historyRecorded?: boolean }
  | { kind: 'image-resize'; id: string; startX: number; startY: number; width: number; height: number; historyRecorded?: boolean }
  | { kind: 'image-move'; id: string; startX: number; startY: number; x: number; y: number; historyRecorded?: boolean }
  | { kind: 'shape-resize'; id: string; startX: number; startY: number; width: number; height: number; historyRecorded?: boolean }
  | { kind: 'shape-move'; id: string; startX: number; startY: number; x: number; y: number; historyRecorded?: boolean };

interface LayeredSnapshot {
  runs: Map<number, EditableTextRun[]>;
  images: Map<number, LayerImage[]>;
  shapes: Map<number, LayerShape[]>;
  selectedRunId: string;
  selectedImageId: string;
  selectedShapeId: string;
}

interface PdfFontStyleRun {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
}

@Component({
  selector: 'app-layered-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, Mainscreen],
  templateUrl: './layered-editor.html',
  styleUrl: './layered-editor.css',
})
export class LayeredEditor implements OnDestroy {
  @ViewChild('pageCanvas') pageCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('imageInput') imageInput?: ElementRef<HTMLInputElement>;
  @ViewChild('toolEngine') private toolEngine?: Mainscreen;

  pageNumber = 1;
  pageCount = 0;
  toolSelectedPageNumbers = new Set<number>();
  zoom = 2.15;
  isLoading = false;
  isSaving = false;
  status = 'Open a PDF to edit text while keeping the original page as the visual background.';
  error = '';
  fileName = '';
  engineVersion = 'Loading PDF.js…';
  editableRuns: EditableTextRun[] = [];
  selectedRunId = '';
  selectedImageId = '';
  selectedShapeId = '';
  textEditing = true;
  toolsVisible = true;

  private document?: pdfjsLib.PDFDocumentProxy;
  private sourceBytes?: Uint8Array;
  pageSize = { width: 0, height: 0 };
  private renderTask?: pdfjsLib.RenderTask;
  private loadingTask?: pdfjsLib.PDFDocumentLoadingTask;
  private renderGeneration = 0;
  private readonly editsByPage = new Map<number, EditableTextRun[]>();
  private readonly imagesByPage = new Map<number, LayerImage[]>();
  private readonly shapesByPage = new Map<number, LayerShape[]>();
  private readonly fontStylesByPage = new Map<number, PdfFontStyleRun[]>();
  private pdfRuntimePromise?: Promise<typeof pdfjsLib>;
  private pointerEdit?: PointerEdit;
  private readonly undoStack: LayeredSnapshot[] = [];
  private readonly redoStack: LayeredSnapshot[] = [];
  readonly editableFonts = [
    'Arial', 'Calibri', 'Times New Roman', 'Noto Sans Devanagari', 'Noto Serif Devanagari',
    'Mangal', 'Nirmala UI', 'Aparajita', 'Kokila', 'Sanskrit Text',
  ];
  readonly beforeToolAction = (): Promise<{ bytes?: Uint8Array; pageNumber: number; selectedPageNumbers: number[] }> => this.prepareToolAction();

  get pageNumbers(): number[] { return Array.from({ length: this.pageCount }, (_, index) => index + 1); }

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  get hasDocument(): boolean { return Boolean(this.document); }
  get selectedRun(): EditableTextRun | undefined { return this.editableRuns.find(run => run.id === this.selectedRunId); }
  get selectedImage(): LayerImage | undefined { return (this.imagesByPage.get(this.pageNumber) ?? []).find(image => image.id === this.selectedImageId); }
  get selectedShape(): LayerShape | undefined { return (this.shapesByPage.get(this.pageNumber) ?? []).find(shape => shape.id === this.selectedShapeId); }
  get pageImages(): LayerImage[] { return this.imagesByPage.get(this.pageNumber) ?? []; }
  get pageShapes(): LayerShape[] { return this.shapesByPage.get(this.pageNumber) ?? []; }
  get canUndoLayered(): boolean { return this.undoStack.length > 0 || Boolean(this.toolEngine?.canUndo); }
  get canRedoLayered(): boolean { return this.redoStack.length > 0 || Boolean(this.toolEngine?.canRedo); }

  ngOnDestroy(): void {
    this.renderTask?.cancel();
    void this.loadingTask?.destroy();
  }

  openFilePicker(): void {
    this.fileInput?.nativeElement.click();
  }

  runTool(action: string): void {
    if (action === 'undo' || action === 'redo') { this.runLayeredHistory(action); return; }
    if (action === 'addText') { this.addTextRun(); return; }
    if (action === 'chooseImage') { this.openImagePicker(); return; }
    if (action === 'addSignature') { this.addTextRun('Signature'); return; }
    if (action === 'addWhiteout' || action === 'addRedaction') { this.addShape('whiteout'); return; }
    if (action === 'addHighlight') { this.addShape('highlight'); return; }
    if (action === 'addRectangle' || action === 'addSquare') { this.addShape('rectangle', action === 'addSquare'); return; }
    if (action === 'addEllipse') { this.addShape('ellipse'); return; }
    if (action === 'addLine') { this.addShape('line'); return; }
    void this.toolEngine?.run(action);
  }

  addTextRun(initialText = ''): void {
    this.recordLayeredHistory();
    const fontSize = 12;
    const run: EditableTextRun = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      page: this.pageNumber, text: initialText, originalText: '',
      x: Math.max(0, (this.pageSize.width - 180) / 2), y: Math.max(0, this.pageSize.height / 2),
      originalX: 0, originalY: 0, width: 180, originalWidth: 0, height: fontSize * 1.5, originalHeight: 0,
      fontSize, originalFontSize: fontSize, fontFamily: 'Arial', originalFontFamily: 'Arial',
      color: '#111111', originalColor: '#111111', bold: false, originalBold: false,
      italic: false, originalItalic: false, textAlign: 'left', originalTextAlign: 'left',
    };
    this.editableRuns = [...this.editableRuns, run];
    this.selectedRunId = run.id;
    this.selectedImageId = '';
    this.selectedShapeId = '';
    this.textEditing = true;
    this.saveCurrentPageEdits();
    this.status = 'Text box added. Type text and use the text toolbar to format or resize it.';
    this.changeDetector.detectChanges();
    window.setTimeout(() => {
      const field = window.document.querySelector<HTMLTextAreaElement>('.text-run.selected');
      field?.focus();
      if (field) field.setSelectionRange(field.value.length, field.value.length);
    });
  }

  openImagePicker(): void { this.imageInput?.nativeElement.click(); }

  async onImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
      });
      const image = await this.loadImage(dataUrl);
      const maxWidth = Math.min(240, this.pageSize.width * 0.45);
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const width = Math.max(24, image.naturalWidth * scale);
      const height = Math.max(24, image.naturalHeight * scale);
      const overlay: LayerImage = {
        id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        page: this.pageNumber, dataUrl, width, height,
        x: Math.max(0, (this.pageSize.width - width) / 2),
        y: Math.max(0, (this.pageSize.height - height) / 2), rotation: 0,
      };
      this.recordLayeredHistory();
      this.imagesByPage.set(this.pageNumber, [...this.pageImages, overlay]);
      this.selectedImageId = overlay.id;
      this.selectedRunId = '';
      this.selectedShapeId = '';
      this.status = 'Image added. Drag it to move, or drag its corner to resize.';
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : 'Could not insert the image.';
    } finally {
      input.value = '';
    }
  }

  addShape(kind: LayerShape['kind'], square = false): void {
    this.recordLayeredHistory();
    const width = square ? 80 : kind === 'line' ? 140 : 120;
    const height = kind === 'line' ? 2 : square ? 80 : kind === 'highlight' ? 24 : 70;
    const shape: LayerShape = {
      id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      page: this.pageNumber, kind, width, height,
      x: Math.max(0, (this.pageSize.width - width) / 2),
      y: Math.max(0, (this.pageSize.height - height) / 2),
      color: kind === 'whiteout' ? '#ffffff' : kind === 'highlight' ? '#fff17680' : 'transparent',
      borderColor: kind === 'whiteout' ? '#ffffff' : kind === 'highlight' ? '#e6c84f' : '#2563eb',
      borderWidth: kind === 'line' ? 2 : 1,
    };
    this.shapesByPage.set(this.pageNumber, [...this.pageShapes, shape]);
    this.selectedShapeId = shape.id;
    this.selectedRunId = '';
    this.selectedImageId = '';
    this.status = `${kind === 'whiteout' ? 'Whiteout' : kind[0].toUpperCase() + kind.slice(1)} added. Drag to move or resize it.`;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load the selected image.'));
      image.src = src;
    });
  }

  runToolSummarizer(): void {
    void this.toolEngine?.openToolSummarizer();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    const displayName = files.length === 1
      ? files[0].name
      : `${files[0].name.replace(/\.pdf$/i, '')}-combined.pdf`;

    this.error = '';
    this.isLoading = true;
    this.status = files.length === 1 ? 'Opening PDF…' : `Combining ${files.length} PDFs…`;
    this.fileName = displayName;
    this.editsByPage.clear();
    this.imagesByPage.clear();
    this.shapesByPage.clear();
    this.fontStylesByPage.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.editableRuns = [];
    this.selectedRunId = '';
      this.textEditing = true;
      this.zoom = 2.15;
    this.renderTask?.cancel();
    await this.loadingTask?.destroy();

    try {
      const bytes = files.length === 1
        ? new Uint8Array(await files[0].arrayBuffer())
        : await this.combinePdfFiles(files);
      this.sourceBytes = new Uint8Array(bytes);
      const runtime = await this.getPdfJsRuntime();
      // PDF.js may transfer and detach the supplied buffer to its worker.
      // Keep our own copy alive for the editor tool engine below.
      this.loadingTask = runtime.getDocument({ data: bytes.slice() });
      this.document = await this.loadingTask.promise;
      this.pageCount = this.document.numPages;
      this.pageNumber = 1;
      this.toolSelectedPageNumbers = new Set([1]);
      // The canvas is inside a conditional template. Create it before asking
      // PDF.js to render the first page.
      this.isLoading = false;
      this.changeDetector.detectChanges();
      await this.renderCurrentPage();
      this.status = `${displayName} opened. Preparing the shared PDF tools…`;
      await this.toolEngine?.loadFromLayeredEditor(bytes, displayName);
      for (let page = 1; page <= this.pageCount; page++) {
        this.fontStylesByPage.set(page, this.toolEngine?.getLayeredTextMetadata(page) ?? []);
      }
      this.applyPdfFontStyles(this.editableRuns);
      this.saveCurrentPageEdits();
      this.status = `${displayName} opened. Click any text line and type to replace it.`;
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : 'Could not open this PDF.';
      this.status = '';
    } finally {
      this.isLoading = false;
      input.value = '';
    }
  }

  private async combinePdfFiles(files: File[]): Promise<Uint8Array> {
    const combined = await PDFDocument.create();
    for (const file of files) {
      const source = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
      const pages = await combined.copyPages(source, source.getPageIndices());
      pages.forEach(page => combined.addPage(page));
    }
    const saved = await combined.save();
    const bytes = new Uint8Array(saved.length);
    bytes.set(saved);
    return bytes;
  }

  async goToPage(pageNumber: number): Promise<void> {
    if (!this.document || pageNumber < 1 || pageNumber > this.pageCount || pageNumber === this.pageNumber) return;
    const wasSelectingCurrentOnly = this.toolSelectedPageNumbers.size === 1 && this.toolSelectedPageNumbers.has(this.pageNumber);
    this.saveCurrentPageEdits();
    this.pageNumber = pageNumber;
    if (wasSelectingCurrentOnly) this.toolSelectedPageNumbers = new Set([pageNumber]);
    this.selectedRunId = '';
    this.selectedImageId = '';
    this.selectedShapeId = '';
    this.editableRuns = this.editsByPage.get(pageNumber) ?? [];
    await this.renderCurrentPage();
  }

  async changeZoom(amount: number): Promise<void> {
    this.zoom = Math.max(0.5, Math.min(4, Math.round((this.zoom + amount) * 100) / 100));
    await this.renderCurrentPage();
  }

  toggleTools(): void { this.toolsVisible = !this.toolsVisible; }

  setToolPageSelected(pageNumber: number, selected: boolean): void {
    const next = new Set(this.toolSelectedPageNumbers);
    selected ? next.add(pageNumber) : next.delete(pageNumber);
    this.toolSelectedPageNumbers = next;
  }

  selectRun(run: EditableTextRun, event: Event): void {
    event.stopPropagation();
    this.selectedRunId = run.id;
    this.selectedImageId = '';
    this.selectedShapeId = '';
    // Selecting a text run is the edit action. This avoids leaving the field
    // read-only after the user has clicked it and makes keyboard input work.
    this.textEditing = true;
  }

  textToolbarLeft(run: EditableTextRun): number {
    const toolbarWidth = Math.min(680, Math.max(360, window.innerWidth - 48));
    const pageWidth = this.pageSize.width * this.zoom;
    return Math.max(8, Math.min(run.x * this.zoom, pageWidth - toolbarWidth - 8));
  }

  textToolbarTop(run: EditableTextRun): number {
    const pageHeight = this.pageSize.height * this.zoom;
    const aboveText = run.y * this.zoom - 56;
    if (aboveText >= 8) return aboveText;
    return Math.min(pageHeight - 48, run.y * this.zoom + run.height * this.zoom + 8);
  }

  selectImage(image: LayerImage, event: Event): void {
    event.stopPropagation();
    this.selectedImageId = image.id; this.selectedRunId = ''; this.selectedShapeId = '';
  }

  selectShape(shape: LayerShape, event: Event): void {
    event.stopPropagation();
    this.selectedShapeId = shape.id; this.selectedRunId = ''; this.selectedImageId = '';
  }

  resizeRunForText(run: EditableTextRun): void {
    const canvas = window.document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    context.font = `${run.italic ? 'italic ' : ''}${run.bold ? '700 ' : '400 '}${run.fontSize}px ${run.fontFamily}`;
    const measured = context.measureText(run.text).width + 8;
    run.width = Math.min(Math.max(run.originalWidth, measured), Math.max(run.originalWidth, this.pageSize.width - run.x));
    run.height = Math.max(run.height, run.fontSize * 1.25);
  }

  updateRunText(run: EditableTextRun, value: string): void {
    if (run.text !== value) this.recordLayeredHistory();
    run.text = value;
    this.resizeRunForText(run);
  }

  setRunFontSize(run: EditableTextRun, size: number): void {
    if (!Number.isFinite(size)) return;
    const nextSize = Math.max(5, Math.min(96, size));
    if (run.fontSize === nextSize) return;
    this.recordLayeredHistory();
    run.fontSize = nextSize;
    run.height = Math.max(run.originalHeight, run.height, run.fontSize * 1.6);
    this.resizeRunForText(run);
    this.saveCurrentPageEdits();
    this.changeDetector.detectChanges();
  }

  increaseRunFontSize(run: EditableTextRun): void { this.setRunFontSize(run, run.fontSize + 2); }
  decreaseRunFontSize(run: EditableTextRun): void { this.setRunFontSize(run, run.fontSize - 2); }

  setRunFontFamily(run: EditableTextRun, family: string): void {
    if (run.fontFamily === family) return;
    this.recordLayeredHistory(); run.fontFamily = family; this.resizeRunForText(run);
  }
  setRunColor(run: EditableTextRun, color: string): void {
    if (run.color === color) return;
    this.recordLayeredHistory(); run.color = color;
  }
  setRunAlignment(run: EditableTextRun, alignment: 'left' | 'center' | 'right'): void {
    if (run.textAlign === alignment) return;
    this.recordLayeredHistory(); run.textAlign = alignment;
  }
  toggleRunBold(run: EditableTextRun): void { this.recordLayeredHistory(); run.bold = !run.bold; }
  toggleRunItalic(run: EditableTextRun): void { this.recordLayeredHistory(); run.italic = !run.italic; }
  setImageSize(image: LayerImage, axis: 'width' | 'height', value: number): void {
    if (!Number.isFinite(value) || value <= 0 || image[axis] === value) return;
    this.recordLayeredHistory(); image[axis] = Math.max(24, value);
  }
  setShapeBorder(shape: LayerShape, color: string): void { if (shape.borderColor !== color) { this.recordLayeredHistory(); shape.borderColor = color; } }
  setShapeFill(shape: LayerShape, color: string): void { if (shape.color !== color) { this.recordLayeredHistory(); shape.color = color; } }

  removeRun(run: EditableTextRun): void {
    this.recordLayeredHistory();
    this.editableRuns = this.editableRuns.filter(item => item.id !== run.id);
    this.selectedRunId = '';
    this.saveCurrentPageEdits();
  }

  beginTextMove(run: EditableTextRun, event: PointerEvent): void { this.beginPointerEdit('text-move', run.id, run.x, run.y, event); }
  beginTextResize(run: EditableTextRun, event: PointerEvent): void {
    this.beginPointerEdit('text-resize', run.id, run.width, run.height, event);
    if (this.pointerEdit?.kind === 'text-resize') this.pointerEdit.startFontSize = run.fontSize;
  }
  beginImageMove(image: LayerImage, event: PointerEvent): void { this.beginPointerEdit('image-move', image.id, image.x, image.y, event); }
  beginImageResize(image: LayerImage, event: PointerEvent): void { this.beginPointerEdit('image-resize', image.id, image.width, image.height, event); }
  beginShapeMove(shape: LayerShape, event: PointerEvent): void { this.beginPointerEdit('shape-move', shape.id, shape.x, shape.y, event); }
  beginShapeResize(shape: LayerShape, event: PointerEvent): void { this.beginPointerEdit('shape-resize', shape.id, shape.width, shape.height, event); }

  private beginPointerEdit(kind: PointerEdit['kind'], id: string, first: number, second: number, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (kind.startsWith('text-')) { this.selectedRunId = id; this.selectedImageId = ''; this.selectedShapeId = ''; }
    else if (kind.startsWith('image-')) { this.selectedImageId = id; this.selectedRunId = ''; this.selectedShapeId = ''; }
    else { this.selectedShapeId = id; this.selectedRunId = ''; this.selectedImageId = ''; }
    const resize = kind.endsWith('resize');
    this.pointerEdit = {
      kind, id, startX: event.clientX, startY: event.clientY,
      historyRecorded: false,
      ...(resize ? { width: first, height: second } : { x: first, y: second }),
    } as PointerEdit;
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent): void {
    const edit = this.pointerEdit;
    if (!edit) return;
    const dx = (event.clientX - edit.startX) / this.zoom;
    const dy = (event.clientY - edit.startY) / this.zoom;
    if (!edit.historyRecorded && (Math.abs(dx) > 0.25 || Math.abs(dy) > 0.25)) {
      this.recordLayeredHistory();
      edit.historyRecorded = true;
    }
    if (edit.kind.startsWith('text-')) {
      const run = this.editableRuns.find(item => item.id === edit.id);
      if (!run) return;
      if (edit.kind === 'text-resize') {
        run.fontSize = Math.max(5, Math.min(96, edit.startFontSize + (dx + dy) * 0.08));
        run.width = Math.max(run.originalWidth, edit.width + dx, 30);
        run.height = Math.max(run.originalHeight, edit.height + dy, run.fontSize * 1.6);
        this.resizeRunForText(run);
      } else {
        const move = edit as Extract<PointerEdit, { kind: 'text-move' }>;
        run.x = Math.max(0, Math.min(this.pageSize.width - run.width, move.x + dx));
        run.y = Math.max(0, Math.min(this.pageSize.height - run.height, move.y + dy));
      }
      return;
    }
    if (edit.kind.startsWith('image-')) {
      const image = this.pageImages.find(item => item.id === edit.id);
      if (!image) return;
      if (edit.kind === 'image-resize') {
        const ratio = edit.width / Math.max(1, edit.height);
        image.width = Math.max(24, edit.width + dx);
        image.height = Math.max(24, image.width / ratio);
      } else {
        const move = edit as Extract<PointerEdit, { kind: 'image-move' }>;
        image.x = Math.max(0, Math.min(this.pageSize.width - image.width, move.x + dx));
        image.y = Math.max(0, Math.min(this.pageSize.height - image.height, move.y + dy));
      }
      return;
    }
    const shape = this.pageShapes.find(item => item.id === edit.id);
    if (!shape) return;
    if (edit.kind === 'shape-resize') {
      shape.width = Math.max(8, edit.width + dx);
      shape.height = shape.kind === 'line' ? shape.height : Math.max(8, edit.height + dy);
    } else {
      const move = edit as Extract<PointerEdit, { kind: 'shape-move' }>;
      shape.x = Math.max(0, Math.min(this.pageSize.width - shape.width, move.x + dx));
      shape.y = Math.max(0, Math.min(this.pageSize.height - shape.height, move.y + dy));
    }
  }

  @HostListener('document:pointerup')
  onDocumentPointerUp(): void { this.pointerEdit = undefined; }

  rotateSelectedImage(): void { if (this.selectedImage) { this.recordLayeredHistory(); this.selectedImage.rotation = (this.selectedImage.rotation + 90) % 360; } }
  removeSelectedImage(): void {
    if (!this.selectedImage) return;
    this.recordLayeredHistory();
    this.imagesByPage.set(this.pageNumber, this.pageImages.filter(image => image.id !== this.selectedImageId));
    this.selectedImageId = '';
  }
  removeSelectedShape(): void {
    if (!this.selectedShape) return;
    this.recordLayeredHistory();
    this.shapesByPage.set(this.pageNumber, this.pageShapes.filter(shape => shape.id !== this.selectedShapeId));
    this.selectedShapeId = '';
  }

  toggleTextEditing(): void {
    this.textEditing = !this.textEditing;
    this.status = this.textEditing
      ? 'Edit guides are shown. Click any text line and type to replace it.'
      : 'Edit guides are hidden. Text fields remain directly editable.';
  }

  closeSelection(): void {
    this.selectedRunId = '';
    this.selectedImageId = '';
    this.selectedShapeId = '';
  }

  hasChanged(run: EditableTextRun): boolean {
    return run.text !== run.originalText || run.x !== run.originalX || run.y !== run.originalY
      || run.fontSize !== run.originalFontSize || run.fontFamily !== run.originalFontFamily
      || run.color !== run.originalColor || run.bold !== run.originalBold || run.italic !== run.originalItalic
      || run.textAlign !== run.originalTextAlign || run.width !== run.originalWidth || run.height !== run.originalHeight;
  }

  async downloadEditedPdf(): Promise<void> {
    if (!this.document || this.isSaving) return;
    this.isSaving = true;
    this.error = '';
    this.status = 'Preparing a visual copy of the edited PDF…';
    try {
      const ownedBytes = await this.buildEditedPdfBytes();
      const blob = new Blob([ownedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `${this.fileName.replace(/\.pdf$/i, '') || 'edited-document'}-visual-edit.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.status = 'Edited PDF downloaded as a visual copy.';
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : 'Could not save the edited PDF.';
      this.status = '';
    } finally {
      this.isSaving = false;
    }
  }

  async receiveToolDocument(event: { bytes: Uint8Array; fileName: string; pageNumber?: number; selectedPageNumbers?: number[] }): Promise<void> {
    if (!event.bytes.length) return;
    const nextBytes = new Uint8Array(event.bytes);
    const nextPageNumber = event.pageNumber ?? Math.min(this.pageNumber, this.pageCount || 1);
    this.isLoading = true;
    this.status = 'Updating layered view from the selected tool…';
    this.renderTask?.cancel();
    await this.loadingTask?.destroy();
    try {
      const runtime = await this.getPdfJsRuntime();
      this.sourceBytes = nextBytes;
      this.fileName = event.fileName || this.fileName;
      // Keep nextBytes intact for source state while PDF.js owns this copy.
      this.loadingTask = runtime.getDocument({ data: nextBytes.slice() });
      this.document = await this.loadingTask.promise;
      this.pageCount = this.document.numPages;
      this.pageNumber = Math.min(nextPageNumber, this.pageCount) || 1;
      this.toolSelectedPageNumbers = new Set((event.selectedPageNumbers ?? []).filter(page => page >= 1 && page <= this.pageCount));
      if (!this.toolSelectedPageNumbers.size) this.toolSelectedPageNumbers.add(this.pageNumber);
      this.editsByPage.clear();
      this.imagesByPage.clear();
      this.shapesByPage.clear();
      this.fontStylesByPage.clear();
      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.editableRuns = [];
      this.selectedRunId = '';
      this.selectedImageId = '';
      this.selectedShapeId = '';
      this.isLoading = false;
      this.changeDetector.detectChanges();
      await this.renderCurrentPage();
      this.status = 'Tool changes are applied to the layered view.';
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : 'Could not refresh the layered view.';
      this.status = '';
    } finally {
      this.isLoading = false;
    }
  }

  private async prepareToolAction(): Promise<{ bytes?: Uint8Array; pageNumber: number; selectedPageNumbers: number[] }> {
    this.saveCurrentPageEdits();
    const hasTextChanges = [...this.editsByPage.values()].some(pageRuns => pageRuns.some(run => this.hasChanged(run)));
    const hasChanges = hasTextChanges || [...this.imagesByPage.values()].some(images => images.length > 0)
      || [...this.shapesByPage.values()].some(shapes => shapes.length > 0);
    return { bytes: hasChanges ? await this.buildEditedPdfBytes() : undefined, pageNumber: this.pageNumber, selectedPageNumbers: [...this.toolSelectedPageNumbers] };
  }

  runLayeredHistory(action: 'undo' | 'redo' | string): void {
    if (action === 'undo' && this.undoStack.length) {
      this.redoStack.push(this.captureLayeredSnapshot());
      this.restoreLayeredSnapshot(this.undoStack.pop()!);
      return;
    }
    if (action === 'redo' && this.redoStack.length) {
      this.undoStack.push(this.captureLayeredSnapshot());
      this.restoreLayeredSnapshot(this.redoStack.pop()!);
      return;
    }
    void this.toolEngine?.applyHistoryFromLayeredRoute(action);
  }

  private recordLayeredHistory(): void {
    this.saveCurrentPageEdits();
    this.undoStack.push(this.captureLayeredSnapshot());
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  private captureLayeredSnapshot(): LayeredSnapshot {
    this.saveCurrentPageEdits();
    const copyMap = <T extends object>(source: Map<number, T[]>): Map<number, T[]> =>
      new Map([...source].map(([page, values]) => [page, values.map(value => ({ ...value }))]));
    return {
      runs: copyMap(this.editsByPage), images: copyMap(this.imagesByPage), shapes: copyMap(this.shapesByPage),
      selectedRunId: this.selectedRunId, selectedImageId: this.selectedImageId, selectedShapeId: this.selectedShapeId,
    };
  }

  private restoreLayeredSnapshot(snapshot: LayeredSnapshot): void {
    const restoreMap = <T extends object>(target: Map<number, T[]>, source: Map<number, T[]>): void => {
      target.clear();
      for (const [page, values] of source) target.set(page, values.map(value => ({ ...value })));
    };
    restoreMap(this.editsByPage, snapshot.runs);
    restoreMap(this.imagesByPage, snapshot.images);
    restoreMap(this.shapesByPage, snapshot.shapes);
    this.editableRuns = this.editsByPage.get(this.pageNumber) ?? [];
    this.selectedRunId = snapshot.selectedRunId;
    this.selectedImageId = snapshot.selectedImageId;
    this.selectedShapeId = snapshot.selectedShapeId;
    this.changeDetector.detectChanges();
  }

  private async buildEditedPdfBytes(): Promise<Uint8Array> {
    if (!this.document) throw new Error('Open a PDF before exporting.');
    this.saveCurrentPageEdits();
    const output = await PDFDocument.create();
    for (let index = 1; index <= this.pageCount; index++) {
      const sourcePage = await this.document.getPage(index);
      const viewport = sourcePage.getViewport({ scale: 1, rotation: sourcePage.rotate });
      const rasterScale = Math.min(1.8, 3000 / Math.max(viewport.width, viewport.height));
      const renderViewport = sourcePage.getViewport({ scale: rasterScale, rotation: sourcePage.rotate });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(renderViewport.width));
      canvas.height = Math.max(1, Math.ceil(renderViewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create a page canvas.');
      await sourcePage.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;

      for (const run of this.editsByPage.get(index) ?? []) {
        if (!this.hasChanged(run)) continue;
        const factorX = canvas.width / viewport.width;
        const factorY = canvas.height / viewport.height;
        const x = run.x * factorX;
        const y = run.y * factorY;
        const maskX = (run.originalText ? run.originalX : run.x) * factorX;
        const maskY = (run.originalText ? run.originalY : run.y) * factorY;
        const width = Math.max(1, Math.max(run.originalWidth, run.width) * factorX);
        const height = Math.max(run.height * factorY, run.fontSize * factorY * 1.2, run.originalHeight * factorY);
        context.fillStyle = '#ffffff';
        context.fillRect(maskX - 1, maskY - 1, width + 2, height + 2);
        const fontSize = run.fontSize * factorY;
        context.font = `${run.italic ? 'italic ' : ''}${run.bold ? '700 ' : '400 '}${fontSize}px ${run.fontFamily}`;
        context.textBaseline = 'alphabetic';
        context.fillStyle = run.color;
        context.textAlign = run.textAlign;
        const anchorX = run.textAlign === 'center' ? x + width / 2 : run.textAlign === 'right' ? x + width : x;
        context.fillText(run.text, anchorX, y + Math.min(height, fontSize), width);
      }

      for (const imageItem of this.imagesByPage.get(index) ?? []) {
        const image = await this.loadImage(imageItem.dataUrl);
        const x = imageItem.x * canvas.width / viewport.width;
        const y = imageItem.y * canvas.height / viewport.height;
        const width = imageItem.width * canvas.width / viewport.width;
        const height = imageItem.height * canvas.height / viewport.height;
        context.save();
        context.translate(x + width / 2, y + height / 2);
        context.rotate(imageItem.rotation * Math.PI / 180);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        context.restore();
      }

      for (const shape of this.shapesByPage.get(index) ?? []) {
        const factorX = canvas.width / viewport.width;
        const x = shape.x * canvas.width / viewport.width;
        const y = shape.y * canvas.height / viewport.height;
        const width = shape.width * canvas.width / viewport.width;
        const height = shape.height * canvas.height / viewport.height;
        context.save();
        context.fillStyle = shape.color;
        context.strokeStyle = shape.borderColor;
        context.lineWidth = Math.max(1, shape.borderWidth * factorX);
        if (shape.kind === 'line') {
          context.beginPath(); context.moveTo(x, y); context.lineTo(x + width, y + height); context.stroke();
        } else if (shape.kind === 'ellipse') {
          context.beginPath(); context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
          if (shape.color !== 'transparent') context.fill();
          context.stroke();
        } else {
          if (shape.color !== 'transparent') context.fillRect(x, y, width, height);
          if (shape.kind !== 'whiteout' && shape.kind !== 'highlight') context.strokeRect(x, y, width, height);
        }
        context.restore();
      }

      const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode a rendered PDF page.')), 'image/png'));
      const embedded = await output.embedPng(new Uint8Array(await image.arrayBuffer()));
      const page = output.addPage([viewport.width, viewport.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: viewport.width, height: viewport.height });
      canvas.width = 1;
      canvas.height = 1;
    }
    const saved = await output.save();
    const ownedBytes = new Uint8Array(saved.length);
    ownedBytes.set(saved);
    return ownedBytes;
  }

  private saveCurrentPageEdits(): void {
    if (this.editableRuns.length) this.editsByPage.set(this.pageNumber, this.editableRuns.map(run => ({ ...run })));
  }

  private async renderCurrentPage(): Promise<void> {
    const canvas = this.pageCanvas?.nativeElement;
    if (!canvas || !this.document) return;
    const generation = ++this.renderGeneration;
    this.renderTask?.cancel();
    const page = await this.document.getPage(this.pageNumber);
    if (generation !== this.renderGeneration) return;
    const unitViewport = page.getViewport({ scale: 1, rotation: page.rotate });
    this.pageSize = { width: unitViewport.width, height: unitViewport.height };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale: this.zoom * dpr, rotation: page.rotate });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${unitViewport.width * this.zoom}px`;
    canvas.style.height = `${unitViewport.height * this.zoom}px`;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a PDF page canvas.');
    const task = page.render({ canvas, canvasContext: context, viewport });
    this.renderTask = task;
    try {
      await task.promise;
    } catch (cause) {
      if (!(cause instanceof Error) || cause.name !== 'RenderingCancelledException') throw cause;
    } finally {
      if (this.renderTask === task) this.renderTask = undefined;
    }
    if (generation !== this.renderGeneration) return;

    if (this.editsByPage.has(this.pageNumber)) {
      this.editableRuns = this.editsByPage.get(this.pageNumber) ?? [];
    } else {
      const content = await page.getTextContent();
      const runtime = await this.getPdfJsRuntime();
      const sampleContext = canvas.getContext('2d', { willReadFrequently: true });
      this.editableRuns = content.items.flatMap((candidate, index) => {
        const item = candidate as { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string };
        if (typeof item.str !== 'string' || !item.str.trim() || !item.transform || item.transform.length < 6) return [];
        const transform = runtime.Util.transform(unitViewport.transform, item.transform);
        const fontSize = Math.max(6, Math.hypot(transform[2], transform[3]));
        const height = Math.max(item.height ?? fontSize, fontSize * 0.9);
        const style = item.fontName ? content.styles[item.fontName] : undefined;
        const family = style?.fontFamily && !/sans-serif/i.test(style.fontFamily) ? style.fontFamily : 'Arial, sans-serif';
        let embeddedFont: { bold?: boolean; black?: boolean; italic?: boolean } | undefined;
        try { embeddedFont = item.fontName ? page.commonObjs.get(item.fontName) : undefined; } catch { /* font flags fall back to the PDF font name */ }
        const text = item.str.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/g, ' ');
        const width = Math.max(2, item.width ?? text.length * fontSize * 0.5);
        const color = sampleContext
          ? this.sampleRenderedTextColor(sampleContext, transform[4], transform[5] - height, width, height, this.zoom * dpr)
          : '#111111';
        const runX = transform[4];
        const runY = transform[5] - height;
        const runFontFamily = /[\u0900-\u097f]/.test(text) ? 'Noto Sans Devanagari' : family;
        const runBold = Boolean(embeddedFont?.bold || embeddedFont?.black || /bold|black|heavy/i.test(item.fontName ?? ''));
        const runItalic = Boolean(embeddedFont?.italic || /italic|oblique/i.test(item.fontName ?? ''));
        const run: EditableTextRun = {
          id: `${this.pageNumber}-${index}`, page: this.pageNumber, text, originalText: text,
          x: runX, y: runY, originalX: runX, originalY: runY, width, originalWidth: width,
          height, originalHeight: height, fontSize, originalFontSize: fontSize,
          fontFamily: runFontFamily, originalFontFamily: runFontFamily,
          color, originalColor: color,
          bold: runBold, originalBold: runBold,
          italic: runItalic, originalItalic: runItalic,
          textAlign: 'left', originalTextAlign: 'left',
        };
        return [run];
      });
      this.applyPdfFontStyles(this.editableRuns);
      this.editsByPage.set(this.pageNumber, this.editableRuns.map(run => ({ ...run })));
    }
  }

  private applyPdfFontStyles(runs: EditableTextRun[]): void {
    const styles = this.fontStylesByPage.get(this.pageNumber) ?? [];
    if (!styles.length) return;
    for (const run of runs) {
      const runText = this.normalizeStyleText(run.text);
      const match = styles
        .map(style => {
          const xOverlap = Math.max(0, Math.min(run.x + run.width, style.x + style.width) - Math.max(run.x, style.x));
          const yDistance = Math.abs((run.y + run.height / 2) - (style.y + style.height / 2));
          const overlap = xOverlap / Math.max(1, Math.min(run.width, style.width));
          const styleText = this.normalizeStyleText(style.text);
          const textMatch = runText.length > 1 && styleText.length > 1 && (styleText.includes(runText) || runText.includes(styleText));
          const score = (textMatch ? 100 : 0) + overlap * 20 - yDistance * 2;
          return { style, score, yDistance };
        })
        .filter(candidate => candidate.yDistance <= Math.max(run.height, candidate.style.height) * 1.1)
        .sort((a, b) => b.score - a.score)[0];
      if (!match) continue;
      run.bold = /bold|black|heavy|demi/i.test(match.style.fontWeight);
      run.italic = /italic|oblique/i.test(match.style.fontStyle);
      if (match.style.fontFamily && !/^(serif|sans-serif|monospace)$/i.test(match.style.fontFamily)) {
        run.fontFamily = match.style.fontFamily;
      }
      run.originalBold = run.bold;
      run.originalItalic = run.italic;
      run.originalFontFamily = run.fontFamily;
    }
  }

  private normalizeStyleText(value: string): string {
    return value.replace(/[\u0000-\u001f\ufffd\s]/g, '').toLocaleLowerCase();
  }

  private sampleRenderedTextColor(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, scale: number): string {
    const canvas = context.canvas;
    const left = Math.max(0, Math.floor((x - 1) * scale));
    const top = Math.max(0, Math.floor((y - 1) * scale));
    const right = Math.min(canvas.width, Math.ceil((x + width + 1) * scale));
    const bottom = Math.min(canvas.height, Math.ceil((y + height + 1) * scale));
    if (right <= left || bottom <= top) return '#111111';

    const pixels = context.getImageData(left, top, right - left, bottom - top).data;
    const colorCounts = new Map<number, number>();
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
      if (pixels[index + 3] < 128 || (red > 244 && green > 244 && blue > 244)) continue;
      if ((red * 0.299 + green * 0.587 + blue * 0.114) > 232) continue;
      const r = Math.round(red / 16), g = Math.round(green / 16), b = Math.round(blue / 16);
      const key = (r << 8) | (g << 4) | b;
      colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
    }
    let mostCommon = 0, count = 0;
    for (const [key, amount] of colorCounts) {
      if (amount > count) { mostCommon = key; count = amount; }
    }
    if (!count) return '#111111';
    const hex = (value: number) => Math.min(255, value * 16).toString(16).padStart(2, '0');
    return `#${hex((mostCommon >> 8) & 15)}${hex((mostCommon >> 4) & 15)}${hex(mostCommon & 15)}`;
  }

  private getPdfJsRuntime(): Promise<typeof pdfjsLib> {
    if (!this.pdfRuntimePromise) {
      this.pdfRuntimePromise = (async () => {
        // This editor runs exclusively on the user-provided public/old build.
        const moduleUrl = new URL('/old/pdf.min.js', window.location.href).href;
        const runtime = await import(moduleUrl) as typeof pdfjsLib;
        (runtime.GlobalWorkerOptions as { workerSrc: string }).workerSrc = '/old/pdf.worker.min.js';
        this.engineVersion = runtime.version;
        return runtime;
      })();
    }
    return this.pdfRuntimePromise;
  }
}
