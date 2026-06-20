import { Injectable, NgZone } from '@angular/core';
import { hexToRgb, paintBlankCanvas, paintHtmlTextToCanvas, safePdfRenderScale } from './pdf-utils';
import type { PageItem, OverlayItem, HtmlTextItem } from '../mainscreen/models/pdf-types';

/**
 * Injectable service that provides PDF page rendering utilities.
 * Requires NgZone for running pdfjs rendering outside Angular's change detection,
 * and accepts callbacks for component-specific operations.
 */
@Injectable({ providedIn: 'root' })
export class PdfRenderService {
  constructor(private ngZone: NgZone) {}

  /**
   * Run work outside Angular's zone to avoid excessive change detection during rendering.
   */
  runOutsideAngular<T>(work: () => Promise<T>): Promise<T> {
    return this.ngZone.runOutsideAngular(work);
  }

  /**
   * Render a single PDF page to a canvas using pdfjs-dist.
   */
  async renderPageCanvas(
    pageItem: PageItem,
    scale: number,
    openPdfJsDocument: () => Promise<any>,
    isMobile: boolean,
  ): Promise<HTMLCanvasElement> {
    const pdf: any = await openPdfJsDocument();
    const page: any = await this.runOutsideAngular(() => pdf.getPage(pageItem.sourceIndex + 1));
    const viewport = page.getViewport({ scale, rotation: pageItem.rotation });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context.');
    if (pageItem.blank) {
      paintBlankCanvas(canvas, context, pageItem, scale);
      return canvas;
    }
    await this.runOutsideAngular(() =>
      page.render({ canvas, canvasContext: context, viewport }).promise,
    );
    return canvas;
  }

