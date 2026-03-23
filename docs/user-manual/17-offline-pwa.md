# 17. Offline Mode & PWA

**Available to:** All Users

## Progressive Web App (PWA)

1POS is a Progressive Web App, meaning it can be installed on any device and provides a near-native app experience.

### Benefits

- Works without an app store
- Installs directly from the browser
- Updates automatically
- Runs in its own window (no browser chrome)
- Home screen icon on mobile devices

### Installing 1POS

See [Getting Started > Installing 1POS as an App](./01-getting-started.md#installing-1pos-as-an-app-pwa) for installation instructions on Desktop, Android, and iOS.

## Offline Mode

1POS can continue operating when the internet connection is lost or unstable.

### How It Works

1. **Connection drops** — The system detects loss of connectivity
2. **Offline indicator** — A banner appears at the top of the screen: "You are offline"
3. **Continue working** — POS transactions can still be processed
4. **Local storage** — Transactions are saved securely on the device
5. **Connection restored** — Data automatically syncs to the server
6. **Sync confirmation** — A notification confirms all data has been uploaded

### What Works Offline

| Feature | Offline Support |
|---------|----------------|
| **Process sales** | Yes — transactions saved locally |
| **View products** | Yes — cached product catalog |
| **Scan barcodes** | Yes — product lookup from cache |
| **Print receipts** | Yes — if printer is locally connected |
| **View recent transactions** | Yes — locally cached history |
| **Cash drawer operations** | Yes — saved locally |

### What Requires Internet

| Feature | Reason |
|---------|--------|
| **Reports generation** | Requires server-side aggregation |
| **User management** | Requires server authentication |
| **Email receipts** | Requires email server |
| **Booking management** | Requires real-time conflict detection |
| **Settings changes** | Requires server persistence |
| **Stock sync across branches** | Requires server coordination |

### Receipt Numbers During Offline

- Receipt serial numbers are **pre-allocated** in batches
- When working offline, the system uses reserved numbers from the local pool
- This ensures sequential numbering even without server contact
- When back online, the used numbers are reconciled with the server

### Data Safety

- Offline transactions are stored in the browser's **IndexedDB**
- Data is encrypted and persists even if the browser is closed
- When connectivity returns, sync happens automatically
- If there are conflicts (rare), the system uses the server version as the source of truth
- A sync log is maintained for troubleshooting

### Checking Sync Status

1. Look at the **Offline Indicator** in the navigation bar
2. Status values:
   - **Online** (green) — Connected and synced
   - **Offline** (red) — No internet, working locally
   - **Syncing** (yellow) — Uploading local changes to server
   - **Sync Error** (orange) — Sync failed, will retry

### Forcing a Manual Sync

If auto-sync hasn't triggered:
1. Ensure internet connectivity
2. The system retries automatically on a schedule
3. Refreshing the page triggers a sync attempt

## Troubleshooting Offline Issues

| Issue | Solution |
|-------|---------|
| Offline indicator stays on | Check WiFi/network, refresh page |
| Transactions not syncing | Ensure stable connection, check sync status |
| Products not showing offline | Visit products page once while online to cache |
| Old prices showing | Refresh while online to update cached catalog |
| PWA not installable | Ensure you're using HTTPS, clear browser cache |

## Best Practices

1. **Visit all key pages while online** — This caches data for offline use
2. **Don't clear browser data** — This removes offline cached data
3. **Sync before end of shift** — Ensure all transactions are uploaded
4. **Keep the device charged** — Offline data is lost if the device dies with unsaved data
5. **Report persistent sync issues** — Tell your manager if sync errors continue
