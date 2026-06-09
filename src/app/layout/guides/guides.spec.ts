import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Guides } from './guides';

describe('Guides', () => {
  let component: Guides;
  let fixture: ComponentFixture<Guides>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Guides],
    }).compileComponents();

    fixture = TestBed.createComponent(Guides);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
