# 15. Multi-Branch Operations

**Available to:** Admin, Owner

## Overview

1POS supports multiple branches (store locations) under a single tenant. Each branch maintains its own inventory, cash drawer, and staff while sharing products, customers, and settings.

## Viewing Branches

1. Navigate to **Admin > Branches**
2. View all branches with: name, address, status, staff count

## Adding a Branch

1. Click **Add Branch**
2. Fill in details:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Branch display name (e.g., "Main Street Store") |
| **Address** | Yes | Physical address |
| **Phone** | No | Branch contact number |
| **Email** | No | Branch contact email |
| **Manager** | No | Assign a branch manager |

3. Click **Save**

> **Note:** The number of branches allowed depends on your subscription plan.

## Branch-Specific Data

Each branch has its own:

| Data | Shared or Separate |
|------|-------------------|
| **Products** | Shared (catalog is global) |
| **Product Stock** | Separate (per-branch inventory) |
| **Transactions** | Separate (sales are branch-specific) |
| **Cash Drawer** | Separate (each branch has its own drawer) |
| **Staff** | Separate (users are assigned to branches) |
| **Customers** | Shared (customer database is global) |
| **Categories** | Shared |
| **Discounts** | Shared |
| **Settings** | Shared (with branch-specific overrides) |
| **Bookings** | Separate (per-branch appointments) |

## Stock Transfers Between Branches

1. Navigate to **Inventory**
2. Click **Transfer Stock**
3. Select:
   - **From Branch** — Source location
   - **To Branch** — Destination location
   - **Products** — Select items and quantities
4. Add transfer notes (e.g., reason, delivery details)
5. Click **Initiate Transfer**

### Transfer Workflow

1. **Initiated** — Transfer created at source branch
2. **In Transit** — Stock deducted from source
3. **Received** — Destination branch confirms receipt, stock added
4. Both sides are recorded in stock movement history

## Branch Switching

Users with multi-branch access:
1. Click the **branch selector** in the navigation bar
2. Select the branch to view
3. All data (inventory, transactions, reports) updates to reflect the selected branch

## Branch Reports

Reports can be filtered by branch:
1. Navigate to **Reports**
2. Use the **Branch** filter
3. View performance for a specific branch or compare across branches

## Editing a Branch

1. Navigate to **Admin > Branches**
2. Click the branch
3. Modify details
4. Click **Save**

## Deactivating a Branch

1. Open the branch
2. Click **Deactivate**
3. The branch is hidden but data is preserved
4. Staff assigned to the branch should be reassigned
