# POS product search

Product search on the register (`app/[tenant]/[lang]/page.tsx`) is **local-first** so typing never
costs MongoDB reads. Logic lives in `hooks/usePosProducts.ts`.

## How it works

1. **Catalog on the device.** On load the hook reads the tenant's catalog from IndexedDB
   (`lib/offline-storage.ts`), so search works instantly and offline.
2. **Sync.** It then syncs with `GET /api/products?view=pos[&updatedSince=<iso>]`:
   - **Delta** (normal case): only products whose `updatedAt` is after the last sync, including
     deactivated ones (removed locally). Uses the `{ tenantId, updatedAt }` index.
   - **Full**: first run on a device, empty cache, or the last full sync is over 24 h old (catches
     hard deletes from maintenance scripts, which a delta can't see).
   - Repeats every 5 min while the tab is visible, and when the device comes back online.
   - The last sync time is kept in `localStorage` (`posCatalogSync_<tenant>`); the server's
     `syncedAt` (taken before the query) is used, so device clock skew doesn't matter.
3. **Search.** Each keystroke (150 ms debounce) is matched in memory: pinned first, then exact
   SKU/barcode, name prefix, word start, other matches (SKU, barcode, category, description).
4. **Live changes.** Stock events (SSE), completed sales and pin toggles update the local catalog
   through the hook's `setProducts`, which persists it back to IndexedDB.
5. **Scanner.** Barcode/QR scans look up the local catalog first; `/api/products/by-barcode`
   (indexed exact match) is only hit for products not synced yet.

## Server fallback

If the device has no catalog and the sync failed, search falls back to
`/api/products?search=…&count=0&view=pos` for queries of 2+ characters. `count=0` fetches
`limit + 1` rows to report `hasMore` instead of running `countDocuments`.

## API parameters (`GET /api/products`)

| Param | Effect |
| --- | --- |
| `view=pos` | Only the fields the register uses; no category populate. Unpaged responses include `syncedAt`. |
| `updatedSince=<ISO date>` | `updatedAt > date`, ignores the `isActive` filter. 400 if invalid. |
| `count=0` (with `page` + `limit`) | No `countDocuments`; `pagination` is `{ page, limit, hasMore }`. |

Existing callers (admin product list, dashboard) are unchanged: without these params the route
behaves as before.

## Cost

A sale no longer reads the catalog per keystroke. Per register, reads are roughly: one full
catalog pull per day, plus the products that changed since the last 5-minute delta.
