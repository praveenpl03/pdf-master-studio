import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-about-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './about.html',
  styleUrls: ['./about.css']
})
export class AboutModalComponent {
  isOpen = false;
  version = '1.0.0';

  open() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }
}