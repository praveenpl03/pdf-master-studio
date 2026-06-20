const fs = require('fs');
const c = fs.readFileSync('src/app/layout/mainscreen/mainscreen.ts', 'utf8');

const search = '  rotation?: number;\r\n}\r\n\r\ninterface PdfTool {';
const replace = '  rotation?: number;\r\n  textAlign?: \'left\' | \'center\';\r\n}\r\n\r\ninterface PdfTool {';

if (c.includes(search)) {
  const result = c.replace(search, replace);
  fs.writeFileSync('src/app/layout/mainscreen/mainscreen.ts', result, 'utf8');
  console.log('OK - textAlign added to OverlayItem');
} else {
  console.log('ERR - pattern not found');
}
