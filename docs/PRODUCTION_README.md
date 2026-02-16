# Production Deployment Guide

This guide covers setting up the POS system for production deployment.

## Prerequisites

- Node.js 18+ and npm
- MongoDB 6.0+
- Environment variables configured
- SSL certificate (for HTTPS in production)

## Environment Variables

Create a `.env.local` file (or set environment variables in your hosting platform):

```bash
# Database
MONGODB_URI=mongodb://your-mongodb-connection-string

# JWT Authentication (REQUIRED - Change in production!)
JWT_SECRET=your-super-secret-random-string-min-32-chars
JWT_EXPIRES_IN=7d

# Application
NODE_ENV=production
PORT=3000

# Tenant Configuration
DEFAULT_TENANT_SLUG=default

# Security
ALLOWED_ORIGINS=https://yourdomain.com
```

**⚠️ IMPORTANT**: Never commit `.env.local` to version control. Use `.env.example` as a template.

## Initial Setup

### 1. Create Default Tenant

```bash
npx tsx scripts/create-default-tenant.ts
```

### 2. Create Admin User

```bash
npx tsx scripts/create-admin-user.ts default admin@example.com SecurePassword123! "Admin User"
```

### 3. Build Application

```bash
npm run build
```

### 4. Start Production Server

```bash
npm start
```

## Data Models

### Core Entities

1. **Tenant** - Multi-tenant organization/store
2. **User** - User accounts with role-based access
3. **Product** - Products with inventory tracking
4. **Category** - Product categories
5. **Transaction** - Sales transactions with receipts
6. **StockMovement** - Inventory change tracking
7. **AuditLog** - Activity audit trail

## Authentication & Authorization

### User Roles

- **admin**: Full access, can manage users and settings
- **manager**: Can manage products, view reports, manage inventory
- **cashier**: Can process transactions, view products
- **viewer**: Read-only access

### API Authentication

Most API routes require authentication via JWT token:

```javascript
// Login to get token
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password",
  "tenantSlug": "default"
}

// Use token in requests
Authorization: Bearer <token>
// Or via cookie: auth-token
```

## Security Features

1. **Password Hashing**: bcrypt with salt rounds
2. **JWT Tokens**: Secure token-based authentication
3. **Input Validation**: All inputs validated and sanitized
4. **Audit Logging**: All critical actions logged
5. **Role-Based Access**: Fine-grained permissions
6. **Tenant Isolation**: Complete data separation

## Database Indexes

All models include optimized indexes for:
- Tenant-scoped queries
- User lookups
- Product searches
- Transaction queries
- Stock movement tracking
- Audit log queries

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Products
- `GET /api/products?tenant=default` - List products
- `POST /api/products?tenant=default` - Create product (auth required)
- `GET /api/products/[id]?tenant=default` - Get product
- `PUT /api/products/[id]?tenant=default` - Update product (auth required)
- `DELETE /api/products/[id]?tenant=default` - Delete product (auth required)

### Transactions
- `GET /api/transactions?tenant=default` - List transactions (auth required)
- `POST /api/transactions?tenant=default` - Create transaction (auth required)
- `GET /api/transactions/[id]?tenant=default` - Get transaction (auth required)
- `PUT /api/transactions/[id]?tenant=default` - Update transaction (admin/manager only)

### Categories
- `GET /api/categories?tenant=default` - List categories
- `POST /api/categories?tenant=default` - Create category (auth required)

### Users
- `GET /api/users?tenant=default` - List users (admin/manager only)
- `POST /api/users?tenant=default` - Create user (admin/manager only)

### Stock Movements
- `GET /api/stock-movements?tenant=default&productId=xxx` - Get stock history (auth required)

## Production Checklist

- [ ] Set strong `JWT_SECRET` (min 32 characters, random)
- [ ] Configure MongoDB connection string
- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Enable HTTPS/SSL
- [ ] Set up database backups
- [ ] Configure monitoring and logging
- [ ] Set up rate limiting (recommended)
- [ ] Create admin user account
- [ ] Test all critical workflows
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Configure CDN for static assets (if needed)

## Monitoring

### Key Metrics to Monitor

1. **API Response Times**
2. **Database Query Performance**
3. **Error Rates**
4. **Authentication Failures**
5. **Transaction Volume**
6. **Stock Levels**

### Audit Logs

All critical actions are logged in the `AuditLog` collection:
- User logins/logouts
- Product create/update/delete
- Transaction creation/cancellation/refunds
- Stock adjustments
- User management

Query audit logs:
```javascript
GET /api/audit-logs?tenant=default&action=create&entityType=product
```

## Backup Strategy

1. **Database Backups**: Daily MongoDB backups
2. **Audit Log Retention**: Keep audit logs for compliance (configurable)
3. **Transaction History**: Maintain transaction records per business requirements

## Scaling Considerations

1. **Database**: Use MongoDB replica sets for high availability
2. **Application**: Horizontal scaling with load balancer
3. **Caching**: Consider Redis for session management
4. **CDN**: Use CDN for static assets
5. **Rate Limiting**: Implement rate limiting per tenant/user

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Check JWT_SECRET is set correctly
2. **Database Connection**: Verify MONGODB_URI
3. **Tenant Not Found**: Ensure default tenant is created
4. **Stock Issues**: Check StockMovement records for discrepancies

## Support

For production issues, check:
- Application logs
- Database logs
- Audit logs for user actions
- Network request logs

