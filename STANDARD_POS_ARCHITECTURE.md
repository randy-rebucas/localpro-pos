# Standard POS Architecture (Baseline)

## Overview

This document defines the **Universal POS Architecture Baseline** that all businesses—laundry, retail, food, services—must conform to. This ensures consistency, maintainability, and scalability across all business types while allowing for industry-specific customizations.

## Core Principle

**All businesses use the same base schema.** Industry-specific features are implemented as extensions or configurations on top of this universal foundation.

---

## Universal POS Objects

### 1. Business Profile

**Purpose**: Core business identity and configuration

**Schema Requirements**:
- **Unique Identifier**: `slug` (URL-friendly identifier)
- **Name**: Business/company name
- **Domain Configuration**: Custom domain or subdomain
- **Settings**: Comprehensive configuration object
  - Currency & Localization
  - Branding (logo, colors, themes)
  - Contact Information
  - Business Type (retail, restaurant, service, laundry, etc.)
  - Tax Configuration
  - Feature Flags
  - Hardware Configuration
  - Business Hours & Holidays
- **Status**: Active/Inactive flag
- **Timestamps**: Created/Updated timestamps

**Current Implementation**: `models/Tenant.ts`
- ✅ Fully implemented
- ✅ Supports multi-tenant architecture
- ✅ Comprehensive settings structure

**API Endpoints**: `/api/tenants/*`

---

### 2. Outlet / Branch

**Purpose**: Physical or logical locations where business operates

**Schema Requirements**:
- **Tenant Reference**: Links to Business Profile
- **Name**: Branch/outlet name
- **Code**: Unique identifier within tenant (e.g., "BR001")
- **Address**: Physical location details
  - Street, City, State, ZIP, Country
- **Contact**: Phone, Email
- **Manager**: Reference to Staff member
- **Status**: Active/Inactive flag
- **Timestamps**: Created/Updated timestamps

**Current Implementation**: `models/Branch.ts`
- ✅ Fully implemented
- ✅ Supports multi-branch operations
- ✅ Manager assignment capability

**API Endpoints**: `/api/branches/*`

---

### 3. Products / Services

**Purpose**: Items or services sold by the business

**Schema Requirements**:
- **Tenant Reference**: Links to Business Profile
- **Name**: Product/service name
- **Description**: Optional details
- **Type**: `regular` | `bundle` | `service`
- **Price**: Base price (required)
- **SKU**: Stock Keeping Unit (optional, unique within tenant)
- **Category**: Reference to Category
- **Image**: Product image URL
- **Inventory Tracking**:
  - `trackInventory`: Boolean flag
  - `stock`: Master stock level
  - `branchStock`: Branch-specific stock levels
  - `variations`: Product variations (size, color, type) with individual stock
  - `allowOutOfStockSales`: Allow sales when stock is zero/negative
  - `lowStockThreshold`: Alert threshold
- **Display**: Pinned status for POS display
- **Timestamps**: Created/Updated timestamps

**Current Implementation**: `models/Product.ts`
- ✅ Fully implemented
- ✅ Supports products, bundles, and services
- ✅ Multi-branch inventory tracking
- ✅ Product variations support
- ✅ Flexible inventory control

**Related Models**:
- `models/ProductBundle.ts` - Bundle definitions
- `models/Category.ts` - Product categorization

**API Endpoints**: `/api/products/*`, `/api/bundles/*`, `/api/categories/*`

---

### 4. Pricing Rules

**Purpose**: Rules that modify product prices (discounts, promotions, tax)

**Schema Requirements**:

#### 4.1 Discounts
- **Tenant Reference**: Links to Business Profile
- **Code**: Unique discount code
- **Name/Description**: Human-readable labels
- **Type**: `percentage` | `fixed`
- **Value**: Discount amount or percentage
- **Constraints**:
  - `minPurchaseAmount`: Minimum order value
  - `maxDiscountAmount`: Maximum discount cap (for percentage)
- **Validity**: Start/End dates
- **Usage Limits**: Total usage count and limit
- **Status**: Active/Inactive flag
- **Timestamps**: Created/Updated timestamps

#### 4.2 Tax Rules
- **Tenant Reference**: Links to Business Profile
- **Name**: Tax rule name (e.g., "VAT", "GST", "Sales Tax")
- **Rate**: Tax percentage (0-100)
- **Label**: Display label
- **Scope**: Applies to `all` | `products` | `services` | `categories`
- **Targets**: Specific category/product IDs
- **Regional**: Country/State/City/ZIP targeting
- **Priority**: Rule application order
- **Status**: Active/Inactive flag

**Current Implementation**:
- ✅ `models/Discount.ts` - Discount codes
- ✅ `models/Tenant.ts` - Tax rules in settings
- ⚠️ Tax rules embedded in Tenant settings (consider separate model for complex scenarios)

**API Endpoints**: `/api/discounts/*`, `/api/discounts/validate/*`

---

