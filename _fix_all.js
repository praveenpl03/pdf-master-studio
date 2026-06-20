const fs = require('fs');
const path = 'src/app/layout/mainscreen/mainscreen.ts';
let c = fs.readFileSync(path, 'utf8');
let changes = 0;

// 1. Fix width/height padding in htmlItemFromLineSegment
const old1 = "        width: Math.max(18, last.x + last.width - first.x),\n        height: Math.max(size * 1.12, ...ordered.map((item) => item.height)),";
const new1 = "        width: Math.max(18, last.x + last.width - first.x) + 50,\n        height: Math.max(size * 1.12, ...ordered.map((item) => item.height)) + 5.3,";
if (c.includes(old1)) {
  c = c.replace(old1, new1);
  console.log('1. Fixed width/height padding in htmlItemFromLineSegment');
  changes++;
} else {
  console.log('1. WARNING: Could not find width/height pattern');
}

// 2. Fix height in rawItemsFromTextContent (add +0.3)
const old2 = "        const height = Math.max(10, item.height || fontSize * 1.08);\n        const style = item.fontName ? content.styles?.[item.fontName] : undefined;";
const new2 = "        const height = Math.max(10, item.height || fontSize * 1.08) + 0.3;\n        const style = item.fontName ? content.styles?.[item.fontName] : undefined;";
if (c.includes(old2)) {
  c = c.replace(old2, new2);
  console.log('2. Fixed height +0.3 in rawItemsFromTextContent');
  changes++;
} else {
  console.log('2. WARNING: Could not find rawItemsFromTextContent height pattern');
}

// 3. Remove dead colorScore function
const colorScoreRegex = /\n  private colorScore\(\[red, green, blue\]: number\[\]\): number \{\n[\s\S]*?\n  \}/;
if (colorScoreRegex.test(c)) {
  c = c.replace(colorScoreRegex, '');
  console.log('3. Removed dead colorScore function');
  changes++;
} else {
  console.log('3. colorScore function not found');
}

fs.writeFileSync(path, c, 'utf8');
console.log('\nTotal changes:', changes);
if (changes > 0) console.log('SUCCESS: All fixes applied');
