# 2026-11-15 19:54 — Admin action validation and account locks

## Prompt
“Fix backend: tìm các potential issues và sửa lỗi - Admin Backend - Security”

## Root cause
Admin mutations interpreted missing or malformed choices as intentional actions. The router checked guest identity by id presence, and lock decisions and session revocations committed separately.

## Fix
Require explicit boolean choices for account lock and cheat-report decisions. Set `no-store` for the admin API and use the shared guest guard. Revoke database sessions in the account-lock transaction and disconnect the live socket after commit.

## Verification
The targeted admin and authentication Jest run passed 234 tests in 13 suites. Regression assertions cover invalid choices, unchanged audit state, real guest identities and cache headers.
