# Super-admin UI patterns (copy-paste reference)

Every snippet here is lifted from a live page in `app/super-admin/`, with the known drift already corrected. Each section cites its source so you can see the pattern in context. On tenant pages, replace the English literals with dictionary lookups.

---

## Containers

### Panel (base surface for everything)
```tsx
<div className="bg-white border border-gray-300">…</div>
<div className="bg-white border border-gray-300 p-4">…</div>   {/* padded */}
```

### Section card with header strip (settings, backups)
```tsx
<section className="bg-white border border-gray-300">
  <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between">
    <div>
      <h2 className="text-base font-bold text-gray-900">Database Health</h2>
      <p className="text-sm text-gray-500">Check PostgreSQL connection and table stats</p>
    </div>
    <button className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors">
      Check Health
    </button>
  </div>
  <div className="p-6">…</div>
</section>
```
Stack them with `<div className="space-y-6">`.

### Chart/card panel with small heading (analytics)
```tsx
<div className="bg-white border border-gray-300 p-5">
  <h2 className="text-sm font-bold text-gray-900 mb-4">Plan Distribution</h2>
  …
</div>
```
Use two-up grids of these: `grid grid-cols-1 lg:grid-cols-2 gap-6`.

### Eyebrow / group label
```tsx
<p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto-Provisioning</p>
```
Inside forms, separate groups with `<hr className="border-gray-300" />`.

---

## Toolbars & filters

### Toolbar: search + select on the left, CTA on the right (tenants)
```tsx
<div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
  <div className="flex gap-3">
    <div className="relative">
      <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
      </svg>
      <input type="text" placeholder="Search by name or slug…" aria-label="Search tenants"
        className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56" />
    </div>
    <select aria-label="Filter by status" className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900">
      <option value="">All statuses</option>
    </select>
  </div>
  <button className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors">
    + New Tenant
  </button>
</div>
```

### Labeled filter bar with submit (billing)
```tsx
<form onSubmit={…} className="bg-white border border-gray-300 p-4 flex flex-wrap gap-3 items-end">
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
    <select className="px-3 py-2 border border-gray-300 text-sm bg-white w-44">…</select>
  </div>
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
    <input type="date" className="px-3 py-2 border border-gray-300 text-sm" />
  </div>
  <button type="submit" className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors">Filter</button>
  {hasFilters && <button type="button" className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Clear</button>}
  <button type="button" className="ml-auto px-4 py-2 border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 bg-white transition-colors">
    + Record Billing Event
  </button>
</form>
```

### Date-range presets (analytics, logs)
```tsx
<button className="px-2.5 py-1 text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 bg-white transition-colors">7d</button>
```

---

## Buttons

| Variant | Classes |
|---|---|
| Primary | `px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors` |
| Secondary (outline) | `px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors` |
| Solid navy (safe alt action) | `px-4 py-2 bg-brand-navy text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-[filter]` |
| Danger | `px-4 py-2 bg-win8-danger text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-[filter]` |
| Small solid (row text action) | `px-3 py-1 text-xs font-semibold bg-brand text-white hover:brightness-110 transition-[filter]` (swap `bg-win8-*` per meaning) |
| Text link | `text-xs text-brand hover:underline` (destructive: `text-xs text-win8-danger hover:underline`) |
| Full-width submit | `w-full py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors` |

### Icon action button (table rows)
```tsx
<div className="flex justify-end gap-1.5">
  <button onClick={…} title="Edit" aria-label="Edit"
    className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]">
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </svg>
  </button>
  <button title="Delete" aria-label="Delete"
    className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 transition-[filter]">
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
    </svg>
  </button>
</div>
```
Colors: edit `bg-brand`, delete/deactivate `bg-win8-danger`, activate `bg-win8-success`, impersonate/special `bg-win8-accent`, flags `bg-win8-warning`. While busy, replace the icon with `<span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>` and add `disabled:opacity-50`.

Other icon paths in use:
- activate/check: `m5 12 5 5L20 7`
- power/deactivate: `M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10`
- close X: `M6 18 18 6M6 6l12 12`
- flag: `M5 3v18M5 4h11l-2 4 2 4H5`

