# 1pos Privacy Policy: proposed additions

**Status: draft for legal review. Do not publish.** None of this text is on the live site.

This document is for the lawyer or data protection officer reviewing the 1pos Privacy Policy. It was prepared from the application code and has not been reviewed by a lawyer, so the legal references below need checking.

The live policy is in `app/privacy/PrivacyPolicy.tsx`. Each addition below says where it would go and why it is proposed.

## Information needed first

Bracketed blanks in the draft text depend on these answers.

| # | Question | Who can answer |
| --- | --- | --- |
| 1 | What is Devcom's DTI or SEC registration number? The name and address are confirmed: Devcom Digital Marketing Services, Brgy Hipusngo, Baybay City, Leyte, Philippines, 6521. | Devcom |
| 2 | What email address should the data protection officer use? Randy Rebucas is named as DPO. A dedicated address is better than a personal one. | Devcom |
| 3 | Is Devcom registered with the National Privacy Commission (NPC), and is registration required? | Counsel |
| 4 | Are all stored copies in Singapore? Devcom reports data is stored in Singapore. Confirm this also covers backups and Cloudinary files. | Devcom |
| 5 | Are Hostinger (email) and Twilio (SMS) actually sending in production? Devcom names them as its providers. See "Confirm the providers are sending" below. | Devcom |
| 6 | Does the 1pos companion app collect anything beyond camera use for scanning and product photos? Its code is not in this repository. | Devcom |
| 7 | How long must transaction records be kept for BIR purposes? The policy currently says only "longer". | Counsel |
| 8 | Do store owners need a separate data processing agreement with Devcom? | Counsel |

## Proposed additions

### A. Who we are

**Goes in:** Section 1, Introduction. **Why:** the policy says "we" but never names the company responsible.

> 1pos is a product of Devcom Digital Marketing Services ("Devcom"), Brgy Hipusngo, Baybay City, Leyte, Philippines, 6521. In this policy, "we," "our," and "us" refer to Devcom.

### B. Philippine data privacy law

**Goes in:** new section after Section 1. **Why:** the product serves Philippine businesses, and the policy does not mention the Data Privacy Act of 2012 (Republic Act No. 10173).

> We process personal data in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules and Regulations, and issuances of the National Privacy Commission.
>
> Our Data Protection Officer is Randy Rebucas, who can be reached at [DPO email].

### C. Who is responsible for customer data

**Goes in:** new section after Section 7, Tenant Data Isolation. **Why:** stores enter their own customers' details, and the policy does not say who is responsible for that data. Counsel should confirm the roles.

> Each store decides what customer data it enters into 1pos and why. For that data, the store is the personal information controller and Devcom acts as its personal information processor, handling the data on the store's instructions.
>
> If you are a customer of a store that uses 1pos, please contact that store first about your personal data. We will assist the store in responding to your request.

### D. Public store directory

**Goes in:** Section 4, Data Sharing and Disclosure. **Why:** `/stores` and the public `/api/tenants` endpoint show store details to anyone, and the policy does not say so.

> **Public store directory** — stores on 1pos appear in a public directory. It shows the store's name, company name, web address, logo, business type, currency, and city and country. It does not show customer data.

Before publishing, confirm the fields shown, and decide whether stores can opt out. The code has no opt-out today.

### E. Named service providers

**Goes in:** Section 4, under Service providers. **Why:** the policy only lists categories. Naming providers is optional, but it is more transparent.

> We use the following categories of service providers:
>
> - Hosting and database: Vercel, MongoDB Atlas
> - File and image storage: Cloudinary
> - Backups: Amazon Web Services or a compatible storage provider [confirm]
> - Payments: PayPal
> - Email delivery: Hostinger
> - SMS delivery: Twilio
> - AI-assisted product images: OpenAI and Anthropic. We send product names and related product details only, not customer data.
>
> If a store connects Shopify or WooCommerce, product, stock and order data is exchanged with that service on the store's instructions.

Code notes for the reviewer:

- The AI features are in `lib/openai.ts`, `lib/claude.ts` and `app/api/products/suggest-image/route.ts`. Confirm they are enabled in production, and that nothing beyond product details is sent.

#### Confirm the providers are sending

Hostinger and Twilio are listed because Devcom named them, but the policy should describe what actually happens. In the code, email set up with SMTP, which Hostinger uses, is skipped unless `EMAIL_API_KEY` is also set. The app then logs the message and reports success, so Hostinger may not be receiving any mail from 1pos yet.

### F. Data stored outside the Philippines

**Goes in:** new section after Section 5, Data Retention. **Why:** cloud providers may store data abroad, and the policy is silent on this.

> Your data is stored in Singapore, and some of our service providers may process it in other countries, including the United States. Where this happens, we remain responsible for your data and require our service providers to protect it.

Counsel should confirm the requirements for transferring data abroad. Several providers in Section E are based outside the Philippines, and "require our service providers to protect it" should be checked against their actual contracts.

### G. Specific retention periods

**Goes in:** Section 5, Data Retention. **Why:** the policy gives no periods, but the system already applies these automatically. Check these against legal requirements, since they may need to change.

> We keep certain records for fixed periods, after which they are deleted automatically:
>
> - Activity logs: 90 days, then archived for about 10 years
> - Attendance and booking records: about 5 years
> - One-time login codes: until they expire
> - Offline sales: 30 days after they sync
>
> Transaction records are kept for [period from question 7].

Source: index settings in `models/AuditLog.ts`, `models/ArchivedAuditLog.ts`, `models/Attendance.ts`, `models/Booking.ts`, `models/CustomerOTP.ts` and `models/OfflineTransaction.ts`. Some production indexes may differ from the code, so confirm against the production database.

### H. Rights under Philippine law

**Goes in:** Section 8, Your Rights. **Why:** the current list is generic, and leaves out the right to be informed, to claim damages, and to complain to the NPC.

> Under the Data Privacy Act, you also have the right to be informed about how your data is processed, to claim damages, and to file a complaint with the National Privacy Commission (www.privacy.gov.ph).

### I. Data breaches

**Goes in:** Section 6, Data Security. **Why:** the policy does not say what happens after a breach. Counsel should confirm the wording against current NPC rules on breach notification.

> If a personal data breach occurs that requires notification, we will notify the National Privacy Commission and affected individuals as required by law.

### J. Companion app

**Goes in:** Section 2.2, Information Collected Automatically. **Why:** the app uses the phone camera, which the policy does not mention. Confirm against question 6.

> **Companion app** — if you use the 1pos mobile app, it uses your camera to scan barcodes and QR codes and to take product photos. Scans and photos are used only for these features.

## After approval

1. Add the approved text to `app/privacy/PrivacyPolicy.tsx`.
2. Update `LAST_UPDATED` in the same file.
3. Tell existing stores about any significant changes, as Section 11 of the policy promises.
4. Review the "At a glance" receipt on the page, so it still matches the policy.
