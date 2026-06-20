const fs = require('fs');

// --- Fix 1: pdfconvert.ts - Add right padding to width and increase height ---
const pdfPath = 'src/app/layout/services/pdfconvert.ts';
let pdf = fs.readFileSync(pdfPath, 'utf8');

// Add 15% right padding to the segment width to prevent last word clipping
const oldWidth = 'width: Math.max(18, last.x + last.width - first.x),';
const newWidth = 'width: Math.max(18, last.x + last.width - first.x + size * 0.8),';
if (pdf.includes(oldWidth)) {
  pdf = pdf.replace(oldWidth, newWidth);
  console.log('pdfconvert.ts: Increased segment width with right padding');
} else {
  console.log('pdfconvert.ts: width pattern not found');
}

// Increase minimum height from 1.12x to 1.28x to prevent descender clipping
const oldHeight = 'height: Math.max(size * 1.12, ...ordered.map((item) => item.height)),';
const newHeight = 'height: Math.max(size * 1.28, ...ordered.map((item) => item.height)),';
if (pdf.includes(oldHeight)) {
  pdf = pdf.replace(oldHeight, newHeight);
  console.log('pdfconvert.ts: Increased segment height multiplier');
} else {
  console.log('pdfconvert.ts: height pattern not found');
}

fs.writeFileSync(pdfPath, pdf, 'utf8');
console.log('pdfconvert.ts saved');

// --- Fix 2: mainscreen.css - Allow textarea to show overflowed text ---
const cssPath = 'src/app/layout/mainscreen/mainscreen.css';
let css = fs.readFileSync(cssPath, 'utf8');

// Change overflow: hidden to overflow: visible so the last word isn't clipped
const oldOverflow = '.html-text-run {\n  position: absolute;\n  z-index: 3;\n  overflow: hidden;';
const newOverflow = '.html-text-run {\n  position: absolute;\n  z-index: 3;\n  overflow: visible;';
if (css.includes(oldOverflow)) {
  css = css.replace(oldOverflow, newOverflow);
  console.log('mainscreen.css: Changed overflow to visible');
} else {
  console.log('mainscreen.css: overflow pattern not found');
}

// Also increase min-width to prevent single-word clipping
const oldMinWidth = 'min-width: 80px;';
const newMinWidth = 'min-width: 120px;';
// Only replace the one inside .html-text-run if it exists
// Actually, this is in .overlay-item, not .html-text-run - let's skip this

fs.writeFileSync(cssPath, css, 'utf8');
console.log('mainscreen.css saved');

console.log('ALL DONE');
