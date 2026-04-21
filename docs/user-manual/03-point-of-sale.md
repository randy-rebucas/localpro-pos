# 3. Point of Sale (POS)

**Available to:** Cashier, Manager, Admin, Owner

The POS screen is the primary interface for processing sales transactions.

## POS Screen Layout

| Area | Description |
|------|-------------|
| **Product Grid / Search** | Left side — browse or search products |
| **Cart** | Right side — items added to the current sale |
| **Action Bar** | Bottom — payment, discount, hold, and clear buttons |

## Processing a Sale

### Step 1: Add Products to Cart

**By Search:**
1. Click the **search bar** at the top
2. Type the product name or SKU
3. Click the product from the results

**By Barcode Scanner:**
1. Ensure your barcode scanner is connected (see Settings > Hardware)
2. Scan the product barcode
3. The item is automatically added to the cart

**By Browsing:**
1. Browse products by category using the category tabs
2. Click any product tile to add it to the cart

**Product Variations:**
- If a product has variations (e.g., size, color), a selection dialog appears
- Choose the desired variation before adding to cart

### Step 2: Adjust Quantities

- Click the **+** or **-** buttons next to each cart item
- Or tap the quantity number to type a specific amount
- To remove an item, reduce quantity to 0 or click the **trash icon**

### Step 3: Apply Discounts

**Discount Code:**
1. Click **Apply Discount** in the cart area
2. Enter the discount/promo code
3. Click **Apply**
4. The discount appears as a line item showing the amount saved

**Manual Discount (Manager+ only):**
1. Click **Manual Discount**
2. Choose percentage or fixed amount
3. Enter the value
4. Click **Apply**

**Senior Citizen / PWD Discount:**
1. Click **SC/PWD Discount**
2. Enter the customer's SC/PWD ID number
3. The system applies the appropriate discount per RA 9994 / RA 10754
4. VAT-exempt status is automatically toggled

### Step 4: Select Customer (Optional)

1. Open the **customer** area at the top of the cart (e.g. **Select Customer**).
2. Search by name, email, or phone.
3. Pick a customer from the dropdown results.

Once attached:

- The sale is linked to that customer for **history** and **loyalty** (when the loyalty program is enabled).
- The panel may show **loyalty points** and **balance due** so staff can verify the account before taking payment.

To clear the selection, use the control to **remove** the customer from the cart.

### Step 5: Process Payment

1. Click **Pay** or **Checkout**
2. Select payment method:

| Method | Description |
|--------|-------------|
| **Cash** | Enter amount tendered; change is calculated automatically |
| **Card** | Process via connected card terminal |
| **Digital** | GCash, Maya, or other digital wallets |
| **Split** | Combine multiple payment methods |
| **On account** | Available only when **On-account sales** is enabled in Settings **and** a customer is attached; records the sale against the customer’s **balance due** for later settlement (see [Customers](./08-customers.md)) |

3. Confirm the payment amount
4. Click **Complete Sale**

> **Note:** On-account requires an attached customer. Owners/Admins enable the feature under **Settings** — see [Settings & Configuration](./12-settings.md).

### Step 6: Receipt

After payment:
- A receipt is generated automatically
- Options: **Print**, **Email**, or **Skip**
- The receipt includes: store details, TIN, items, VAT breakdown, serial number

## Held / Saved Carts

If a customer needs to step away or you need to serve another customer:

1. Click **Hold** or **Save Cart**
2. Optionally add a note (e.g., "Customer went to ATM")
3. Start a new transaction
4. To resume: click **Saved Carts** and select the held cart
5. The cart items are restored and you can continue

## Product Bundles

When adding a bundle to the cart:
- The bundle appears as a single line item
- The bundled price is applied automatically
- Component stock is tracked individually

## Quick Keys / Favorites

- Frequently sold items can be pinned to the quick-access grid
- Ask your Manager or Admin to configure quick keys in product settings

## Tax Handling

- **12% VAT** is computed automatically on all taxable items
- **VAT-Exempt** items are clearly marked
- The receipt shows a complete VAT breakdown:
  - VATable Sales
  - VAT Amount
  - VAT-Exempt Sales
  - Zero-Rated Sales

## Offline Mode

If the internet connection drops:
1. The **Offline Indicator** appears at the top of the screen
2. You can continue processing sales normally
3. Transactions are saved locally on the device
4. When connectivity returns, data syncs automatically
5. A sync status notification confirms successful upload

> **Important:** Receipt serial numbers are reserved in advance, so offline receipts maintain proper sequencing.

## Common POS Shortcuts

| Action | How |
|--------|-----|
| Quick search | Start typing — the search bar auto-focuses |
| Clear cart | Click **Clear All** button |
| Last transaction | Click **Recent** to view the latest sale |
| Calculator | Click the calculator icon in the payment dialog |
