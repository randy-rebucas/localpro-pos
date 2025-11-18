# POS System - Point of Sale Application

A complete, fully functional Point of Sale (POS) system built with Next.js 16, MongoDB, Mongoose, and Tailwind CSS.

## Features

- **Product Management**: Full CRUD operations for products with inventory tracking
- **Point of Sale Interface**: Intuitive sales interface with shopping cart
- **Transaction Processing**: Complete transaction handling with multiple payment methods (Cash, Card, Digital)
- **Transaction History**: View and search through all past transactions
- **Receipt Generation**: Print receipts for completed transactions
- **Dashboard Analytics**: Real-time sales statistics and analytics
- **Inventory Management**: Automatic stock updates on sales
- **Search & Filter**: Quick product search and filtering

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with modern design

## Prerequisites

- Node.js 20.9 or higher
- MongoDB (local installation or MongoDB Atlas account)

## Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd pos-system
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
   ```bash
   cp .env.local.example .env.local
   ```

4. **Configure MongoDB connection:**
   Edit `.env.local` and set your MongoDB connection string:
   ```env
   # For local MongoDB
   MONGODB_URI=mongodb://localhost:27017/pos-system
   
   # For MongoDB Atlas
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/pos-system
   ```

5. **Start MongoDB (if using local installation):**
   ```bash
   # macOS (using Homebrew)
   brew services start mongodb-community
   
   # Linux
   sudo systemctl start mongod
   
   # Windows
   # Start MongoDB service from Services panel
   ```

6. **Run the development server:**
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
   ```

7. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Dashboard
- View sales statistics (total sales, transactions, averages)
- Filter by time period (Today, Week, Month, All)
- View payment method breakdowns

### Products Management
- Add new products with name, price, stock, SKU, category
- Edit existing products
- Delete products
- Search products by name, description, or SKU
- View stock levels with color-coded indicators

### Point of Sale (POS)
- Browse products in a grid layout
- Add products to cart by clicking on them
- Adjust quantities in cart
- Process payments with multiple methods:
  - **Cash**: Enter cash received, system calculates change
  - **Card**: Direct payment processing
  - **Digital**: Digital wallet payments
- Automatic inventory deduction on sale completion

### Transactions
- View all transaction history
- See transaction details (items, totals, payment methods)
- Print receipts for any transaction
- Pagination for large transaction lists

## Project Structure

```
pos-system/
├── app/
│   ├── api/
│   │   ├── products/
│   │   │   ├── route.ts          # Product CRUD endpoints
│   │   │   └── [id]/route.ts     # Individual product operations
│   │   └── transactions/
│   │       ├── route.ts           # Transaction creation and listing
│   │       └── stats/route.ts     # Sales statistics endpoint
│   ├── pos/
│   │   └── page.tsx               # POS sales interface
│   ├── products/
│   │   └── page.tsx               # Products management page
│   ├── transactions/
│   │   └── page.tsx               # Transactions history page
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Dashboard
│   └── globals.css                # Global styles
├── components/
│   ├── Navbar.tsx                 # Navigation component
│   └── ProductModal.tsx           # Product add/edit modal
├── lib/
│   └── mongodb.ts                 # MongoDB connection utility
├── models/
│   ├── Product.ts                 # Product Mongoose model
│   └── Transaction.ts             # Transaction Mongoose model
└── .env.local                      # Environment variables (create from .env.local.example)
```

## API Endpoints

### Products
- `GET /api/products` - List all products (supports ?search= and ?category= query params)
- `POST /api/products` - Create a new product
- `GET /api/products/[id]` - Get a specific product
- `PUT /api/products/[id]` - Update a product
- `DELETE /api/products/[id]` - Delete a product

### Transactions
- `GET /api/transactions` - List transactions (supports ?page= and ?limit= query params)
- `POST /api/transactions` - Create a new transaction
- `GET /api/transactions/stats` - Get sales statistics (supports ?period= query param: today, week, month, all)

## Building for Production

```bash
npm run build
npm start
```

## Environment Variables

- `MONGODB_URI`: MongoDB connection string (required)

## Features in Detail

### Inventory Management
- Stock levels are automatically updated when products are sold
- Low stock warnings (color-coded: green > 10, yellow 1-10, red = 0)
- Prevents sales when stock is insufficient

### Payment Processing
- **Cash Payments**: Validates cash received amount and calculates change
- **Card/Digital Payments**: Direct processing without change calculation
- All payment methods are tracked in transaction history

### Receipt Generation
- Printable receipts with transaction details
- Includes all items, prices, quantities, and totals
- Payment method and change information (for cash payments)

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running (check with `mongosh` or MongoDB Compass)
- Verify the connection string in `.env.local`
- Check firewall settings if using MongoDB Atlas

### Port Already in Use
- Change the port: `npm run dev -- -p 3001`
- Or stop the process using port 3000

## License

This project is open source and available for use.

## Support

For issues or questions, please check the Next.js documentation or MongoDB documentation.
