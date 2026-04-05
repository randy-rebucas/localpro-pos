# Admin Page Refactoring Template

## Standard Pattern (Used for 9 completed pages)
All refactored admin pages follow this pattern:

### 1. Create `hooks/use[Resource]List.ts`
```typescript
import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';

export interface [Resource] {
  _id: string;
  // ... other fields
}

export function use[Resource]List() {
  const [items, setItems] = useState<[Resource][]>([]);
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetch[Resources] = useCallback(
    async (onError?: (error: string) => void) => {
      // Abort previous request, set up new controller with 20s timeout
      // Fetch from /api/[resources]
      // Set items on success, call onError on failure
      // Always toast.error() on error
    },
    []
  );

  const delete[Resource] = useCallback(
    async (id: string, onSuccess?: () => void, onError?: (error: string) => void) => {
      // DELETE /api/[resources]/{id}
      // Update state on success
      // toast.success() and call onSuccess
      // toast.error() and call onError on failure
    },
    []
  );

  const toggle[Resource]Status = useCallback(
    async (id: string, newStatus: boolean, onSuccess?: () => void) => {
      // PATCH /api/[resources]/{id} with { isActive: newStatus }
      // Update state optimistically
      // Toast success, call onSuccess
    },
    []
  );

  return { items, loading, fetch[Resources], delete[Resource], toggle[Resource]Status };
}
```

### 2. Create `hooks/use[Resource]Form.ts`
```typescript
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

export interface [Resource]FormData {
  // All form fields
}

export function use[Resource]Form(isEdit: boolean = false) {
  const [formData, setFormData] = useState<[Resource]FormData>({ /* initial values */ });
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setFormData({ /* initial values */ });
    setError('');
  }, []);

  const handleSubmit = useCallback(
    async (id: string | null, onSuccess?: () => void, onError?: (error: string) => void) => {
      // Validate form data
      // POST (create) or PATCH (update)
      // On success: toast, call onSuccess, resetForm, return true
      // On error: setError, toast.error, call onError, return false
    },
    [formData, isEdit, resetForm]
  );

  return { formData, setFormData, error, handleSubmit, resetForm };
}
```

### 3. Create `lib/[resource]-helpers.ts`
```typescript
export function getStatusColor(isActive: boolean): string {
  return isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(isActive: boolean, dict: Record<string, string>): string {
  return isActive ? dict?.['common.active'] || 'Active' : dict?.['common.inactive'] || 'Inactive';
}

export function getDeleteConfirmMessage(dict: Record<string, string>): string {
  return dict?.['confirmation.delete[Resource]'] || 'Are you sure?';
}

// ... other utility functions as needed
```

### 4. Refactor Page Component
```typescript
'use client';

import { useEffect, useState } from 'react';
import { use[Resource]List } from '@/hooks/use[Resource]List';
import { use[Resource]Form } from '@/hooks/use[Resource]Form';

export default function [Resource]Page() {
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const { items, loading, fetch[Resources], delete[Resource], toggle[Resource]Status } = use[Resource]List();
  const { formData, setFormData, handleSubmit, resetForm } = use[Resource]Form(!!selectedItem);

  useEffect(() => {
    fetch[Resources](); // Fetch on mount
  }, [fetch[Resources]]);

  const openAdd = () => {
    setSelectedItem(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (item: any) => {
    setSelectedItem(item);
    setFormData(item); // Or use a custom setter if different
    setShowModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await handleSubmit(selectedItem?._id || null, () => {
      setShowModal(false);
      fetch[Resources](); // Refresh list
    });
    if (!success) return;
  };

  const handleDelete = async (item: any) => {
    if (!confirm('Are you sure?')) return;
    await delete[Resource](item._id, () => {
      fetch[Resources]();
    });
  };

  return (
    <>
      <GridComponent items={items} onEdit={openEdit} onDelete={handleDelete} />
      <ModalComponent formData={formData} onSubmit={handleFormSubmit} onClose={() => setShowModal(false)} />
    </>
  );
}
```

## Pages Status

### ✅ Completed (9)
- Bookings, Branches, Bundles, Business-Hours, Cash-Drawer, Categories, Customers, Discounts, Tables

### ✅ Mostly Done (1)
- **Products** - Has basic hooks, just needs minor cleanup
- **Users** - Already has useUsersList + useUserForm pattern, minimal work needed

### 🔄 Requires Refactoring (Remaining 13)
#### High Priority (Core Business)
- **Transactions** - Large dataset, complex filtering, high traffic
- **Expenses** - Financial tracking, straightforward CRUD
- **Credits** - Customer management, straightforward CRUD
- **Receivables** - Accounts receivable, follows standard CRUD pattern

#### Medium Priority (Operational)
- **Stock-Movements** - Inventory management
- **Notification-Templates** - Communication settings
- **Attendance** - HR module
- **Loyalty** - Customer engagement

#### Lower Priority (Setup/Admin)
- **Holidays** - Settings-based, different pattern
- **Tax-Rules** - Compliance, straightforward CRUD
- **Tenants** - Multi-tenant setup
- **Audit-Logs** - Read-only, no CRUD
- **Subscriptions** - Subscription management

## Quick Refactoring Checklist

For each page:
1. [ ] Identify GET list, POST create, PATCH/PUT update, DELETE operations
2. [ ] Check for existing hooks - might be 50% done
3. [ ] Create `use[Resource]List.ts` with fetch, delete, toggle
4. [ ] Create `use[Resource]Form.ts` with validation
5. [ ] Create `lib/[resource]-helpers.ts` with at least:
   - `getStatusColor(isActive)`
   - `getStatusLabel(isActive, dict)`
   - `getDeleteConfirmMessage(dict)`
- [ ] Refactor page component to use hooks
- [ ] Remove all inline state management
- [ ] Remove duplicate fetch/abort controller logic
- [ ] Test build: `pnpm run build`

## Common Gotchas
1. **Routing**: Check API endpoint patterns (some use `/api/[resource]`, others `/api/tenants/[tenant]/[resource]`)
2. **Abort Controllers**: Use consistent pattern with 20s timeout
3. **Toast Messages**: All mutations should toast.success() and toast.error()
4. **Tenant Scoping**: Most APIs auto-scope to JWT tenant - remove tenant param from URL
5. **File Cleanup**: Watch for duplicate code after replacing page component (Tables had this issue)
6. **Helper Naming**: Use consistent naming like `getStatusColor`, `getStatusLabel`, etc.

## Performance Considerations
- No pagination on list pages (client-side filtering only for now)
- Implement pagination if list exceeds 100+ items
- Use lean() in MongoDB queries for read-only operations
- Cache form dictionaries if needed
