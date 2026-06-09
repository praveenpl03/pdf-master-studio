import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Tools } from './tools';

describe('Tools', () => {
  let component: Tools;
  let fixture: ComponentFixture<Tools>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Tools],
    }).compileComponents();

    fixture = TestBed.createComponent(Tools);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
