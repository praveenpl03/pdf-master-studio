import { Component, signal } from '@angular/core';
import { Mainscreen } from "./layout/mainscreen/mainscreen";

@Component({
  selector: 'app-root',
  imports: [Mainscreen],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('theconvertor');
}
