import { TestBed } from '@angular/core/testing';

import { Mupdftrail } from './mupdftrail';

describe('Mupdftrail', () => {
  let service: Mupdftrail;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Mupdftrail);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