---

## Form fields

```tsx
<div>
  <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
  <input required className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="My Store" />
  <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, hyphens only</p>   {/* optional hint */}
</div>

<select className="w-full border border-gray-300 px-3 py-2 text-sm bg-white">…</select>
<textarea rows={2} className="w-full border border-gray-300 px-3 py-2 text-sm resize-none" />
<input disabled className="… disabled:bg-gray-100" />
```
- Two or three fields per row: `grid grid-cols-2 gap-3` / `grid grid-cols-3 gap-3`.
- Required marker, when it's styled separately: `<span className="text-win8-danger">*</span>`.
- Field stack spacing: `space-y-4`.

### Checkbox (always `.checkbox-win8`)
```tsx
<label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
  <input type="checkbox" className="checkbox-win8" checked={…} onChange={…} />
  Available to new tenants
</label>
```
Checkbox grids use `grid grid-cols-2 gap-y-2 gap-x-4`.

### Inline status-select in a table cell (tenants onboarding)
```tsx
<select aria-label={`Onboarding status for ${t.name}`}
  className={`text-xs px-2 py-0.5 cursor-pointer border-0 font-semibold ${STATUS_BADGE[value]}`}>
  <option className="bg-white text-gray-900 font-normal">…</option>
</select>
```

---

## Badges & indicators

```tsx
// Status / tier / type badge: solid fill, white text
<span className={`px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[s] || 'bg-gray-500 text-white'}`}>{s.replace(/_/g, ' ')}</span>

// Mono code tag (audit actions)
<span className="text-xs font-mono bg-gray-500 text-white px-1.5 py-0.5">{action}</span>

// Square status dot + label
<span className={`inline-block w-2.5 h-2.5 ${ok ? 'bg-win8-success' : 'bg-win8-danger'}`} />
<span className={`text-sm font-semibold ${ok ? 'text-win8-success' : 'text-win8-danger'}`}>{ok ? 'Connected' : 'Error'}</span>

// Delta badge (KPI change)
<span className={`text-xs font-semibold px-1.5 py-0.5 text-white ${up ? 'bg-win8-success' : 'bg-win8-danger'}`}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
```

Badge map template:
```ts
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-win8-success text-white',
  trial: 'bg-win8-warning text-white',
  suspended: 'bg-win8-suspended text-white',
  cancelled: 'bg-win8-danger text-white',
  inactive: 'bg-gray-500 text-white',
};
```

---

## Data table (tenants, users, logs)

```tsx
<div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
  <table className="w-full text-sm">
    <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
      <tr>
        {['Name', 'Slug', 'Status', 'Created', 'Actions'].map(h => (
          <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-200">
      {rows.map(r => (
        <tr key={r.id} className="hover:bg-gray-100 transition-colors">
          <td className="px-4 py-3">
            <p className="font-medium text-gray-900">{r.name}</p>
            <p className="text-xs text-gray-400 font-mono">{r.slug}</p>
          </td>
          <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.slug}</td>
          <td className="px-4 py-3">{/* badge */}</td>
          <td className="px-4 py-3 text-xs text-gray-700">{new Date(r.createdAt).toLocaleDateString()}</td>
          <td className="px-4 py-3">{/* icon actions */}</td>
        </tr>
      ))}
    </tbody>
  </table>
  {/* pagination goes here, inside the bordered wrapper */}
</div>
```
- Right-align numeric columns (`text-right`).
- Selected row: add `bg-brand-soft`.
- Long text: `max-w-[240px] truncate` plus `title={full}`.

### Expandable detail row (logs)
```tsx
<React.Fragment key={row.id}>
  <tr className="hover:bg-gray-100 transition-colors">…
    <td className="px-4 py-3">
      <button onClick={() => setExpandedId(expandedId === row.id ? null : row.id)} className="text-xs text-brand hover:underline">
        {expandedId === row.id ? 'Hide' : 'Changes'}
      </button>
    </td>
  </tr>
  {expandedId === row.id && (
    <tr>
      <td colSpan={COLS} className="px-4 py-3 bg-gray-100">
        <div className="text-xs font-semibold text-gray-500 mb-1">Changes</div>
        <div className="bg-white border border-gray-300 p-3 overflow-x-auto max-h-60">…</div>
      </td>
    </tr>
  )}
</React.Fragment>
```

