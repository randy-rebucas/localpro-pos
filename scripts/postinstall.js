#!/usr/bin/env node

/**
 * Post-install script
 * Runs automatically after npm install
 * Checks for .env.local and provides helpful messages
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.local');

// Only show messages if .env.local doesn't exist
if (!fs.existsSync(envPath)) {
  console.log('');
  console.log('⚠️  .env.local not found!');
  console.log('');
  console.log('To set up your environment:');
  console.log('  1. Run: npm run setup');
  console.log('  2. Or manually create .env.local with your configuration');
  console.log('');
  console.log('For a full installation including database setup:');
  console.log('  npm run install:full');
  console.log('');
}

