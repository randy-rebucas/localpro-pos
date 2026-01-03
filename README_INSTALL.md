# Installation Guide

This guide will help you install and set up the POS System from scratch.

## Quick Start

### For macOS/Linux:

```bash
./install.sh
```

### For Windows (PowerShell):

```powershell
.\install.ps1
```

## What the Installation Script Does

The installation script performs the following steps:

1. **Cleans Environment**
   - Removes `node_modules` directory
   - Removes `package-lock.json`
   - Removes `.next` build directory
   - Removes `.turbo` cache directory

2. **Checks Prerequisites**
   - Verifies Node.js 18+ is installed
   - Verifies npm is installed

3. **Environment Configuration**
   - Creates `.env.local` file if it doesn't exist
   - Generates a random JWT_SECRET if needed
   - Sets up default configuration

4. **Installs Dependencies**
   - Runs `npm install` to install all required packages

5. **Builds Application**
   - Runs `npm run build` to build the Next.js application

6. **Database Setup** (Optional)
   - Creates default tenant
   - Optionally creates admin user

## Manual Installation

If you prefer to install manually:

### 1. Prerequisites

- **Node.js 18+** - [Download Node.js](https://nodejs.org/)
- **npm** (comes with Node.js)
- **MongoDB** - [Download MongoDB](https://www.mongodb.com/try/download/community) or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)

### 2. Clean Environment

```bash
# Remove existing installations
rm -rf node_modules package-lock.json .next .turbo
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Environment Setup

Create a `.env.local` file:

```bash
cp .env.example .env.local
```

Or create it manually with:

```env
# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/1pos

# JWT Authentication (CHANGE THIS IN PRODUCTION!)
JWT_SECRET=your-super-secret-random-string-min-32-chars

# Application
NODE_ENV=development
PORT=3000

# Tenant Configuration
DEFAULT_TENANT_SLUG=default
```

**Important:** Generate a secure JWT_SECRET:

```bash
# macOS/Linux
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Build Application

```bash
npm run build
```

### 6. Create Default Tenant

```bash
npx tsx scripts/create-default-tenant.ts
```

### 7. Create Admin User (Optional)

```bash
npx tsx scripts/create-admin-user.ts default admin@example.com SecurePassword123! "Admin User"
```

## Running the Application

### Development Mode

```bash
npm run dev
```

Access the application at: http://localhost:3000

### Production Mode

```bash
npm start
```

## Troubleshooting

### Installation Fails

1. **Check Node.js version:**
   ```bash
   node -v  # Should be 18.0.0 or higher
   ```

2. **Clear npm cache:**
   ```bash
   npm cache clean --force
   ```

3. **Delete node_modules and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Build Fails

1. **Check TypeScript errors:**
   ```bash
   npx tsc --noEmit
   ```

2. **Check for missing dependencies:**
   ```bash
   npm install
   ```

### Database Connection Issues

1. **Verify MongoDB is running:**
   ```bash
   # Local MongoDB
   mongosh
   
   # Or check MongoDB Atlas connection string
   ```

2. **Update MONGODB_URI in .env.local:**
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
   ```

### Script Execution Issues

If `npx tsx` doesn't work:

1. **Install tsx globally:**
   ```bash
   npm install -g tsx
   ```

2. **Or use ts-node:**
   ```bash
   npm install -D ts-node
   npx ts-node scripts/create-default-tenant.ts
   ```

## Post-Installation

After installation:

1. **Update Settings:**
   - Access `/default/en/settings` to configure tenant settings
   - Set currency, branding, contact information

2. **Create Products:**
   - Navigate to Products page
   - Add your inventory

3. **Start Selling:**
   - Use the POS page to process transactions

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production` in `.env.local`
2. Use a strong, unique `JWT_SECRET`
3. Configure proper MongoDB connection (Atlas recommended)
4. Set up SSL/HTTPS
5. Configure proper CORS settings
6. Set up monitoring and logging

See `PRODUCTION_README.md` for detailed production setup instructions.

## Support

If you encounter issues:

1. Check the error messages in the terminal
2. Verify all prerequisites are installed
3. Check `.env.local` configuration
4. Review the logs for specific errors

## Next Steps

- Read `TENANT_SETTINGS.md` for configuring tenant settings
- Read `ENTERPRISE_FEATURES.md` for enterprise features
- Read `PRODUCTION_README.md` for production deployment

