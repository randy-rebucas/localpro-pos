# Users API - Mobile

Complete guide to managing users from mobile applications.

## Overview

The Users API allows you to:
- List users
- Get user details
- Create users
- Update users
- Manage user roles
- Handle user authentication

## Endpoints

### List Users

**Endpoint:** `GET /api/users`

**Query Parameters:**
- `role` (string) - Filter by role
- `isActive` (boolean) - Filter by active status

**Example:**
```typescript
// Get all users
const users = await apiClient.request('/users');

// Get only active users
const activeUsers = await apiClient.request('/users?isActive=true');

// Get users by role
const cashiers = await apiClient.request('/users?role=cashier');
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "user_id",
      "email": "user@example.com",
      "name": "User Name",
      "role": "cashier",
      "isActive": true,
      "lastLogin": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Get User by ID

**Endpoint:** `GET /api/users/:id`

**Example:**
```typescript
const user = await apiClient.request(`/users/${userId}`);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "role": "cashier",
    "isActive": true,
    "hasPIN": true,
    "lastLogin": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Create User

**Endpoint:** `POST /api/users`

**Request:**
```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "password": "password123",
  "role": "cashier",
  "isActive": true
}
```

**Example:**
```typescript
const newUser = await apiClient.request('/users', {
  method: 'POST',
  body: {
    email: 'newuser@example.com',
    name: 'New User',
    password: 'password123',
    role: 'cashier',
    isActive: true
  }
});
```

### Update User

**Endpoint:** `PUT /api/users/:id`

**Example:**
```typescript
const updated = await apiClient.request(`/users/${userId}`, {
  method: 'PUT',
  body: {
    name: 'Updated Name',
    role: 'manager',
    isActive: true
  }
});
```

### Delete User

**Endpoint:** `DELETE /api/users/:id`

**Example:**
```typescript
await apiClient.request(`/users/${userId}`, {
  method: 'DELETE'
});
```

### Set User PIN

**Endpoint:** `POST /api/users/:id/pin`

**Request:**
```json
{
  "pin": "1234"
}
```

**Example:**
```typescript
await apiClient.request(`/users/${userId}/pin`, {
  method: 'POST',
  body: {
    pin: '1234'
  }
});
```

### Generate QR Code

**Endpoint:** `GET /api/users/:id/qr-code`

**Example:**
```typescript
const qrCode = await apiClient.request(`/users/${userId}/qr-code`);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qrToken": "qr_token_string",
    "qrCodeUrl": "data:image/png;base64,..."
  }
}
```

## User Roles

### Available Roles

- **owner** - Full system access
- **admin** - Administrative access
- **manager** - Management functions
- **cashier** - POS operations
- **viewer** - Read-only access

### Role Hierarchy

```
owner > admin > manager > cashier > viewer
```

## Complete Example

```typescript
class UserService {
  constructor(private apiClient: APIClient) {}

  async getAllUsers(filters?: {
    role?: string;
    isActive?: boolean;
  }) {
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.isActive !== undefined) {
      params.append('isActive', String(filters.isActive));
    }

    const query = params.toString();
    return this.apiClient.request(`/users${query ? `?${query}` : ''}`);
  }

  async getUser(id: string) {
    return this.apiClient.request(`/users/${id}`);
  }

  async createUser(data: {
    email: string;
    name: string;
    password: string;
    role: string;
    isActive?: boolean;
  }) {
    return this.apiClient.request('/users', {
      method: 'POST',
      body: data
    });
  }

  async updateUser(id: string, updates: {
    name?: string;
    email?: string;
    role?: string;
    isActive?: boolean;
  }) {
    return this.apiClient.request(`/users/${id}`, {
      method: 'PUT',
      body: updates
    });
  }

  async deleteUser(id: string) {
    return this.apiClient.request(`/users/${id}`, {
      method: 'DELETE'
    });
  }

  async setPIN(userId: string, pin: string) {
    return this.apiClient.request(`/users/${userId}/pin`, {
      method: 'POST',
      body: { pin }
    });
  }

  async getQRCode(userId: string) {
    return this.apiClient.request(`/users/${userId}/qr-code`);
  }
}
```

## Error Handling

```typescript
try {
  const users = await userService.getAllUsers();
} catch (error) {
  if (error.message.includes('401')) {
    // Handle authentication error
  } else if (error.message.includes('403')) {
    // Insufficient permissions
  } else if (error.message.includes('404')) {
    // User not found
  } else {
    // Other errors
  }
}
```

## Best Practices

1. **Validate permissions** - Check user role before operations
2. **Secure passwords** - Never log or expose passwords
3. **Handle roles** - Respect role hierarchy
4. **Track activity** - Monitor user actions
5. **Secure PINs** - Handle PINs securely

## Related Documentation

- [Authentication API](../authentication.md)

---

**Last Updated**: 2024
