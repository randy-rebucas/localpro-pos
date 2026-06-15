# Database Restore

Full documentation for restoring a MongoDB database from a backup file — CLI, API, and the super-admin UI.

See [database-backup.md](database-backup.md) for how backups are created and scheduled.

---

## Overview

The restore system reads a JSON backup file (produced by `db:backup` or the automated nightly job) and inserts its documents back into MongoDB.

**Two restore modes:**

| Mode | Behaviour |
|---|---|
| **Merge** (default) | Backup documents are inserted alongside existing data. Documents whose `_id` already exists are silently skipped. |
| **Clear + restore** (`--clear` / `clearExisting`) | Each target collection is emptied with `deleteMany({})` before inserting. The result is an exact copy of the backup. |

**Dry run** is available in all modes — it parses the file and shows what would be inserted without touching the database.

---

## Before You Restore

1. **Create a fresh backup first.** If you are restoring to fix bad data, back up the current state before overwriting it so you have a fallback.
2. **Use dry run.** Run with `--dry-run` to see how many documents would be inserted per collection before committing.
3. **Consider `--clear` carefully.** Clear mode permanently deletes live data. It is appropriate for a point-in-time rollback; merge mode is safer for partial recovery.
4. **Check the backup file format.** The restore script supports both the flat format `{ collectionName: [...] }` and the wrapped format `{ collections: { ... } }` produced by newer versions of the backup system.

---

## CLI

```sh
npm run db:restore -- --file=<path> [options]
```

### Options

| Flag | Description |
|---|---|
| `--file=<path>` | Path to the backup JSON file. Required. Relative to the project root or absolute. |
| `--clear` | Delete all documents in each restored collection before inserting. |
| `--collections=<names>` | Comma-separated list of collections to restore. Omit to restore all. |
| `--dry-run` | Parse the file and print document counts. No database writes. |
| `--force` | Skip the confirmation prompt. Useful in CI/CD pipelines. |

### Examples

```sh
# Restore everything (prompts for confirmation)
npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.json

# Clean restore — wipe collections, then insert backup
npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.json --clear

# Preview what would be restored (no writes)
npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.json --dry-run

# Restore only specific collections
npm run db:restore -- \
  --file=backups/backup-2026-06-16T02-00-00-000Z.json \
  --collections=products,customers,categories

# Non-interactive (CI/CD)
npm run db:restore -- \
  --file=backups/backup-2026-06-16T02-00-00-000Z.json \
  --clear --force
```

### Example output

```
Database Restore
================
File:        /app/backups/backup-2026-06-16T02-00-00-000Z.json
Size:        12.45 MB
Clear first: No (merge/upsert)
Collections: all
Dry run:     No

Proceed with restore? (yes/no): yes

Connecting to database...
Connected.

Restoring 18 collection(s)...

  products                       1,234 inserted
  transactions                  18,903 inserted
  customers                      3,201 inserted
  categories                       142 inserted
  branches                           4 inserted
  ...

---
Inserted:  38,471 documents

Restore complete.
```

**With `--clear`:**

```
  products                       1,234 inserted (cleared 980)
  transactions                  18,903 inserted (cleared 21,450)
  ...
```

---

## API

**Endpoint:** `POST /api/super-admin/backups/restore`

Requires an active super-admin session cookie.

### Mode 1 — restore from a server-side file

Use this when the backup file is already on the server (i.e., it appears in the Backup Files list).

**Request body (`application/json`):**

```json
{
  "filename": "backup-2026-06-16T02-00-00-000Z.json",
  "clearExisting": false,
  "collections": ["products", "customers"],
  "dryRun": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `filename` | string | Yes | Name of the file in the `./backups/` directory. Path traversal is blocked. |
| `clearExisting` | boolean | No | Delete collection documents before inserting. Default: `false`. |
| `collections` | string[] | No | Restore only these collections. Omit to restore all. |
| `dryRun` | boolean | No | Count without writing. Default: `false`. |

### Mode 2 — restore from an uploaded file

Use this when you have a backup file on your local machine that is not on the server.

**Request (`multipart/form-data`):**

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | Yes | The `.json` backup file. |
| `clearExisting` | string | No | `"true"` or `"false"`. Default: `"false"`. |
| `collections` | string | No | Comma-separated collection names. |
| `dryRun` | string | No | `"true"` or `"false"`. Default: `"false"`. |

```sh
# curl example
curl -X POST https://your-domain.com/api/super-admin/backups/restore \
  -b "session=YOUR_SESSION_COOKIE" \
  -F "file=@backups/backup-2026-06-16T02-00-00-000Z.json" \
  -F "clearExisting=false" \
  -F "dryRun=true"