  /**
   * Draw a single overlay item onto a canvas context.
   */
  async paintOverlayToCanvas(
    context: CanvasRenderingContext2D,
    overlay: OverlayItem,
    scale: number,
    croppedImageDataUrl: (overlay: OverlayItem) => Promise<string>,
  ): Promise<void> {
    const x = overlay.x * scale;
    const y = overlay.y * scale;
    const w = overlay.width * scale;
    const h = overlay.height * scale;

    if (overlay.kind === 'image' && overlay.imageData) {
      const imageData = await croppedImageDataUrl(overlay);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not load overlay image.'));
        image.src = imageData;
      });
      context.save();
      context.globalAlpha = overlay.opacity;
      context.drawImage(img, x, y, w, h);
      context.restore();
    } else if (['rectangle', 'highlight', 'ellipse', 'line'].includes(overlay.kind)) {
      context.save();
      context.globalAlpha = overlay.opacity;
      const color = hexToRgb(overlay.color);
      const cssColor = `rgba(${Math.round(color.red * 255)},${Math.round(color.green * 255)},${Math.round(color.blue * 255)},${overlay.opacity})`;
      context.strokeStyle = cssColor;
      context.lineWidth = Math.max(1, overlay.borderWidth ?? 2);

      if (overlay.fillEnabled) {
        const fill = hexToRgb(overlay.fillColor ?? overlay.color);
        context.fillStyle = `rgba(${Math.round(fill.red * 255)},${Math.round(fill.green * 255)},${Math.round(fill.blue * 255)},${overlay.opacity})`;
      }

      if (overlay.kind === 'line') {
        context.beginPath();
        context.moveTo(x, y + h / 2);
        context.lineTo(x + w, y + h / 2);
        context.stroke();
      } else if (overlay.kind === 'ellipse') {
        context.beginPath();
        context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        if (overlay.fillEnabled) context.fill();
        context.stroke();
      } else if (overlay.kind === 'rectangle' || overlay.kind === 'highlight') {
        if (overlay.fillEnabled) context.fillRect(x, y, w, h);
        context.strokeRect(x, y, w, h);
      }
      context.restore();
    } else {
      // Text overlay
      context.save();
      context.globalAlpha = overlay.opacity;
      context.font = `${
        overlay.fontStyle === 'italic' ? 'italic ' : ''
      }${overlay.fontWeight ?? '400'} ${overlay.size * scale}px Arial, sans-serif`;
      context.fillStyle = `rgba(${Math.round((hexToRgb(overlay.color).red) * 255)},${Math.round((hexToRgb(overlay.color).green) * 255)},${Math.round((hexToRgb(overlay.color).blue) * 255)},${overlay.opacity})`;
      context.textBaseline = 'top';
      context.fillText(overlay.text, x, y + 8 * scale);
      context.restore();
    }
  }

  /**
   * Render a page with its overlays composited onto the canvas.
   */
  async renderCompositePageCanvas(
    pageItem: PageItem,
    scale: number,
    overlays: OverlayItem[],
    openPdfJsDocument: () => Promise<any>,
    croppedImageDataUrl: (overlay: OverlayItem) => Promise<string>,
    isMobile: boolean,
  ): Promise<HTMLCanvasElement> {
    const canvas = await this.renderPageCanvas(pageItem, scale, openPdfJsDocument, isMobile);
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    const pageOverlays = overlays.filter((o) => o.pageId === pageItem.id);
    for (const overlay of pageOverlays) {
      await this.paintOverlayToCanvas(context, overlay, scale, croppedImageDataUrl);
    }
    return canvas;
  }

  /**
   * Render a page with HTML text items composited onto the canvas.
   */
  async renderHtmlPageCanvas(
    pageItem: PageItem,
    htmlItems: HtmlTextItem[],
    scale: number,
    openPdfJsDocument: () => Promise<any>,
    isMobile: boolean,
  ): Promise<HTMLCanvasElement> {
    const pageHtmlItems = htmlItems.filter((i) => i.pageId === pageItem.id);
    // If no HTML items, just render the page
    if (!pageHtmlItems.length) {
      return this.renderPageCanvas(pageItem, scale, openPdfJsDocument, isMobile);
    }
    const canvas = await this.renderPageCanvas(pageItem, scale, openPdfJsDocument, isMobile);
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    for (const item of pageHtmlItems) {
      paintHtmlTextToCanvas(context, item, scale);
    }
    return canvas;
  }

  /**
   * Render a page with all edits (overlays + HTML text) composited.
   */
  async renderEditedPageCanvas(
    pageItem: PageItem,
    scale: number,
    overlays: OverlayItem[],
    htmlItems: HtmlTextItem[],
    openPdfJsDocument: () => Promise<any>,
    croppedImageDataUrl: (overlay: OverlayItem) => Promise<string>,
    isMobile: boolean,
  ): Promise<HTMLCanvasElement> {
    const canvas = await this.renderHtmlPageCanvas(
      pageItem, htmlItems, scale, openPdfJsDocument, isMobile,
    );
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    const pageOverlays = overlays.filter((o) => o.pageId === pageItem.id);
    for (const overlay of pageOverlays) {
      await this.paintOverlayToCanvas(context, overlay, scale, croppedImageDataUrl);
    }
    return canvas;
  }

  /**
   * Render a page for image export with all edits.
   */
  async renderPageImageForExport(
    pageItem: PageItem,
    scale: number,
    overlays: OverlayItem[],
    htmlItems: HtmlTextItem[],
    openPdfJsDocument: () => Promise<any>,
    croppedImageDataUrl: (overlay: OverlayItem) => Promise<string>,
    isMobile: boolean,
  ): Promise<HTMLCanvasElement> {
    return this.renderEditedPageCanvas(
      pageItem, scale, overlays, htmlItems, openPdfJsDocument, croppedImageDataUrl, isMobile,
    );
  }

  /**
   * Render the active page canvas for display, respecting blank pages.
   */
  async renderActivePageCanvas(
    pageItem: PageItem,
    scale: number,
    overlays: OverlayItem[],
    htmlItems: HtmlTextItem[],
    openPdfJsDocument: () => Promise<any>,
    croppedImageDataUrl: (overlay: OverlayItem) => Promise<string>,
    isMobile: boolean,
    zoom: number,
    mainCanvas?: HTMLCanvasElement,
  ): Promise<HTMLCanvasElement | undefined> {
    if (!mainCanvas) return undefined;
    if (pageItem.blank) {
      const context = mainCanvas.getContext('2d');
      if (!context) return undefined;
      paintBlankCanvas(mainCanvas, context, pageItem, scale, zoom);
      return mainCanvas;
    }
    const canvas = await this.renderEditedPageCanvas(
      pageItem, scale, overlays, htmlItems, openPdfJsDocument, croppedImageDataUrl, isMobile,
    );
    const ctx = mainCanvas.getContext('2d');
    if (!ctx) return canvas;
    mainCanvas.width = canvas.width;
    mainCanvas.height = canvas.height;
    mainCanvas.style.width = `${pageItem.width * zoom}px`;
    mainCanvas.style.height = `${pageItem.height * zoom}px`;
    ctx.drawImage(canvas, 0, 0);
    return mainCanvas;
  }
}
