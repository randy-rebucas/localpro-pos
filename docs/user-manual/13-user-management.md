# 13. User Management

**Available to:** Admin, Owner

## Viewing Users

1. Navigate to **Admin > Users**
2. The user list shows: name, email, role, branch, status, last login

### Filtering

- **By Role** — Owner, Admin, Manager, Cashier, Viewer
- **By Branch** — Filter by assigned branch
- **By Status** — Active, Inactive
- **Search** — By name or email

## Adding a New User

1. Click **Add User**
2. Fill in the details:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Full name |
| **Email** | Yes | Login email (must be unique) |
| **Password** | Yes | Initial password (user should change on first login) |
| **Role** | Yes | Select from: Viewer, Cashier, Manager, Admin, Owner |
| **Branch** | No | Assign to a specific branch |
| **PIN** | No | 4-6 digit PIN for quick login |

3. Click **Save**

### Role Assignment Rules

- **Admins** can create users with roles: Viewer, Cashier, Manager
- **Owners** can create users with any role, including Admin and Owner
- You cannot assign a role higher than your own

## Editing a User

1. Click on the user in the list
2. Modify any fields (name, role, branch, etc.)
3. Click **Save**

### Changing a User's Role

1. Open the user profile
2. Change the **Role** dropdown
3. Click **Save**
4. The user's permissions update immediately on their next page load

## Resetting a User's Password

1. Open the user profile
2. Click **Reset Password**
3. Enter a new temporary password
4. Click **Save**
5. Inform the user of their new password — they should change it on first login

## Deactivating a User

1. Open the user profile
2. Click **Deactivate**
3. The user can no longer log in
4. Their data and transaction history remain intact
5. They can be reactivated later

> **Note:** Users are never hard-deleted. Deactivation preserves all audit trail and transaction history.

## QR Code Badges

For stores using QR login:

1. Open the user profile
2. Click **Generate QR Code**
3. The system creates a unique QR token for the user
4. **Print** the QR code as a staff badge
5. The user can scan their badge to log in

### Regenerating QR Codes

If a QR badge is lost or compromised:
1. Open the user profile
2. Click **Regenerate QR Code**
3. The old code is invalidated immediately
4. Print the new code

## User Activity

Track what each user has done:

1. Open the user profile
2. View recent activity:
   - Last login time
   - Transactions processed
   - Attendance record
3. For full activity, check **Admin > Audit Logs** filtered by user

## Branch Assignment

For multi-branch stores:
1. Edit the user
2. Set their **Branch**
3. The user only sees data for their assigned branch
4. Managers can be assigned to oversee multiple branches

## Permissions Reference

See [Role Permission Reference](./19-role-permissions.md) for a complete matrix of what each role can access.
