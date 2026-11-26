'use strict';

/**
 * jsdom environment pinned to America/New_York (UTC-5/-4), for tests that must prove a value does not depend on
 * the viewer's zone (B480). `process.env.TZ` set inside a test file never reaches the worker, so the environment
 * sets it on the real process and restores it in teardown (workers run other files afterwards).
 */
const { TestEnvironment } = require('jest-environment-jsdom');

class NewYorkEnvironment extends TestEnvironment {
  async setup() {
    this.prevTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    await super.setup();
  }

  async teardown() {
    if (this.prevTz === undefined) delete process.env.TZ; else process.env.TZ = this.prevTz;
    await super.teardown();
  }
}

module.exports = NewYorkEnvironment;
