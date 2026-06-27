import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { Observable, tap, map } from 'rxjs';

export interface GoogleFontItem {
  family: string;
  variants: string[];
  category?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleFontService {
  private fontsMap = new Map<string, GoogleFontItem>();
  private loadedFontsToDOM = new Set<string>();

  constructor(
    private http: HttpClient,
    @Inject(DOCUMENT) private document: Document
  ) {}

public loadFontsFromAssets(): Observable<GoogleFontItem[]> {
  return this.http.get<any>('assets/fonts-metadata.json').pipe(
    map(response => {
      // 🔥 FIX: Extract the array if the JSON is wrapped inside an object
      if (Array.isArray(response)) {
        return response;
      } else if (response && Array.isArray(response.fonts)) {
        return response.fonts;
      } else if (response && Array.isArray(response.items)) {
        return response.items;
      } else if (response && typeof response === 'object') {
        // Fallback: search for any array property inside the object
        const foundArray = Object.values(response).find(val => Array.isArray(val));
        if (foundArray) return foundArray as GoogleFontItem[];
      }
      console.error('Failed to find a valid font array inside fonts-metadata.json');
      return [];
    }),
    tap((fontsList: GoogleFontItem[]) => {
      this.fontsMap.clear();
      for (let i = 0; i < fontsList.length; i++) {
        const font = fontsList[i];
        if (font && font.family) {
          this.fontsMap.set(font.family.toLowerCase().trim(), font);
        }
      }
    }),
    map((fontsList: GoogleFontItem[]) => 
      // Safely run sort now that it is guaranteed to be an array
      [...fontsList].sort((a, b) => a.family.localeCompare(b.family))
    )
  );
}


public findFontMatch(fontName: string): GoogleFontItem | null {
  if (!fontName) return null;
  
  // 1. Clean out subset tags, quotes, and punctuation
  const cleanKey = fontName.split('+').pop()?.replace(/['"]/g, '').toLowerCase().trim() || '';
  
  // 2. 🔥 NEW: Aggressively strip font modifiers and suffixes (like MT, Bold, Regular)
  let baseKey = cleanKey
    .replace(/bold|italic|regular|oblique/gi, '')
    .replace(/(psmt|mt|ps)$/i, '') // Strips "ArialMT" -> "arial", "SymbolMT" -> "symbol"
    .trim();

  // 3. System to Web Substitution Engine
  if (baseKey === 'cambria') baseKey = 'tinos';       
  if (baseKey === 'calibri') baseKey = 'carlito';     
  if (baseKey === 'arial') baseKey = 'arimo';         
  if (baseKey === 'symbol') baseKey = 'noto sans symbols'; 

  // Direct map check
  if (this.fontsMap.has(baseKey)) {
    return this.fontsMap.get(baseKey)!;
  }

  // 4. Substring fallback engine loop (maps keys like "segoeuisymbol" -> "segoe")
  for (const [mapKey, fontItem] of this.fontsMap.entries()) {
    if (baseKey.includes(mapKey) || mapKey.includes(baseKey)) {
      return fontItem;
    }
  }

  return null;
}


public buildFontApiUrl(fontData: GoogleFontItem): string {
  if (!fontData || !fontData.variants) {
    return 'https://googleapis.com';
  }

  // 1. Clean out words like 'italic', isolate raw number variants, and cast them to pure integers
  const numericWeights = fontData.variants
    .map(v => v.replace('italic', '').trim())
    .map(v => v === 'regular' || v === '' ? 400 : parseInt(v, 10))
    .filter(w => !isNaN(w) && w >= 100 && w <= 900); // Enforce strict Google weight boundaries

  // 2. De-duplicate weights and sort them in strict ascending order (Required by Google)
  const uniqueWeights = Array.from(new Set(numericWeights)).sort((a, b) => a - b);

  if (uniqueWeights.length === 0) {
    uniqueWeights.push(400); // Secure baseline layout fallback
  }

  const hasItalic = fontData.variants.some(v => v.includes('italic') || v === 'italic');
  const familyParam = fontData.family.replace(/\s+/g, '+');
  let axisString = '';
  
  // =========================================================================
  // 🔥 OFFICIAL GOOGLE API SPEC: BUILD STRUCTURAL STRINGS PERFECTLY
  // =========================================================================
  if (hasItalic) {
    // If italics exist, Google requires explicitly mapping ALL upright weights (0,wght) 
    // FIRST, followed by ALL italic weights (1,wght) SECOND. They cannot be interleaved!
    // Correct Syntax Example: :ital,wght@0,400;0,700;1,400;1,700
    const uprightPairs = uniqueWeights.map(w => `0,${w}`);
    const italicPairs = uniqueWeights.map(w => `1,${w}`);
    
    axisString = `:ital,wght@${[...uprightPairs, ...italicPairs].join(';')}`;
  } else {
    // Upright fonts only syntax layout: :wght@400;700
    axisString = `:wght@${uniqueWeights.join(';')}`;
  }

  return `https://googleapis.com{familyParam}${axisString}&display=swap`;
}



  // Blank stub since styles are now combined into the single layout style sheet header element
  public loadFontToDOM(fontFamily: string): void {}
}
