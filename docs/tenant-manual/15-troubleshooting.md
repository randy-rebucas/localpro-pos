# 15. Troubleshooting & Limits

## Subscription Limit Errors

### Error: "Subscription limit exceeded for maxTransactions"

**Cause:** Monthly transaction count has reached the plan limit.

**Solutions:**
1. Wait for the monthly reset (occurs on `lastResetDate` anniversary)
2. Upgrade to a higher plan with more transactions
3. Check current usage: **Subscription** page shows usage vs. limits

### Error: "Subscription limit exceeded for maxUsers"

**Cause:** Trying to create a user when the user limit is reached.

**Solutions:**
1. Deactivate unused user accounts to free up slots
2. Upgrade plan for more user capacity

### Error: "Subscription limit exceeded for maxProducts"

**Cause:** Product count has reached the plan limit.

**Solutions:**
1. Deactivate unused products
2. Upgrade plan

### Error: "Subscription limit exceeded for maxBranches"

**Cause:** Trying to add a branch beyond plan allowance.

**Solution:** Upgrade to Business or Enterprise plan.

## Tenant Access Issues

### "Tenant not found"

**Causes:**
- Incorrect slug in URL
- Tenant has been deactivated
- Tenant was never created

**Solutions:**
1. Verify the URL slug is correct
2. Check with platform admin if tenant exists
3. Ensure tenant `isActive` is `true`

### "Access denied to this tenant"

**Cause:** User account doesn't belong to this tenant.

**Solution:** Verify the user was created under the correct tenant.

## Configuration Issues

### Settings Not Saving

**Causes:**
- Validation error (check field formats)
- Missing required fields
- Session expired

**Solutions:**
1. Check browser console for error details
2. Ensure all required fields are filled
3. Refresh and log in again if session expired

### Feature Not Visible After Enabling

**Causes:**
- Feature flag is on but plan doesn't include it
- Browser cache showing old UI
- User role doesn't have access

**Solutions:**
1. Check subscription plan includes the feature
2. Hard refresh the browser (Ctrl+Shift+R)
3. Verify user role has permission for the feature

### Tax Not Calculating

**Causes:**
- `taxEnabled` is `false`
- `taxRate` is `0`
- Product is set to VAT-Exempt

**Solutions:**
1. Check **Settings > General** — ensure tax is enabled
2. Set tax rate to `12` for standard Philippine VAT
3. Check the product's tax rule assignment

## Automation Issues

### Automation Not Running

**Causes:**
- Cron job not configured on server
- Automation endpoint returning errors
- Dependent service down (email provider, S3, etc.)

**Solutions:**
1. Verify cron jobs are set up on the server
2. Check server logs for automation errors
3. Test the automation API endpoint manually
4. Verify dependent service credentials

### Emails Not Sending

**Causes:**
- No email provider configured
- `emailNotifications` is `false`
- API key invalid or expired
- Recipient email invalid

**Solutions:**
1. Check environment variables for email provider
2. Enable email notifications in tenant settings
3. Test with a simple email send
4. Check server logs for send errors

### Backup Failures

**Causes:**
- S3 credentials invalid
- Disk space full (local backup)
- Database connection issues

**Solutions:**
1. Verify AWS credentials
2. Check server disk space
3. Ensure database is accessible

## Data Issues

### Missing Transactions

**Causes:**
- Transactions in offline queue (not yet synced)
- Wrong date filter
- Wrong branch filter
- Transactions were voided

**Solutions:**
1. Check offline indicator — ensure sync is complete
2. Expand the date range
3. Select "All Branches"
4. Include voided status in filter

### Stock Count Mismatch

**Causes:**
- Offline transactions not yet synced
- Manual adjustment not recorded
- Stock transfer in transit

**Solutions:**
1. Ensure all offline data is synced
2. Use Stock Adjustment to correct with reason
3. Check pending transfers

### Audit Log Gaps

**Causes:**
- Logs archived (older than 1 year)
- Date filter too narrow

**Solutions:**
1. Expand date range to include archived period
2. System queries both active and archived collections

## Performance Issues

### Slow Page Load

**Solutions:**
1. Check internet connection
2. Clear browser cache
3. Reduce items per page in lists
4. Check if too many automations running simultaneously

### Report Generation Timeout

**Solutions:**
1. Narrow the date range
2. Add filters (branch, payment method)
3. Export in CSV format (faster than PDF)
4. Run during off-peak hours

## Platform Limits Reference

| Resource | Starter | Pro | Business | Enterprise |
|----------|---------|-----|----------|------------|
| Users | Plan-specific | Plan-specific | Plan-specific | Unlimited |
| Branches | 1 | Plan-specific | Plan-specific | Unlimited |
| Products | Plan-specific | Plan-specific | Plan-specific | Unlimited |
| Transactions/month | Plan-specific | Plan-specific | Plan-specific | Unlimited |
| Backup retention | 7 days | 30 days | 90 days | 365 days |
| Data retention | 10 years | 10 years | 10 years | 10 years |
| API rate limit | Standard | Standard | Higher | Custom |

## Getting Help

1. Check this troubleshooting guide
2. Review the [User Manual](../user-manual/18-troubleshooting.md)
3. Check server logs for detailed error messages
4. Contact platform support (Enterprise plans include priority support)
