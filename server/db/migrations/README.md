# Schema migrations (B255)

`PRAGMA user_version` is the schema version. Baseline = 3 (`schema.sql` + `legacy-upgrade.js` + historical `001-003`, applied by hand).

To change the schema: add `migrations/NNN_name.sql` with NNN = next number (>= 004). `migrate.js` runs each unapplied file once, in order,
in one transaction with the version bump (failure = rollback). Also: never edit a shipped file; don't add inline ALTERs to `database.js`;
`schema.sql` and `legacy-upgrade.js` are frozen at the baseline (fresh DBs get later changes by replaying migrations).
Table rebuilds: start the file with `-- rebuild` (runner turns `foreign_keys` OFF around it and runs `foreign_key_check`).
