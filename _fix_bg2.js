const fs = require('fs');
const path = 'src/app/layout/mainscreen/mainscreen.ts';
let c = fs.readFileSync(path, 'utf8');

const startMarker = 'private sampleCanvasColor(context: CanvasRenderingContext2D, item: Pick<HtmlTextItem, \'x\' | \'y\' | \'width\' | \'height\'>, scale: number): string {';
const startIdx = c.indexOf(startMarker);

// Find the exact closing } - it's the first line that's just '  }' after the function body
// The closing of the function is: '\n  }\n' (newline, 2 spaces, brace, newline)
const afterStart = c.substring(startIdx + startMarker.length);
const closingMatch = afterStart.match(/\n  }\n/);
const endIdx = startIdx + startMarker.length + closingMatch.index + 1; // position of the closing }

const oldFunc = c.substring(startIdx, endIdx);

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
console.log('SUCCESS');
