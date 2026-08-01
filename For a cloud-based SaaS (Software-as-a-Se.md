For a cloud-based SaaS (Software-as-a-Service) POS system, the Bureau of Internal Revenue (BIR) applies specific architectural rules because your data sits in the cloud rather than on a physical local hard drive. [1, 2, 3] 
Whether you are a developer building a SaaS POS or a merchant looking to buy one, the platform must meet these distinct cloud-computing standards:
## 1. Cloud-Specific BIR Compliance Rules

* 
* Data Transmission ("Push" Functionality): The cloud system must have built-in APIs to transmit daily sales summaries seamlessly. This prepares the system for the BIR's Electronic Invoicing System (EIS) data transfer formats (like JSON). [4, 5] 
* Server Location Transparency: You must explicitly state and provide proof of where your cloud servers are hosted (e.g., AWS, Google Cloud, Microsoft Azure) during registration. [6] 
* Offline Local Buffering: If your internet connection drops, the SaaS app must still allow transactions to occur offline. It must automatically save data locally and sync it back to the cloud as soon as connection returns, without gaps in sequential receipt numbering. [7, 8, 9, 10, 11] 
* Database Logs & Security: Even if the database is in the cloud, it must run a strict, tamper-proof electronic journal audit trail. Database records cannot be directly edited via the backend without logging the change. [4, 12] 
* 

## 2. Registration Rules: How It is Registered
How the BIR classifies a SaaS POS depends heavily on how it interacts with your hardware:

* 
* As a Standard POS (eAccReg): If the SaaS POS is pre-integrated into dedicated devices (like [Qashier](https://support.qashier.com/en/articles/8056583-philippines-guide-to-bir-pos-registration) or [EasyPOS](https://humedit.ph/point-of-sales/is-your-pos-bir-compliant-what-every-philippine-business-must-know/)), it is registered via the BIR's eAccReg portal. The SaaS vendor handles the software accreditation, while you register the specific serial numbers of your hardware terminals. [5, 13, 14] 
* As a Component of a Computerized Accounting System (CAS): If you run your SaaS POS on an open browser (like Shopify POS, Odoo, or custom cloud setups) linked directly to your accounting ledger, the BIR often requires you to register it under the Online Registration and Update System (ORUS) as a CAS Component. [1, 15, 16, 17] 
* 

## 3. Essential Capabilities to Look For

* 
* Real-time multi-branch sync that isolates sales data per store branch and terminal ID.
* Automatic monthly data export formats ready to upload to the BIR eSales portal.
* Permanent 10-digit accumulating grand total handled entirely server-side to prevent tampering. [4, 5, 7, 18, 19] 
* 

Are you a software developer building a custom SaaS POS, or a business merchant trying to find out if your current cloud POS needs a BIR Permit to Use?