### 5. Orders / Tickets

**Purpose**: Sales transactions/orders

**Schema Requirements**:
- **Tenant Reference**: Links to Business Profile
- **Branch Reference**: Optional branch/location
- **Items**: Array of order items
  - Product/Service reference
  - Product name (snapshot)
  - Price (snapshot at time of sale)
  - Quantity
  - Subtotal
  - Variation details (if applicable)
- **Pricing**:
  - `subtotal`: Total before discounts/tax
  - `discountCode`: Applied discount code
  - `discountAmount`: Discount value
  - `taxAmount`: Calculated tax
  - `total`: Final amount
- **Payment**:
  - `paymentMethod`: `cash` | `card` | `digital`
  - `cashReceived`: Amount received (for cash)
  - `change`: Change given (for cash)
- **Status**: `completed` | `cancelled` | `refunded`
- **Staff**: Reference to User who processed
- **Receipt Number**: Unique receipt identifier
- **Notes**: Optional transaction notes
- **Timestamps**: Created/Updated timestamps

**Current Implementation**: `models/Transaction.ts`
- ✅ Fully implemented as Orders/Tickets
- ✅ Supports multiple payment methods
- ✅ Discount application
- ✅ Receipt number generation
- ⚠️ Tax calculation embedded in transaction logic (should reference Pricing Rules)

**API Endpoints**: `/api/transactions/*`

---

### 6. Payments

**Purpose**: Payment processing and tracking

**Schema Requirements**:
- **Transaction Reference**: Links to Order/Ticket
- **Method**: `cash` | `card` | `digital` | `check` | `other`
- **Amount**: Payment amount
- **Status**: `pending` | `completed` | `failed` | `refunded`
- **Details**: Payment-specific metadata
  - Card: Last 4 digits, card type
  - Digital: Transaction ID, provider
  - Cash: Received amount, change
- **Processed By**: Staff reference
- **Processed At**: Timestamp
- **Timestamps**: Created/Updated timestamps

**Current Implementation**:
- ✅ Payment data embedded in `models/Transaction.ts`
- ⚠️ No separate Payment model (consider for complex payment scenarios)
- ✅ Supports cash, card, digital methods

**API Endpoints**: Embedded in `/api/transactions/*`

---

### 7. Invoices / Receipts

**Purpose**: Official documents for transactions

**Schema Requirements**:

#### 7.1 Receipts
- **Transaction Reference**: Links to Order/Ticket
- **Receipt Number**: Unique identifier (format: REC-YYYYMMDD-XXXXX)
- **Type**: `receipt` | `invoice`
- **Content**: Receipt data (items, totals, business info)
- **Template**: Receipt template used
- **Generated At**: Timestamp
- **Printed**: Print status and timestamp

#### 7.2 Invoices
- **Invoice Number**: Unique identifier
- **Customer**: Customer information (if applicable)
- **Due Date**: Payment due date
- **Status**: `draft` | `sent` | `paid` | `overdue` | `cancelled`
- **Payment Terms**: Terms and conditions

**Current Implementation**:
- ✅ Receipt generation in `lib/receipt.ts`
- ✅ Receipt number generation
- ✅ Receipt templates in Tenant settings
- ✅ Receipt printing via `lib/hardware/receipt-printer.ts`
- ⚠️ No separate Invoice model (receipts serve dual purpose)
- ⚠️ Customer information not linked (future enhancement)

**API Endpoints**: Receipt generation embedded in transaction flow

---

### 8. Staff & Roles

**Purpose**: User accounts and permissions

**Schema Requirements**:
- **Tenant Reference**: Links to Business Profile
- **Email**: Unique email address (unique within tenant)
- **Password**: Hashed password
- **Name**: Full name
- **Role**: `owner` | `admin` | `manager` | `cashier` | `viewer`
- **PIN**: Hashed PIN for quick login
- **QR Token**: Unique token for QR code login
- **Branch Assignment**: Optional branch assignment
- **Status**: Active/Inactive flag
- **Last Login**: Last login timestamp
- **Timestamps**: Created/Updated timestamps

**Current Implementation**: `models/User.ts`
- ✅ Fully implemented
- ✅ Role-based access control
- ✅ Multiple authentication methods (email/password, PIN, QR)
- ✅ Tenant-scoped users
- ⚠️ Branch assignment not in model (can be added if needed)

**API Endpoints**: `/api/users/*`, `/api/auth/*`

---

### 9. Reports & Logs

**Purpose**: Audit trails, analytics, and business intelligence

**Schema Requirements**:

#### 9.1 Audit Logs
- **Tenant Reference**: Links to Business Profile
- **User Reference**: Optional user who performed action
- **Action**: Action type (CREATE, UPDATE, DELETE, etc.)
- **Entity Type**: Type of entity affected
- **Entity ID**: ID of affected entity
- **Changes**: Before/after state or change details
- **Metadata**: IP address, user agent, additional context
- **Timestamp**: When action occurred

