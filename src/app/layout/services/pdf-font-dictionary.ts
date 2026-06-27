import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { PDFDocument, PDFDict, PDFName, PDFRef } from 'pdf-lib';
import {GoogleFontService} from '../mainscreen/fonts/font-catalog';
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

  constructor(@Inject(DOCUMENT) private document: Document, private googleFontService: GoogleFontService) {}


private fontRegistry = new Map<string, PdfFontDefinition[]>();
   cssStyleBlock = '';
   processedFamilies = new Set<string>();

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
compileGlobalDocumentFontHeaderStyle(extractedFonts: any[]): void {
  const elementId = 'pdf-runtime-layout-fontface-header';
  
  const existingStyle = this.document.getElementById(elementId);
  if (existingStyle) {
    existingStyle.remove();
  }

  const processedFamilies = new Set<string>();
  const googleFamilyQueries: string[] = [];
  const processedGoogleFamilies = new Set<string>(); // Prevent duplicate font query strings
  let localRulesCssBlock = '';

  // 1. Loop through data elements to assemble query parts
  extractedFonts.forEach((font) => {
    const rawFamilyName = font.baseFont; 
    const baseFamily = rawFamilyName.replace(/Bold|Italic|Regular/gi, '').trim();
    const lookupKey = baseFamily.toLowerCase();
    
    if (processedFamilies.has(lookupKey)) return;
    processedFamilies.add(lookupKey);

    // Look for a Google Font mapping record reference
    const googleFontMatch = this.googleFontService.findFontMatch(baseFamily);
    let webFontFamilyName = baseFamily;

    if (googleFontMatch) {
      webFontFamilyName = googleFontMatch.family;
      const normalizedFamilyKey = webFontFamilyName.toLowerCase().trim();

      // Only build the query block if we haven't already added this family (Prevents Duplication)
      if (!processedGoogleFamilies.has(normalizedFamilyKey)) {
        processedGoogleFamilies.add(normalizedFamilyKey);

        // Calculate axis weights strictly for this specific font family structure
        const numericWeights = googleFontMatch.variants
          .map(v => v.replace('italic', '').trim())
          .map(v => v === 'regular' || v === '' ? 400 : parseInt(v, 10))
          .filter(w => !isNaN(w) && w >= 100 && w <= 900);

        const uniqueWeights = Array.from(new Set(numericWeights)).sort((a, b) => a - b);
        if (uniqueWeights.length === 0) uniqueWeights.push(400);

        const hasItalic = googleFontMatch.variants.some(v => v.includes('italic') || v === 'italic');
        const familyParam = googleFontMatch.family.replace(/\s+/g, '+');
        let axisString = '';

        if (hasItalic) {
          const uprightPairs = uniqueWeights.map(w => `0,${w}`);
          const italicPairs = uniqueWeights.map(w => `1,${w}`);
          axisString = ':ital,wght@' + [...uprightPairs, ...italicPairs].join(';');
        } else {
          axisString = ':wght@' + uniqueWeights.join(';');
        }

        // Add this family's query segment to the collection array
        googleFamilyQueries.push('family=' + familyParam );
      }
    }

    // 2. Map structural fallback overrides matching your element dataset keys
    const familyVariants = extractedFonts.filter(f => 
      f.baseFont.replace(/Bold|Italic|Regular/gi, '').trim().toLowerCase() === lookupKey
    );

    familyVariants.forEach((variant) => {
      localRulesCssBlock += `
        @font-face {
          font-family: "${webFontFamilyName}";
          src: local("${variant.baseFont}"), local("${baseFamily}");
          font-weight: ${variant.bold ? '700' : '400'};
          font-style: ${variant.italic ? 'italic' : 'normal'};
          font-display: swap;
        }
      `;
    });

    const isSerif = /serif|times|cambria|georgia|tinos/i.test(baseFamily);
    const fontStack = isSerif 
      ? `"${baseFamily}", "${webFontFamilyName}", Georgia, serif` 
      : `"${baseFamily}", "${webFontFamilyName}", Arial, sans-serif`;

    localRulesCssBlock += `
      [data-pdf-font="${lookupKey}"],
      textarea[data-pdf-font="${lookupKey}"] {
        font-family: ${fontStack} !important;
      }
    `;
  });

  // =========================================================================
  // 🔥 FIX: BULLETPROOF OFFICIAL MULTI-FAMILY URL BUILDER
  // =========================================================================
  let finalImportStatement = '';
  if (googleFamilyQueries.length > 0) {
    // Merges with precise official fonts.googleapis.com base domains
    const combinedFamiliesUrl = "https://fonts.googleapis.com/css2?" + googleFamilyQueries.join('&') + "&display=swap";
    finalImportStatement = "@import url('" + combinedFamiliesUrl + "');\n";
    
    console.log('Generated Multi-Family API Link String:', combinedFamiliesUrl);
  }

  try {
    const styleElement = this.document.createElement('style');
    styleElement.id = elementId;
    styleElement.innerHTML = finalImportStatement + "\n" + localRulesCssBlock;
    this.document.head.appendChild(styleElement);
    
    console.log('✅ Success: Clean unified stylesheet header mounted.');
  } catch (error) {
    console.error('Failed generating layout document style header element blocks.', error);
  }
}








 

}