# Fix log entry — 2026-08-01 22:30

## Prompt

Backend fix #9 (security review 2026-08-01): `npm test` was red on `main` — `DisconnectHandler.test.js`'s `mockState` (lines 35-41) mocked `../socket/state` without `syncReadyWindow`, while `DisconnectHandler.js:67` calls it in the normal-leave path, throwing `TypeError: syncReadyWindow is not a function`.

## Action

Added `syncReadyWindow: jest.fn()` to `mockState` in [DisconnectHandler.test.js](server/tests/DisconnectHandler.test.js#L35-L41).

## Decision

Matched the existing style of the other mocked `state` exports in the same object (plain `jest.fn()`, no implementation needed since the test only asserts on other side effects of the code path).

## Summary output

`npm test`: 145/145 passing — this was the last remaining baseline failure; the whole suite is now green.
