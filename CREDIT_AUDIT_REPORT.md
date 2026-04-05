# Credit / Pay-Later System Audit Report
**Date:** April 3, 2026  
**Objective:** Audit existing credit system and assess readiness for "pay-later" / accounts receivable (customer debt tracking)

---

## Executive Summary

The system currently has **two separate payment methods** that are conflated:
1. **Credit Wallet** (prepaid credits) — customer funds account first, then spends
2. **BNPL Provision** (partial) — tracks payment method but not debt/installments/due dates

**What's Missing:** A proper **Accounts Receivable / Pay-Later** system (`bnpl` payment method should track actual debt with due dates, payment status, and partial payment support).

**Risk Level:** 🔴 **CRITICAL** — System is not ready for production accounts receivable without schema and API changes.

---

## Current State Analysis

### 1. Credit Wallet System (Prepaid Model)

#### Models
- **Customer.creditBalance** — numeric balance (₱)
- **Credit** model — transaction log (`top_up`, `usage`, `refund`, `adjustment`)
  - Tracks: `type`, `amount`, `balanceBefore`, `balanceAfter`, `reason`, `transactionId`

#### Flow
```
Customer → adds ₱1000 credit → Customer.creditBalance = 1000
Customer → buys ₱500 item with "credit" payment → creditBalance = 500
  ↓
Credit record created: {type: 'usage', amount: 500, balanceBefore: 1000, balanceAfter: 500}
```

#### Current Scope
- ✅ Top-up / add credits (admin only)
- ✅ Use credits to pay (deduct from balance)
- ✅ Audit trail (Credit model)
- ❌ **No due dates, payment schedules, or receivable tracking**

---

### 2. BNPL / Pay-Later (Partial & Conflated)

#### Current State
- **UI**: Payment modal shows "Pay Later" button (maps to `bnpl` method)
- **Storage**: Transaction fields — `bnplInstallments`, `paymentProvider`, `paymentReference`
- **No Debt Tracking**: Just records "this was a BNPL transaction" — no outstanding balance, no installment schedule

#### What's Missing
| Need | Current State |
|------|---------------|
| Customer outstanding debt | ❌ Not tracked anywhere |
| Due date per transaction | ❌ Not stored |
| Payment status (pending/partial/overdue) | ❌ Not tracked |
| Installment schedule | ❌ Payment dates not recorded |
| Partial payment recording | ❌ No payment plan records |
| Aging analysis (30/60/90+ days) | ❌ No base data |
| Payment reminders | ❌ Can't be generated |

---

## Data Model Gaps

### 1. Customer Model (Current)
```typescript
interface ICustomer {
  creditBalance?: number;         // ✅ Prepaid wallet
  loyaltyPointsBalance?: number;  // ✅ Loyalty
  // ❌ MISSING for accounts receivable:
  // - totalOutstandingDebt
  // - creditLimit
  // - paymentTerms (net30, net60, etc.)
  // - creditStatus ('good', 'overdue', 'suspended')
}
```

### 2. Transaction Model (Current)
```typescript
interface ITransaction {
  paymentMethod: 'cash' | 'card' | ... | 'bnpl' | 'credit';
  bnplInstallments?: number;      // ✅ Installment count only
  // ❌ MISSING for accounts receivable:
  // - paymentStatus: 'pending' | 'partial' | 'paid' | 'overdue'
  // - dueDate: Date
  // - outstandingAmount: number
  // - paidAmount: number
  // - expectedPaymentDate: Date
}
```

### 3. Missing Models Entirely
```typescript
// ❌ No accounts receivable tracking:

// Option A: Extend Transaction with receivables fields
// Option B: Create separate AccountsReceivable model
interface IAccountsReceivable {
  tenantId: ObjectId;
  customerId: ObjectId;
  transactionId: ObjectId;
  originalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  dueDate: Date;
  paymentStatus: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  installmentPlan?: {
    installments: number;
    frequency: 'weekly' | 'biweekly' | 'monthly';
    schedule: Array<{ dueDate: Date; amount: number; paid: boolean; paidDate?: Date }>;
  };
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ❌ No payment records for receivables:
interface IPaymentPlan {
  tenantId: ObjectId;
  customerId: ObjectId;
  receivableIds: ObjectId[]; // Link to accounts receivable records
  totalAmount: number;
  totalPaid: number;
  paymentSchedule: Array<{
    dueDate: Date;
    amount: number;
    paidAmount: number;
    paidDate?: Date;
    status: 'pending' | 'paid' | 'overdue';
  }>;
}
```