### Light inner table (inside a card, e.g. top-10 or invoice lines)
```tsx
<table className="min-w-full text-sm">
  <thead><tr className="border-b border-gray-200">
    <th className="pb-2 text-left text-xs font-medium text-gray-500">Tenant</th>
  </tr></thead>
  <tbody className="divide-y divide-gray-200"><tr><td className="py-2">…</td></tr></tbody>
</table>
```

### Pagination
```tsx
{pagination.pages > 1 && (
  <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
    <span>Showing {(p.page - 1) * p.limit + 1}–{Math.min(p.page * p.limit, p.total)} of {p.total}</span>
    <div className="flex gap-2">
      <button disabled={p.page === 1} className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100">← Prev</button>
      <button disabled={p.page >= p.pages} className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100">Next →</button>
    </div>
  </div>
)}
```

---

## States

```tsx
// Loading (panel)
<div className="text-center py-12 bg-white border border-gray-300">
  <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
  <p className="mt-3 text-gray-400 text-sm">Loading tenants…</p>
</div>

// Loading (full page)
<div className="min-h-screen flex items-center justify-center bg-gray-50">
  <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
</div>

// Skeleton KPI grid
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  {[...Array(4)].map((_, i) => (
    <div key={i} className="bg-white border border-gray-300 p-5 animate-pulse">
      <div className="h-3 bg-gray-200 w-24 mb-3" /><div className="h-8 bg-gray-200 w-16 mb-2" /><div className="h-3 bg-gray-200 w-20" />
    </div>
  ))}
</div>

// Empty
<div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
  {hasFilters ? 'No tenants match your filters.' : 'No tenants yet.'}
</div>
// Empty inside a card/section
<p className="text-sm text-gray-400 italic">No backup files found. Create your first backup above.</p>

// Error with retry
<div className="text-center py-12 bg-white border border-gray-300">
  <p className="text-win8-danger text-sm font-medium">{error}</p>
  <button onClick={retry} className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors">Retry</button>
</div>
```

### Alerts / notes
| Kind | Classes |
|---|---|
| Inline error or warning (section, form) | `p-3 bg-white border border-win8-danger text-win8-danger text-sm` |
| Strong error banner (drawer form error) | `bg-win8-danger text-white text-sm p-3` |
| Info note | `bg-brand-soft border border-brand p-4 text-sm text-brand-navy` |
| Success/result tile | `bg-brand text-white p-4` or `bg-win8-warning text-white p-4`; secondary text `text-xs text-white/80` |
| Inline status message | `mt-3 text-sm font-medium text-win8-success` / `text-win8-danger` |

---

## Overlays

### Drawer form (the default for create/edit): `Win8Drawer`
```tsx
import Win8Drawer from '@/components/admin/Win8Drawer';

<Win8Drawer open={showForm} onClose={() => setShowForm(false)}>
  <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
    <h2 className="text-base font-semibold">{editing ? 'Edit Plan' : 'Create Plan'}</h2>
    <button type="button" onClick={close} title="Close" aria-label="Close" className="text-white/70 hover:text-white">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
    </button>
  </div>
  <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
    <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
      {/* fields */}
      {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
    </div>
    <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
      <button type="button" onClick={close} className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100">Cancel</button>
      <button type="submit" disabled={saving} className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors">
        {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Plan'}
      </button>
    </div>
  </form>
</Win8Drawer>
```
Keep the drawer title stable during the close animation: tenants copies `flagsTenant` into a `displayFlagsTenant` state so the header doesn't blank while sliding out.

