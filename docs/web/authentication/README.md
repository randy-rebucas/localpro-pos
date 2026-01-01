# Authentication & User Management

Complete guide to authentication and user management in the LocalPro POS web application.

## Overview

The LocalPro POS system supports multiple authentication methods and comprehensive user management with role-based access control.

## Features

- ✅ Email/password authentication
- ✅ PIN-based login
- ✅ QR code-based login
- ✅ JWT token sessions
- ✅ Role-based access control (RBAC)
- ✅ User management
- ✅ Profile management
- ✅ Session management

## Documentation

### User Guides
- **[Login Guide](./login.md)** - How to log in using different methods
- **[Profile Management](./profile.md)** - Managing your user profile
- **[Password Management](./password.md)** - Changing passwords and PINs

### Admin Guides
- **[User Management](./admin/users.md)** - Creating and managing users
- **[Role Management](./admin/roles.md)** - Understanding user roles
- **[Permissions](./admin/permissions.md)** - Role-based permissions

### Technical
- **[Authentication Flow](./technical/flow.md)** - Technical authentication details
- **[Session Management](./technical/sessions.md)** - How sessions work
- **[Security](./technical/security.md)** - Security best practices

## Quick Start

### For Users
1. Navigate to login page: `/{tenant}/{lang}/login`
2. Choose login method (email, PIN, or QR)
3. Enter credentials
4. Access the system

### For Admins
1. Go to Admin → Users
2. Click "Add User"
3. Fill in user details
4. Assign role and permissions
5. Save

## User Roles

- **Owner** - Full system access
- **Admin** - Administrative access
- **Manager** - Management functions
- **Cashier** - POS operations
- **Viewer** - Read-only access

## Related Documentation

- [Mobile Authentication API](../mobile/authentication.md)
- [User Management API](../mobile/features/users.md)
- [Security Features](../settings/security.md)

---

**Last Updated**: 2024
