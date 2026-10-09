const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'read-foreground-window.ps1');
const buf = fs.readFileSync(file);
if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
  console.log('PS1 already has UTF-8 BOM');
} else {
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf]));
  console.log('Added UTF-8 BOM to PS1');
}
