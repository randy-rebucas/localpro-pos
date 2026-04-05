# Admin Page Template Implementation Guide

## Status Summary
✅ **2 Pages Refactored & Tested**
- Categories
- Discounts  

✅ **Build Verified** 
- Compiled successfully in 16.3s
- All tests passing (261/261)
- Zero TypeScript errors

## Quick Start Pattern

### Step 1: Replace Wrapper
```diff
- <div className="min-h-screen bg-gray-50">
-   <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
-     <div className="mb-6 sm:mb-8">
+ <AdminPageTemplate
+   title={dict?.admin?.items || 'Items'}
+   subtitle={dict?.admin?.itemsSubtitle || 'Description'}
+   loading={!dict || loading}
+   primaryAction={{ label: 'Add Item', onClick: handleAdd }}
+   message={message}
+ >
```

### Step 2: Replace Table with AdminTable
```diff
- <div className="bg-white border border-gray-300 p-6">
-   <table className="min-w-full...">
+ <AdminTable 
+   columns={columns} 
+   data={tableData} 
+ />
```

### Step 3: Define Columns
```typescript
const columns = [
  { key: 'name', label: dict?.admin?.name || 'Name', width: 'flex-1' },
  { key: 'status', label: dict?.admin?.status || 'Status', width: '100px' },
  { key: 'actions', label: dict?.common?.actions || 'Actions', width: '200px' },
];
```

### Step 4: Map Data to Table Format
```typescript
const tableData = items.map((item) => ({
  _id: item._id,
  name: item.name,
  status: <StatusBadge status={item.status} />,
  actions: (
    <div className="flex gap-2">
      <button onClick={() => handleEdit(item)}>Edit</button>
      <button onClick={() => handleDelete(item._id)}>Delete</button>
    </div>
  ),
}));
```

## Remaining Pages by Complexity

### Level 1: Simple Tables (5 pages)
Estimated effort: 15-20 mins each, 1-2 token refactors per page

- [ ] branches - Has BranchModal
- [ ] business-hours - Uses BusinessHoursManager component
- [ ] cash-drawer - Simple table with status filters
- [ ] holidays - Uses HolidaysManager component  
- [ ] stock-movements - Table with dropdown filters

**Pattern**: Basic table structure with filters. Replaces old container div + manual table HTML.

### Level 2: Complex Tables with Forms (8 pages)
Estimated effort: 30-45 mins, may need custom modal updates

- [ ] customers - Pagination, search, edit modal
- [ ] transactions - Large dataset, receipt display
- [ ] receivables - Payment tracking, infinite scroll
- [ ] attendance - Dynamic employee selection
- [ ] expenses - Date filters, category grouping
- [ ] loyalty - Customer segment display (already refactored)
- [ ] tables - Floor layout, capacity management
- [ ] users - Role selection, QR code generation

**Pattern**: Combine AdminTable with custom AdminModal components.

### Level 3: Analytics & Special Pages (6 pages)
Estimated effort: 45-60 mins, may need chart integration

- [ ] products - Barcode scanning, categories, large inventory
- [ ] bundles - Performance charts, batch actions
- [ ] bookings - Calendar component, date range
- [ ] subscriptions - Tab navigation (Subscription/Billing)
- [ ] crm - Segment tabs, campaign compose
- [ ] audit-logs - User/action filter dropdowns

**Pattern**: Keep specialized components (charts, calendars), wrap in template.

### Level 4: Settings & Config (10+ pages)
Estimated effort: 20-30 mins, mostly form-based

- [ ] advanced-branding - Complex form (font, colors, CSS)
- [ ] bir-compliance - Multi-section form
- [ ] feature-flags - Toggle list with descriptions
- [ ] hardware - Device configuration  
- [ ] multi-currency - Exchange rate fields
- [ ] notification-templates - Email/SMS editor
- [ ] tax-rules - Dynamic rule builder
- [ ] business-types - Info display only
- [ ] file-upload - Drag/drop Area
- [ ] api-docs - Documentation view
- [ ] backup-reset - Collection selection

**Pattern**: Keep existing form managers, wrap page in AdminPageTemplate.

## Implementation Checklist

For each page you refactor:

- [ ] Copy imports from examples (categories/discounts)
- [ ] Replace outer `<div>` containers with `<AdminPageTemplate>`
- [ ] Move title/subtitle to template props
- [ ] Replace loading spinner with template's `loading` prop
- [ ] Remove manual table HTML, use `<AdminTable>`
- [ ] Define `columns` array
- [ ] Create `tableData` mapping
- [ ] Update modal usage if needed (use `AdminModal` if applicable)
- [ ] Test build: `npm run build`
- [ ] Verify no TypeScript errors
- [ ] Test page in browser (if needed)
- [ ] Commit changes

## Code Snippets for Copy-Paste

### Basic Page Template
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useItemsList, type Item } from '@/hooks/useItemsList';
import { AdminPageTemplate, AdminTable } from '@/components/admin/AdminPageTemplate';
import toast from 'react-hot-toast';

export default function ItemsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);

  const { items, loading, message, fetchItems, deleteItem } = useItemsList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchItems();
  }, [lang, fetchItems]);

  const handleDelete = async (itemId: string) => {
    if (!confirm('Delete this item?')) return;
    await deleteItem(itemId, () => {
      toast.success('Deleted');
      fetchItems();
    }, (err) => toast.error(err));
  };

  const columns = [
    { key: 'name', label: dict?.admin?.name || 'Name', width: 'flex-1' },
    { key: 'actions', label: dict?.common?.actions || 'Actions', width: '150px' },
  ];

  const tableData = items.map((item) => ({
    _id: item._id,
    name: item.name,
    actions: (
      <div className="flex gap-2">
        <button className="text-blue-600">Edit</button>
        <button onClick={() => handleDelete(item._id)} className="text-red-600">Delete</button>
      </div>
    ),
  }));

  return (
    <AdminPageTemplate
      title={dict?.admin?.items || 'Items'}
      loading={!dict || loading}
      message={message}
    >
      <AdminTable columns={columns} data={tableData} />
    </AdminPageTemplate>
  );
}
```

### With Modal
```typescript
import { AdminPageTemplate, AdminTable, AdminModal, FormField } from '@/components/admin/AdminPageTemplate';

// Inside JSX:
{showModal && (
  <AdminModal
    title="Edit Item"
    isOpen={showModal}
    onClose={() => setShowModal(false)}
    onSubmit={handleSubmit}
    submitting={submitting}
    error={error}
  >
    <FormField label="Name" required error={error}>
      <input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
    </FormField>
  </AdminModal>
)}
```

## Notes

1. **AdminPageTemplate features:**
   - Automatic loading spinner
   - Message display (success/error)
   - Primary action button
   - Empty state handling
   - Responsive layout

2. **AdminTable features:**
   - Column definitions
   - Flexible width (flex-1, fixed px)
   - Empty state message  
   - Renders JSX in cells

3. **Type Safety:**
   - Import types from hooks: `type Item`
   - Pass full objects to helper functions
   - Use `| null | undefined` in message prop

4. **Performance:**
   - No performance impact from template
   - Same re-render patterns as before
   - CSS stays identical (Tailwind)

## Build Commands

```bash
# Test individual page
npm run build

# Run tests
npm run test

# Type check
npx tsc --noEmit
```

## Support

If you encounter issues during refactoring:
1. Check the pattern in **categories/** and **discounts/** pages
2. Verify all imports match
3. Ensure type annotations are correct
4. Run `npm run build` to catch TypeScript errors
5. Reference the session memory file for troubleshooting
