const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (!entry.name.endsWith('.ts')) {
      fs.copyFileSync(from, to);
    }
  }
}

const srcRenderer = path.join(__dirname, '..', 'src', 'renderer');
const destRenderer = path.join(__dirname, '..', 'dist', 'renderer');
const srcAssets = path.join(__dirname, '..', 'assets');
const destAssets = path.join(__dirname, '..', 'dist', 'assets');

copyDir(srcRenderer, destRenderer);

if (fs.existsSync(srcAssets)) {
  fs.mkdirSync(destAssets, { recursive: true });
  for (const file of fs.readdirSync(srcAssets)) {
    fs.copyFileSync(path.join(srcAssets, file), path.join(destAssets, file));
  }
}

console.log('Copied renderer static assets and assets/');
