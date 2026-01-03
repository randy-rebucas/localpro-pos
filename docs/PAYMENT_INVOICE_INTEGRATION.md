# Payment and Invoice Model Integration

This document describes the integration of the Payment and Invoice models into the POS system.

## Overview

The Payment and Invoice models were available in the codebase but not integrated into the transaction flow. This integration adds full support for:
- Detailed payment tracking with Payment model
- B2B invoicing with Invoice model
- Multiple payment methods per transaction (split payments)
- Automatic payment record creation from transactions
- Payment refund tracking

## Payment Model Integration

### API Endpoints

#### GET `/api/payments`
List payments with filtering options:
- `status` - Filter by payment status (pending, completed, failed, refunded)
- `method` - Filter by payment method (cash, card, digital, check, other)
- `transactionId` - Filter by transaction ID
- `limit` - Number of results per page (default: 50)
- `page` - Page number (default: 1)

#### POST `/api/payments`
Create a new payment record:
```json
{
  "transactionId": "transaction_id",
  "method": "card",
  "amount": 100.00,
  "details": {
    "cardLast4": "1234",
    "cardType": "Visa",
    "provider": "stripe",
    "transactionId": "stripe_txn_id"
  }
}
```

#### POST `/api/payments/[id]/refund`
Refund a payment:
```json
{
  "refundReason": "Customer request"
}
```

### Automatic Payment Record Creation

When creating a transaction, payment records are automatically created unless `createPaymentRecord: false` is specified in the request body.

**Single Payment:**
```json
{
  "items": [...],
  "paymentMethod": "card",
  "paymentProvider": "stripe",
  "cardLast4": "1234"
}
```

**Multiple Payments (Split Payments):**
```json
{
  "items": [...],
  "payments": [
    {
      "method": "cash",
      "amount": 50.00,
      "cashReceived": 50.00,
      "change": 0
    },
    {
      "method": "card",
      "amount": 50.00,
      "provider": "stripe",
      "cardLast4": "1234"
    }
  ]
}
```

The payments array must sum to the transaction total (within 0.01 tolerance for rounding).

### Transaction Refund Integration

When a transaction is refunded, the system:
1. Creates a refund transaction record
2. Automatically creates a refund payment record linked to the original payment
3. Marks the original payment as refunded

## Invoice Model Integration

### API Endpoints

#### GET `/api/invoices`
List invoices with filtering:
- `status` - Filter by status (draft, sent, paid, overdue, cancelled)
- `customerId` - Filter by customer ID
- `overdue` - Filter for overdue invoices (status: sent/draft, dueDate < today)
- `limit` - Results per page (default: 50)
- `page` - Page number (default: 1)

#### POST `/api/invoices`
Create a new invoice:
```json
{
  "transactionId": "optional_transaction_id",
  "customerId": "customer_id",
  "items": [
    {
      "name": "Product Name",
      "quantity": 2,
      "price": 50.00,
      "subtotal": 100.00
    }
  ],
  "subtotal": 100.00,
  "taxAmount": 10.00,
  "total": 110.00,
  "dueDate": "2024-12-31",
  "paymentTerms": "Net 30",
  "notes": "Optional notes"
}
```

#### GET `/api/invoices/[id]`
Get invoice details with populated transaction and customer information.

#### PATCH `/api/invoices/[id]`
Update invoice:
```json
{
  "status": "sent",
  "notes": "Updated notes"
}
```

When status is set to "paid", the system automatically:
- Sets `paidAt` to current date
- Sets `paidAmount` to total (or provided amount)

#### POST `/api/invoices/from-transaction`
Convert an existing transaction to an invoice (B2B scenarios):
```json
{
  "transactionId": "transaction_id",
  "customerId": "customer_id",
  "dueDate": "2024-12-31",
  "paymentTerms": "Net 30",
  "notes": "Optional notes"
}
```

### Invoice Number Generation

Invoices are automatically assigned unique invoice numbers in the format:
`INV-YYYYMMDD-XXXXX` (e.g., `INV-20241118-00001`)

## Multiple Payment Methods

The transaction creation endpoint now supports multiple payment methods per transaction, enabling split payments.

### Features:
- Accept an array of payments instead of a single payment method
- Validate that payment amounts sum to transaction total
- Create multiple Payment records linked to the transaction
- Determine primary payment method for the transaction record (largest amount or first payment)
- Support all payment methods: cash, card, digital, check, other

### Example Use Cases:
1. **Partial Cash + Card**: Customer pays $50 cash and $50 card
2. **Multiple Cards**: Split payment across two credit cards
3. **Mixed Methods**: Cash + digital wallet + check

### Backward Compatibility:
- Existing single payment method requests continue to work unchanged
- If `payments` array is not provided, system uses the `paymentMethod` field as before

## Audit Logging

All payment and invoice operations are logged with audit actions:
- `PAYMENT_CREATE`
- `PAYMENT_REFUND`
- `INVOICE_CREATE`
- `INVOICE_UPDATE`
- `INVOICE_SEND`
- `INVOICE_MARK_PAID`

## Error Handling

- Payment record creation failures don't block transaction creation (optional feature)
- Validation errors return appropriate HTTP status codes (400, 404, etc.)
- Refund operations validate payment status before processing

## Security

- All endpoints require tenant access validation
- Payment/invoice data is scoped to tenant
- Audit logs track all changes with user and timestamp information