---

## API & Business Logic Gaps

### 1. Transaction Creation (POST /api/transactions)

#### Current Behavior with `bnpl`
```typescript
// Payment method accepted: ✅
const validPaymentMethods = ['cash', 'card', 'digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'credit'];

// What happens with bnpl?
const transaction = await Transaction.create({
  paymentMethod: 'bnpl',
  bnplInstallments: 6,
  paymentProvider: 'BillEase',  // Provider name only
  paymentReference: 'BLE-12345', // External reference only
  status: 'completed',            // ⚠️ IMMEDIATELY MARKED COMPLETE
  // ❌ NO: dueDate, paymentStatus, outstandingAmount
});
```

#### What Should Happen
```typescript
// For true accounts receivable (pay-later without external BNPL provider):
const transaction = await Transaction.create({
  paymentMethod: 'bnpl', // or new method 'accounts_receivable'
  paymentProvider: 'on-account',
  status: 'pending',  // ⚠️ NOT completed until payment received
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Net 30
  outstandingAmount: total,
  paidAmount: 0,
});

// Create accounts receivable record:
await AccountsReceivable.create({
  tenantId,
  customerId,
  transactionId: transaction._id,
  originalAmount: total,
  outstandingAmount: total,
  dueDate: transaction.dueDate,
  paymentStatus: 'pending',
});
```

### 2. Missing API Endpoints

| Endpoint | Purpose | Current Status |
|----------|---------|-----------------|
| `POST /api/customers/:id/receivables` | Create payment-on-account | ❌ Does not exist |
| `GET /api/customers/:id/receivables` | View customer's outstanding debt | ❌ Does not exist |
| `POST /api/receivables/:id/payment` | Record partial/full payment | ❌ Does not exist |
| `GET /api/receivables` (admin) | Aging analysis, total A/R | ❌ Does not exist |
| `PUT /api/receivables/:id` | Adjust terms, extend due date | ❌ Does not exist |
| `POST /api/receivables/:id/remind` | Send payment reminder | ❌ Does not exist |

### 3. Credit Handler (lib/credit-handler.ts)

#### Current Logic
```typescript
export async function deductCredits({
  tenantId, customerId, amount, transactionId, userId
}: CreditDeductionOptions): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  
  // Current: Only handles prepaid wallet deduction
  const currentBalance = customer.creditBalance || 0;
  if (currentBalance < amount) {
    return { success: false, error: 'Insufficient credits' };
  }
  
  // Deduct from balance
  const newBalance = currentBalance - amount;
  await Customer.updateOne(
    { _id: customerId },
    { $set: { creditBalance: newBalance } }
  );
  
  // ❌ MISSING: Support for debt/receivable creation on BNPL
}
```

---

## Payment Modal UI Analysis

### Current Implementation
```typescript
// In app/[tenant]/[lang]/page.tsx ~2290

const paymentMethods = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'bnpl', label: 'Pay Later' },      // ← This option
  { id: 'credit', label: 'Credits' },      // ← vs this (wallet)
];

// For BNPL:
{paymentMethod === 'bnpl' && (
  <div>
    <label>BNPL provider</label>
    <div className="grid grid-cols-3 gap-2">
      {(['BillEase', 'Akulaku', 'Atome', 'Kredivo', 'Tala', 'Other'] as const).map(p => (
        <button
          onClick={() => setPaymentProvider(paymentProvider === p ? '' : p)}
        >
          {p}
        </button>
      ))}
    </div>
    <label>Installments</label>
    {[1, 3, 6, 12].map(n => (
      <button onClick={() => setBnplInstallments(n)}>
        {n === 1 ? 'Full' : `${n}×`}
      </button>
    ))}
  </div>
)}
```

