# 1POS - Architecture & Database Schema Diagrams

## BIR Compliance Documentation | Visual System & Process Flowcharts

These Mermaid diagrams accompany [BIR_SYSTEM_OVERVIEW.md](./BIR_SYSTEM_OVERVIEW.md) and [BIR_PROCESS_FLOW.md](./BIR_PROCESS_FLOW.md) as the visual artifacts requested in the BIR accreditation Technical Metadata Package (system/process flowcharts, database schema diagram). They render natively on GitHub and most Markdown/Mermaid-aware viewers.

---

## 1. System Architecture

```mermaid
flowchart TB
    subgraph Client["Client Browser (React 19 / Next.js App Router)"]
        POS["POS Terminal"]
        Admin["Admin Panel"]
        Reports["Reports / Analytics"]
    end

    subgraph API["API Layer (Next.js Route Handlers, /api/*)"]
        Auth["Auth Middleware\n(JWT, RBAC)"]
        Biz["Business Logic\n(tax, discounts, receipts)"]
        Cron["Automations\n(node-cron)"]
    end

    subgraph Data["Data Layer (MongoDB / Mongoose)"]
        Tenant[("Tenant")]
        Transaction[("Transaction")]
        Product[("Product")]
        AuditLog[("AuditLog")]
        ZReading[("ZReading")]
        OfflineTx[("OfflineTransaction")]
    end

    subgraph External["External Systems"]
        Printer["Thermal / Network Printer\n(ESC/POS)"]
        Payment["Payment Gateways"]
        Backup["Scheduled Cloud Backups"]
    end

    POS --> Auth
    Admin --> Auth
    Reports --> Auth
    Auth --> Biz
    Biz --> Tenant
    Biz --> Transaction
    Biz --> Product
    Biz --> AuditLog
    Biz --> ZReading
    Cron --> Backup
    Cron --> ZReading
    POS -- "offline queue" --> OfflineTx
    OfflineTx -- "auto-resync on reconnect" --> Transaction
    Biz --> Printer
    Biz --> Payment
```

---

## 2. Sales / Checkout Process Flow (BIR-relevant path)

```mermaid
flowchart LR
    Start([Cashier adds items]) --> Discount{Discount applied?}
    Discount -- "SC/PWD" --> VATExempt["Mark VAT-exempt\n+ capture SC/PWD name & ID"]
    Discount -- "None/General" --> TaxCalc
    VATExempt --> TaxCalc["calculateTax()\nVATable / VAT-exempt / zero-rated split"]
    TaxCalc --> Commit["Create Transaction\n(DB session)"]
    Commit --> GT["Increment Grand Total\naccumulator ($inc, same session)"]
    Commit --> Receipt["Print Sales Invoice\n(Terminal SN, MIN, Invoice No, TIN, VAT breakdown)"]
    Commit --> AuditLog["Write AuditLog entry\n(transaction.create)"]
    Receipt --> End([Done])

    subgraph Void["Void / Refund (tamper-proof)"]
        VoidReq["Manager+ requests void/refund"] --> Check{"Already\nvoided/refunded?"}
        Check -- "Yes" --> Reject(["Rejected — no further edits"])
        Check -- "No" --> Apply["Status → cancelled/refunded"]
        Apply --> AuditLog2["Write AuditLog entry\n(transaction.cancel/refund)"]
    end
```

---

## 3. Offline Resilience Flow (Non-Volatile Memory requirement)

```mermaid
flowchart LR
    Sale["Sale at POS"] --> Online{Network available?}
    Online -- "Yes" --> Direct["POST /api/transactions"]
    Online -- "No" --> Queue["Queue in IndexedDB\n(OfflineTransaction)"]
    Queue --> Reconnect{Reconnected?}
    Reconnect -- "Yes" --> Sync["syncOfflineTransactions()"]
    Sync --> Direct
    Direct --> DB[("MongoDB\nTransaction collection")]
```

---

## 4. End-of-Day Reading Flow (X-Reading / Z-Reading)

