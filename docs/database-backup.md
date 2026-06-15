# Database Backup

Full documentation for the database backup system — automated scheduling, manual CLI, API, and the super-admin UI.

---

## Overview

The backup system exports every MongoDB collection to a timestamped JSON file. It runs automatically every night and can also be triggered manually via the CLI, a cron-protected API endpoint, or the super-admin dashboard.

**What gets backed up:** All collections (products, transactions, customers, tenants, users, audit logs, etc.) up to 50,000 documents per collection. System collections (`system.*`) are skipped.

**Retention:** The last 7 backups are kept automatically; older ones are deleted on each run.

**Storage options:** Local filesystem (`./backups/`) and optional upload to any S3-compatible service (AWS S3, DigitalOcean Spaces, MinIO, etc.).

---

## Automated Backup (Cron)

A cron job runs `createDatabaseBackup()` every day at **2:00 AM UTC** when `ENABLE_CRON_JOBS=true` is set.

```env
# .env.local
ENABLE_CRON_JOBS=true
```

The cron job is registered in `lib/cron.ts` and initialized at server startup. No further configuration is needed for local-only backups.

---

## CLI

### Commands

```sh
# Full database backup (local)
npm run db:backup

# Full backup + upload to cloud storage
npm run db:backup:cloud

# List existing backup files
npm run db:backup:list
```

### Extra flags

Flags are passed after `--`:

```sh
# Backup only one tenant (by ObjectId)
npm run db:backup -- --tenant=64abc123def456

# Upload to cloud
npm run db:backup -- --cloud

# Custom output directory
npm run db:backup -- --out=/mnt/backups

# Keep more backups (default: 7)
npm run db:backup -- --keep=14

# Delete a specific backup file
npm run db:backup -- --delete=backup-2026-01-01T02-00-00-000Z.json
```

All flags can be combined:

```sh
npm run db:backup -- --tenant=64abc123 --cloud --keep=30 --out=/mnt/backups
```

### Output

```
Connecting to database...
Connected.

Exporting 24 collection(s)...

  products                       1,234 documents
  transactions                  18,903 documents
  customers                      3,201 documents
  ...

Writing backup to: /path/to/backups/backup-2026-06-16T02-00-00-000Z.json
Backup size: 12.45 MB
Total documents: 38,471

Rotating old backups (keeping 7, deleting 1)...
  Deleted: backup-2026-06-09T02-00-00-000Z.json

Backup complete: backup-2026-06-16T02-00-00-000Z.json
```

---

## API

All API routes require authentication.

### Cron-protected endpoint

Used by the automated scheduler and external cron services (Vercel Cron, cron-job.org, etc.).

**Authenticate** with the `CRON_SECRET` environment variable:

```sh
# POST
curl -X POST https://your-domain.com/api/automations/backups/create \
  -H "Content-Type: application/json" \
  -d '{"secret": "YOUR_CRON_SECRET"}'

# GET
curl "https://your-domain.com/api/automations/backups/create?secret=YOUR_CRON_SECRET"
```

Optional body/query parameters:

| Parameter | Type | Description |
|---|---|---|
| `secret` | string | Required. Must match `CRON_SECRET`. |
| `tenantId` | string | Backup only this tenant's documents. |
| `uploadToCloud` | boolean | Upload to S3 after backup. Default: `false`. |

**Response:**

```json
{
  "success": true,
  "message": "Backup created: backup-2026-06-16T02-00-00-000Z.json",
  "processed": 1,
  "failed": 0,
  "errors": []
}
```

---

### Super-admin API

Requires an active super-admin session cookie.

#### List backups

```
GET /api/super-admin/backups
```

```json
{
  "success": true,
  "data": [
    {
      "name": "backup-2026-06-16T02-00-00-000Z.json",
      "size": 13054976,
      "createdAt": "2026-06-16T02:00:05.123Z"
    }
  ]
}
```

#### Trigger a backup

```
POST /api/super-admin/backups
Content-Type: application/json

{
  "tenantId": "64abc123def456",   // optional
  "uploadToCloud": true            // optional
}
```

#### Download a backup file

```
GET /api/super-admin/backups/:filename
```

Returns the file as an attachment (`Content-Disposition: attachment`).

#### Delete a backup file

```
DELETE /api/super-admin/backups/:filename
```

```json
{ "success": true, "message": "Deleted backup-2026-06-16T02-00-00-000Z.json" }
```

---

## Super-Admin UI

Navigate to **Super Admin → Backups** (`/super-admin/backups`).

**Create Backup** — triggers an immediate full backup. The "Create & Upload to Cloud" button also pushes the file to your configured S3 bucket.

**Backup Files** — table of all local backup files with size, timestamp, download, and delete actions.

**Backup Schedule** — summary of the automated schedule and retention policy.

---

## Per-Tenant Backup (Admin UI)

Store admins can back up and restore their own data from the tenant admin panel at:

```
/{tenant}/{lang}/admin/backup-reset
```

This allows collection-level selection — for example, backing up only `products` and `customers` — and restoring from a previously downloaded JSON file. It does **not** have access to other tenants' data.

---

## Cloud Storage (S3-compatible)

Set these environment variables to enable cloud uploads:

```env
# Required
BACKUP_S3_BUCKET=my-backup-bucket
BACKUP_S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
BACKUP_S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Optional (default: ap-southeast-1)
BACKUP_S3_REGION=us-east-1

# Optional: for DigitalOcean Spaces, MinIO, Backblaze B2, etc.
BACKUP_S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
```

**S3 key layout:**

```
backups/full/<filename>          # full database backups
backups/<tenantId>/<filename>    # single-tenant backups
```

---

## Backup File Format

```json
{
  "version": "1.0",
  "createdAt": "2026-06-16T02:00:00.000Z",
  "tenantId": null,
  "totalDocuments": 38471,
  "collections": {
    "products": [ { "_id": "...", "name": "...", ... } ],
    "transactions": [ ... ],
    "customers": [ ... ]
  }
}
```

- `tenantId` is `null` for full backups; set to an ObjectId string for tenant-scoped backups.
- Documents are stored as-is from MongoDB, including `_id` and all references.
- Arrays of up to 50,000 documents per collection (CLI) / 10,000 (automated API) to avoid memory exhaustion.

---

## Source Files

| File | Purpose |
|---|---|
| `scripts/backup-database.ts` | CLI script |
| `lib/automations/database-backups.ts` | Core backup + S3 upload logic |
| `lib/cron.ts` | Nightly cron job registration (job #17) |
| `app/api/automations/backups/create/route.ts` | Cron-protected HTTP trigger |
| `app/api/super-admin/backups/route.ts` | Super-admin list + create API |
| `app/api/super-admin/backups/[filename]/route.ts` | Super-admin download + delete API |
| `app/super-admin/backups/page.tsx` | Super-admin backup management UI |
| `app/[tenant]/[lang]/admin/backup-reset/page.tsx` | Per-tenant backup/restore/reset UI |
| `app/api/tenants/[slug]/reset-collections/route.ts` | Per-tenant backup/reset/restore API |
