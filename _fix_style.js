const fs = require('fs');
const path = 'src/app/layout/mainscreen/mainscreen.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Replace template literal back to backtick style in the new function
content = content.replace(
  `'#' + bucket.red.toString(16).padStart(2, '0') + bucket.green.toString(16).padStart(2, '0') + bucket.blue.toString(16).padStart(2, '0')`,
  '`#' + '$' + '{bucket.red.toString(16).padStart(2, \'0\')}' + '$' + '{bucket.green.toString(16).padStart(2, \'0\')}' + '$' + '{bucket.blue.toString(16).padStart(2, \'0\')}`'
);

content = content.replace(
  `'#' + red.toString(16).padStart(2, '0') + green.toString(16).padStart(2, '0') + blue.toString(16).padStart(2, '0')`,
  '`#' + '$' + '{red.toString(16).padStart(2, \'0\')}' + '$' + '{green.toString(16).padStart(2, \'0\')}' + '$' + '{blue.toString(16).padStart(2, \'0\')}`'
);

// 2. Remove the now-unused colorScore function
const colorScoreMatch = content.match(/\n  private colorScore\(\[red, green, blue\]: number\[\]\): number \{\n[\s\S]*?\n  \}/);
if (colorScoreMatch) {
  content = content.replace(colorScoreMatch[0], '');
  console.log('Removed colorScore function');
} else {
  console.log('colorScore function not found');
}

fs.writeFileSync(path, content, 'utf8');
console.log('All fixes applied');
