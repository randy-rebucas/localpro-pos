# LocalPro POS - Enterprise Point of Sale System

A comprehensive, enterprise-grade Point of Sale (POS) system built with Next.js 16, MongoDB, Mongoose, and Tailwind CSS. Features multi-tenant architecture, real-time inventory management, advanced reporting, and extensive customization options.

## 🚀 Features

### Core POS Features

- **Point of Sale Interface**
  - Intuitive shopping cart system
  - Quick product search and filtering
  - Real-time stock validation
  - Multiple payment methods (Cash, Card, Digital)
  - Automatic change calculation for cash payments
  - Receipt generation with customizable templates
  - Transaction notes and customer information

- **Transaction Management**
  - Complete transaction history with search and filters
  - Transaction status tracking (completed, cancelled, refunded)
  - Receipt number generation (REC-YYYYMMDD-XXXXX format)
  - Refund processing with stock restoration
  - Partial refunds support
  - Transaction pagination for large datasets

### Product Management

- **Product Operations**
  - Full CRUD operations (Create, Read, Update, Delete)
  - Product categories and organization
  - SKU tracking and management
  - Product images support
  - Product descriptions and notes

- **Product Variations**
  - Size, color, and type variations
  - Variation-specific pricing
  - Variation-specific stock tracking
  - Variation-specific SKUs

- **Product Bundles**
  - Create bundled products/services
  - Bundle-specific pricing
  - Automatic stock deduction for all bundle items
  - Bundle inventory tracking

- **Barcode & QR Code Support**
  - Barcode scanning for products
  - QR code scanning for products
  - Hardware barcode scanner integration
  - QR code generation for products

### Inventory Management

- **Stock Tracking**
  - Real-time stock updates via Server-Sent Events (SSE)
  - Automatic stock deduction on sales
  - Stock restoration on refunds
  - Stock adjustment and refill capabilities
  - Stock movement history with full audit trail

- **Multi-Branch Inventory**
  - Branch-specific stock levels
  - Stock monitoring across multiple locations
  - Branch-based stock filtering
  - Stock transfer tracking

- **Low Stock Alerts**
  - Configurable low stock thresholds
  - Real-time alert notifications
  - Product-specific or tenant-wide thresholds
  - Visual indicators (color-coded alerts)

- **Stock Movements**
  - Complete history of all stock changes
  - Movement types: Sale, Purchase, Adjustment, Return, Damage, Transfer
  - User attribution for all stock changes
  - Transaction linking for sales/returns

### Multi-Tenant Architecture

- **Tenant Management**
  - Complete data isolation per tenant
  - Path-based routing (`/tenant-slug/lang/...`)
  - Subdomain routing support
  - Custom domain support
  - Tenant-specific settings and branding

- **Tenant Customization**
  - Custom branding (logo, colors, company name)
  - Currency configuration per tenant
  - Localization and language settings
  - Timezone configuration
  - Receipt customization
  - Tax configuration (VAT/GST/Sales Tax)

### User Management & Authentication

- **Authentication Methods**
  - Email/password authentication
  - PIN-based login
  - QR code-based login
  - JWT token-based sessions
  - Secure password hashing (bcrypt)
  - HTTP-only cookie sessions

- **Role-Based Access Control (RBAC)**
  - **Owner**: Full system access
  - **Admin**: Full tenant management
  - **Manager**: Product, inventory, and report management
  - **Cashier**: Transaction processing and product viewing
  - **Viewer**: Read-only access

- **User Features**
  - User creation and management
  - User activation/deactivation
  - PIN setup and management
  - QR code generation for users
  - Last login tracking

### Discount & Promo System

- **Discount Codes**
  - Percentage-based discounts
  - Fixed amount discounts
  - Minimum purchase requirements
  - Maximum discount limits
  - Usage limits per code
  - Validity periods (start/end dates)
  - Active/inactive status

- **Promo Code Application**
  - Real-time discount validation
  - Automatic discount calculation
  - Discount display in cart
  - Discount tracking in transactions

### Reports & Analytics

- **Sales Reports**
  - Sales by time period (daily, weekly, monthly)
  - Sales by payment method
  - Sales trends and charts
  - Custom date range filtering
  - Export capabilities

- **Product Performance Reports**
  - Top-selling products
  - Revenue by product
  - Quantity sold tracking
  - Average price analysis
  - Product ranking

- **Financial Reports**
  - Profit & Loss statements
  - Revenue breakdown
  - Expense tracking by category
  - Gross and net profit calculations
  - Profit margin analysis

- **VAT/Tax Reports**
  - VAT sales vs non-VAT sales
  - VAT amount calculations
  - Configurable VAT rates
  - Tax reporting by period

