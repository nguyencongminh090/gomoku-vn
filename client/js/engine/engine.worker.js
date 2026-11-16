// engine.worker.js — hosts the Rapfi WebAssembly engine off the main thread (#405).
// Adapted from GomokuBoardSite/engine/engine.worker.js (MIT, same author). The page (engine-host.js) fetches
// the lease-gated files and hands them over, so this worker does no network I/O (its CSP: connect-src 'none').
//
// Page → worker: { type:'init', variant, glue: string, wasm: ArrayBuffer, data: ArrayBuffer, dataName }, { type:'cmd', text }
// Worker → page: { type:'ready' }, { type:'line', text }, { type:'error', text }, { type:'exit', code }
//
// The single-threaded build runs a whole search inside one sendCommand(); a STOP cannot reach it, so the page
// stops a search by terminating this worker and starting a fresh one.
// The multi-threaded build (#408, cross-origin isolated pages only) searches on pthreads and accepts YXSTOP.
// Emscripten starts each pthread with `new Worker(<this script's URL>, {name:'em-pthread'})`; this worker has no
// URL for the lease-gated glue, so pthreads are pointed at the glue's blob URL instead — the glue starts itself
// when it runs as 'em-pthread'. Blob workers inherit this worker's CSP and COEP.
'use strict';

let engine = null;
const pending = []; // commands that arrive before the engine is ready
const post = (msg) => self.postMessage(msg);

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'init') init(msg);
  else if (msg.type === 'cmd') {
    if (engine) engine.sendCommand(msg.text);
    else pending.push(msg.text);
  }
};

function init({ variant, glue, wasm, data, dataName }) {
  try {
    const url = URL.createObjectURL(new Blob([glue], { type: 'text/javascript' }));
    if (variant === 'multi') {
      const RealWorker = self.Worker;
      if (typeof RealWorker !== 'function' || typeof SharedArrayBuffer !== 'function') throw new Error('no threads');
      self.Worker = function EngineThread(scriptUrl, opts) {
        return new RealWorker(opts && opts.name === 'em-pthread' ? url : scriptUrl, opts);
      };
    }
    importScripts(url);
    if (variant !== 'multi') URL.revokeObjectURL(url); // pthreads may be spawned later from it
  } catch (err) {
    post({ type: 'error', text: `load: ${err && err.message}` });
    return;
  }
  self.Rapfi({
    locateFile: (p) => p,
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(wasm, imports).then((r) => done(r.instance, r.module), // module → pthreads
        (err) => post({ type: 'error', text: `wasm: ${err && err.message}` }));
      return {};
    },
    getPreloadedPackage: (name) => (name === dataName ? data : null),
    onReceiveStdout: (text) => post({ type: 'line', text }),
    onReceiveStderr: () => {},
    onExit: (code) => post({ type: 'exit', code }),
    setStatus: () => {},
  }).then((m) => {
    engine = m;
    post({ type: 'ready' });
    for (const text of pending.splice(0)) engine.sendCommand(text);
  }, (err) => post({ type: 'error', text: String(err && err.message ? err.message : err) }));
}
