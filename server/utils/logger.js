'use strict';

/**
 * logger.js — Enhanced leveled logger utility.
 *
 * Replaces console.log everywhere in the codebase.
 * Levels: debug (optional), info, warn, error.
 * Format: [LEVEL] [HH:MM:SS] message
 */

// ANSI Color Codes
const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

// Helper to format arguments (extracting Error stacks if present)
function formatArgs(args) {
  return args.map(arg => (arg instanceof Error ? arg.stack || arg.message : arg));
}

const logger = {
  debug(...args) {
    if (process.env.DEBUG === 'true' || process.env.DEBUG === '1') {
      console.debug(`${COLORS.cyan}[DEBUG]${COLORS.reset} ${COLORS.gray}[${timestamp()}]${COLORS.reset}`, ...formatArgs(args));
    }
  },
  info(...args) {
    console.info(`${COLORS.green}[INFO ]${COLORS.reset} ${COLORS.gray}[${timestamp()}]${COLORS.reset}`, ...formatArgs(args));
  },
  warn(...args) {
    console.warn(`${COLORS.yellow}[WARN ]${COLORS.reset} ${COLORS.gray}[${timestamp()}]${COLORS.reset}`, ...formatArgs(args));
  },
  error(...args) {
    console.error(`${COLORS.red}[ERROR]${COLORS.reset} ${COLORS.gray}[${timestamp()}]${COLORS.reset}`, ...formatArgs(args));
  },
};

module.exports = logger;
