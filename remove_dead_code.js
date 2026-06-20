const fs = require('fs');
let content = fs.readFileSync('src/app/layout/mainscreen/mainscreen.ts', 'utf8');

// Remove the unused htmlItemFromLineSegment method (now lives in PdfToHtmlConverter)
const startMarker = 'private htmlItemFromLineSegment';
const endMarker = 'private applyHtmlItemBackgrounds'; // This method was also removed, so we need to find what's after htmlItemFromLineSegment now

// Find the method - look for the start
const startIdx = content.indexOf('  private htmlItemFromLineSegment(');
if (startIdx === -1) {
  console.log('htmlItemFromLineSegment not found');
  process.exit(0);
}

// Find the next private method after it
const afterStart = content.substring(startIdx + 1);
const nextPrivate = afterStart.indexOf('\n  private ');
if (nextPrivate === -1) {
  console.log('Next private method not found');
  process.exit(0);
}

const blockToRemove = content.substring(startIdx, startIdx + 1 + nextPrivate);
content = content.replace(blockToRemove, '');

fs.writeFileSync('src/app/layout/mainscreen/mainscreen.ts', content, 'utf8');
console.log('Dead code removed successfully');
console.log('New file size:', content.length);
