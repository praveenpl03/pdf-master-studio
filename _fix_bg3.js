const fs = require('fs');
const path = 'src/app/layout/mainscreen/mainscreen.ts';
let c = fs.readFileSync(path, 'utf8');

console.log('File contains CRLF:', c.includes('\r\n'));

const startMarker = 'private sampleCanvasColor(context: CanvasRenderingContext2D, item: Pick<HtmlTextItem, \'x\' | \'y\' | \'width\' | \'height\'>, scale: number): string {';
const startIdx = c.indexOf(startMarker);
console.log('startIdx:', startIdx);

// Use flexible regex that handles both \n and \r\n
const afterFuncStart = c.substring(startIdx + startMarker.length);
// Match the closing brace pattern: optional \r, \n, 2 spaces, }
const closingMatch = afterFuncStart.match(/\r?\n  \}/);
if (!closingMatch) {
  console.log('ERROR: closing brace not found');
  console.log('Last 300 chars after start:');
  console.log(afterFuncStart.substring(afterFuncStart.length - 400));
  process.exit(1);
}
// endIdx = position just after the closing }
const endIdx = startIdx + startMarker.length + closingMatch.index + closingMatch[0].length;

const oldFunc = c.substring(startIdx, endIdx);
console.log('Old function length:', oldFunc.length);
console.log('Old function ends with:', JSON.stringify(oldFunc.substring(oldFunc.length - 20)));

const newFunc = `  private sampleCanvasColor(context: CanvasRenderingContext2D, item: Pick<HtmlTextItem, 'x' | 'y' | 'width' | 'height'>, scale: number): string {
    const canvas = context.canvas;
    // Sample a 7x7 grid biased toward the edges where text is least likely
    const samplePoints: [number, number][] = [];
    for (const xRatio of [0.02, 0.08, 0.2, 0.5, 0.8, 0.92, 0.98]) {
      for (const yRatio of [0.02, 0.08, 0.2, 0.5, 0.8, 0.92, 0.98]) {
        samplePoints.push([item.x + item.width * xRatio, item.y + item.height * yRatio]);
      }
    }
    // Read pixel colors
    const samples = samplePoints.map(([x, y]) => {
      const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x * scale)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y * scale)));
      return Array.from(context.getImageData(px, py, 1, 1).data).slice(0, 3);
    });
    // Group similar colors by bucketing (tolerance window)
    const tolerance = 40;
    const buckets: { red: number; green: number; blue: number; count: number }[] = [];
    for (const [red, green, blue] of samples) {
      let match = false;
      for (const bucket of buckets) {
        const dr = Math.abs(bucket.red - red);
        const dg = Math.abs(bucket.green - green);
        const db = Math.abs(bucket.blue - blue);
        if (dr + dg + db <= tolerance) {
          bucket.count++;
          bucket.red = Math.round((bucket.red * (bucket.count - 1) + red) / bucket.count);
          bucket.green = Math.round((bucket.green * (bucket.count - 1) + green) / bucket.count);
          bucket.blue = Math.round((bucket.blue * (bucket.count - 1) + blue) / bucket.count);
          match = true;
          break;
        }
      }
      if (!match) {
        buckets.push({ red, green, blue, count: 1 });
      }
    }
    // Sort by frequency (most common first) — the background is the most frequent color
    buckets.sort((a, b) => b.count - a.count);
    // Pick the most frequent non-white, non-black color
    for (const bucket of buckets) {
      if (bucket.red > 248 && bucket.green > 248 && bucket.blue > 248) continue;
      if (bucket.red < 12 && bucket.green < 12 && bucket.blue < 12) continue;
      return '#' + bucket.red.toString(16).padStart(2, '0') + bucket.green.toString(16).padStart(2, '0') + bucket.blue.toString(16).padStart(2, '0');
    }
    // Fallback: most common color (usually near-white from page background)
    const { red, green, blue } = buckets[0];
    return '#' + red.toString(16).padStart(2, '0') + green.toString(16).padStart(2, '0') + blue.toString(16).padStart(2, '0');
  }`;

c = c.substring(0, startIdx) + newFunc + c.substring(endIdx);
fs.writeFileSync(path, c, 'utf8');
console.log('SUCCESS: sampleCanvasColor replaced');
