const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const children = [
  spawn(process.execPath, [path.join(__dirname, 'web-server.js'), '--api-only'], {
    cwd: root,
    env: { ...process.env, PORT: '4201' },
    stdio: 'inherit',
    windowsHide: true,
  }),
  spawn(process.execPath, [path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'serve', '--proxy-config', 'proxy.conf.json'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  }),
];

function stopChildren(code = 0) {
  for (const child of children) if (!child.killed) child.kill();
  process.exit(code);
}

for (const child of children) child.on('exit', (code) => {
  if (code && code !== 0) stopChildren(code);
});

process.on('SIGINT', () => stopChildren(0));
process.on('SIGTERM', () => stopChildren(0));
