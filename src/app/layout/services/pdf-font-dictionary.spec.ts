import { TestBed } from '@angular/core/testing';

import { PdfFontDictionary } from './pdf-font-dictionary';

describe('PdfFontDictionary', () => {
  let service: PdfFontDictionary;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfFontDictionary);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
