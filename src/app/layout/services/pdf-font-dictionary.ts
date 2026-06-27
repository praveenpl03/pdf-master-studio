import { Injectable } from '@angular/core';
import { PDFDocument, PDFDict, PDFName, PDFRef } from 'pdf-lib';
export interface PdfFontDefinition {
  objectNumber?: number;
  baseFont: string;
  subtype?: string;
  fontDescriptor?: number;
  bold: boolean;
  italic: boolean;
  raw?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PdfFontDictionaryService {

  constructor() {}


private fontRegistry = new Map<string, PdfFontDefinition[]>();

 buildFontRegistry(pdfFonts: PdfFontDefinition[]): void {

    this.fontRegistry.clear();

    for (const font of pdfFonts) {

        const key = font.baseFont.toLowerCase();

        if (!this.fontRegistry.has(key)) {
            this.fontRegistry.set(key, []);
        }

        this.fontRegistry.get(key)!.push(font);
    }

}
 

 async extract(pdf: Uint8Array): Promise<PdfFontDefinition[]> {
  const pdfDoc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const fontsMap = new Map<string, PdfFontDefinition>();
  const context = pdfDoc.context;

  // Iterate through all indirect objects in the PDF catalog
  context.enumerateIndirectObjects().forEach(([ref, object]) => {
    if (!(object instanceof PDFDict)) return;

    // Check if the object is explicitly a Font type
    const type = object.get(PDFName.of('Type'));
    if (type !== PDFName.of('Font')) return;

    // Extract attributes safely using pdf-lib core types
    const baseFontName = object.get(PDFName.of('BaseFont'))?.toString() || 
                         object.get(PDFName.of('FontName'))?.toString() || 
                         '/Unknown';
    
    let fontName = baseFontName.replace(/^\//, ''); // Strip leading slash
    fontName = this.cleanFontName(fontName); // Use your existing cleaning method

    const subtype = object.get(PDFName.of('Subtype'))?.toString().replace(/^\//, '') || 'Unknown';
    
    // Resolve FontDescriptor reference if it exists
    let fontDescriptorRef: number | undefined;
    const descriptor = object.get(PDFName.of('FontDescriptor'));
    if (descriptor instanceof PDFRef) {
      fontDescriptorRef = descriptor.objectNumber;
    }

    const bold = /bold|black|heavy|semibold|demibold|bd/i.test(fontName);
    const italic = /italic|oblique|it/i.test(fontName);
    
    const key = `${fontName}_${subtype}`;

    if (!fontsMap.has(key)) {
      fontsMap.set(key, {
        objectNumber: ref.objectNumber,
        baseFont: fontName,
        subtype,
        fontDescriptor: fontDescriptorRef,
        bold,
        italic
      });
    }
  });

  return Array.from(fontsMap.values()).sort((a, b) => 
    a.baseFont.localeCompare(b.baseFont)
  );
}

  cleanFontName(name: string): string {
  if (!name) return 'Unknown';

  // 1. Unescape PDF hex characters (e.g., #20 to space, #2D to hyphen)
  let cleaned = name.replace(/#([0-9A-Fa-f]{2})/g, (_, hex) => 
    String.fromCharCode(parseInt(hex, 16))
  );

  // 2. Remove standard 6-character PDF subset prefix (e.g., "ABCDEF+")
  cleaned = cleaned.replace(/^[A-Z]{6}\+/, '');

  // 3. Remove common CJK encodings safely using word boundaries or trailing anchors
  cleaned = cleaned.replace(/-(?:Identity|MacExpert|Custom)-(?:H|V)$/i, '');

  // 4. Safely strip PostScript / Monotype modifiers at word boundaries 
  // Prevents mangling regular letters at the end of font names
  cleaned = cleaned.replace(/\b(PSMT|PS|MT)\b$/i, '');

  // 5. Replace common punctuation/delimiters with clean spaces
  cleaned = cleaned.replace(/[,_\-]/g, ' ');

  // 6. Collapse multiple sequential spaces and trim the ends
  return cleaned.replace(/\s+/g, ' ').trim();
}

  //----------------------------------------------------

 

}