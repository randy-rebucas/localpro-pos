#!/bin/bash

# POS System Installation Script
# This script resets the environment and performs a fresh installation

set -e  # Exit on error

echo "=========================================="
echo "POS System Installation Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "  $1"
}

# Step 1: Clean/reset environment
echo "Step 1: Cleaning environment..."
echo "--------------------------------"

if [ -d "node_modules" ]; then
    print_info "Removing node_modules..."
    rm -rf node_modules
    print_success "node_modules removed"
else
    print_info "node_modules not found, skipping..."
fi

if [ -f "package-lock.json" ]; then
    print_info "Removing package-lock.json..."
    rm -f package-lock.json
    print_success "package-lock.json removed"
else
    print_info "package-lock.json not found, skipping..."
fi

if [ -d ".next" ]; then
    print_info "Removing .next build directory..."
    rm -rf .next
    print_success ".next directory removed"
else
    print_info ".next directory not found, skipping..."
fi

if [ -d ".turbo" ]; then
    print_info "Removing .turbo cache..."
    rm -rf .turbo
    print_success ".turbo cache removed"
fi

print_success "Environment cleaned successfully"
echo ""

# Step 2: Check Node.js version
echo "Step 2: Checking prerequisites..."
echo "--------------------------------"

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

print_success "Node.js version: $(node -v)"

if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

print_success "npm version: $(npm -v)"
echo ""

# Step 3: Check for .env.local
echo "Step 3: Checking environment configuration..."
echo "--------------------------------"

if [ ! -f ".env.local" ]; then
    print_warning ".env.local file not found"
    print_info "Creating .env.local from .env.example (if exists)..."
    
    if [ -f ".env.example" ]; then
        cp .env.example .env.local
        print_success ".env.local created from .env.example"
        print_warning "Please update .env.local with your configuration before continuing"
    else
        print_info "Creating basic .env.local file..."
        cat > .env.local << EOF
# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/1pos

# JWT Authentication (CHANGE THIS IN PRODUCTION!)
JWT_SECRET=$(openssl rand -hex 32)

# Application
NODE_ENV=development
PORT=3000

# Tenant Configuration
DEFAULT_TENANT_SLUG=default
EOF
        print_success ".env.local created with default values"
        print_warning "Generated random JWT_SECRET. Please update MONGODB_URI if needed."
    fi
else
    print_success ".env.local file exists"
fi
echo ""

# Step 4: Install dependencies
echo "Step 4: Installing dependencies..."
echo "--------------------------------"

print_info "Running npm install (this may take a few minutes)..."
npm install

if [ $? -eq 0 ]; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi
echo ""

# Step 5: Build the application
echo "Step 5: Building application..."
echo "--------------------------------"

print_info "Running npm run build..."
npm run build

if [ $? -eq 0 ]; then
    print_success "Application built successfully"
else
    print_error "Build failed"
    exit 1
fi
echo ""

# Step 6: Database setup (optional)
echo "Step 6: Database setup..."
echo "--------------------------------"

# Check if .env.local exists and has MONGODB_URI
if [ -f ".env.local" ]; then
    if grep -q "MONGODB_URI" .env.local; then
        MONGODB_URI=$(grep "MONGODB_URI" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
        if [ -z "$MONGODB_URI" ] || [ "$MONGODB_URI" = "mongodb://localhost:27017/1pos" ]; then
            print_warning "MongoDB URI is set to default localhost"
            print_info "Make sure MongoDB is running locally, or update MONGODB_URI in .env.local"
        fi
    else
        print_warning "MONGODB_URI not found in .env.local"
        print_info "Please add MONGODB_URI to .env.local before creating tenants"
    fi
else
    print_warning ".env.local file not found"
    print_info "Please create .env.local with MONGODB_URI before creating tenants"
fi

read -p "Do you want to create the default tenant? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Creating default tenant..."
    if npx tsx scripts/create-default-tenant.ts 2>&1; then
        print_success "Default tenant created"
        
        read -p "Do you want to create an admin user? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            read -p "Enter admin email: " ADMIN_EMAIL
            if [ -z "$ADMIN_EMAIL" ]; then
                print_error "Email cannot be empty"
            else
                read -sp "Enter admin password: " ADMIN_PASSWORD
                echo ""
                if [ -z "$ADMIN_PASSWORD" ]; then
                    print_error "Password cannot be empty"
                else
                    read -p "Enter admin name (optional): " ADMIN_NAME
                    
                    if [ -z "$ADMIN_NAME" ]; then
                        ADMIN_NAME="Admin User"
                    fi
                    
                    print_info "Creating admin user..."
                    if npx tsx scripts/create-admin-user.ts default "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$ADMIN_NAME"; then
                        print_success "Admin user created successfully"
                    else
                        print_error "Failed to create admin user"
                    fi
                fi
            fi
        fi
    else
        print_warning "Failed to create default tenant (may already exist)"
    fi
else
    print_info "Skipping tenant creation"
fi
echo ""

# Step 7: Final summary
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
print_success "POS System is ready to use!"
echo ""
echo "Next steps:"
echo "  1. Update .env.local with your MongoDB connection string"
echo "  2. Run 'npm run dev' to start the development server"
echo "  3. Access the application at http://localhost:3000"
echo "  4. Login at http://localhost:3000/login"
echo ""
echo "Available commands:"
echo "  npm run dev      - Start development server"
echo "  npm run build    - Build for production"
echo "  npm start        - Start production server"
echo "  npm run lint     - Run linter"
echo ""

