# LocalPro POS - Role Quick Reference Cards

Print these cards and hand them to staff based on their assigned role.

---

## VIEWER

**Access Level**: Read-only

**What you can do:**
- View the dashboard
- Browse products and categories
- View transaction history
- View your own attendance records

**What you cannot do:**
- Process sales or refunds
- Modify any data
- Access reports or admin features

---

## CASHIER

**Access Level**: Transaction Processing

**Your daily tasks:**
1. Clock in at shift start
2. Open cash drawer (count and enter opening amount)
3. Process customer sales via POS
4. Apply discounts and promo codes
5. Handle refunds when needed
6. Save/load carts for customers
7. Manage bookings (if enabled)
8. Close cash drawer at shift end (count and enter closing amount)
9. Clock out

**Key screens:**
| Screen | What For |
|--------|----------|
| **POS** | Ring up sales, scan items, process payments |
| **Transactions** | View past transactions, process refunds |
| **Cash Drawer** | Open/close drawer, track cash |
| **Bookings** | View and manage appointments |
| **Attendance** | Clock in/out, track your hours |
| **Profile** | Update your info, change password |

**Discount quick guide:**
- Regular promo: Enter code at checkout
- Senior citizen: Select "Senior" category, verify ID (20% off + VAT exempt)
- PWD: Select "PWD" category, verify ID (20% off + VAT exempt)

**Remember:**
- Always count cash before opening and closing the drawer
- Never delete transactions - use void or refund instead
- Verify ID for senior/PWD discounts
- Print/email receipts for every sale

---

## MANAGER

**Access Level**: Full Management (includes all Cashier tasks)

**Additional responsibilities:**

### Products & Inventory
- Add, edit, and remove products
- Manage categories and bundles
- Monitor stock levels and low-stock alerts
- Record stock purchases, adjustments, and transfers
- Set product-specific low stock thresholds

### Staff & Operations
- View all staff attendance records
- Manage employee schedules and bookings
- Track business expenses
- Create and manage discount codes

### Reporting
- View all reports (Sales, Products, VAT, P&L, Cash Drawer)
- Export Sales Journal to CSV/Excel/PDF
- Monitor daily, weekly, and monthly performance
- Review cash drawer discrepancies

**Key screens (in addition to Cashier screens):**
| Screen | What For |
|--------|----------|
| **Admin > Products** | Full product management |
| **Admin > Categories** | Organize products |
| **Admin > Bundles** | Create product packages |
| **Inventory** | Monitor and adjust stock |
| **Admin > Discounts** | Create promo codes |
| **Admin > Expenses** | Track business costs |
| **Admin > Bookings** | Manage appointments |
| **Admin > Attendance** | View all staff hours |
| **Reports** | All reports + export |

**Monthly tasks:**
- Export VAT report for BIR filing
- Export Sales Journal for record-keeping
- Review Profit & Loss statement
- Audit stock levels against physical count
- Review discount usage and expiration

---

## ADMIN

**Access Level**: Full System Configuration (includes all Manager tasks)

**Additional responsibilities:**

### User Management
- Create and deactivate user accounts
- Assign roles (viewer, cashier, manager, admin)
- Generate QR codes for quick login
- Reset user passwords

### System Configuration
- Configure business settings (currency, timezone, language)
- Set up tax rules (VAT rate, exempt categories)
- Manage branches/locations
- Configure receipt templates and branding
- Set up hardware (printer, scanner, cash drawer)
- Enable/disable features (inventory, bookings, discounts, etc.)
- Configure notification settings and templates

### Compliance & Security
- View audit logs (who did what, when, from where)
- Manage data backups (local and cloud)
- Configure data retention policies
- Manage subscription and billing

**Key screens (in addition to Manager screens):**
| Screen | What For |
|--------|----------|
| **Admin > Users** | Manage staff accounts |
| **Admin > Branches** | Manage store locations |
| **Admin > Tax Rules** | Configure VAT/tax |
| **Admin > Audit Logs** | Review system activity |
| **Admin > Backup & Reset** | Data backup/restore |
| **Admin > Hardware** | Printer/scanner setup |
| **Admin > Feature Flags** | Enable/disable features |
| **Admin > Advanced Branding** | Customize appearance |
| **Admin > Subscriptions** | Manage billing |
| **Settings** | All system settings |

---

## OWNER

**Access Level**: Full System Access (includes all Admin tasks)

**Additional capabilities:**
- Manage multiple tenants/organizations
- Create new tenant accounts
- Access cross-tenant data
- Highest privilege level - cannot be overridden

**Owner-only screens:**
| Screen | What For |
|--------|----------|
| **Admin > Tenants** | Create and manage organizations |

---

## Role Hierarchy Summary

```
Owner (Level 5)
  |
Admin (Level 4)
  |
Manager (Level 3)
  |
Cashier (Level 2)
  |
Viewer (Level 1)
```

Each higher role inherits all permissions from lower roles. For example, a Manager can do everything a Cashier can do, plus management tasks.

---

*For detailed procedures, see [STAFF_OPERATIONS_GUIDE.md](STAFF_OPERATIONS_GUIDE.md)*
