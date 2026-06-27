import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { Observable } from 'rxjs';
import { tap, map } from 'rxjs/operators';

export interface GoogleFontItem {
  family: string;
  variants: string[];
  subsets: string[];
  version: string;
  lastModified: string;
  files: Record<string, string>;
  category: string;
  kind: string;
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

  /**
   * Streams and indexes the large assets file efficiently
   */
  public loadFontsFromAssets(): Observable<GoogleFontItem[]> {
    return this.http.get<GoogleFontItem[]>('assets/fonts-metadata.json').pipe(
      tap(fontsList => {
        this.fontsMap.clear();
        for (let i = 0; i < fontsList.length; i++) {
          const font = fontsList[i];
          this.fontsMap.set(font.family.toLowerCase().trim(), font);
        }
      }),
      map(fontsList => fontsList.sort((a, b) => a.family.localeCompare(b.family)))
    );
  }

  public findFontMatch(fontName: string): GoogleFontItem | null {
    const cleanKey = fontName.split('+').pop()?.replace(/['"]/g, '').toLowerCase().trim() || '';
    return this.fontsMap.get(cleanKey) || null;
  }

  /**
   * Generates crisp multi-weight axis parameters for the Google CDN
   */
  public loadFontToDOM(fontFamily: string): void {
    const lookupKey = fontFamily.toLowerCase().trim();
    const fontData = this.fontsMap.get(lookupKey);

    if (!fontData || this.loadedFontsToDOM.has(lookupKey)) return;

    const weights = fontData.variants
      .map(v => v.replace('italic', ''))
      .map(v => v === 'regular' ? '400' : v);
    
    const uniqueWeights = Array.from(new Set(weights)).sort();
    const hasItalic = fontData.variants.some(v => v.includes('italic') || v === 'italic');
    const familyParam = fontData.family.replace(/\s+/g, '+');
    let axisString = '';
    
    if (hasItalic && uniqueWeights.length) {
      axisString = `:ital,wght@${uniqueWeights.map(w => `0,${w};1,${w}`).join(';')}`;
    } else if (uniqueWeights.length) {
      axisString = `:wght@${uniqueWeights.join(';')}`;
    }

    const fontUrl = `https://fonts.googleapis.com/css2?family=${familyParam}:${axisString}&display=swap`;
    const elementId = `gf-runtime-${lookupKey.replace(/\s+/g, '-')}`;

    try {
      const link = this.document.createElement('link');
      link.id = elementId;
      link.rel = 'stylesheet';
      link.href = fontUrl;
      this.document.head.appendChild(link);
      this.loadedFontsToDOM.add(lookupKey);
    } catch (error) {
      console.error(`Failed loading layout weights for ${fontFamily}`, error);
    }
  }
}
