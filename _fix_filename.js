const fs = require('fs');
const path = 'src/app/layout/mainscreen/mainscreen.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace the exact assignment
const oldStr = "this.fileName = name;";
const newStr = "setTimeout(() => { this.fileName = name; });";

// Find the specific occurrence in loadBytes
// We know it's after "this.currentBytes = bytes;" and before "this.overlays = [];"
const marker = "this.currentBytes = bytes;";
const idx = content.indexOf(marker);
if (idx >= 0) {
  const afterBytes = content.substring(idx + marker.length);
  const fileNameIdx = afterBytes.indexOf(oldStr);
  if (fileNameIdx >= 0) {
    const actualIdx = idx + marker.length + fileNameIdx;
    const before = content.substring(0, actualIdx);
    const after = content.substring(actualIdx + oldStr.length);
    content = before + newStr + after;
    fs.writeFileSync(path, content, 'utf8');
    console.log('Fixed: fileName assignment wrapped in setTimeout');
  } else {
    console.log('ERROR: Could not find "this.fileName = name;" after marker');
    process.exit(1);
  }
} else {
  console.log('ERROR: Could not find marker');
  process.exit(1);
}
