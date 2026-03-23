# 10. Cash Drawer

**Available to:** Cashier, Manager, Admin, Owner

## Overview

The cash drawer module tracks physical cash flow throughout the business day. It helps reconcile cash at the end of each shift.

## Opening the Cash Drawer

1. Navigate to **Cash Drawer**
2. Click **Open Drawer**
3. Enter the **Opening Balance** (starting cash amount)
4. Click **Confirm**
5. The drawer session is now active

> **Tip:** The opening balance should match the cash physically in the drawer at the start of your shift.

## During the Day

While the drawer is open:
- **Cash sales** automatically increase the expected balance
- **Cash refunds** automatically decrease the expected balance
- All cash movements are tracked in real-time

### Cash In / Cash Out

For non-sale cash movements:

**Cash In** (money added to drawer):
1. Click **Cash In**
2. Enter the amount
3. Select reason (e.g., Change replenishment, Float top-up)
4. Add notes if needed
5. Click **Confirm**

**Cash Out** (money removed from drawer):
1. Click **Cash Out**
2. Enter the amount
3. Select reason (e.g., Bank deposit, Expense payment, Petty cash)
4. Add notes
5. Click **Confirm**

## Closing the Cash Drawer

At the end of your shift:

1. Click **Close Drawer**
2. Count the physical cash in the drawer
3. Enter the **Actual Count** (denominations or total)
4. The system calculates:
   - **Expected Balance** = Opening + Cash Sales - Cash Refunds + Cash In - Cash Out
   - **Discrepancy** = Actual Count - Expected Balance
5. If there is a discrepancy, enter a **note** explaining it
6. Click **Close**

### Discrepancy Handling

| Situation | Meaning |
|-----------|---------|
| **Discrepancy = 0** | Cash is balanced. Perfect. |
| **Positive discrepancy** | More cash than expected (overage) |
| **Negative discrepancy** | Less cash than expected (shortage) |

All discrepancies are logged and visible in reports and audit logs.

## Cash Drawer History

1. Navigate to **Cash Drawer**
2. Click **History** or scroll to **Past Sessions**
3. Each session shows:
   - Who opened / closed the drawer
   - Opening balance
   - Total cash sales
   - Total cash refunds
   - Cash in / cash out entries
   - Closing balance
   - Discrepancy

## Cash Drawer Report

For a formal report:
1. Navigate to **Reports > Cash Drawer**
2. Select the date range
3. View or export the report

## Automation

If configured, the system can:
- **Auto-close** the drawer at a set time (e.g., end of business day)
- **Send reminders** to close the drawer if left open past a threshold
- Configure in **Settings > Automations**

## Best Practices

1. **Always count cash at opening** — Don't assume the previous balance is correct
2. **Record all cash movements** — Every cash in/out should be logged
3. **Count cash before closing** — Physical count first, then enter the number
4. **Investigate discrepancies** — Even small ones, to catch issues early
5. **Never leave the drawer open** — Close it at the end of every shift
