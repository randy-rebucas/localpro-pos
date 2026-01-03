#!/usr/bin/env tsx
/**
 * Test Automation Script
 * Tests all automation endpoints
 * 
 * Usage: npx tsx scripts/test-automations.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local first (takes precedence), then .env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
// Use actual CRON_SECRET from environment, or allow testing without it
const CRON_SECRET = process.env.CRON_SECRET;

interface TestResult {
  name: string;
  success: boolean;
  message: string;
  data?: any;
}

async function testAutomation(name: string, endpoint: string): Promise<TestResult> {
  try {
    // Handle endpoints that already have query params
    const separator = endpoint.includes('?') ? '&' : '?';
    // Only add secret if CRON_SECRET is configured
    const secretParam = CRON_SECRET ? `${separator}secret=${CRON_SECRET}` : '';
    const url = `${BASE_URL}${endpoint}${secretParam}`;
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Check if response is HTML (error page)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const text = await response.text();
      console.log(`   ❌ Server returned HTML (likely 404 or error page)`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      return {
        name,
        success: false,
        message: `Server returned HTML instead of JSON. Status: ${response.status}. Is the server running?`,
      };
    }
    
    const data = await response.json();
    
    if (response.ok && data.success !== false) {
      console.log(`   ✅ Success: ${data.message || 'OK'}`);
      return {
        name,
        success: true,
        message: data.message || 'OK',
        data,
      };
    } else {
      console.log(`   ❌ Failed: ${data.error || data.message || 'Unknown error'}`);
      console.log(`   Status: ${response.status}`);
      return {
        name,
        success: false,
        message: data.error || data.message || 'Unknown error',
        data,
      };
    }
  } catch (error: any) {
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      console.log(`   ❌ Connection Error: Is the server running at ${BASE_URL}?`);
      return {
        name,
        success: false,
        message: `Connection failed. Is the server running at ${BASE_URL}?`,
      };
    }
    console.log(`   ❌ Error: ${error.message}`);
    return {
      name,
      success: false,
      message: error.message,
    };
  }
}

async function main() {
  console.log('🚀 Testing 1POS Automations');
  console.log('=====================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Cron Secret: ${CRON_SECRET ? '***' + CRON_SECRET.slice(-4) : 'NOT SET'}`);
  
  if (CRON_SECRET) {
    console.log('   ✅ CRON_SECRET is configured - using authentication');
    console.log(`   Secret length: ${CRON_SECRET.length} characters`);
  } else {
    console.warn('\n⚠️  Note: CRON_SECRET is not set. Endpoints will work without authentication.');
    console.warn('   Set CRON_SECRET in .env.local if you want to test with authentication.');
    console.warn('   Make sure .env.local exists in the project root and contains: CRON_SECRET=your-secret');
  }
  
  // Test server connection first
  console.log('\n🔍 Checking server connection...');
  try {
    const healthCheckUrl = CRON_SECRET 
      ? `${BASE_URL}/api/automations/status?secret=${CRON_SECRET}`
      : `${BASE_URL}/api/automations/status`;
    
    const healthCheck = await fetch(healthCheckUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (healthCheck.ok) {
      console.log('   ✅ Server is reachable and responding');
    } else if (healthCheck.status === 401) {
      console.error('   ❌ Authentication failed!');
      console.error('   The CRON_SECRET in your environment does not match what the server expects.');
      console.error('   Check your .env.local file and ensure CRON_SECRET matches.');
      process.exit(1);
    } else {
      console.log(`   ⚠️  Server responded with status: ${healthCheck.status}`);
    }
  } catch (error: any) {
    console.error(`   ❌ Cannot connect to server at ${BASE_URL}`);
    console.error(`   Error: ${error.message}`);
    console.error('\n💡 Make sure your Next.js server is running:');
    console.error('   npm run dev');
    process.exit(1);
  }

  const tests = [
    { name: 'Automation Status', endpoint: '/api/automations/status' },
    { name: 'Booking Reminders', endpoint: '/api/automations/booking-reminders' },
    { name: 'Booking Confirmations', endpoint: '/api/automations/bookings/confirm' },
    { name: 'No-Show Detection', endpoint: '/api/automations/bookings/no-show' },
    { name: 'Low Stock Alerts', endpoint: '/api/automations/low-stock-alerts' },
    { name: 'Purchase Orders', endpoint: '/api/automations/purchase-orders' },
    { name: 'Sales Report (Daily)', endpoint: '/api/automations/reports/sales?period=daily' },
    { name: 'Transaction Receipts', endpoint: '/api/automations/transaction-receipts' },
    { name: 'Discount Management', endpoint: '/api/automations/discounts/manage' },
    { name: 'Attendance Violations', endpoint: '/api/automations/attendance/violations' },
    { name: 'Break Detection', endpoint: '/api/automations/attendance/break-detection' },
    { name: 'Auto Clock-Out', endpoint: '/api/automations/attendance/auto-clockout' },
    { name: 'Cash Drawer Auto-Close', endpoint: '/api/automations/cash-drawer/auto-close' },
    { name: 'Cash Count Reminders', endpoint: '/api/automations/cash-drawer/reminders' },
    { name: 'Abandoned Cart Reminders', endpoint: '/api/automations/carts/abandoned' },
    { name: 'Product Performance', endpoint: '/api/automations/products/performance' },
    { name: 'Customer Lifetime Value', endpoint: '/api/automations/customers/lifetime-value' },
    { name: 'Session Expiration', endpoint: '/api/automations/sessions/expire' },
    { name: 'Stock Transfer', endpoint: '/api/automations/stock/transfer' },
    { name: 'Predictive Stock', endpoint: '/api/automations/stock/predictive' },
    { name: 'Dynamic Pricing', endpoint: '/api/automations/pricing/dynamic' },
    { name: 'Data Archiving', endpoint: '/api/automations/data/archive' },
    { name: 'Database Backups', endpoint: '/api/automations/backups/create' },
    { name: 'Audit Log Cleanup', endpoint: '/api/automations/audit-logs/cleanup' },
    { name: 'Multi-Branch Sync', endpoint: '/api/automations/sync/multi-branch' },
    { name: 'Suspicious Activity', endpoint: '/api/automations/security/suspicious-activity' },
    { name: 'Sales Trend Analysis (Daily)', endpoint: '/api/automations/analytics/sales-trends?period=daily' },
    { name: 'Sales Trend Analysis (Weekly)', endpoint: '/api/automations/analytics/sales-trends?period=weekly' },
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    const result = await testAutomation(test.name, test.endpoint);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n\n📊 Test Summary');
  console.log('=====================================');
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${results.length}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.name}: ${r.message}`);
    });
  }
  
  console.log('\n✨ Testing complete!');
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
