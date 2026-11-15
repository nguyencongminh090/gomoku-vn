# 2026-11-15 — Compatible npm security updates

## Root cause

The lockfile pinned Express, compression, Engine.IO and other runtime dependencies to versions with known npm advisories. The audit also flagged Vite and transitive development dependencies.

## Fix

Refresh the lockfile within the existing dependency ranges. Keep Jest 29 because the remaining low-severity development advisory requires an incompatible Jest version according to npm.

## Verification

The production audit reports zero vulnerabilities. The full audit reports six low-severity findings in the Jest dependency chain.
