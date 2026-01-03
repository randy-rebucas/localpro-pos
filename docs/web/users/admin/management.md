# User Management - Admin Guide

Complete administrative guide for managing users, roles, and permissions in 1POS.

## Overview

User management allows administrators to create, edit, and manage user accounts, assign roles, and control system access.

## Accessing User Management

1. Log in as Admin or Owner
2. Navigate to **Admin** → **Users**
3. User management interface loads

> **Screenshot Placeholder**: [Add screenshot of admin users page]

## User List View

### Viewing Users

The user list displays:
- User name
- Email address
- Role
- Status (Active/Inactive)
- Last login
- Actions (Edit, Delete, etc.)

> **Screenshot Placeholder**: [Add screenshot of user list]

### Filtering Users

#### By Role

1. Click role filter
2. Select role (Owner, Admin, Manager, Cashier, Viewer)
3. List filters to show only that role

> **Screenshot Placeholder**: [Add screenshot of role filter]

#### By Status

1. Click status filter
2. Select "Active" or "Inactive"
3. List updates

> **Screenshot Placeholder**: [Add screenshot of status filter]

#### By Search

1. Use search bar
2. Type name or email
3. Results filter as you type

> **Screenshot Placeholder**: [Add screenshot of user search]

## Creating Users

### Step 1: Add New User

1. Click **"Add User"** button
2. User creation form appears
3. Fill in user details

> **Screenshot Placeholder**: [Add screenshot of Add User button and form]

### Step 2: Enter User Information

#### Required Fields

- **Name** - User's full name
- **Email** - Email address (must be unique)
- **Password** - Initial password
- **Role** - User role (Owner, Admin, Manager, Cashier, Viewer)

> **Screenshot Placeholder**: [Add screenshot of required fields]

#### Optional Fields

- **Phone** - Phone number
- **Notes** - Internal notes
- **Is Active** - Active status (default: true)

> **Screenshot Placeholder**: [Add screenshot of optional fields]

### Step 3: Assign Role

1. Select role from dropdown
2. Roles available:
   - **Owner** - Full system access
   - **Admin** - Administrative access
   - **Manager** - Management functions
   - **Cashier** - POS operations
   - **Viewer** - Read-only access
3. Role determines permissions

> **Screenshot Placeholder**: [Add screenshot of role selection]

### Step 4: Set Initial Status

1. Toggle **"Is Active"** switch
2. Active users can log in
3. Inactive users cannot log in
4. Can be activated later

> **Screenshot Placeholder**: [Add screenshot of active status toggle]

### Step 5: Save User

1. Review all information
2. Verify email is correct
3. Ensure password is strong
4. Click **"Save User"**
5. User created successfully

> **Screenshot Placeholder**: [Add screenshot of save confirmation]

## Editing Users

### Accessing Edit Mode

1. Go to Users list
2. Click on user
3. Click **"Edit"** button
4. Edit form appears

> **Screenshot Placeholder**: [Add screenshot of edit button]

### Updating User Information

1. Modify fields as needed:
   - Name
   - Email
   - Role
   - Status
2. Click **"Save Changes"**
3. Updates applied

> **Screenshot Placeholder**: [Add screenshot of edit form]

### Changing User Role

1. Edit user
2. Select new role
3. Save changes
4. Permissions update immediately

> **Screenshot Placeholder**: [Add screenshot of role change]

## User Roles and Permissions

### Role Hierarchy

```
Owner > Admin > Manager > Cashier > Viewer
```

### Role Permissions

#### Owner
- ✅ Full system access
- ✅ All admin functions
- ✅ User management
- ✅ System settings
- ✅ All reports

> **Screenshot Placeholder**: [Add screenshot of owner permissions]

#### Admin
- ✅ Administrative access
- ✅ User management (except owners)
- ✅ Product management
- ✅ Transaction management
- ✅ Reports access

> **Screenshot Placeholder**: [Add screenshot of admin permissions]

#### Manager
- ✅ Management functions
- ✅ Product management
- ✅ Transaction viewing
- ✅ Reports access
- ✅ Limited user management

> **Screenshot Placeholder**: [Add screenshot of manager permissions]

#### Cashier
- ✅ POS operations
- ✅ Process transactions
- ✅ View products
- ✅ Limited reports
- ❌ No admin access

> **Screenshot Placeholder**: [Add screenshot of cashier permissions]

#### Viewer
- ✅ Read-only access
- ✅ View reports
- ✅ View transactions
- ❌ No modifications
- ❌ No POS access

> **Screenshot Placeholder**: [Add screenshot of viewer permissions]

## Managing User Status

### Activating Users

1. Go to user
2. Click **"Activate"** button
3. User can now log in
4. Status updates

> **Screenshot Placeholder**: [Add screenshot of activation]

### Deactivating Users

1. Go to user
2. Click **"Deactivate"** button
3. Confirm deactivation
4. User cannot log in
5. Account preserved

> **Screenshot Placeholder**: [Add screenshot of deactivation]

## User Security Features

### Setting PIN

1. Edit user
2. Go to "Security" section
3. Click **"Set PIN"**
4. Enter 4-8 digit PIN
5. Confirm PIN
6. Save

> **Screenshot Placeholder**: [Add screenshot of PIN setup]

### Generating QR Code

1. Edit user
2. Go to "Security" section
3. Click **"Generate QR Code"**
4. QR code displays
5. User can use for login

> **Screenshot Placeholder**: [Add screenshot of QR code generation]

### Resetting Password

1. Edit user
2. Go to "Security" section
3. Click **"Reset Password"**
4. Enter new password
5. User must change on next login
6. Save

> **Screenshot Placeholder**: [Add screenshot of password reset]

## Bulk User Operations

### Selecting Multiple Users

1. Check boxes next to users
2. Or use "Select All"
3. Selected users highlighted

> **Screenshot Placeholder**: [Add screenshot of user selection]

### Bulk Actions

#### Bulk Activate/Deactivate

1. Select users
2. Click "Bulk Activate" or "Bulk Deactivate"
3. Confirm action
4. Status updated for all

> **Screenshot Placeholder**: [Add screenshot of bulk status change]

#### Bulk Role Change

1. Select users
2. Click "Change Role"
3. Select new role
4. Confirm change
5. Roles updated

> **Screenshot Placeholder**: [Add screenshot of bulk role change]

## User Activity

### Viewing User Activity

1. Click on user
2. Go to "Activity" tab
3. View:
   - Login history
   - Transactions processed
   - Actions performed
   - Last activity

> **Screenshot Placeholder**: [Add screenshot of user activity]

### Login History

Shows:
- Login dates and times
- Login methods (email, PIN, QR)
- IP addresses
- Login success/failure

> **Screenshot Placeholder**: [Add screenshot of login history]

## Best Practices

### User Creation

- ✅ Use strong passwords
- ✅ Assign appropriate roles
- ✅ Verify email addresses
- ✅ Set up PIN/QR for cashiers
- ✅ Document user purpose

### Role Management

- ✅ Follow principle of least privilege
- ✅ Review roles regularly
- ✅ Update roles as needed
- ✅ Document role changes

### Security

- ✅ Require password changes
- ✅ Monitor login activity
- ✅ Deactivate unused accounts
- ✅ Review permissions regularly

## Related Documentation

- [Authentication Guide](../authentication/user-guide/login.md)
- [Role Management](./roles.md)
- [Permissions](./permissions.md)

---

**Last Updated**: 2024
