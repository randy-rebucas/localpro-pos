# 18. Troubleshooting & FAQ

## Common Issues

### Login Problems

| Problem | Solution |
|---------|---------|
| "Invalid credentials" | Check email/password spelling. Try password reset. |
| "Account deactivated" | Contact your Admin to reactivate your account. |
| PIN login not working | Ensure your PIN was set up. Ask Admin to reset it. |
| QR login not scanning | Ensure camera permissions are enabled. Try better lighting. Regenerate QR if damaged. |
| Session expired | Log in again. Sessions expire after inactivity for security. |

### POS Issues

| Problem | Solution |
|---------|---------|
| Products not showing | Check category filter. Ensure products are active. Refresh the page. |
| Barcode not scanning | Check scanner connection in Settings > Hardware. Ensure barcode is clean and readable. |
| "Subscription limit exceeded" | Transaction or product limit reached. Contact Owner to upgrade plan. |
| Discount code not working | Check if code is expired, already used, or not applicable to cart items. |
| Cart cleared unexpectedly | Check if another user logged in. Use Saved Carts to preserve work. |
| Offline transactions not syncing | Check internet connection. Wait for auto-retry. Refresh the page. |

### Receipt & Printing

| Problem | Solution |
|---------|---------|
| Receipt not printing | Check printer connection. Verify in Settings > Hardware. Restart printer. |
| Receipt missing info | Check Settings > Receipt Templates. Ensure TIN and business details are filled. |
| Wrong prices on receipt | Receipt shows price at time of sale. Current product price may differ. |
| Email receipt not received | Check customer email address. Verify email service is configured. Check spam folder. |

### Inventory

| Problem | Solution |
|---------|---------|
| Stock count wrong | Use Stock Adjustment to correct. Always note the reason. |
| Low stock alert not appearing | Check product's low stock threshold is set. Verify notification settings. |
| Stock not updating after sale | Refresh the page. Check if product has "Track Stock" enabled. |

### Reports

| Problem | Solution |
|---------|---------|
| Report shows no data | Check date range filter. Ensure there are transactions in the selected period. |
| Numbers don't match | Check filters (branch, cashier, status). Voided transactions are excluded. |
| Export fails | Try a smaller date range. Check browser pop-up blocker for downloads. |

### Hardware

| Problem | Solution |
|---------|---------|
| Barcode scanner not detected | Reconnect USB. Check Settings > Hardware. Try a different USB port. |
| Printer offline | Check cable/WiFi connection. Restart printer. Reconfigure in settings. |
| Cash drawer not opening | Check it's connected to the receipt printer. Test trigger in hardware settings. |

## Frequently Asked Questions

### General

**Q: Can I use 1POS on my phone?**
A: Yes. 1POS works on any modern browser. Install it as a PWA for the best mobile experience.

**Q: Is my data backed up?**
A: Yes. Automatic backups run daily (if configured). Your Admin or Owner can also create manual backups.

**Q: Can I access 1POS from multiple devices?**
A: Yes. Log in from any device with a browser. Your data syncs across devices.

**Q: What happens if I forget my password?**
A: Ask your Admin to reset your password. They can set a temporary one from User Management.

### POS & Sales

**Q: Can I split a payment between cash and card?**
A: Yes. Select "Split Payment" during checkout and enter the amount for each method.

**Q: Can I modify a completed transaction?**
A: No. Completed transactions are immutable for BIR compliance. You can issue a refund and create a new transaction.

**Q: What if I make a mistake on a sale?**
A: If the customer hasn't left, void the transaction. If they have, process a refund.

**Q: Can I apply multiple discounts to one transaction?**
A: Only one discount code per transaction. Manual discounts can be combined with code discounts at Manager discretion.

### Inventory

**Q: Can I track stock for product variations separately?**
A: Yes. Each variation (size, color, etc.) has its own stock count.

**Q: How do I handle damaged goods?**
A: Use Stock Adjustment with reason "Damaged" to reduce the count.

### Tax & Compliance

**Q: How is VAT calculated?**
A: 1POS computes 12% VAT automatically. See [BIR Compliance](./16-bir-compliance.md) for details.

**Q: What reports do I need for BIR?**
A: Daily Sales Summary (Z-reading), Sales Journal, and VAT Report. All are available under Reports.

**Q: Are voided transactions included in reports?**
A: No. Voided transactions are excluded from sales totals but remain in the system for audit purposes.

### Account & Access

**Q: How do I change my password?**
A: Go to Profile > Change Password.

**Q: Can I switch branches?**
A: If you have multi-branch access, use the branch selector in the navigation bar.

**Q: Why can't I see certain menu items?**
A: Menu visibility depends on your role. See [Role Permissions](./19-role-permissions.md) for details.

## Getting Help

If your issue isn't covered here:
1. Check the full [User Manual](./README.md) for detailed guides
2. Ask your Manager or Admin
3. Contact support through your Owner (support channels depend on subscription plan)

## Error Messages Reference

| Error | Meaning | Action |
|-------|---------|--------|
| "Subscription limit exceeded" | Plan limit reached | Upgrade subscription |
| "Insufficient stock" | Product out of stock | Restock or adjust quantity |
| "Invalid discount code" | Code expired or invalid | Check code details |
| "Session expired" | Login timed out | Log in again |
| "Permission denied" | Role doesn't have access | Contact Admin |
| "Offline — changes saved locally" | No internet | Continue working; data syncs when online |
| "Sync failed" | Upload to server failed | Check connection; auto-retry will occur |
