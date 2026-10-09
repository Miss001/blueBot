const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'renderer');
const destDir = path.join(__dirname, '..', 'dist', 'renderer');

fs.mkdirSync(destDir, { recursive: true });

for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith('.ts')) continue;
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log('Copied renderer static assets to dist/renderer');
