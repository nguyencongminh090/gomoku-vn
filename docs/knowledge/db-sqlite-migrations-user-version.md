---
name: db-sqlite-migrations-user-version
description: A minimal ordered-migration runner for SQLite that records the schema version in PRAGMA user_version, runs each step in a transaction, and handles the table-rebuild cases SQLite needs
domain: database
tags: sqlite,better-sqlite3,migrations,user-version,schema,transactions,versioning
apply_when: "an embedded SQLite app needs schema changes between releases without an ORM migration tool; deciding where to store the schema version; a migration failed halfway"
sources: "SQLite - Pragma user_version, foreign_keys, S1 (read); SQLite - Transaction, S10 (read); SQLite - ALTER TABLE, S14 (read); better-sqlite3 api.md transaction(), B1 (read); Fowler - Parallel Change (via data-schema-evolution); local check on sqlite3 3.46.1, L1"
last_reviewed: 2026-10-16
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/database/items/db-sqlite-migrations-user-version.md
copied: 2026-10-16
---

# Versioned migrations on `PRAGMA user_version`

Medium confidence: SQLite documents the pragma and the table-rebuild recipe (S14) but not this runner pattern; the runner below is the author's design, checked
locally (L1) but not taken from a single source. For compatibility across independent deployments see
`data-schema-evolution`; for modeling and ORM tools see `be-data-modeling-migrations`.

## The idea

`user_version` is an integer stored in the database header that SQLite does not use itself, left for applications (S1). It is
a natural version counter: read it at startup, apply every migration numbered above it in order, and set it to the last number.

```js
const migrations = [                     // index 0 is migration 1; append only, never edit a shipped entry
  `CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE)`,
  `ALTER TABLE users ADD COLUMN created_at INTEGER`,
];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  if (current > migrations.length) throw new Error('database is newer than this app');
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v + 1}`);   // integer built by us, never user input
    }).immediate();
  }
}
```

Why it holds together:

- **Each step and its version bump commit together.** `db.transaction()` commits on return and rolls back on a throw (B1); the
  version number is part of the same transaction, so a failure leaves the previous version intact. `immediate()` takes the
  write lock first so two app instances starting together do not both run the step (S10).
- **A newer database is refused,** so an old build does not damage data written by a newer one.
- **Shipped migrations are immutable.** Fix mistakes with a new migration.

## SQLite-specific traps

- **Simple changes first.** `ADD COLUMN`, `RENAME COLUMN` and `DROP COLUMN` are supported directly. `DROP COLUMN` fails if the column is
  part of a PRIMARY KEY, has a UNIQUE constraint, is indexed, appears in a CHECK, foreign key, generated column, trigger or view, or is
  named in a partial index WHERE (S14). Setting or dropping NOT NULL with `ALTER COLUMN` exists only in SQLite 3.53.0 (2026-04-09) and
  later (S14); check the version your driver bundles.
- **Anything else is a table rebuild** (change a type, add or remove UNIQUE, PRIMARY KEY, CHECK, FOREIGN KEY or NOT NULL, reorder
  columns). SQLite's documented order (S14): if foreign keys are on, `PRAGMA foreign_keys=OFF`; start a transaction; save the
  `sqlite_schema` SQL of the table's indexes, triggers and views; `CREATE TABLE new_X`; `INSERT INTO new_X SELECT ... FROM X`;
  `DROP TABLE X`; `ALTER TABLE new_X RENAME TO X`; recreate the indexes, triggers and views (and any view affected); run
  `PRAGMA foreign_key_check`; commit; re-enable foreign keys. `foreign_keys` is a no-op inside a transaction (S1), which is why it is
  turned off first. Do not rename the old table to a temporary name instead: S14 warns this can corrupt references in triggers,
  views and foreign keys since versions 3.25.0 and 3.26.0. Because the pragma must run outside the transaction, give such a
  migration a flag so the runner does it around the step (shape checked in the sqlite3 shell, L1; not run through better-sqlite3):

```js
// migrations entries may be { rebuild: true, up(db) { ... } }
if (m.rebuild) db.pragma('foreign_keys = OFF');
try {
  db.transaction(() => {
    m.up(db);                                   // create new_X, copy, drop X, rename, recreate indexes
    if (db.pragma('foreign_key_check').length) throw new Error('foreign key violation');
    db.pragma(`user_version = ${v + 1}`);
  }).immediate();
} finally {
  if (m.rebuild) db.pragma('foreign_keys = ON');
}
```
- **Adding UNIQUE (or NOT NULL) to existing data** fails the copy if the data already violates it, and the whole migration rolls
  back. Before shipping, find the offenders (`SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1`), decide
  an explicit merge or delete rule, apply that rule in an earlier step or at the start of the same one, and log what was removed
  (author's advice). Likewise, `CAST` in the copy silently turns non-numeric text into 0; check for such values first.
- **Large backfills** should be separate, batched steps (`db-backup-restore-retention` on batching), not one long transaction.
- **Back up first.** Take a `VACUUM INTO` copy (`db-backup-restore-retention`) before migrating production data.
- **Index creation** on a big table takes the write lock for its duration; run `PRAGMA optimize` afterwards (S1).
- **Expand, then contract.** When old and new app versions share the file during a deploy, add the column in one release and
  remove the old one in a later release (`data-schema-evolution`).
- `VACUUM INTO` keeps `user_version` (L1), so a restored backup resumes at the right version.

## Use when

- A desktop, CLI or small server app owns its SQLite file and ships schema changes with the code.

## Do not use when

- An ORM or migration tool already owns the schema (Prisma, Knex, Alembic): mixing two version trackers invites drift.
- Several services share one database schema: coordinate through one owner and `data-schema-evolution` instead.
- The change must run with zero write downtime on a very large table; SQLite has no online schema change, plan a rebuild window.

## Common mistakes

- Editing an old migration after release.
- Running DDL outside a transaction (SQLite supports transactional DDL, so use it).
- Interpolating a version taken from outside the program into the `PRAGMA` text; the pragma does not accept bound parameters.
- Forgetting to re-enable `foreign_keys` after a rebuild.

## Related

- Notes: `data-schema-evolution`, `be-data-modeling-migrations`, `db-sqlite-pragmas-wal-transactions`,
  `db-backup-restore-retention`
