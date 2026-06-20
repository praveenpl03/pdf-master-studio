import { Injectable } from '@angular/core';
import { downloadBlob, escapeHtml } from './pdf-utils';

/** Shape returned by structuredTextPages(). */
export interface StructuredPageData {
  page: number;
  rows: { y: number; cells: { x: number; text: string }[] }[];
}

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  /**
   * Export page text as a plain-text file.
   */
  async exportText(pages: StructuredPageData[]): Promise<void> {
    const text = pages
      .map((page) => [
        `Page ${page.page}`,
        ...page.rows.map((row) => row.cells.map((cell) => cell.text).join('\t')),
      ].join('\n'))
      .join('\n\n');
    downloadBlob(text, 'converted.txt', 'text/plain;charset=utf-8');
  }

  /**
   * Export page text as an HTML-based DOC file.
   */
  async exportDoc(pages: StructuredPageData[], title: string, fileName: string): Promise<void> {
    const body = pages
      .map(
        (page) => `
      <h2>Page ${page.page}</h2>
      ${page.rows
        .map((row) => `<p>${row.cells.map((cell) => escapeHtml(cell.text)).join(' ')}</p>`)
        .join('')}
    `,
      )
      .join('<br style="page-break-before:always">');
    const html = `<!doctype html>
      <html><head><meta charset="utf-8"><title>${escapeHtml(title || fileName)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.35}h2{font-size:13pt}p{margin:0 0 6pt}</style>
      </head><body>${body}</body></html>`;
    downloadBlob(html, 'converted.doc', 'application/msword;charset=utf-8');
  }

  /**
   * Export page text as a DOCX file using the `docx` library.
   */
  async exportDocx(pages: StructuredPageData[], title: string): Promise<void> {
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const children = pages.flatMap((page, index) => [
      new Paragraph({
        spacing: { before: index > 0 ? 400 : 0 },
        children: [new TextRun({ text: `Page ${page.page}`, bold: true, size: 28 })],
      }),
      ...page.rows.map(
        (row) =>
          new Paragraph({
            spacing: { after: 80 },
            children: row.cells.map((cell) => new TextRun({ text: cell.text + ' ', size: 22 })),
          }),
      ),
    ]);
    const doc = new Document({
      title: title || 'Converted PDF',
      description: 'PDF converted to DOCX by TheConvertor',
      styles: {
        default: {
          document: {
            run: { font: 'Arial', size: 22 },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children,
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    downloadBlob(
      blob,
      'converted.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  }

  /**
   * Export page text as an HTML-based XLS file.
   */
  async exportExcel(pages: StructuredPageData[]): Promise<void> {
    const sheets = pages
      .map(
        (page) => `
      <h2>Page ${page.page}</h2>
      <table>
        ${page.rows
          .map(
            (row) =>
              `<tr>${row.cells.map((cell) => `<td>${escapeHtml(cell.text)}</td>`).join('')}</tr>`,
          )
          .join('')}
      </table>
    `,
      )
      .join('<br>');
    const html = `<!doctype html>
      <html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:10pt}
        table{border-collapse:collapse;margin-bottom:18px}
        td{border:1px solid #999;padding:4px 8px;vertical-align:top;mso-number-format:"\\@";}
        h2{font-size:12pt}
      </style></head><body>${sheets}</body></html>`;
    downloadBlob(html, 'converted.xls', 'application/vnd.ms-excel;charset=utf-8');
  }
}
