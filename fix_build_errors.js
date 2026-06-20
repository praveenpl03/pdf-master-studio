const fs = require('fs');
let content = fs.readFileSync('src/app/layout/mainscreen/mainscreen.ts', 'utf8');

// Remove applyHtmlItemBackgrounds (which calls sampleCanvasColor)
content = content.replace(
  /  private applyHtmlItemBackgrounds\(items: HtmlTextItem\[\], canvas: HTMLCanvasElement, scale: number\): HtmlTextItem\[\] \{[\s\S]*?\n  \}/,
  ''
);

// Remove replaceGraphicHtmlItemsWithImages (which calls shouldRenderHtmlItemAsImage)
content = content.replace(
  /  private replaceGraphicHtmlItemsWithImages\(pageItem: PageItem, items: HtmlTextItem\[\], canvas: HTMLCanvasElement, scale: number\): HtmlTextItem\[\] \{[\s\S]*?\n  \}/,
  ''
);

// Remove shouldRenderHtmlItemAsImage (which calls isDarkColor and isGraphicBackground)
content = content.replace(
  /  private shouldRenderHtmlItemAsImage\(item: HtmlTextItem\): boolean \{[\s\S]*?\n  \}/,
  ''
);

// Remove isGraphicBackground
content = content.replace(
  /  private isGraphicBackground\(color: string\): boolean \{[\s\S]*?\n  \}/,
  ''
);

// Verify the import path is correct
const importLine = content.match(/import.*pdfconvert.*/);
if (importLine) {
  console.log('Import line:', importLine[0]);
}

fs.writeFileSync('src/app/layout/mainscreen/mainscreen.ts', content, 'utf8');
console.log('Build fixes applied');
console.log('New file size:', content.length);
