# Refunds in BIR reports: accountant review

Please confirm that 1POS reports refunds in a form that works for BIR filing. The questions are at the end. Each store files its own returns, but all stores share these report formats, so one review covers them all.

## How refunds are reported

A refund is recorded as its own entry, dated the day the refund was paid. The original sale is never changed, so a period that has already been closed stays the same.

Example: a 112.00 sale (100.00 + 12.00 VAT) on March 31, fully refunded on April 2.

| Report | March | April |
|---|---|---|
| Sales journal | Sale line: +112.00, VAT +12.00 | Refund line: -112.00, VAT -12.00 |
| Z reading | Gross sales 112.00, net sales 112.00 | Refunds paid 112.00, VAT on refunds 12.00, net sales -112.00 |
| CAS export | Debit 112.00 | Credit 112.00 |

## Details to check

- **Grand total:** it only goes up. Gross sales on the X and Z readings stay as sold, so they reconcile with it. Refunds appear separately, beside net sales.
- **Partial refunds:** each one pays the items' share of what the customer paid, including VAT and after discounts. The last refund pays exactly what remains.
- **Mixed baskets:** 1POS does not record VAT exemption per line. If a sale mixes VAT-exempt and VATable items, a partial refund splits VAT in proportion, not by item. A sale's refunds still add up exactly to the sale total and its VAT.
- **Senior and PWD sales:** a refund carries its share of the discount and of the VAT-exempt amount.
- **Voids:** a voided sale stays listed in the journal at zero. A sale with a refund against it cannot be voided.
- **Refund receipts:** numbered `REF-` plus the original receipt number, then `-2`, `-3` for further refunds on the same sale.
- **Older data:** refunds made before this change have no VAT split, so they reduce sales but not VAT in the journal. Z readings already generated are locked and do not show refunds.
- **Audit logs:** live logs expire after 90 days. A daily job copies them to an archive first. Archived logs are currently kept for 10 years.

## Questions

1. Is a refund dated when it was paid, not when the sale was made, the right treatment for the VAT return?
2. Should refunds appear as negative lines in the sales journal, or does BIR expect a separate returns book?
3. Does the Z reading need a different layout or different labels for refunds and net sales?
4. Should a refund have its own document, such as a credit memo with its own number series, instead of the `REF-` receipt?
5. Is the VAT split on mixed baskets acceptable, or do we need to record VAT exemption per line?
6. Do the archived audit logs meet the record-keeping period that applies to these stores?
7. If this POS is registered or accredited with the BIR, do these report changes need to be notified or re-approved?