#### Issues
1. ⚠️ **Conflates two concepts**: BNPL providers (external) vs. on-account pay-later (internal)
2. ❌ **No due date selection** for on-account terms
3. ❌ **No indicator** if customer has credit limit exceeded
4. ❌ **No outstanding balance warning** for high-risk customers

---

## Validation Gaps

### lib/validation.ts
```typescript
const VALID_PAYMENT_METHODS = ['cash', 'card', 'digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'credit'];

// validateTransaction only checks:
// ✅ paymentMethod is valid
// ❌ Does NOT validate:
//   - Customer has credit limit remaining (if using accounts receivable)
//   - Due date is in future (if pay-later)
//   - Customer credit status is not 'suspended'
```

---

## Security & Audit Trail Gaps

### What's Being Logged
- ✅ Credit top-ups (audit log created)
- ✅ Credit deductions (Credit model transaction)

### What's NOT Being Logged
- ❌ Accounts receivable creation (when transaction marked for payment-on-account)
- ❌ Payment receipt against receivable (no payment plan tracking)
- ❌ Due date extensions or terms modifications
- ❌ Overdue status changes
- ❌ Credit limit approvals/denials

### Multi-Tenancy Risk
- ✅ All models enforce `tenantId` on create/read
- ⚠️ **Risk**: If accounts receivable feature is added without tenant filtering, cross-tenant debt leakage possible

---

## Functional Requirements Not Met

| Requirement | Current | Needed |
|-------------|---------|--------|
| Record customer purchases on account | ❌ Can mark BNPL but no tracking | ✅ Create receivable record with due date |
| Track outstanding debt per customer | ❌ Not tracked | ✅ Sum of all open receivables |
| Record partial payments | ❌ No payment plan support | ✅ Deduct amount, track balance |
| Show overdue status | ❌ No due date field | ✅ Mark receivable as overdue |
| Auto-calculate aging buckets | ❌ No data | ✅ 0-30, 30-60, 60-90, 90+ days |
| Send payment reminders | ❌ No due date trigger | ✅ Automation based on `dueDate` |
| Set credit limits per customer | ❌ Not supported | ✅ Add to Customer model |
| Block sales if limit exceeded | ❌ No validation | ✅ Check before transaction |
| Generate A/R reports | ❌ No receivables data | ✅ Admin dashboard |
| Payment write-offs (bad debt) | ❌ Not supported | ✅ Mark receivable as written off |

---

## Recommended Implementation Path

### Phase 1: Data Model (Foundation)
```typescript
// 1. Extend Customer model
interface ICustomer {
  creditLimit?: number;           // Max allowed outstanding debt
  creditStatus?: 'active' | 'suspended' | 'closed';
  paymentTerms?: 'net30' | 'net60' | 'net90' | 'immediate';
  totalOutstandingDebt?: number;  // Cached sum (or queried on-demand)
}

// 2. Create AccountsReceivable model
interface IAccountsReceivable {
  tenantId: ObjectId; customerId: ObjectId;
  transactionId: ObjectId;
  originalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  dueDate: Date;
  paymentStatus: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  notes?: string;
  createdAt: Date; updatedAt: Date;
}

// 3. Create PaymentRecord model (for tracking partial payments)
interface IPaymentRecord {
  tenantId: ObjectId;
  customerId: ObjectId;
  receivableId: ObjectId;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'check' | 'transfer';
  reference?: string;
  processedBy: ObjectId;
  processedAt: Date;
}
```

### Phase 2: API Routes (Business Logic)
- `POST /api/receivables` — Create on-account sale
- `GET /api/customers/:id/receivables` — View customer debt
- `POST /api/receivables/:id/payment` — Record payment
- `PUT /api/receivables/:id` — Update terms/status
- `GET /api/reports/receivables` — Aging analysis

### Phase 3: Transaction Controller (Integration)
- Modify `/api/transactions POST` to support `paymentStatus = 'pending'` for pay-later sales
- Add validation: check customer credit limit before allowing sale
- Create AccountsReceivable record after transaction created
- Add due date calculation based on customer's payment terms

