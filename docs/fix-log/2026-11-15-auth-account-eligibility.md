# 2026-11-15 19:54 — Current account eligibility at sign-in

## Prompt
“Fix backend: tìm các potential issues và sửa lỗi - Admin Backend - Security”

## Root cause
Password sign-in retained account state across the bcrypt await. Legacy HTTP migration and socket authentication relied on token claims for member identity.

## Fix
Re-read the account after validating its password. Both legacy credential entry points now resolve registered members from the current record and reject ineligible accounts. Guest fixtures used by the repository's test and load tools remain supported. The session contract follows `docs/knowledge/auth-session-oauth.md`.

## Verification
The targeted admin and authentication Jest run passed 234 tests in 13 suites, including account eligibility and password sign-in state changes.