#### 9.2 Reports
- **Tenant Reference**: Links to Business Profile
- **Report Type**: Sales, Inventory, Staff, etc.
- **Date Range**: Start/End dates
- **Filters**: Applied filters (branch, product, staff, etc.)
- **Data**: Report results
- **Generated By**: User reference
- **Generated At**: Timestamp

**Current Implementation**:
- ✅ `models/AuditLog.ts` - Comprehensive audit logging
- ✅ Audit logging integrated in API routes
- ⚠️ Reports generated on-demand (no persistent Report model)
- ✅ Report endpoints in `/api/reports/*`

**API Endpoints**: `/api/audit-logs/*`, `/api/reports/*`

---

## Data Relationships

```
Business Profile (Tenant)
├── Outlets/Branches (1:N)
├── Products/Services (1:N)
├── Pricing Rules (1:N)
│   ├── Discounts
│   └── Tax Rules
├── Orders/Tickets (1:N)
│   └── Payments (1:1 or 1:N)
│   └── Receipts/Invoices (1:1)
├── Staff & Roles (1:N)
└── Reports & Logs (1:N)
```

---

## Universal Constraints

### 1. Tenant Isolation
- All objects must reference `tenantId`
- All queries must be tenant-scoped
- Unique constraints are tenant-scoped (e.g., SKU uniqueness per tenant)

### 2. Timestamps
- All objects include `createdAt` and `updatedAt`
- Use MongoDB/Mongoose timestamps

### 3. Soft Deletes
- Use `isActive` flag instead of hard deletes where appropriate
- Maintain data integrity for historical records

### 4. Audit Trail
- Critical operations logged to AuditLog
- Include user, action, entity, and changes

### 5. Data Snapshotting
- Transaction items store product name/price at time of sale
- Prevents issues with product updates affecting historical records

---

## Industry-Specific Extensions

While all businesses use the same base schema, industry-specific features are implemented as:

1. **Feature Flags**: Enable/disable features per business type
   - Example: `enableBookingScheduling` for service businesses
   - Example: `enableInventory` for retail businesses

2. **Product Types**: Use `productType` field
   - `regular`: Standard products
   - `bundle`: Product bundles
   - `service`: Services (laundry, appointments, etc.)

3. **Custom Fields**: Extend models with industry-specific metadata
   - Example: Service duration, appointment slots
   - Example: Laundry service types, pickup/delivery

4. **Business Type Configuration**: Use `businessType` in Tenant settings
   - Drives UI customization
   - Enables/disables relevant features

---

## Implementation Status

### ✅ Fully Implemented
- Business Profile (Tenant)
- Outlet/Branch
- Products/Services
- Discounts (Pricing Rules)
- Orders/Tickets (Transactions)
- Payments (embedded)
- Receipts (generation)
- Staff & Roles (Users)
- Audit Logs

### ⚠️ Partially Implemented / Considerations
- **Tax Rules**: Embedded in Tenant settings; consider separate model for complex scenarios
- **Invoices**: Receipts serve dual purpose; may need separate Invoice model for B2B
- **Payments**: Embedded in Transactions; consider separate model for complex payment flows
- **Reports**: Generated on-demand; consider persistent Report model for scheduled reports
- **Customer Management**: Not in baseline; may be needed for some business types

### 🔄 Future Enhancements
- Separate Payment model for complex payment scenarios
- Invoice model for B2B transactions
- Customer model for customer relationship management
- Advanced pricing rules (tiered pricing, volume discounts, etc.)
- Scheduled reports and report templates

---

## API Standards

All API endpoints follow these conventions:

1. **Tenant Scoping**: All endpoints require tenant identification
2. **Authentication**: JWT-based authentication required
3. **Authorization**: Role-based access control
4. **Validation**: Input validation with translated error messages
5. **Audit Logging**: Critical operations logged
6. **Error Handling**: Consistent error response format
7. **Pagination**: List endpoints support pagination
8. **Filtering**: Support for common filters (date range, status, etc.)

---

## Migration Path

For existing implementations or new business types:

1. **Map to Universal Objects**: Identify which objects map to which universal objects
2. **Fill Gaps**: Implement missing universal objects
3. **Extend for Industry**: Add industry-specific fields/features
4. **Validate**: Ensure all universal objects are present and conform to schema
5. **Test**: Verify tenant isolation, audit logging, and data integrity

---

## Conclusion

This Standard POS Architecture Baseline ensures that all businesses—regardless of industry—use a consistent, well-defined schema. This foundation enables:

- **Consistency**: Same data model across all business types
- **Maintainability**: Easier to maintain and extend
- **Scalability**: Supports multi-tenant, multi-branch operations
- **Flexibility**: Industry-specific features built on solid foundation
- **Auditability**: Comprehensive logging and tracking
- **Interoperability**: Standard APIs and data structures

All future development must conform to this baseline while allowing for industry-specific extensions through configuration and feature flags.
