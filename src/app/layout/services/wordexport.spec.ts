import { TestBed } from '@angular/core/testing';

import { Wordexport } from './wordexport';

describe('Wordexport', () => {
  let service: Wordexport;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Wordexport);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
