/**
 * Test script for customer authentication endpoints
 * 
 * Usage:
 *   tsx scripts/test-customer-auth.ts
 * 
 * Make sure your .env file has Twilio credentials configured
 */

import '../lib/script-runtime';

import 'dotenv/config';
import readline from 'readline';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
const TENANT_SLUG = 'default';

// Test phone number (replace with your test number)
const TEST_PHONE = process.argv[2] || '+1234567890';

async function testCustomerAuth() {
  console.log('🧪 Testing Customer Authentication Flow\n');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Tenant: ${TENANT_SLUG}`);
  console.log(`Test Phone: ${TEST_PHONE}\n`);

  try {
    // Step 1: Send OTP
    console.log('📤 Step 1: Sending OTP...');
    const sendOTPResponse = await fetch(`${API_BASE}/auth/customer/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: TEST_PHONE,
        tenantSlug: TENANT_SLUG,
      }),
    });

    const sendOTPData = await sendOTPResponse.json();
    
    if (!sendOTPData.success) {
      console.error('❌ Failed to send OTP:', sendOTPData.error);
      return;
    }

    console.log('✅ OTP sent successfully!');
    
    // In development, OTP is logged to console
    // In production, check SMS
    if (process.env.NODE_ENV !== 'production') {
      console.log('💡 Check your backend console for the OTP code');
    } else {
      console.log('💡 Check your SMS for the OTP code');
    }

    // Wait for user to enter OTP
    console.log('\n⏳ Waiting for OTP...');
    console.log('Enter the OTP code:');
    
    // For automated testing, you could read from stdin
    // For now, we'll use a placeholder
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const otp = await new Promise<string>((resolve) => {
      rl.question('OTP: ', (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });

    if (!otp || otp.length !== 6) {
      console.error('❌ Invalid OTP format');
      return;
    }

    // Step 2: Verify OTP
    console.log('\n📥 Step 2: Verifying OTP...');
    const verifyOTPResponse = await fetch(`${API_BASE}/auth/customer/verify-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: TEST_PHONE,
        otp,
        tenantSlug: TENANT_SLUG,
        firstName: 'Test',
        lastName: 'User',
      }),
    });

    const verifyOTPData = await verifyOTPResponse.json();

    if (!verifyOTPData.success) {
      console.error('❌ Failed to verify OTP:', verifyOTPData.error);
      return;
    }

    console.log('✅ OTP verified successfully!');
    console.log('📦 Customer Data:', JSON.stringify(verifyOTPData.data.customer, null, 2));
    console.log('🔑 Token received:', verifyOTPData.data.token.substring(0, 20) + '...');

    const token = verifyOTPData.data.token;
    const customerId = verifyOTPData.data.customer._id;

    // Step 3: Test authenticated endpoint - Get bookings
    console.log('\n📋 Step 3: Testing authenticated endpoint (Get Bookings)...');
    const bookingsResponse = await fetch(`${API_BASE}/bookings/customer/${customerId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const bookingsData = await bookingsResponse.json();

    if (!bookingsData.success) {
      console.error('❌ Failed to get bookings:', bookingsData.error);
    } else {
      console.log('✅ Bookings retrieved successfully!');
      console.log('📊 Bookings count:', bookingsData.data.length);
    }

    // Step 4: Test authenticated endpoint - Get orders
    console.log('\n🛍️ Step 4: Testing authenticated endpoint (Get Orders)...');
    const ordersResponse = await fetch(`${API_BASE}/transactions/customer/${customerId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const ordersData = await ordersResponse.json();

    if (!ordersData.success) {
      console.error('❌ Failed to get orders:', ordersData.error);
    } else {
      console.log('✅ Orders retrieved successfully!');
      console.log('📊 Orders count:', ordersData.data.length);
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run tests
testCustomerAuth().catch(console.error);
