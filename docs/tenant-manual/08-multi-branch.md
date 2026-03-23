# 8. Multi-Branch Setup

**Requires:** Business or Enterprise plan with `enableMultiBranch: true`

## Overview

Multi-branch allows a single tenant to manage multiple physical store locations. Each branch maintains its own inventory and transactions while sharing products, customers, and settings.

## Data Isolation Model

| Data Type | Scope | Description |
|-----------|-------|-------------|
| **Products** | Tenant-wide | Product catalog is shared across all branches |
| **Categories** | Tenant-wide | Category structure is global |
| **Customers** | Tenant-wide | Customer database is shared |
| **Discounts** | Tenant-wide | Discount codes work at all branches |
| **Settings** | Tenant-wide | Core settings apply to all branches |
| **Stock Levels** | Per-branch | Each branch has its own inventory |
| **Transactions** | Per-branch | Sales are recorded per branch |
| **Cash Drawer** | Per-branch | Each branch has its own drawer sessions |
| **Bookings** | Per-branch | Appointments are branch-specific |
| **Users** | Per-branch assignment | Users are assigned to specific branches |
| **Attendance** | Per-branch | Clock in/out is branch-specific |

## Adding a Branch

1. Navigate to **Admin > Branches**
2. Click **Add Branch**
3. Fill in:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Branch display name |
| **Address** | Yes | Physical location |
| **Phone** | No | Branch contact number |
| **Email** | No | Branch contact email |
| **Manager** | No | Assigned branch manager |

4. Click **Save**

The branch is now active. Products are immediately available but stock starts at 0 — you'll need to add initial stock.

## Initial Stock Setup

After creating a branch:

1. Navigate to **Inventory** (switch to the new branch)
2. For each product, click **Restock** or use **Bulk Restock**
3. Enter the initial stock quantities
4. These are recorded as "Restock" movements

Or use **Stock Transfer** from an existing branch.

## User Assignment

Users must be assigned to a branch:

1. Navigate to **Admin > Users**
2. Edit the user
3. Set their **Branch**
4. Click **Save**

### Branch Access Rules

| Role | Branch Access |
|------|--------------|
| **Viewer** | Only their assigned branch |
| **Cashier** | Only their assigned branch |
| **Manager** | Their assigned branch (can view others if permitted) |
| **Admin** | All branches |
| **Owner** | All branches |

## Branch Switching

Admin and Owner users can switch between branches:

1. Click the **branch selector** in the navigation bar
2. Select the target branch
3. All data refreshes to show the selected branch's data

## Stock Transfers

Move inventory between branches:

### Creating a Transfer

1. Navigate to **Inventory**
2. Click **Transfer Stock**
3. Select **Source Branch** and **Destination Branch**
4. Add products and quantities
5. Add notes (e.g., delivery date, reason)
6. Click **Initiate Transfer**

### Transfer Workflow

```
Initiated → In Transit → Received
              ↓              ↓
     Source stock      Destination stock
      reduced           increased
```

### Transfer Records

Both branches see the transfer in their stock movement history:
- Source: "Transfer Out" movement (stock decrease)
- Destination: "Transfer In" movement (stock increase)

## Branch Reports

Reports can be filtered and compared:

1. Navigate to **Reports**
2. Use the **Branch** filter to:
   - View a single branch's performance
   - Compare branches side by side
3. **All Branches** view shows aggregate totals

### Key Branch Metrics

| Metric | Description |
|--------|-------------|
| Revenue per branch | Total sales by location |
| Stock value per branch | Inventory value at each location |
| Staff per branch | Headcount and attendance |
| Transaction volume | Sales count by location |

## Branch Configuration

Each branch inherits the tenant's global settings but can have:
- Its own business hours (via special hours)
- Its own staff and manager
- Its own cash drawer sessions
- Its own booking calendar

## Deactivating a Branch

1. Navigate to **Admin > Branches**
2. Click the branch
3. Click **Deactivate**
4. Effects:
   - Branch is hidden from selection
   - Data is preserved
   - Users assigned to this branch cannot log in
   - Reassign users before deactivating

## Limits

The number of branches is limited by your subscription plan:
- **Starter:** 1 branch
- **Pro:** Check plan details
- **Business:** Multiple (check plan)
- **Enterprise:** Unlimited (-1)

Attempting to create a branch beyond your limit shows: `"Subscription limit exceeded for maxBranches"`
