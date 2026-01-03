#!/usr/bin/env node

/**
 * POS System Installation Script
 * Run with: npm run install:full or npm run setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`  ${message}`, 'cyan');
}

function logStep(step, title) {
  console.log('');
  log(`Step ${step}: ${title}`, 'bright');
  log('─'.repeat(50), 'cyan');
}

// Check if command exists
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Generate random JWT secret
function generateJWTSecret() {
  return crypto.randomBytes(32).toString('hex');
}

// Reset admin users for a tenant
async function resetAdminUsers(tenantSlug = 'default') {
  try {
    logInfo(`Resetting admin users for tenant: ${tenantSlug}...`);
    
    // Create a temporary reset script
    const resetScriptPath = path.join(process.cwd(), 'scripts', 'reset-admin-users.ts');
    const resetScriptContent = `import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import User from '../models/User';
import Tenant from '../models/Tenant';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/1pos';
const tenantSlug = process.argv[2] || 'default';

async function resetAdminUsers() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) {
      console.log('Tenant "' + tenantSlug + '" not found');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    const result = await User.deleteMany({ 
      tenantId: tenant._id, 
      role: { $in: ['admin', 'owner'] } 
    });
    
    console.log('Deleted ' + result.deletedCount + ' admin user(s) for tenant "' + tenantSlug + '"');
    await mongoose.disconnect();
  } catch (error: any) {
    console.error('Error resetting admin users:', error.message);
    process.exit(1);
  }
}

resetAdminUsers();
`;
    
    fs.writeFileSync(resetScriptPath, resetScriptContent);
    
    try {
      execSync(`npx tsx scripts/reset-admin-users.ts ${tenantSlug}`, { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      logSuccess(`Admin users reset for tenant: ${tenantSlug}`);
    } catch (error) {
      logWarning(`Failed to reset admin users: ${error.message}`);
      logInfo('Continuing with installation...');
    } finally {
      // Clean up temporary script
      if (fs.existsSync(resetScriptPath)) {
        try {
          fs.unlinkSync(resetScriptPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
    }
  } catch (error) {
    logWarning(`Failed to reset admin users: ${error.message}`);
    logInfo('Continuing with installation...');
  }
}

// Main installation function
async function install() {
  console.log('');
  log('═══════════════════════════════════════════════════════', 'bright');
  log('  POS System - Installation Script', 'bright');
  log('═══════════════════════════════════════════════════════', 'bright');
  console.log('');

  try {
    // Step 1: Check prerequisites
    logStep(1, 'Checking Prerequisites');
    
    if (!commandExists('node')) {
      logError('Node.js is not installed. Please install Node.js 18+ first.');
      process.exit(1);
    }

    const nodeVersion = execSync('node -v', { encoding: 'utf-8' }).trim();
    const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0]);
    
    if (majorVersion < 18) {
      logError(`Node.js version 18+ is required. Current version: ${nodeVersion}`);
      process.exit(1);
    }

    logSuccess(`Node.js version: ${nodeVersion}`);

    if (!commandExists('npm')) {
      logError('npm is not installed. Please install npm first.');
      process.exit(1);
    }

    const npmVersion = execSync('npm -v', { encoding: 'utf-8' }).trim();
    logSuccess(`npm version: ${npmVersion}`);
    console.log('');

    // Step 2: Clean environment (optional)
    logStep(2, 'Cleaning Environment');
    
    const cleanEnv = process.argv.includes('--clean') || process.argv.includes('-c');
    
    if (cleanEnv) {
      const dirsToClean = ['node_modules', '.next', '.turbo'];
      const filesToClean = ['package-lock.json'];

      dirsToClean.forEach(dir => {
        const dirPath = path.join(process.cwd(), dir);
        if (fs.existsSync(dirPath)) {
          logInfo(`Removing ${dir}...`);
          fs.rmSync(dirPath, { recursive: true, force: true });
          logSuccess(`${dir} removed`);
        }
      });

      filesToClean.forEach(file => {
        const filePath = path.join(process.cwd(), file);
        if (fs.existsSync(filePath)) {
          logInfo(`Removing ${file}...`);
          fs.unlinkSync(filePath);
          logSuccess(`${file} removed`);
        }
      });
    } else {
      logInfo('Skipping clean (use --clean flag to clean before install)');
    }
    console.log('');

    // Step 3: Setup environment variables
    logStep(3, 'Setting Up Environment Variables');
    
    const envPath = path.join(process.cwd(), '.env.local');
    const envExamplePath = path.join(process.cwd(), '.env.example');

    if (!fs.existsSync(envPath)) {
      logInfo('Creating .env.local file...');
      
      let envContent = '';
      
      // Check if .env.example exists
      if (fs.existsSync(envExamplePath)) {
        envContent = fs.readFileSync(envExamplePath, 'utf-8');
        logInfo('Using .env.example as template');
      } else {
        // Create default .env.local
        envContent = `# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/1pos

# JWT Authentication Secret (CHANGE THIS IN PRODUCTION!)
JWT_SECRET=${generateJWTSecret()}

# Application Environment
NODE_ENV=development
PORT=3000

# Tenant Configuration
DEFAULT_TENANT_SLUG=default
`;
        logInfo('Creating default .env.local');
      }

      fs.writeFileSync(envPath, envContent);
      logSuccess('.env.local created');
      
      // Check if JWT_SECRET needs to be set
      if (envContent.includes('your-super-secret') || envContent.includes('CHANGE THIS')) {
        const updatedContent = envContent.replace(
          /JWT_SECRET=.*/,
          `JWT_SECRET=${generateJWTSecret()}`
        );
        fs.writeFileSync(envPath, updatedContent);
        logSuccess('JWT_SECRET generated and set');
      }
    } else {
      logInfo('.env.local already exists, skipping...');
      
      // Check if JWT_SECRET is set
      const envContent = fs.readFileSync(envPath, 'utf-8');
      if (!envContent.includes('JWT_SECRET=') || envContent.match(/JWT_SECRET=(your-super-secret|CHANGE THIS)/)) {
        logWarning('JWT_SECRET not set or using placeholder. Please update .env.local');
      }
    }
    console.log('');

    // Step 4: Install dependencies
    logStep(4, 'Installing Dependencies');
    
    logInfo('Running npm install (this may take a few minutes)...');
    try {
      execSync('npm install', { stdio: 'inherit' });
      logSuccess('Dependencies installed successfully');
    } catch (error) {
      logError('Failed to install dependencies');
      throw error;
    }
    console.log('');

    // Step 5: Build application
    logStep(5, 'Building Application');
    
    logInfo('Running npm run build...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
      logSuccess('Application built successfully');
    } catch (error) {
      logWarning('Build failed, but installation continues...');
      logInfo('You can build later with: npm run build');
    }
    console.log('');

    // Step 6: Database setup (optional)
    logStep(6, 'Database Setup');
    
    // Check if we should create default tenant
    const skipSetup = process.argv.includes('--skip-db');
    
    if (!skipSetup) {
      // Check if user wants to create tenant and admin interactively
      const createTenant = process.argv.includes('--create-tenant') || process.argv.includes('--create-admin');
      const createAdmin = process.argv.includes('--create-admin');
      
      if (createTenant || createAdmin) {
        // Create default tenant first
        logInfo('Creating default tenant...');
        try {
          execSync('npx tsx scripts/create-default-tenant.ts', { stdio: 'inherit' });
          logSuccess('Default tenant created');
        } catch (error) {
          logWarning('Failed to create default tenant (may already exist)');
        }
        
        if (createAdmin) {
          // Reset admin users before creating new one (default behavior, can be skipped with --no-reset)
          const skipReset = process.argv.includes('--no-reset');
          if (!skipReset) {
            await resetAdminUsers('default');
          } else {
            logInfo('Skipping admin user reset (--no-reset flag)');
          }
          
          // Get admin user details from command line or use defaults
          const tenantSlug = process.argv.find(arg => arg.startsWith('--tenant='))?.split('=')[1] || 'default';
          const adminEmail = process.argv.find(arg => arg.startsWith('--email='))?.split('=')[1] || 'admin@example.com';
          const adminPassword = process.argv.find(arg => arg.startsWith('--password='))?.split('=')[1] || 'Admin123!';
          const adminName = process.argv.find(arg => arg.startsWith('--name='))?.split('=')[1] || 'Administrator';
          
          logInfo('Creating admin user...');
          try {
            execSync(`npx tsx scripts/create-admin-user.ts ${tenantSlug} ${adminEmail} ${adminPassword} "${adminName}"`, { 
              stdio: 'inherit' 
            });
            logSuccess('Admin user created successfully');
          } catch (error) {
            logWarning('Failed to create admin user');
          }
        }
      } else {
        logInfo('To create default tenant, run:');
        logInfo('  npx tsx scripts/create-default-tenant.ts', 'yellow');
        logInfo('');
        logInfo('To create admin user (with automatic reset), run:');
        logInfo('  node scripts/install.js --create-admin --email=admin@example.com --password=Admin123!', 'yellow');
        logInfo('  (Use --no-reset to skip reset)');
        logInfo('');
        logInfo('Or manually create admin user:');
        logInfo('  npx tsx scripts/create-admin-user.ts <tenant-slug> <email> <password> <name>', 'yellow');
        logInfo('');
        logInfo('Or use flags to create tenant and admin automatically:');
        logInfo('  node scripts/install.js --create-tenant --create-admin --email=admin@example.com --password=Admin123!', 'yellow');
      }
    } else {
      logInfo('Skipping database setup (--skip-db flag)');
    }
    console.log('');

    // Final summary
    log('═══════════════════════════════════════════════════════', 'bright');
    log('  Installation Complete!', 'green');
    log('═══════════════════════════════════════════════════════', 'bright');
    console.log('');
    log('Next steps:', 'bright');
    logInfo('1. Update .env.local with your MongoDB connection string');
    logInfo('2. Create default tenant: npx tsx scripts/create-default-tenant.ts');
    logInfo('3. Create admin user (automatically resets existing admins):');
    logInfo('   node scripts/install.js --create-admin --email=admin@example.com --password=Admin123!');
    logInfo('   Or manually: npx tsx scripts/create-admin-user.ts default admin@example.com password "Admin"');
    logInfo('4. Start development server: npm run dev');
    console.log('');

  } catch (error) {
    console.log('');
    logError('Installation failed!');
    logError(error.message);
    process.exit(1);
  }
}

// Run installation
if (require.main === module) {
  install();
}

module.exports = { install };

