# Login Guide

Complete guide to logging in to LocalPro POS using different authentication methods.

## Overview

LocalPro POS supports three login methods:
1. **Email/Password** - Standard login
2. **PIN** - Quick login for cashiers
3. **QR Code** - Contactless login

## Accessing Login

1. Navigate to login page: `/{tenant}/{lang}/login`
2. Login form appears
3. Choose login method

> **Screenshot Placeholder**: [Add screenshot of login page]

## Method 1: Email/Password Login

### Step-by-Step

1. **Enter Email**
   - Type your email address
   - Email format is validated

> **Screenshot Placeholder**: [Add screenshot of email input]

2. **Enter Password**
   - Type your password
   - Password is hidden for security

> **Screenshot Placeholder**: [Add screenshot of password input]

3. **Select Tenant** (if multiple)
   - Choose your store/tenant
   - Or enter tenant slug

> **Screenshot Placeholder**: [Add screenshot of tenant selection]

4. **Click Login**
   - System authenticates
   - Redirects to dashboard on success

> **Screenshot Placeholder**: [Add screenshot of login button and success]

### Login Form

```
┌─────────────────────────────────┐
│  LocalPro POS                   │
│                                 │
│  Email: [________________]      │
│  Password: [____________]       │
│  Tenant: [Select...]            │
│                                 │
│  [Login]                        │
│                                 │
│  [PIN Login] [QR Login]         │
└─────────────────────────────────┘
```

> **Screenshot Placeholder**: [Add screenshot of complete login form]

## Method 2: PIN Login

### When to Use

- Quick login for cashiers
- Fast access during busy times
- No need to type full password

### Step-by-Step

1. **Click "PIN Login"**
   - Switch to PIN login mode
   - PIN input appears

> **Screenshot Placeholder**: [Add screenshot of PIN login button]

2. **Enter PIN**
   - Type your 4-8 digit PIN
   - PIN is masked for security

> **Screenshot Placeholder**: [Add screenshot of PIN input]

3. **Select Tenant**
   - Choose your store
   - Or enter tenant slug

> **Screenshot Placeholder**: [Add screenshot of tenant in PIN login]

4. **Click Login**
   - System authenticates
   - Redirects on success

> **Screenshot Placeholder**: [Add screenshot of PIN login completion]

### PIN Setup

If you don't have a PIN:

1. Log in with email/password
2. Go to Profile → Security
3. Click "Set PIN"
4. Enter 4-8 digit PIN
5. Confirm PIN
6. Save

> **Screenshot Placeholder**: [Add screenshot of PIN setup]

## Method 3: QR Code Login

### When to Use

- Contactless login
- Mobile device access
- Quick access from phone

### Step-by-Step

1. **Click "QR Login"**
   - QR code scanner appears
   - Or enter QR token manually

> **Screenshot Placeholder**: [Add screenshot of QR login option]

2. **Scan QR Code**
   - Use device camera
   - Scan your personal QR code
   - Or enter QR token

> **Screenshot Placeholder**: [Add screenshot of QR code scanning]

3. **Select Tenant**
   - Choose your store
   - Or enter tenant slug

> **Screenshot Placeholder**: [Add screenshot of tenant selection in QR login]

4. **Click Login**
   - System authenticates
   - Redirects on success

> **Screenshot Placeholder**: [Add screenshot of QR login success]

### QR Code Generation

To get your QR code:

1. Log in with email/password
2. Go to Profile → Security
3. Click "Generate QR Code"
4. QR code displays
5. Save or print QR code

> **Screenshot Placeholder**: [Add screenshot of QR code generation]

## Login Troubleshooting

### Invalid Credentials

**Problem**: "Invalid credentials" error

**Solutions**:
- Check email spelling
- Verify password is correct
- Check Caps Lock
- Try password reset

> **Screenshot Placeholder**: [Add screenshot of invalid credentials error]

### Account Locked

**Problem**: Account is locked

**Solutions**:
- Wait 15 minutes
- Contact administrator
- Check email for unlock link

> **Screenshot Placeholder**: [Add screenshot of account locked message]

### Tenant Not Found

**Problem**: "Tenant not found" error

**Solutions**:
- Verify tenant slug is correct
- Check tenant is active
- Contact administrator

> **Screenshot Placeholder**: [Add screenshot of tenant error]

### PIN Not Working

**Problem**: PIN login fails

**Solutions**:
- Verify PIN is correct
- Check PIN is set up
- Try email/password login
- Reset PIN if needed

> **Screenshot Placeholder**: [Add screenshot of PIN error]

## Security Best Practices

### Password Security

- ✅ Use strong passwords
- ✅ Don't share passwords
- ✅ Change password regularly
- ✅ Use different password for each account

### PIN Security

- ✅ Don't share PIN
- ✅ Change PIN if compromised
- ✅ Use different PIN than other systems
- ✅ Don't write PIN down

### QR Code Security

- ✅ Keep QR code secure
- ✅ Don't share QR code
- ✅ Regenerate if lost/stolen
- ✅ Use secure storage for QR code

## Remember Me / Stay Logged In

### Session Duration

- Default: 7 days
- Extended: 30 days (if enabled)
- Auto-logout: After inactivity

> **Screenshot Placeholder**: [Add screenshot of remember me option]

## Logout

### Manual Logout

1. Click user menu (top right)
2. Click "Logout"
3. Confirmed logged out
4. Redirected to login

> **Screenshot Placeholder**: [Add screenshot of logout process]

### Automatic Logout

System automatically logs out:
- After session expires
- After extended inactivity
- On security violation

> **Screenshot Placeholder**: [Add screenshot of auto-logout message]

## Related Documentation

- [Profile Management](./profile.md)
- [Password Management](./password.md)
- [Security Settings](../technical/security.md)

---

**Last Updated**: 2024
