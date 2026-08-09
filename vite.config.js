import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync, mkdirSync, readFileSync, readdirSync } from 'fs';

// Vite's HTML transform only bundles <script type="module"> and
// <link rel="stylesheet"> — every classic (non-module) <script src="js/...">
// across client/*.html is left as a literal, unprocessed reference (Vite logs
// "can't be bundled without type=module" for each one) and never gets copied
// into dist/. Without this plugin those files 404 in a production build,
// breaking every page that uses one (theme/ui-mode preload IIFEs run
// pre-paint on purpose — converting them to modules would defer them and
// reintroduce the flash-of-unstyled-content they exist to prevent — plus
// history.html's whole non-entry.js script chain, plus the UMD modules like
// escape-utils.js/audio-manager.js/profanity-*.js that self-attach to a
// global and would otherwise get silently lazy-wrapped by Vite's commonjs
// plugin and never run — see the comment in client/js/room-entry.js).
//
// The file list is scanned out of client/*.html rather than hand-maintained:
// a hardcoded list drifts the moment a new classic <script src="js/..."> is
// added to a page and someone forgets to also add it here (this is exactly
// how profanity-filter.js/profanity-classifier-model.js 404'd in production
// the first time this plugin was written — TODO.md #65 fix-log).
function findClassicScripts() {
  const clientDir = resolve(__dirname, 'client');
  const files = new Set();
  for (const htmlFile of readdirSync(clientDir)) {
    if (!htmlFile.endsWith('.html') || htmlFile.includes('mockup')) continue;
    const html = readFileSync(resolve(clientDir, htmlFile), 'utf8');
    for (const match of html.matchAll(/<script\s+src="js\/([^"?]+)(?:\?[^"]*)?"(?![^>]*type="module")[^>]*>/g)) {
      files.add(match[1]);
    }
  }
  return [...files];
}

function copyClassicScripts() {
  return {
    name: 'copy-classic-scripts',
    closeBundle() {
      const destDir = resolve(__dirname, 'dist/js');
      mkdirSync(destDir, { recursive: true });
      for (const file of findClassicScripts()) {
        cpSync(resolve(__dirname, 'client/js', file), resolve(destDir, file));
      }
    },
  };
}

export default defineConfig({
  root: 'client',
  plugins: [copyClassicScripts()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/index.html'),
        login: resolve(__dirname, 'client/login.html'),
        room: resolve(__dirname, 'client/room.html'),
        history: resolve(__dirname, 'client/history.html'),
        tournament: resolve(__dirname, 'client/tournament.html'),
        tournamentMatch: resolve(__dirname, 'client/tournament-match.html')
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  }
});
