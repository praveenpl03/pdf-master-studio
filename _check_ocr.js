const fs = require('fs');
const t = fs.readFileSync('src/app/layout/mainscreen/mainscreen.ts', 'utf8');

// 1. Check for ocrCanvasToHtmlItems method
const methodIdx = t.indexOf('private async ocrCanvasToHtmlItems');
if (methodIdx >= 0) {
  console.log('FOUND: ocrCanvasToHtmlItems method exists at', methodIdx);
  // Extract the method
  const after = t.slice(methodIdx);
  let depth = 0;
  let end = 0;
  for (let i = 0; i < after.length; i++) {
    if (after[i] === '{') depth++;
    else if (after[i] === '}') { depth--; if (depth === 0) { end = methodIdx + i + 1; break; } }
  }
  console.log(t.slice(methodIdx, Math.min(methodIdx + 200, end)));
} else {
  console.log('NOT FOUND: ocrCanvasToHtmlItems method does not exist');
}

// 2. Check for calls to ocrCanvasToHtmlItems
const callIdx = t.indexOf('.ocrCanvasToHtmlItems(');
if (callIdx >= 0) {
  console.log('FOUND: ocrCanvasToHtmlItems call at', callIdx);
  // Find which method it's in
  const before = t.slice(Math.max(0, callIdx - 500), callIdx);
  const methodLine = before.split('\n').filter(l => l.includes('private ')).pop() || 'unknown';
  console.log('Called from:', methodLine.trim());
  console.log('Call context:', t.slice(callIdx - 60, callIdx + 80));
} else {
  console.log('NOT FOUND: No calls to ocrCanvasToHtmlItems');
}

// 3. Check for createWorker calls
const workerIdx = t.indexOf('createWorker(');
if (workerIdx >= 0) {
  console.log('FOUND: createWorker call at', workerIdx);
  console.log('Context:', t.slice(workerIdx - 60, workerIdx + 80));
} else {
  console.log('NOT FOUND: No createWorker calls');
}

// 4. Check for ocrService usage
const svcIdx = t.indexOf('this.ocrService');
if (svcIdx >= 0) {
  console.log('FOUND: this.ocrService usage at', svcIdx);
  console.log('Context:', t.slice(svcIdx - 40, svcIdx + 60));
} else {
  console.log('NOT FOUND: No this.ocrService usage (besides declaration/terminate)');
}

// 5. Summarize OCR state
console.log('\n=== Summary ===');
console.log(`ocrCanvasToHtmlItems method: ${methodIdx >= 0 ? 'EXISTS' : 'MISSING'}`);
console.log(`calls to ocrCanvasToHtmlItems: ${callIdx >= 0 ? 'EXISTS' : 'NONE'}`);
console.log(`createWorker calls: ${workerIdx >= 0 ? 'EXISTS' : 'NONE'}`);
console.log(`this.ocrService usage: ${svcIdx >= 0 ? 'EXISTS' : 'NONE (besides field/terminate)'}`);
