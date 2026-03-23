# 9. Multi-Currency Setup

**Requires:** Business or Enterprise plan

## Overview

Multi-currency allows your store to display prices in multiple currencies alongside your base currency. Useful for tourist areas or international businesses.

## Enabling Multi-Currency

1. Navigate to **Settings > Multi-Currency** or **Admin > Multi-Currency**
2. Toggle **Enable Multi-Currency** to ON
3. Click **Save**

## Configuration

### Base Currency

Your base currency is set in **Settings > General** (e.g., PHP). All prices are stored in the base currency. Other currencies are displayed as conversions.

### Adding Display Currencies

1. Click **Add Currency**
2. Enter the currency code (e.g., `USD`, `EUR`, `JPY`, `GBP`)
3. Set the exchange rate from your base currency
4. Click **Save**

### Exchange Rate Examples (PHP base)

| Currency | Code | Rate | Meaning |
|----------|------|------|---------|
| US Dollar | USD | 0.018 | 1 PHP = 0.018 USD |
| Euro | EUR | 0.016 | 1 PHP = 0.016 EUR |
| Japanese Yen | JPY | 2.7 | 1 PHP = 2.7 JPY |

### Exchange Rate Source

| Source | Description |
|--------|-------------|
| **Manual** | You enter and update rates yourself |
| **API** | Rates update automatically from an external service |

For API-based rates:
1. Set **Exchange Rate Source** to `API`
2. Enter your **API Key** (from your exchange rate provider)
3. Rates refresh automatically
4. `lastUpdated` shows when rates were last fetched

## Display Settings

Navigate to **Admin > Multi-Currency** to configure display:

| Setting | Description |
|---------|-------------|
| **Display Currencies** | Which currencies to show alongside the base |
| **Show on POS** | Display converted prices on POS screen |
| **Show on Receipts** | Include conversions on printed receipts |
| **Decimal Places** | Per-currency decimal settings |

## How It Works

### In the POS

When multi-currency is enabled:
- Product prices show in the base currency (primary)
- Below each price, converted amounts appear in display currencies
- Example: `₱1,120.00 (~$20.16 USD, ~€17.92 EUR)`

### On Receipts

The receipt shows:
- All totals in the base currency (official amount)
- Optional converted total in display currencies
- Exchange rate used (for reference)

### For Transactions

All transactions are **always recorded in the base currency**. Display currencies are informational only — they don't affect calculations, reports, or tax computations.

## Updating Exchange Rates

### Manual Update

1. Navigate to **Admin > Multi-Currency**
2. Click **Edit** next to a currency
3. Update the exchange rate
4. Click **Save**

### API Auto-Update

If using the API source, rates update on a schedule. You can force a refresh:
1. Navigate to **Admin > Multi-Currency**
2. Click **Refresh Rates**

## Best Practices

1. **Update rates regularly** — Stale rates can mislead customers
2. **Round display amounts** — Use appropriate decimal places per currency
3. **Clarify on receipts** — Note that converted amounts are approximate
4. **Post exchange rates** — Display current rates visibly in-store
5. **Base currency is authoritative** — All calculations use the base currency

## Limitations

- Transactions are always in the base currency
- Payment must be in the base currency (or converted at point of sale)
- Tax calculations use base currency amounts only
- Reports are in base currency only