### Phase 4: UI (User-facing)
- Payment modal: separate "Pay Later" from external BNPL providers
- Customer side panel: show outstanding balance & due dates
- Admin receivables page: aging buckets, payment tracking, reminders
- Transaction detail: show "payment pending" indicator for on-account sales

### Phase 5: Automations
- Overdue notification (emailer automation)
- Due date reminders (3/7 days before)
- Accounts receivable aging dashboard

---

## Risk Assessment

### Current Gaps Summary
| Category | Risk | Impact |
|----------|------|--------|
| **Data Model** | ⚠️ Medium | Can't track debt properly without schema |
| **APIs** | 🔴 Critical | No endpoints to record payments against receivables |
| **Validation** | ⚠️ Medium | Could approve sales to customers over credit limit |
| **Audit Trail** | ⚠️ Medium | Payment receipt history will be incomplete |
| **Multi-tenancy** | ⚠️ Medium | Risk of inter-tenant debt leakage if not carefully implemented |
| **Reporting** | 🔴 Critical | No A/R aging reports or collection analytics |

### Production Readiness: 🔴 **NOT READY**
- System can track BNPL **orders** but not **receivables**
- No way to record customer **payments** against open debt
- No credit control or **risk management** features
- Missing **audit trail** for regulatory compliance

---

## Recommendations

### Immediate (This Sprint)
1. ✅ Clarify with client: do they want:
   - Internal accounts receivable (to-be-paid-later by customer)?
   - External BNPL integration (partner handles payment)?
   - OR both?

2. ✅ Decide on implementation approach:
   - **Option A**: Extend existing `Transaction` model with debt fields
   - **Option B**: Create separate `AccountsReceivable` model (cleaner separation)

3. ✅ Define payment terms and credit policy:
   - Net 30/60/90?
   - Credit limits per customer or global policy?
   - Who approves credit? (superadmin, manager, automatic?)

### Short-term (Next Sprint)
1. Create `AccountsReceivable` model + indexes
2. Create `PaymentRecord` model for tracking partial payments
3. Extend `Customer` model with `creditLimit`, `creditStatus`, `paymentTerms`
4. Create payment-against-receivables endpoint: `POST /api/receivables/:id/payment`

### Medium-term
1. Modify transaction controller to create receivables on pay-later sales
2. Add credit limit validation to transaction route
3. Build admin pages: A/R dashboard, payment tracker, aging analysis
4. Add automations: overdue notifications, payment reminders

---

## File References

### Models
- [Customer.ts](models/Customer.ts) — Add `creditLimit`, `creditStatus`, `paymentTerms`
- [Credit.ts](models/Credit.ts) — Current prepaid model (keep separate from receivables)
- ❌ `AccountsReceivable.ts` — **TO CREATE**
- ❌ `PaymentRecord.ts` — **TO CREATE**

### API Routes
- [/api/transactions/route.ts](app/api/transactions/route.ts) — Add receivables creation logic
- [/api/customers/[id]/credits/route.ts](app/api/customers/[id]/credits/route.ts) — Prepaid credits (separate)
- ❌ `/api/receivables/route.ts` — **TO CREATE**
- ❌ `/api/receivables/[id]/payment/route.ts` — **TO CREATE**
- ❌ `/api/reports/receivables/route.ts` — **TO CREATE**

### UI
- [app/[tenant]/[lang]/page.tsx](app/[tenant]/[lang]/page.tsx) — Payment modal ~2290

### Lib
- [lib/credit-handler.ts](lib/credit-handler.ts) — Prepaid only (keep separate)
- [lib/validation.ts](lib/validation.ts) — Add credit limit validation

---

## Conclusion

The current system **treats pay-later like prepaid credits** (credits wallet model), but the client needs a true **accounts receivable** (on-account purchase with later payment) system.

**Key Distinction:**
- 💳 **Credit Wallet** (current): Customer funds → balance → spend
- 📋 **Accounts Receivable** (needed): Customer buys → owes → pays in installments/later

**Action:** Audit complete. Ready for implementation planning meeting with client.
