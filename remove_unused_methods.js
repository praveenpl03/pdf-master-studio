const fs = require('fs');
let content = fs.readFileSync('src/app/layout/mainscreen/mainscreen.ts', 'utf8');

// Methods to remove (in order from file)
const removals = [
  // applyHtmlItemBackgrounds
  { start: 'private applyHtmlItemBackgrounds', end: 'private isColoredText' },
  // isColoredText
  { start: 'private isColoredText', end: 'private replaceGraphicHtmlItemsWithImages' },
  // replaceGraphicHtmlItemsWithImages
  { start: 'private replaceGraphicHtmlItemsWithImages', end: 'private createGraphicCoverOverlay' },
  // createGraphicCoverOverlay and createImageOverlayFromCanvasArea
  { start: 'private createGraphicCoverOverlay', end: 'private shouldRenderHtmlItemAsImage' },
  // shouldRenderHtmlItemAsImage
  { start: 'private shouldRenderHtmlItemAsImage', end: 'private isDarkColor' },
  // isDarkColor
  { start: 'private isDarkColor', end: 'private isGraphicBackground' },
  // isGraphicBackground
  { start: 'private isGraphicBackground', end: 'private sampleCanvasColor' },
  // sampleCanvasColor and colorScore
  { start: 'private sampleCanvasColor', end: 'private linkRectsFromAnnotations' },
];

// Apply removals in reverse order to preserve indices
removals.reverse();
for (const { start, end } of removals) {
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx !== -1 && endIdx !== -1) {
    const block = content.substring(startIdx, endIdx);
    content = content.replace(block, '');
  }
}

fs.writeFileSync('src/app/layout/mainscreen/mainscreen.ts', content, 'utf8');
console.log('Unused methods removed successfully');
console.log('New file size:', content.length);
