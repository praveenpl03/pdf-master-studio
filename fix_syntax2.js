const fs = require('fs');
let t = fs.readFileSync('src/app/layout/mainscreen/mainscreen.ts', 'utf8');

// Fix 1: Duplicated else - find `}else { ... applyHtmlTextEdits ... }` AFTER `} else {` block
const dupElseRegex = /\}\s*else\s*\{[\s\S]*?await this\.applyHtmlTextEdits\(output\);[\s\S]*?\}\s*else\s*\{[\s\S]*?await this\.applyHtmlTextEdits\(output\);[\s\S]*?\}\s*\n/g;
const match = t.match(dupElseRegex);
if (match) {
  console.log('Found duplicated else block, fixing...');
  // Replace the whole if/else/else with just if/else
  const ifStart = t.indexOf('if (hasCjk) {');
  if (ifStart >= 0) {
    // Count braces to find the end
    const after = t.slice(ifStart);
    let depth = 0;
    let endIdx = 0;
    let foundElses = 0;
    let elsePositions = [];
    for (let i = 0; i < after.length; i++) {
      if (after[i] === '{') depth++;
      else if (after[i] === '}') {
        depth--;
        if (depth === 0) { endIdx = ifStart + i + 1; break; }
      }
      // Check for "else {" at non-zero depth
      if (depth === 1 && after[i] === '}' && after.slice(i+1, i+7) === ' else ') {
        const elseEnd = after.indexOf('{', i+1);
        elsePositions.push({ braceEnd: ifStart + i + 1, elseStart: after.slice(i+1, elseEnd+1) });
        foundElses++;
      }
    }
    console.log('Found elses:', foundElses, 'positions:', JSON.stringify(elsePositions));
    console.log('if block ends at:', endIdx);
    
    if (foundElses >= 2) {
      // Keep only first else, remove everything from second else to end
      const secondElseStart = elsePositions[1].braceEnd;
      // The second else block: from secondElseStart to endIdx
      const newEnd = `    }\n    await this.applyOverlays(output);\n    if (applyMetadata) this.writeMetadata(output);\n    return output;\n  }`;
      // Search for the text from secondElseStart onwards
      const between = t.slice(secondElseStart, endIdx);
      // Find the part after the second else's opening brace
      const innerStart = between.indexOf('{') + 1;
      const inner = between.slice(innerStart).trim();
      console.log('Second else inner:', inner.slice(0, 60));
      
      // Replace: from first else's closing brace to end of if block
      // First else closing is at elsePositions[0].braceEnd
      // But we want to keep first else, remove second
      const firstElseEnd = elsePositions[0].braceEnd;
      const afterFirstElse = t.slice(firstElseEnd);
      let secondDepth = 0;
      let secondEnd = 0;
      for (let i = 0; i < afterFirstElse.length; i++) {
        if (afterFirstElse[i] === '{') secondDepth++;
        else if (afterFirstElse[i] === '}') {
          secondDepth--;
          if (secondDepth === 0) { secondEnd = firstElseEnd + i + 1; break; }
        }
      }
      console.log('First else block ends at:', secondEnd);
      
      // Now find the second else starting from secondEnd
      const afterFirstElseBlock = t.slice(secondEnd);
      const elseMatch2 = afterFirstElseBlock.match(/\}\s*else\s*\{/);
      if (elseMatch2) {
        const secondElseOpen = secondEnd + elseMatch2.index;
        // Find the closing brace of the if block (depth from secondElseOpen)
        const afterOpen = t.slice(secondElseOpen);
        let d3 = 0;
        let close3 = 0;
        for (let i = 0; i < afterOpen.length; i++) {
          if (afterOpen[i] === '{') d3++;
          else if (afterOpen[i] === '}') {
            d3--;
            if (d3 === 0) { close3 = secondElseOpen + i + 1; break; }
          }
        }
        console.log('Second else block ends at:', close3);
        
        // Remove second else: from secondOpen to close3
        const removed = t.slice(secondOpen, close3);
        console.log('Removing second else:', removed.slice(0, 50));
        t = t.slice(0, secondOpen) + t.slice(close3);
      }
    }
  }
}

// Fix 2: canvasToBlobUrl - remove extra `);` and `}`
const canvasRegex = /private canvasToBlobUrl\(canvas: HTMLCanvasElement\): Promise<string> \{\s*return canvasToBlobUrl\(canvas\);\s*\}\);\s*\}/;
const canvasMatch = t.match(canvasRegex);
if (canvasMatch) {
  console.log('Found canvasToBlobUrl issue, fixing...');
  t = t.replace(canvasRegex, `private canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {\n    return canvasToBlobUrl(canvas);\n  }`);
} else {
  console.log('canvasToBlobUrl regex not matched, trying to find it...');
  const idx = t.indexOf('return canvasToBlobUrl(canvas)');
  if (idx >= 0) {
    console.log('Found at index:', idx);
    console.log('Context:', t.slice(idx-50, idx+60));
  }
}

fs.writeFileSync('src/app/layout/mainscreen/mainscreen.ts', t, 'utf8');
console.log('Done');