- **Cash Drawer Reports**
  - Cash drawer session tracking
  - Opening/closing amounts
  - Shortage/overage detection
  - Cash sales tracking
  - Cash expenses tracking

- **Dashboard Analytics**
  - Real-time sales statistics
  - Total sales, transactions, and averages
  - Payment method breakdowns
  - Interactive sales charts
  - Period filtering (Today, Week, Month, All)

### Attendance Management

- **Time Tracking**
  - Clock in/out functionality
  - Break tracking (start/end)
  - Automatic hours calculation
  - Current session display
  - Attendance history

- **Location Tracking**
  - GPS location capture (optional)
  - Address recording
  - Location-based attendance

- **Attendance Features**
  - Notes and comments
  - Session status tracking
  - Real-time hours display
  - Attendance records per user

### Cash Drawer Management

- **Cash Drawer Sessions**
  - Opening cash drawer with starting amount
  - Closing cash drawer with count
  - Automatic expected amount calculation
  - Shortage/overage detection
  - Session notes

- **Cash Tracking**
  - Cash sales tracking
  - Cash expenses tracking
  - Net cash calculations
  - Session history

### Expense Management

- **Expense Tracking**
  - Expense categories
  - Expense descriptions
  - Amount tracking
  - Payment method for expenses
  - Receipt attachments
  - Expense notes

- **Expense Features**
  - Date-based filtering
  - Category-based organization
  - User attribution
  - Integration with profit/loss reports

### Hardware Integration

- **Supported Hardware**
  - Barcode scanners
  - QR code scanners
  - Receipt printers
  - Hardware status monitoring

- **Hardware Configuration**
  - Per-tenant hardware settings
  - Hardware status checking
  - Hardware settings management
  - Device connection monitoring

### Settings & Configuration

- **Tenant Settings**
  - Currency and localization
  - Date and time formats
  - Number formatting
  - Timezone configuration
  - Language selection (English, Spanish)

- **Branding**
  - Company name and logo
  - Primary, secondary, and accent colors
  - Custom favicon
  - Receipt header/footer customization

- **Contact Information**
  - Business email and phone
  - Website URL
  - Complete address (street, city, state, zip, country)

- **Receipt Settings**
  - Show/hide logo on receipts
  - Show/hide contact information
  - Custom header and footer text
  - Receipt template customization

- **Tax Configuration**
  - Enable/disable tax calculation
  - Configurable tax rate
  - Custom tax labels (VAT, GST, Sales Tax)

- **Feature Flags**
  - Enable/disable inventory management
  - Enable/disable categories
  - Enable/disable discounts
  - Enable/disable loyalty programs
  - Enable/disable customer management

### Security & Audit

- **Security Features**
  - JWT-based authentication
  - Secure password hashing
  - Input validation and sanitization
  - XSS protection
  - CSRF protection
  - Tenant data isolation
  - Role-based access control

- **Audit Logging**
  - Complete audit trail for all actions
  - User login/logout tracking
  - Product CRUD operations logging
  - Transaction event logging
  - Stock movement tracking
  - User management actions
  - Before/after value tracking
  - IP address and user agent logging

### Offline Support

- **Offline Capabilities**
  - Offline mode detection
  - Local storage for offline transactions
  - Automatic sync when online
  - Offline indicator display

### Internationalization

- **Multi-Language Support**
  - English (en)
  - Spanish (es)
  - Language switching
  - Tenant-specific language settings
  - Localized date/time formatting

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **QR Code**: qrcode.react, jsqr
- **Internationalization**: Custom i18n implementation

## 📋 Prerequisites

- Node.js 20.9 or higher
- MongoDB 6.0+ (local installation or MongoDB Atlas account)
- npm, yarn, or pnpm

