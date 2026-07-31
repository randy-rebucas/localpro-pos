# 16. Role Permission Matrix

This page is the authoritative feature-by-feature breakdown of what each role can do. See [13. Security & Access Control](./13-security.md) for the authentication and RBAC model this matrix implements.

**Last audited:** 2026-07-21 — every row below was checked against the actual `requireRole()`/`hasRole()` calls on its API route. Ten routes were missing or had incorrect role checks (product/category/tax-rule/expense/customer writes, manual transaction creation, cash-drawer and bookings reads, and an audit-log bug that locked out super_admin) — these were fixed in code so this table now reflects enforced behavior, not just intent.

## Roles

| Role | Level | Scope |
|------|:---:|-------|
| **Super Admin** | 6 | Platform-wide — no `tenantId`, manages all tenants via `/api/super-admin/*` |
| **Owner** | 5 | Tenant-wide — full control of one tenant |
| **Admin** | 4 | Tenant-wide — full config + user management |
| **Manager** | 3 | Branch operations — products, inventory, reports |
| **Cashier** | 2 | POS transactions + cash drawer |
| **Viewer** | 1 | Read-only |

Access is hierarchical: a route that requires `manager` also admits `admin`, `owner`, and `super_admin`. Users can only create accounts at a role **below their own level**.

## Feature Matrix

Legend: ✅ Full access · ➖ Limited/view-only · ❌ No access

| Feature Area | Super Admin | Owner | Admin | Manager | Cashier | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Platform** |||||||
| Manage all tenants (backups, plans, coupons, feature flags, impersonate) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Platform analytics & system health | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Tenant & Users** |||||||
| Create/edit tenant record | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Tenant settings & compliance docs | ✅ | ✅ | ✅ | ➖ | ❌ | ❌ |
| Manage staff accounts (create/edit) | ✅ | ✅ | ✅ | ➖ | ❌ | ❌ |
| Delete/deactivate staff accounts | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Branches | ✅ | ✅ | ✅ | ➖ | ❌ | ❌ |
| **Billing** |||||||
| Subscriptions & subscription plans | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Sales & POS** |||||||
| POS transactions | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Void / refund transactions | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Cash drawer sessions | ✅ | ✅ | ✅ | ✅ | ➖ (own session) | ❌ |
| Discounts | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Bookings | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Saved carts | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Catalog & Inventory** |||||||
| Products, categories, bundles, services | ✅ | ✅ | ✅ | ✅ | ➖ (view) | ➖ (view) |
| Inventory & stock movements | ✅ | ✅ | ✅ | ✅ | ❌ | ➖ (view) |
| Tax rules | ✅ | ✅ | ✅ | ➖ | ❌ | ❌ |
| **Customers** |||||||
| CRM / customers | ✅ | ✅ | ✅ | ✅ | ➖ (view/create) | ➖ (view) |
| Loyalty programs | ✅ | ✅ | ✅ | ✅ | ➖ (view) | ❌ |
| **Reports & Compliance** |||||||
| Sales journal, CAS reports | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Expenses & invoices | ✅ | ✅ | ✅ | ✅ | ❌ | ➖ (view) |
| Audit logs | ✅ | ✅ | ✅ | ➖ (view) | ❌ | ❌ |
| **Integrations** |||||||
| Shopify / WooCommerce / e-commerce sync | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Webhooks & hardware | ✅ | ✅ | ✅ | ➖ | ❌ | ❌ |
| **Mobile App** |||||||
| Mobile app login & companion access | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |

## Notes

- ➖ generally means the role can view or perform a narrow subset of the action (e.g. a cashier viewing but not editing a product, or managing only their own cash drawer session) — it is not a formal permission tier in code, just the practical effect of route-level role checks.
- There is no capability-based permission system (e.g. per-user toggleable permissions) — access is entirely determined by the six fixed roles above and enforced per API route.
- Super Admin is a platform role, not a tenant role: it has no `tenantId` and does not appear in a tenant's own staff list.
