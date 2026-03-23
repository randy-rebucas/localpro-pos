# 12. Data Management

## Backups

### Automatic Backups

If the backup automation is enabled:
- Runs daily at the configured time
- Creates a full database dump for your tenant
- Uploads to S3 (if configured) and keeps a local copy
- Old backups are pruned based on retention settings

### Manual Backups

1. Navigate to **Admin > Backup & Reset**
2. Click **Create Backup**
3. The backup is generated and available for download
4. Backup includes: all tenant data (products, transactions, customers, settings, etc.)

### Backup Storage

| Storage | Configuration | Description |
|---------|--------------|-------------|
| **Local** | Default | Stored on the server filesystem |
| **Amazon S3** | `AWS_*` env vars | Uploaded to S3 bucket |
| **Both** | Default + S3 | Redundant storage |

### Backup Contents

A backup includes:
- Products, categories, and bundles
- Transactions and payment records
- Customers
- Inventory and stock movements
- Bookings
- Users (hashed passwords, not plaintext)
- Settings and configuration
- Audit logs
- Attendance records
- Cash drawer sessions
- Expenses

### Restoring from Backup

Contact your platform administrator for restore operations. Backup restore replaces all current tenant data with the backup snapshot.

> **Warning:** Restore is destructive — all current data is replaced.

## Data Archiving

### Purpose

BIR requires 10 years of data retention. Archiving moves old records to archive storage while keeping them accessible for audits.

### How It Works

1. The archiving automation runs monthly
2. Records older than the retention threshold are moved to archive collections
3. Archived data is queryable but not shown in day-to-day views
4. Original records are marked as archived

### Configurable Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Archive After** | 2 years | Move records older than this to archive |
| **Retention Period** | 10 years | Keep archived data for this long |
| **Archive Types** | All | Which record types to archive |

### What Gets Archived

| Record Type | Archive After |
|------------|---------------|
| Transactions | 2 years |
| Audit Logs | 1 year (active), 10 years (archive) |
| Stock Movements | 2 years |
| Attendance | 1 year |
| Cash Drawer Sessions | 1 year |
| Bookings | 1 year |

## Audit Log Management

### Audit Log Cleanup

The cleanup automation manages audit log size:
- Active logs: Kept for 1 year in main collection
- Archived logs: Moved to archive for 10-year retention
- Very old logs (past retention): Permanently deleted

### Accessing Archived Logs

1. Navigate to **Admin > Audit Logs**
2. Set date range to include archived period
3. The system queries both active and archive collections
4. Export for BIR inspection if needed

## Sample Data

### Loading Sample Data

For testing and training:

1. Navigate to **Admin > Sample Data**
2. Click **Load Sample Data**
3. The system creates:
   - Sample products and categories
   - Sample customers
   - Sample transactions
   - Sample inventory data
4. Use for training new staff or testing configuration

> **Warning:** Only use sample data on test/training tenants. Do not load on a production tenant with real data.

### Clearing Sample Data

1. Navigate to **Admin > Sample Data**
2. Click **Clear Sample Data**
3. Only sample-tagged records are removed

## Data Export

All data can be exported for external use:

| Data Type | Export Format | Access Path |
|-----------|-------------|-------------|
| Transactions | CSV, Excel, PDF | Reports > Transactions > Export |
| Products | CSV, Excel | Admin > Products > Export |
| Customers | CSV, Excel | Admin > Customers > Export |
| Inventory | CSV, Excel | Inventory > Export |
| Sales Journal | CSV, Excel, PDF | Reports > Sales Journal > Export |
| VAT Report | CSV, Excel, PDF | Reports > VAT > Export |
| Audit Logs | CSV, Excel | Admin > Audit Logs > Export |
| Attendance | CSV, Excel | Admin > Attendance > Export |

## Data Retention Summary

| Data Type | Active | Archived | Total Retention |
|-----------|--------|----------|----------------|
| Transactions | 2 years | 8 years | 10 years |
| Audit Logs | 1 year | 9 years | 10 years |
| Financial Records | 2 years | 8 years | 10 years |
| Customer Data | Indefinite | — | Until deactivated |
| Products | Indefinite | — | Soft-deleted only |
| Settings | Indefinite | — | Current state |

## Best Practices

1. **Verify backups regularly** — Download and check that backup files are valid
2. **Test restore** — Periodically test restore on a staging environment
3. **Monitor storage** — Check backup storage usage
4. **Export before changes** — Export data before making major configuration changes
5. **Keep 10 years** — BIR requires 10-year retention for all financial records
