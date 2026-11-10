import { Routes } from '@angular/router';
import { Mainscreen } from './layout/mainscreen/mainscreen';
import { LayeredEditor } from './layout/layered-editor/layered-editor';

export const routes: Routes = [
  { path: '', component: Mainscreen },
  { path: 'layered-editor', component: LayeredEditor },
  { path: '**', redirectTo: '' },
];