## 🚀 Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd localpro-pos
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Set up environment variables:**
   Create a `.env.local` file in the root directory:
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/localpro-pos
   # or for MongoDB Atlas
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/localpro-pos
   
   # JWT Authentication (REQUIRED - Change in production!)
   JWT_SECRET=your-super-secret-random-string-min-32-characters
   JWT_EXPIRES_IN=7d
   
   # Application
   NODE_ENV=development
   PORT=3000
   
   # Tenant Configuration
   DEFAULT_TENANT_SLUG=default
   ```

4. **Start MongoDB (if using local installation):**
   ```bash
   # macOS (using Homebrew)
   brew services start mongodb-community
   
   # Linux
   sudo systemctl start mongod
   
   # Windows
   # Start MongoDB service from Services panel
   ```

5. **Create default tenant:**
   ```bash
   npm run tenant:default
   # or
   npx tsx scripts/create-default-tenant.ts
   ```

6. **Create admin user:**
   ```bash
   npx tsx scripts/create-admin-user.ts default admin@example.com SecurePassword123! "Admin User"
   ```

7. **Run the development server:**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

8. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)
   The system will automatically redirect to `/default/en` (or appropriate locale)

## 📖 Usage

### Initial Setup

1. **Login**: Use the admin credentials created during setup
2. **Configure Tenant Settings**: Go to Settings page to configure:
   - Currency and localization
   - Company branding
   - Contact information
   - Tax settings
   - Receipt customization

3. **Add Products**: Navigate to Products page to add your inventory
4. **Create Categories**: Organize products into categories
5. **Set Up Branches**: If using multi-branch, create branches
6. **Configure Hardware**: Set up barcode scanners, receipt printers, etc.

### Dashboard

- View real-time sales statistics
- Filter by time period (Today, Week, Month, All)
- View payment method breakdowns
- Interactive sales trend charts

### Products Management

- Add products with name, price, stock, SKU, category
- Create product variations (size, color, type)
- Create product bundles
- Edit existing products
- Delete products (soft delete)
- Search products by name, description, or SKU
- View stock levels with color-coded indicators
- Refill stock for products

### Point of Sale (POS)

- Browse products in a grid layout
- Search products by name or scan barcode/QR code
- Add products to cart by clicking or scanning
- Adjust quantities in cart
- Apply discount codes
- Process payments with multiple methods:
  - **Cash**: Enter cash received, system calculates change
  - **Card**: Direct payment processing
  - **Digital**: Digital wallet payments
- Automatic inventory deduction on sale completion
- Print receipts
- Process refunds

### Transactions

- View all transaction history
- Search and filter transactions
- See transaction details (items, totals, payment methods)
- Print receipts for any transaction
- Process refunds (full or partial)
- Pagination for large transaction lists

### Inventory Management

- View real-time stock levels
- Monitor low stock alerts
- Track stock movements
- Filter by branch
- Stock refill and adjustments
- Stock movement history

### Reports

- **Sales Reports**: View sales by period, payment method, trends
- **Product Reports**: Top-selling products, revenue analysis
- **VAT Reports**: Tax calculations and reporting
- **Profit & Loss**: Revenue, expenses, profit analysis
- **Cash Drawer Reports**: Cash drawer session tracking

### Admin Panel

- **User Management**: Create, edit, delete users
- **Tenant Management**: Create and manage tenants
- **Role Assignment**: Assign roles to users
- **PIN Management**: Set up PINs for users
- **QR Code Generation**: Generate QR codes for user login

### Settings

- Configure tenant settings
- Customize branding
- Set up contact information
- Configure tax settings
- Customize receipt templates
- Configure hardware devices
- Enable/disable features

## 📁 Project Structure

```
localpro-pos/
├── app/
│   ├── [tenant]/[lang]/          # Multi-tenant, multi-language routes
│   │   ├── admin/                 # Admin panel
│   │   ├── inventory/            # Inventory management
│   │   ├── pos/                   # Point of Sale interface
│   │   ├── products/              # Product management
│   │   ├── reports/               # Reports and analytics
│   │   ├── settings/              # Settings page
│   │   ├── transactions/          # Transaction history
│   │   └── login/                 # Login page
│   ├── api/                       # API routes
│   │   ├── attendance/            # Attendance endpoints
│   │   ├── auth/                  # Authentication endpoints
│   │   ├── branches/              # Branch management
│   │   ├── bundles/               # Product bundle endpoints
│   │   ├── cash-drawer/           # Cash drawer sessions
│   │   ├── categories/            # Category endpoints
│   │   ├── discounts/             # Discount/promo code endpoints
│   │   ├── expenses/              # Expense tracking
│   │   ├── inventory/             # Inventory endpoints
│   │   ├── products/              # Product endpoints
│   │   ├── reports/               # Report endpoints
│   │   ├── stock-movements/       # Stock movement history
│   │   ├── tenants/               # Tenant management
│   │   ├── transactions/           # Transaction endpoints
│   │   └── users/                 # User management
│   └── layout.tsx                  # Root layout
├── components/                     # React components
│   ├── AttendanceClock.tsx        # Attendance tracking
│   ├── BarcodeScanner.tsx         # Barcode scanning
│   ├── HardwareSettings.tsx        # Hardware configuration
│   ├── LowStockAlerts.tsx         # Low stock notifications
│   ├── QRCodeScanner.tsx          # QR code scanning
│   └── ...                        # Other components
├── contexts/                       # React contexts
│   ├── AuthContext.tsx            # Authentication context
│   └── TenantSettingsContext.tsx  # Tenant settings context
├── lib/                            # Utility libraries
│   ├── auth.ts                    # Authentication utilities
│   ├── currency.ts                 # Currency formatting
│   ├── hardware/                  # Hardware integration
│   ├── stock.ts                   # Stock management
│   └── ...                        # Other utilities
├── models/                         # Mongoose models
│   ├── Attendance.ts              # Attendance model
│   ├── CashDrawerSession.ts       # Cash drawer model
│   ├── Discount.ts                # Discount model
│   ├── Expense.ts                 # Expense model
│   ├── Product.ts                 # Product model
│   ├── ProductBundle.ts           # Bundle model
│   ├── Transaction.ts             # Transaction model
│   └── ...                        # Other models
└── scripts/                        # Setup scripts
    ├── create-admin-user.ts        # Admin user creation
    └── create-default-tenant.ts    # Default tenant creation
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login (email/password)
- `POST /api/auth/login-pin` - User login (PIN)
- `POST /api/auth/login-qr` - User login (QR code)
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `GET /api/auth/qr-code` - Generate QR code for login