### Confirm / choose modal (short actions only)
```tsx
{modal && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={close}>
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title"
      className="bg-white border border-gray-300 w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
      <h2 id="confirm-title" className="text-lg font-bold text-gray-900 mb-1">Deactivate user</h2>
      <p className="text-sm text-gray-500 mb-4">User: <span className="font-medium text-gray-700">{name}</span></p>
      <p className="text-sm text-gray-600 mb-4">They will lose access immediately.</p>
      <div className="flex gap-3 justify-end">
        <button onClick={close} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-100 bg-white transition-colors">Cancel</button>
        <button onClick={confirm} disabled={saving} className="px-4 py-2 bg-win8-danger text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-[filter]">
          {saving ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  </div>
)}
```

---

## Dashboard & analytics

### KPI card (white, colored value)
```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
  <div className="bg-white border border-gray-300 p-5">
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">Active Tenants</p>
    <div className="flex items-end gap-2 mt-1.5">
      <p className="text-3xl font-bold tabular-nums text-win8-success">{value.toLocaleString()}</p>
      {/* optional delta badge */}
    </div>
    <p className="text-xs text-gray-400 mt-1">82% of total</p>
  </div>
</div>
```
Value colors: `text-brand`, `text-win8-success`, `text-win8-danger`, `text-win8-accent`, or `text-gray-900` for neutral. To make the card clickable, wrap it in `<Link className="group block">` and add `transition-colors group-hover:border-gray-400` to the card.

### KPI tile (solid-color variant, used in the tenant admin dashboard)
```tsx
<div className="bg-win8-info text-white p-5 hover:brightness-110 transition-[filter]">
  <div className="flex items-center justify-between">
    <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Sales Today</p>
    <span className="w-8 h-8 bg-white/15 flex items-center justify-center"><Icon className="w-4 h-4" /></span>
  </div>
  <p className="text-3xl font-bold tabular-nums mt-2">{value}</p>
</div>
```
Use one variant per page, not both.

### Quick-link tile
```tsx
<Link href={href} className="bg-white border border-gray-300 p-5 hover:border-brand transition-colors group">
  <div className="flex items-start gap-3">
    <span className="w-9 h-9 shrink-0 bg-brand text-white flex items-center justify-center"><Icon /></span>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-900 group-hover:text-brand">Manage Tenants</p>
      <p className="text-xs text-gray-500 mt-0.5 leading-snug">Create, edit, activate or deactivate tenants</p>
    </div>
  </div>
</Link>
```
Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.

### Horizontal bar row (flat CSS chart, no library)
```tsx
function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-24 shrink-0 capitalize">{label}</span>
      <div className="flex-1 bg-gray-100 h-4 overflow-hidden"><div className={`h-4 ${color} transition-all`} style={{ width: `${pct}%` }} /></div>
      <span className="text-sm font-medium text-gray-700 w-8 text-right tabular-nums">{value}</span>
    </div>
  );
}
```
Stack rows with `space-y-3`. Colors come from the same badge maps (`bg-win8-*`, `bg-brand`, `bg-brand-navy`).

### Expandable reference card (business types)
```tsx
<div className="bg-white border border-gray-300">
  <button className="w-full text-left p-5" aria-expanded={open} onClick={toggle}>
    <div className="flex items-start justify-between gap-2">
      <div><p className="text-sm font-bold text-gray-900">{name}</p><p className="text-xs text-gray-500 mt-0.5">{desc}</p></div>
      <span className="text-gray-400 text-xs shrink-0 mt-0.5" aria-hidden="true">{open ? '▲' : '▼'}</span>
    </div>
  </button>
  {open && <div className="border-t border-gray-300 px-5 py-4">…</div>}
</div>
```

---

## Shell chrome (reference only, in `components/super-admin/Shell.tsx`)

- Sidebar: `w-56 bg-gray-900`. Logo block is a `w-8 h-8 bg-brand` square monogram. Inactive nav items are `text-gray-300 hover:bg-gray-800 hover:text-white`; the active item is `bg-brand text-white font-medium`. Nav items are square: drop the existing `rounded`.
- Title bar: `bg-white border-b border-gray-100 px-8 py-4`, with `h1` as `text-lg font-semibold text-gray-900`.
- Page canvas: `bg-gray-50`, and `main` has `p-6`.
- Mobile: the sidebar slides in over a `bg-black/40` overlay, and a hamburger sits in a white top bar.
