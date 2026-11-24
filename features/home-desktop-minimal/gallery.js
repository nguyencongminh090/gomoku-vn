#!/usr/bin/env node
/* Copies shots into gallery/: node features/home-desktop-minimal/gallery.js m8,m9,... Prints the Artifact `files` map for those ids. */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const HERE = __dirname;
const ids = (process.argv[2] || 'm8,m9,m10,m11,m12,m13').split(',');
(async () => {
  const files = {};
  for (const id of ids) {
    for (const s of ['1440', 'dark', 'search', 'busy', '1024']) {
      const rel = `img/${id}-${s}.jpg`;
      await sharp(path.join(HERE, 'shots', `${id}-${s}.png`)).resize(s === '1024' ? 1024 : 1600).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(HERE, 'gallery', rel));
      files[rel] = rel;
    }
    const rel = `video/${id}.webm`;
    fs.copyFileSync(path.join(HERE, 'shots/video', `${id}.webm`), path.join(HERE, 'gallery', rel));
    files[rel] = { from: rel, contentType: 'video/webm' };
  }
  console.log(JSON.stringify(files));
})();