```

### Response

```json
{
  "success": true,
  "message": "Restored 38471 documents across 18 collection(s)",
  "dryRun": false,
  "collections": {
    "products":     { "inserted": 1234,  "cleared": 0 },
    "transactions": { "inserted": 18903, "cleared": 0 },
    "customers":    { "inserted": 3201,  "cleared": 0 },
    "auditlogs":    { "inserted": 0,     "cleared": 0, "skipped": true }
  },
  "errors": []
}
```

| Field | Description |
|---|---|
| `success` | `false` if a fatal error occurred before any writes. Partial success returns `true` with entries in `errors`. |
| `dryRun` | Mirrors the request flag. |
| `collections[name].inserted` | Documents inserted (or that would be inserted in dry-run mode). |
| `collections[name].cleared` | Documents deleted before insert (only non-zero when `clearExisting: true`). |
| `collections[name].skipped` | `true` if the collection was not present in the backup file. |
| `errors` | Per-chunk insert warnings (e.g., duplicate key errors when merging). Does not abort the operation. |

**Error response (fatal):**

```json
{
  "success": false,
  "message": "Restore failed: File not found",
  "dryRun": false,
  "collections": {},
  "errors": ["Restore failed: File not found"]
}
```

---

## Super-Admin UI

Navigate to **Super Admin → Backups** (`/super-admin/backups`).

### Restore from Server Backup

1. In the **Backup Files** table, click the **Restore** button on the row you want to restore from. The row highlights blue and the filename appears in the panel below.
2. Choose options:
   - **Clear existing data before restore** — empties each collection first (shows a red warning).
   - **Dry run** — preview only, no writes.
3. Click **Restore** (or **Run Dry Run**).
4. A results table appears showing inserted and cleared counts per collection, plus any warnings.

### Restore from Uploaded File

1. In the **Restore from Uploaded File** section, click the file input and select a `.json` backup file from your computer.
2. Choose the same options (clear, dry run).
3. Click **Restore**.

This mode is useful when:
- You downloaded a backup from one environment (e.g., production) and want to restore it in another (e.g., staging).
- The backup file is not on the server.

---

## Behaviour Details

### `_id` re-hydration

Documents in the backup file may have their `_id` stored as a plain string or as extended JSON (`{ "$oid": "..." }`). The restore engine re-hydrates these back into `ObjectId` instances before inserting, preserving the original document identities.

### Chunked inserts

Documents are inserted in batches of 500 to stay well under MongoDB's 16 MB BSON limit per batch. If a batch fails (e.g., a duplicate key on merge), the error is recorded in `errors` and the next batch continues — the restore does not abort mid-collection.

### Collection format compatibility

The restore engine accepts both backup formats:

```json
// Flat format (older backups, per-tenant backup-reset API)
{ "products": [...], "customers": [...] }

// Wrapped format (db:backup CLI and automated backup)
{
  "version": "1.0",
  "collections": { "products": [...], "customers": [...] }
}
```

### What is not restored

- **`system.*` collections** — skipped by the backup and therefore absent from the file.
- Collections **not present in the backup file** — listed as `skipped: true` in the response.
- Cross-collection references (e.g., a `tenantId` foreign key) are preserved as-is from the backup. If you are restoring into a different database, make sure referenced documents (tenants, users) exist or restore them as well.

---

## Common Scenarios

### Full point-in-time rollback

```sh
# 1. Back up current state as a safety net
npm run db:backup -- --force

# 2. Restore the target backup with --clear
npm run db:restore -- \
  --file=backups/backup-2026-06-15T02-00-00-000Z.json \
  --clear --force
```

### Selective collection recovery

```sh
# Restore only products and categories from yesterday's backup
npm run db:restore -- \
  --file=backups/backup-2026-06-15T02-00-00-000Z.json \
  --collections=products,categories \
  --clear
```

### Staging environment seed from production backup

```sh
# On staging server, with the production backup file copied over
npm run db:restore -- \
  --file=/tmp/prod-backup-2026-06-16.json \
  --clear --force
```

### CI/CD automated restore test

```sh
# Create a backup, then restore it in dry-run to verify it is readable
npm run db:backup -- --force
LATEST=$(ls -t backups/backup-*.json | head -1)
npm run db:restore -- --file="$LATEST" --dry-run --force
```

---

## Source Files

| File | Purpose |
|---|---|
| `scripts/restore-database.ts` | CLI restore script |
| `lib/automations/database-backups.ts` | `restoreDatabaseBackup()` core function |
| `app/api/super-admin/backups/restore/route.ts` | HTTP restore endpoint (server file or upload) |
| `app/super-admin/backups/page.tsx` | Super-admin UI (restore panels) |
