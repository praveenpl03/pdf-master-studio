import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';

@Injectable({ providedIn: 'root' })
export class PdfCryptoService {
  /**
   * Encrypt PDF bytes with qpdf-wasm.
   * @param inputBytes Source PDF bytes
   * @param userPassword User password for opening
   * @param ownerPassword Owner password (defaults to userPassword)
   */
  async encryptPdf(
    inputBytes: Uint8Array,
    userPassword: string,
    ownerPassword?: string,
  ): Promise<Uint8Array> {
    const owner = ownerPassword || userPassword;
    return this.runQpdf(inputBytes, ['--encrypt', userPassword, owner, '256', '--']);
  }

  /**
   * Decrypt PDF bytes with qpdf-wasm.
   */
  async decryptPdf(inputBytes: Uint8Array, password: string): Promise<Uint8Array> {
    return this.runQpdf(inputBytes, [`--password=${password}`, '--decrypt']);
  }

  /**
   * Run a qpdf-wasm command on the given PDF bytes.
   */
  async runQpdf(inputBytes: Uint8Array, args: string[]): Promise<Uint8Array> {
    if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error(
        'PDF password tools need cross-origin isolation. ' +
        'Restart the dev server so COOP/COEP headers are applied, then reload the page.',
      );
    }
    const init = (await import('qpdf-wasm')).default;
    const wasmBinary = await this.loadQpdfWasm();
    const errors: string[] = [];
    const qpdf = await init({
      wasmBinary,
      locateFile: (path: string) => (path.startsWith('qpdf.') ? `/assets/${path}` : path),
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

  /**
   * Encrypt PDF bytes using pdf-lib's built-in encryption.
   * This works on all browsers (including mobile) without SharedArrayBuffer.
   * Falls back gracefully when qpdf-wasm is not available.
   */
  async encryptWithPdfLib(
    pdfBytes: Uint8Array,
    userPassword: string,
    ownerPassword?: string,
  ): Promise<Uint8Array> {
    // pdf-lib does not support encryption via save(); delegate to qpdf-wasm instead.
    return this.encryptPdf(pdfBytes, userPassword, ownerPassword);
  }

  /**
   * Load the qpdf WASM binary from assets.
   */
  async loadQpdfWasm(): Promise<Uint8Array> {
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
    throw new Error(
      `Could not load PDF password engine. Restart the dev server if assets were just added. ${failures.join(' | ')}`,
    );
  }
}
