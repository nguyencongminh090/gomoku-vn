// CJS wrapper for uuid used exclusively by Jest (uuid v14 is pure ESM).
// Uses Node.js built-in crypto — no ESM import needed.
'use strict';
const { randomUUID } = require('crypto');
module.exports = {
  v4: () => randomUUID(),
};