```mermaid
flowchart TB
    Any["Any time during business day"] --> X["GET /api/reports/x-reading\n(repeatable, no reset)"]
    X --> XOut["Shift summary:\ngross sales, VAT breakdown,\ncurrent Grand Total snapshot"]

    EOD["End of business day"] --> Z["POST /api/reports/z-reading"]
    Z --> Exists{"Z-Reading already\ngenerated for this date?"}
    Exists -- "Yes" --> Reprint["Return existing record\n(reprint, audit-logged)"]
    Exists -- "No" --> Aggregate["Aggregate day's completed\ntransactions"]
    Aggregate --> Snapshot["Snapshot beginningGT / endingGT\nfrom Tenant.grandTotalSales"]
    Snapshot --> Persist[("ZReading collection\n(unique per tenant+day)")]
    Persist --> AuditZ["Write AuditLog entry\n(z_reading.generate)"]
```

---

## 5. Database Schema (BIR-relevant collections)

```mermaid
erDiagram
    TENANT ||--o{ TRANSACTION : "has many"
    TENANT ||--o{ PRODUCT : "has many"
    TENANT ||--o{ ZREADING : "has many"
    TENANT ||--o{ AUDITLOG : "has many"
    TENANT ||--o{ USER : "has many"
    TENANT ||--o{ DEVICE : "has many"
    USER ||--o{ TRANSACTION : "processes"
    USER ||--o{ ZREADING : "generates"
    DEVICE ||--o{ TRANSACTION : "processes (snapshotted)"
    PRODUCT ||--o{ TRANSACTION : "sold in (line items)"
    TRANSACTION ||--o{ AUDITLOG : "referenced by"

    TENANT {
        ObjectId _id
        string slug
        string birTin
        string birPtuNumber
        string birMinNumber
        string birTerminalSN
        string birAccreditationNo
        number grandTotalSales "non-resettable, all-time"
        number grandTotalTransactionCount "non-resettable, all-time"
    }
    TRANSACTION {
        ObjectId _id
        ObjectId tenantId
        ObjectId userId "cashier"
        ObjectId deviceId "terminal that processed the sale"
        string terminalId "denormalized snapshot"
        string deviceSerialNumber "denormalized snapshot"
        string receiptNumber "sequential"
        number subtotal
        number discountAmount
        string discountCategory "senior/pwd/general/..."
        string scPwdName
        string scPwdId
        number taxAmount
        number taxExemptAmount
        number zeroRatedAmount
        number total
        string status "completed/cancelled/refunded"
        date createdAt
    }
    DEVICE {
        ObjectId _id
        ObjectId tenantId
        ObjectId branchId
        string label
        string serialNumber "unique per tenant"
        string terminalId "unique per tenant"
        string ptuNumber
        string ptuStatus "pending/approved"
        boolean isActive
    }
    PRODUCT {
        ObjectId _id
        ObjectId tenantId
        string name
        number price
        boolean taxExempt
        boolean zeroRated
    }
    ZREADING {
        ObjectId _id
        ObjectId tenantId
        date businessDate "unique per tenant+day"
        number beginningGT
        number endingGT
        number grossSales
        number vatAmount
        number vatExemptSales
        number zeroRatedSales
        ObjectId generatedBy
    }
    AUDITLOG {
        ObjectId _id
        ObjectId tenantId
        ObjectId userId
        string action
        string entityType
        string entityId
        object changes
        date createdAt "TTL: 90 days"
    }
    USER {
        ObjectId _id
        ObjectId tenantId
        string name
        string email
        string role
    }
```

> **Retention note**: `AuditLog` currently has a 90-day TTL index (`models/AuditLog.ts`). BIR generally expects longer retention for books of account (commonly cited as 10 years). If the accreditation review requires longer online retention, export periodically via `GET /api/audit-logs/export` (see [BIR_AUDIT_TRAIL.md](./BIR_AUDIT_TRAIL.md)) and archive off-platform, or extend the TTL — this is a policy decision, not something changed silently by this document.

---

*Diagrams generated from the current codebase (`models/`, `app/api/`, `lib/`) as of this document's authoring. Re-verify against source before submission if the schema changes.*
