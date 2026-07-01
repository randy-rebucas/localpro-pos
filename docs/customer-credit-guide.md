# Customer Credit — Quick Guide

A simple step-by-step reference for the most common on-account workflows.

---

## Step 1 — Enable the feature (Owner)

1. Go to **Settings**
2. Turn on **Customer Management**
3. Turn on **On-account sales**

> Both switches must be on before on-account options appear anywhere in the app.

---

## Step 2 — Set a customer's credit limit (Admin)

1. Go to **Admin > Customers**
2. Open a customer (create or edit)
3. Enter a **Credit limit** (e.g. `500`) — leave blank for no cap
4. Save

---

## Step 3 — Sell on account at the POS (Cashier)

1. Add items to the cart
2. Open the **Customer** panel → search and select the customer
3. Check the **Balance due** and **Credit limit** shown in the panel
4. Tap **Pay** → choose **On account**
   - For a split: enter a partial amount under **On account**, pay the rest with cash/card
5. Complete checkout — the on-account amount is added to the customer's **Balance due**

> **On account** only appears when a customer is attached to the sale.

---

## Step 4 — Collect payment from the customer (Manager / Cashier)

1. Go to **Admin > Customers**
2. Find the customer — the **Balance due** column shows what they owe
3. Click **Record payment**
4. Enter the **Amount** (can be partial)
5. Select the **Payment method** (cash, card, digital, check, or other)
6. Add optional **Notes**
7. Submit — balance decreases immediately

Repeat until **Balance due** reaches $0.00.

---

## Step 5 — Handle a credit limit block at checkout (Cashier)

If checkout fails with *"Sale would exceed this customer's credit limit"*:

| Option | What to do |
|--------|-----------|
| **Partial on account** | Split the payment — put only part on account |
| **Pay in full now** | Switch to cash or card for the whole amount |
| **Raise the limit** | Ask a manager to increase the credit limit in Admin |
| **Cancel** | Remove the on-account payment and void the sale |

---

## Step 6 — Refund an on-account sale (Manager)

1. Open the original transaction in **Transactions** (or POS refund flow)
2. Start a refund and enter the amount
3. Confirm — the system automatically credits back the proportional on-account share

**Example:** $100 sale ($40 on account, $60 cash) → $50 refund → $20 credited back to balance.

---

## Quick-reference cheat sheet

| Task | Where |
|------|-------|
| Enable on-account | Settings |
| Set credit limit | Admin > Customers → edit customer |
| Sell on account | POS → Customer panel → Pay → On account |
| Collect payment | Admin > Customers → Record payment |
| View balance history | Admin > Customers → Record payment modal → Recent payments |
| Refund on-account sale | Transactions → refund flow |

---

## Common problems

| Problem | Fix |
|---------|-----|
| "On account" missing at POS | Enable on-account sales in Settings and attach a customer |
| Checkout blocked by credit limit | Split payment, pay in full, or raise the limit |
| Can't record a payment | Check on-account is enabled; amount must be ≤ balance due |
| Balance looks wrong after refund | Only the on-account share is credited back — this is expected |