### Products
- `GET /api/products?tenant=xxx` - List products
- `POST /api/products?tenant=xxx` - Create product (auth required)
- `GET /api/products/[id]?tenant=xxx` - Get product
- `PUT /api/products/[id]?tenant=xxx` - Update product (auth required)
- `DELETE /api/products/[id]?tenant=xxx` - Delete product (auth required)
- `POST /api/products/[id]/refill?tenant=xxx` - Refill stock (auth required)

### Transactions
- `GET /api/transactions?tenant=xxx` - List transactions (auth required)
- `POST /api/transactions?tenant=xxx` - Create transaction (auth required)
- `GET /api/transactions/[id]?tenant=xxx` - Get transaction (auth required)
- `PUT /api/transactions/[id]?tenant=xxx` - Update transaction (admin/manager only)
- `POST /api/transactions/[id]/refund?tenant=xxx` - Process refund (auth required)
- `GET /api/transactions/stats?tenant=xxx&period=xxx` - Get statistics

### Inventory
- `GET /api/inventory/low-stock?tenant=xxx` - Get low stock products
- `GET /api/inventory/realtime?tenant=xxx` - Real-time stock updates (SSE)
- `GET /api/stock-movements?tenant=xxx&productId=xxx` - Get stock history

### Discounts
- `GET /api/discounts?tenant=xxx` - List discounts
- `POST /api/discounts?tenant=xxx` - Create discount (auth required)
- `GET /api/discounts/[id]?tenant=xxx` - Get discount
- `PUT /api/discounts/[id]?tenant=xxx` - Update discount (auth required)
- `DELETE /api/discounts/[id]?tenant=xxx` - Delete discount (auth required)
- `POST /api/discounts/validate?tenant=xxx` - Validate discount code

### Reports
- `GET /api/reports/sales?tenant=xxx` - Sales report
- `GET /api/reports/products?tenant=xxx` - Product performance report
- `GET /api/reports/vat?tenant=xxx` - VAT report
- `GET /api/reports/profit-loss?tenant=xxx` - Profit & Loss report
- `GET /api/reports/cash-drawer?tenant=xxx` - Cash drawer report

### Users
- `GET /api/users?tenant=xxx` - List users (admin/manager only)
- `POST /api/users?tenant=xxx` - Create user (admin/manager only)
- `GET /api/users/[id]?tenant=xxx` - Get user
- `PUT /api/users/[id]?tenant=xxx` - Update user (admin/manager only)
- `DELETE /api/users/[id]?tenant=xxx` - Delete user (admin only)
- `POST /api/users/[id]/pin?tenant=xxx` - Set/update PIN
- `GET /api/users/[id]/qr-code?tenant=xxx` - Generate QR code

### Tenants
- `GET /api/tenants` - List tenants
- `POST /api/tenants` - Create tenant
- `GET /api/tenants/[slug]` - Get tenant
- `PUT /api/tenants/[slug]` - Update tenant
- `GET /api/tenants/[slug]/settings` - Get tenant settings
- `PUT /api/tenants/[slug]/settings` - Update tenant settings

### Other Endpoints
- `GET /api/branches?tenant=xxx` - List branches
- `GET /api/bundles?tenant=xxx` - List product bundles
- `GET /api/categories?tenant=xxx` - List categories
- `GET /api/expenses?tenant=xxx` - List expenses
- `GET /api/cash-drawer/sessions?tenant=xxx` - Cash drawer sessions
- `GET /api/attendance/current` - Current attendance session
- `POST /api/attendance` - Clock in/out

