If you only provide the software and your client supplies their own hardware (BYOD - Bring Your Own Device), you cannot just stay in the background. Under [Bureau of Internal Revenue (BIR)](https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023%20Digest%20FINAL.pdf) rules, specifically [RMO No. 24-2023](https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023.pdf), the registration process is a two-part handshake between you (the software provider) and your client (the merchant). [1, 2, 3, 4] 
Your client cannot legally register their hardware until you have officially accredited your software. [2, 5] 
------------------------------
## Step 1: Your Responsibility (The Software Accreditation)
Before your client can do anything, you must register as a POS Software Provider/Supplier on the [BIR eAccReg portal](https://eaccreg.bir.gov.ph/ACCREG/help.html). You must apply for a Certificate of Accreditation for your software version. [3, 6, 7, 8] 

* 
* What you must submit: You need to present system flowcharts, database structures, sample layouts of receipts, and a sworn statement of data integrity.
* The Goal: The BIR will issue you a Software Accreditation Number. Your clients cannot proceed without this number. [5, 9, 10] 
* 

## Step 2: The Handshake (Declaring the Client's Hardware)
Once your software is accredited, you must log into your BIR eAccReg portal to link your client to your software: [3] 

   1. You must upload or type in your client's business details (Company Name, TIN, and Branch Code).
   2. You must input the exact serial numbers of the hardware devices (iPads, Android tablets, or Windows PCs) that your client bought and wants to use.
   3. The system will then generate a joint digital application. [3, 11, 12, 13, 14] 

## Step 3: Your Client's Responsibility (The Hardware Permit)
After you complete the handshake in the backend portal, your client takes over to secure their final legal authorization: [3, 15] 

* 
* The Application: Your client will see the pending application tied to their TIN. They will officially apply to their local Revenue District Office (RDO) to get a Permit to Use (PTU) or an Acknowledgement Certificate (AC) for those specific machines. [3, 7, 15, 16] 
* The Sticker: Once approved, the client receives the official BIR registration sticker (decal) or a digital permit certificate that must be conspicuously displayed on or right next to their hardware terminal. [5] 
* 

------------------------------
## Key Technical Rule for SaaS "BYOD" Models
Because you do not control their physical devices, your cloud system must strictly isolate and track hardware identities. The BIR requires that your SaaS database hard-codes a unique identifier mapping the Accreditation Number (Your Software) + Machine Serial Number (Their Hardware) + Terminal ID directly onto the footer of every single printed invoice. [5, 11] 
Have you already gone through the initial software accreditation process on the BIR eAccReg portal, or do you need help understanding the technical documentation requirements to get your platform certified? [6, 9] 
