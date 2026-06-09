import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Mainscreen } from './mainscreen';

describe('Mainscreen', () => {
  let component: Mainscreen;
  let fixture: ComponentFixture<Mainscreen>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Mainscreen],
    }).compileComponents();

    fixture = TestBed.createComponent(Mainscreen);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