## 🏗️ Building for Production

```bash
npm run build
npm start
```

See [PRODUCTION_README.md](./PRODUCTION_README.md) for detailed production deployment instructions.

## 📚 Documentation

### Complete Documentation Index

**📱 [Mobile API Documentation](./docs/mobile/)** - Complete mobile integration guide
- [Quick Start](./docs/mobile/quick-start.md) - Get started in 10 minutes
- [Authentication](./docs/mobile/authentication.md) - Mobile authentication
- [API Client Setup](./docs/mobile/api-client-setup.md) - Platform-specific setup
- [Feature APIs](./docs/mobile/features/) - All feature endpoints
- [API Reference](./docs/mobile/reference/) - Complete reference
- [Examples](./docs/mobile/examples/) - Code examples
- [Troubleshooting](./docs/mobile/troubleshooting/) - Common issues

**🌐 [Web Application Documentation](./docs/web/)** - Complete web app guide
- [Overview](./docs/web/README.md) - Web application features
- [Authentication](./docs/web/authentication/) - Login and user management
- [Products](./docs/web/products/) - Product management
- [Transactions & POS](./docs/web/transactions/) - Point of Sale system
- [Inventory](./docs/web/inventory/) - Stock management
- [All Features](./docs/web/) - Complete feature list

**📖 [Documentation Index](./docs/INDEX.md)** - Complete documentation index
**📋 [Documentation Structure](./docs/DOCUMENTATION_STRUCTURE.md)** - Documentation organization

### Legacy Documentation (Still Available)

- **[Mobile API Quick Start](./docs/MOBILE_API_QUICK_START.md)** - Legacy quick start
- **[Mobile API Reference](./docs/MOBILE_API_REFERENCE.md)** - Legacy API reference
- **[Mobile API Examples](./docs/MOBILE_API_EXAMPLES.md)** - Legacy examples
- **[Mobile API Troubleshooting](./docs/MOBILE_API_TROUBLESHOOTING.md)** - Legacy troubleshooting
- **[Full Mobile Integration Guide](./MOBILE_API_INTEGRATION.md)** - Comprehensive guide

### System Documentation

- [PRODUCTION_README.md](./PRODUCTION_README.md) - Production deployment guide
- [MULTI_TENANT.md](./MULTI_TENANT.md) - Multi-tenant architecture details
- [INVENTORY_MANAGEMENT.md](./INVENTORY_MANAGEMENT.md) - Inventory management features
- [TENANT_SETTINGS.md](./TENANT_SETTINGS.md) - Tenant settings and branding
- [ENTERPRISE_FEATURES.md](./ENTERPRISE_FEATURES.md) - Enterprise features summary

## 🔒 Security Features

1. **Authentication**: JWT tokens with secure storage
2. **Authorization**: Role-based access control
3. **Data Isolation**: Complete tenant separation
4. **Input Validation**: All inputs validated and sanitized
5. **Password Security**: bcrypt hashing with salt
6. **Audit Trail**: Complete activity logging
7. **Error Handling**: Secure error messages
8. **HTTPS Ready**: Cookie security flags

## 🌍 Internationalization

The system supports multiple languages:
- English (en)
- Spanish (es)

Language can be set per tenant and switched dynamically. All UI text is localized.

## 🐛 Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running (check with `mongosh` or MongoDB Compass)
- Verify the connection string in `.env.local`
- Check firewall settings if using MongoDB Atlas

### Port Already in Use
- Change the port: `npm run dev -- -p 3001`
- Or stop the process using port 3000

### Authentication Errors
- Check JWT_SECRET is set correctly in `.env.local`
- Ensure JWT_SECRET is at least 32 characters
- Verify user credentials

### Tenant Not Found
- Ensure default tenant is created: `npm run tenant:default`
- Check tenant slug in URL matches existing tenant

## 📝 License

This project is open source and available for use.

## 🤝 Support

For issues or questions:
- Check the documentation files in the repository
- Review the Next.js documentation
- Review the MongoDB documentation

## 🎯 Feature Summary

This POS system includes **50+ enterprise features** covering:
- ✅ Complete POS functionality
- ✅ Advanced inventory management
- ✅ Multi-tenant architecture
- ✅ Comprehensive reporting
- ✅ User management with RBAC
- ✅ Discount/promo system
- ✅ Attendance tracking
- ✅ Cash drawer management
- ✅ Expense tracking
- ✅ Hardware integration
- ✅ Offline support
- ✅ Internationalization
- ✅ Security & audit logging
- ✅ And much more!

---

**Built with ❤️ using Next.js, MongoDB, and modern web technologies.**
