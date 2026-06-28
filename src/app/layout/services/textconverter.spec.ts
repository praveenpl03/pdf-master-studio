import { TestBed } from '@angular/core/testing';

import { Textconverter } from './textconverter';

describe('Textconverter', () => {
  let service: Textconverter;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Textconverter);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
