# File storage (Cloudinary)

All tenant uploads are stored in Cloudinary. The only route that talks to Cloudinary is `POST/GET/DELETE /api/upload`. It calls `lib/cloudinary.ts`, which uses the official `cloudinary` SDK.

## Folder layout

The Cloudinary account is **shared** with other projects, so 1POS writes only under its own root folder, split by tenant and by what each file is for:

```
1pos/{tenant_slug}/{type}/<file>
```

| `type` | Used by | Accepts | Who can upload (default) |
|---|---|---|---|
| `products` | Product image upload and picker (products page, product modal) | Images | `products.manage` (manager+) |
| `branding` | Store logo and favicon (both settings pages) | Images, including `.ico` | `settings.manage` (manager+) |
| `files` | General file library (Admin > File Upload) | Images, PDF, CSV, XLS/XLSX | `products.manage` or `settings.manage` |

The client sends the type as a `type` form field. If it's missing, the type is `files`, and any other value is rejected.

Every asset also gets:
- **tags:** `1pos`, `tenant:{slug}`, `type:{type}`
- **context metadata:** `tenantId`, `tenantSlug`, `assetType`

So a tenant's assets can be found from the Cloudinary console even if a folder gets moved.

Each upload is recorded in the `files` collection (`models/File.ts`). The record stores the full `public_id` (in `filename`), `assetType`, `resourceType` (`image` / `video` / `raw`; CSV and Excel files are `raw`) and the `folder` the file was written to.

## Rules

- **Content check.** The server checks the file's actual bytes against its declared type (`lib/file-content.ts`) before uploading. The limit is 10MB.
- **Tenant-scoped delete.** Delete looks the record up by `{ _id, tenantId }`. It deletes the Cloudinary asset only if its `public_id` is inside the folder recorded for it under `1pos/`, or under the legacy `tenants/{tenantId}/` folder. So a bad record can never delete another tenant's assets, or another project's.
- **Delete order.** The Cloudinary asset is deleted first. If that fails, the database record is kept (the route returns 502), so the delete can be retried. An asset with no record would be left in the shared account forever.
- **Slug renames.** Files keep the folder they were uploaded to, because their record stores it. New uploads go to the new slug's folder.
- **Legacy uploads.** Files uploaded before this layout are under `tenants/{tenantId}/` and have no `assetType`. They still list (as `files`) and can still be deleted. They are not moved.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `CLOUDINARY_URL` | yes* | `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | yes* | Alternative to `CLOUDINARY_URL` |
| `CLOUDINARY_ROOT_FOLDER` | no | Defaults to `1pos`. Set it to something like `1pos-staging` on non-production deploys so they don't write into production's folders. |
| `CLOUDINARY_SIGNATURE_ALGORITHM` | no | `sha1` (Cloudinary's default) or `sha256`, if the account is set to SHA-256. |

\* Set either `CLOUDINARY_URL` or the three separate variables.

If storage is not configured, uploads return **503** "File storage is not configured", instead of failing with a generic error.

## Index

`models/File.ts` adds `{ tenantId: 1, assetType: 1, uploadedAt: -1 }` for listings filtered by type. Production indexes are synced selectively, so create this index on its own; don't run a full sync.
