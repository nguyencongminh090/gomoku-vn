---
name: be-data-modeling-migrations
description: Modeling relational data for a web app (constraints in the database, indexes from query patterns) and changing the schema safely with versioned migrations and the expand-and-contract sequence
domain: web-development
tags: database,schema,constraints,indexes,migrations,expand-contract,orm
apply_when: "designing tables for a new app; queries are slow; adding or renaming a column on a live system; running migrations in CI and deploys; deciding what the ORM should own"
sources: "PostgreSQL docs - Constraints (read); Use The Index, Luke - Preface (read); Fowler and Sadalage - Evolutionary Database Design (read); Fowler - Parallel Change (read); Twelve-Factor App - Admin processes (read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/be-data-modeling-migrations.md
copied: 2026-10-09
---

# Data modeling and migrations for web apps

Storage engine choice is in `data-storage-selection`. This note assumes a relational database.

## Model with constraints

Put integrity rules in the database, not only in application code (PostgreSQL docs): primary keys, `NOT NULL`,
`UNIQUE`, `CHECK`, foreign keys and (in PostgreSQL) exclusion constraints reject invalid data from every
writer, including scripts and future services, and document the rules. Choose foreign-key
`ON DELETE` behavior on purpose: `RESTRICT` or the default `NO ACTION` block deleting referenced rows,
`CASCADE` deletes dependents, `SET NULL` and `SET DEFAULT` keep rows detached. Use `CASCADE` only where the child has no life of its own.
Also keep the application-level validation, since it gives friendlier messages (`ux-forms-errors`).

Sensitive fields need classification and retention decisions at design time (`appsec-data-protection-privacy`);
multi-tenant tables need a tenant key and enforcement (`authz-multitenancy`).

## Index from query patterns

Use The Index, Luke's argument: the most important input to indexing is how the application queries the data,
and developers, not DBAs, know that. SQL hides execution details, but performance depends on them, so
learn how B-tree indexes serve `WHERE`, joins and sorting and what indexes cost on writes. Practical
habits: index foreign keys used in joins and the columns of frequent filters and orderings, check
query plans on realistic data, and watch for ORMs that issue one query per row (N+1).

## Change the schema with migrations

Evolutionary database design (Sadalage and Fowler) recommends:

1. Every change is a **migration script in version control** next to the code, so the history is auditable.
2. Integrate database changes continuously (at least daily) and run migrations plus tests in CI like any code.
3. Prefer many **small** migrations to big batches; small changes are easier to get right and to debug.
4. Give each developer their own database instance for experiments.

Most refactorings follow **parallel change** (expand, migrate, contract; Kerievsky, described by Fowler):
add the new column or table alongside the old (**expand**), move writers and readers to it while both
exist (**migrate**), then remove the old structure (**contract**). This keeps rollbacks and rolling
deploys safe because old and new code versions can run against the same schema. For a rename: add new
column, write both, backfill, read new, stop writing old, drop old, across separate deploys.

Run migrations as a one-off admin process from the same codebase and release as the app, with the same
configuration (Twelve-Factor, admin processes; `deploy-twelve-factor`). Schema evolution across
services and events is in `data-schema-evolution`.

## Use when

- Any relational-backed web app, from first table to production changes.

## Do not use when

- Do not enforce everything with triggers and stored procedures if the team cannot test and version them.
- Do not use the full expand-contract sequence for a table that nothing reads yet; a single migration is fine.

## Trade-offs

- Strict constraints catch bugs early and make bulk imports and legacy data harder.
- Indexes speed reads and slow writes and use space.
- Expand-contract needs several deploys per change; it buys zero-downtime rollouts.

## Common mistakes

- Unique or foreign-key rules only in application code.
- A long, locking migration in the middle of a busy period.
- Dropping a column in the same release that stops using it.
- Editing an already-applied migration instead of adding a new one.

## Related

- Notes: `data-storage-selection`, `data-schema-evolution`, `data-transactions-sagas`,
  `deploy-twelve-factor`, `authz-multitenancy`, `appsec-data-protection-privacy`
- Skills: `prisma-database-setup`, `data-architecture`
