# POS System Installation Script (PowerShell)
# This script resets the environment and performs a fresh installation

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "POS System Installation Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Clean/reset environment
Write-Host "Step 1: Cleaning environment..." -ForegroundColor Yellow
Write-Host "--------------------------------" -ForegroundColor Yellow

if (Test-Path "node_modules") {
    Write-Host "  Removing node_modules..." -ForegroundColor Gray
    Remove-Item -Recurse -Force "node_modules"
    Write-Host "  ✓ node_modules removed" -ForegroundColor Green
} else {
    Write-Host "  node_modules not found, skipping..." -ForegroundColor Gray
}

if (Test-Path "package-lock.json") {
    Write-Host "  Removing package-lock.json..." -ForegroundColor Gray
    Remove-Item -Force "package-lock.json"
    Write-Host "  ✓ package-lock.json removed" -ForegroundColor Green
} else {
    Write-Host "  package-lock.json not found, skipping..." -ForegroundColor Gray
}

if (Test-Path ".next") {
    Write-Host "  Removing .next build directory..." -ForegroundColor Gray
    Remove-Item -Recurse -Force ".next"
    Write-Host "  ✓ .next directory removed" -ForegroundColor Green
} else {
    Write-Host "  .next directory not found, skipping..." -ForegroundColor Gray
}

if (Test-Path ".turbo") {
    Write-Host "  Removing .turbo cache..." -ForegroundColor Gray
    Remove-Item -Recurse -Force ".turbo"
    Write-Host "  ✓ .turbo cache removed" -ForegroundColor Green
}

Write-Host "  ✓ Environment cleaned successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Check Node.js version
Write-Host "Step 2: Checking prerequisites..." -ForegroundColor Yellow
Write-Host "--------------------------------" -ForegroundColor Yellow

try {
    $nodeVersion = node -v
    Write-Host "  ✓ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js is not installed. Please install Node.js 18+ first." -ForegroundColor Red
    exit 1
}

try {
    $npmVersion = npm -v
    Write-Host "  ✓ npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ npm is not installed. Please install npm first." -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Check for .env.local
Write-Host "Step 3: Checking environment configuration..." -ForegroundColor Yellow
Write-Host "--------------------------------" -ForegroundColor Yellow

if (-not (Test-Path ".env.local")) {
    Write-Host "  ⚠ .env.local file not found" -ForegroundColor Yellow
    
    if (Test-Path ".env.example") {
        Write-Host "  Creating .env.local from .env.example..." -ForegroundColor Gray
        Copy-Item ".env.example" ".env.local"
        Write-Host "  ✓ .env.local created from .env.example" -ForegroundColor Green
        Write-Host "  ⚠ Please update .env.local with your configuration" -ForegroundColor Yellow
    } else {
        Write-Host "  Creating basic .env.local file..." -ForegroundColor Gray
        $jwtSecret = -join ((48..57) + (65..70) | Get-Random -Count 64 | ForEach-Object {[char]$_})
        $envContent = @"
# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/1pos

# JWT Authentication (CHANGE THIS IN PRODUCTION!)
JWT_SECRET=$jwtSecret

# Application
NODE_ENV=development
PORT=3000

# Tenant Configuration
DEFAULT_TENANT_SLUG=default
"@
        $envContent | Out-File -FilePath ".env.local" -Encoding utf8
        Write-Host "  ✓ .env.local created with default values" -ForegroundColor Green
        Write-Host "  ⚠ Generated random JWT_SECRET. Please update MONGODB_URI if needed." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✓ .env.local file exists" -ForegroundColor Green
}
Write-Host ""

# Step 4: Install dependencies
Write-Host "Step 4: Installing dependencies..." -ForegroundColor Yellow
Write-Host "--------------------------------" -ForegroundColor Yellow

Write-Host "  Running npm install (this may take a few minutes)..." -ForegroundColor Gray
npm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "  ✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 5: Build the application
Write-Host "Step 5: Building application..." -ForegroundColor Yellow
Write-Host "--------------------------------" -ForegroundColor Yellow

Write-Host "  Running npm run build..." -ForegroundColor Gray
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Application built successfully" -ForegroundColor Green
} else {
    Write-Host "  ✗ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 6: Database setup (optional)
Write-Host "Step 6: Database setup..." -ForegroundColor Yellow
Write-Host "--------------------------------" -ForegroundColor Yellow

$createTenant = Read-Host "Do you want to create the default tenant? (y/n)"
if ($createTenant -eq "y" -or $createTenant -eq "Y") {
    Write-Host "  Creating default tenant..." -ForegroundColor Gray
    npx tsx scripts/create-default-tenant.ts
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Default tenant created" -ForegroundColor Green
        
        $createAdmin = Read-Host "Do you want to create an admin user? (y/n)"
        if ($createAdmin -eq "y" -or $createAdmin -eq "Y") {
            $adminEmail = Read-Host "Enter admin email"
            $adminPassword = Read-Host "Enter admin password" -AsSecureString
            $adminName = Read-Host "Enter admin name (optional)"
            
            if ([string]::IsNullOrWhiteSpace($adminName)) {
                $adminName = "Admin User"
            }
            
            $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
            $plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
            
            Write-Host "  Creating admin user..." -ForegroundColor Gray
            npx tsx scripts/create-admin-user.ts default $adminEmail $plainPassword $adminName
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Admin user created successfully" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Failed to create admin user" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "  ⚠ Failed to create default tenant (may already exist)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Skipping tenant creation" -ForegroundColor Gray
}
Write-Host ""

# Step 7: Final summary
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ POS System is ready to use!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Update .env.local with your MongoDB connection string"
Write-Host "  2. Run 'npm run dev' to start the development server"
Write-Host "  3. Access the application at http://localhost:3000"
Write-Host "  4. Login at http://localhost:3000/login"
Write-Host ""
Write-Host "Available commands:" -ForegroundColor Yellow
Write-Host "  npm run dev      - Start development server"
Write-Host "  npm run build    - Build for production"
Write-Host "  npm start        - Start production server"
Write-Host "  npm run lint     - Run linter"
Write-Host ""

