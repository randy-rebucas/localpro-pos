# Mobile API Documentation

Complete documentation for integrating 1POS API with mobile applications.

## 📱 Quick Navigation

### Getting Started
- **[Quick Start Guide](./quick-start.md)** - Get up and running in 10 minutes
- **[Authentication Guide](./authentication.md)** - Complete authentication flow
- **[API Client Setup](./api-client-setup.md)** - Setting up API clients for different platforms

### Feature Documentation
- **[Products API](./features/products.md)** - Product management endpoints
- **[Transactions API](./features/transactions.md)** - Transaction processing
- **[Inventory API](./features/inventory.md)** - Stock management
- **[Categories API](./features/categories.md)** - Category management
- **[Bundles API](./features/bundles.md)** - Product bundles
- **[Discounts API](./features/discounts.md)** - Discount codes and promotions
- **[Users API](./features/users.md)** - User management
- **[Attendance API](./features/attendance.md)** - Employee attendance
- **[Cash Drawer API](./features/cash-drawer.md)** - Cash drawer operations
- **[Expenses API](./features/expenses.md)** - Expense tracking
- **[Reports API](./features/reports.md)** - Reports and analytics
- **[Bookings API](./features/bookings.md)** - Appointment scheduling

### Reference
- **[Complete API Reference](./reference/api-reference.md)** - All endpoints
- **[Error Codes](./reference/error-codes.md)** - Error handling
- **[Data Models](./reference/data-models.md)** - Data structures

### Examples
- **[React Native Examples](./examples/react-native.md)** - React Native implementations
- **[Flutter Examples](./examples/flutter.md)** - Flutter/Dart implementations
- **[iOS Swift Examples](./examples/ios-swift.md)** - Swift implementations
- **[Android Kotlin Examples](./examples/android-kotlin.md)** - Kotlin implementations

### Troubleshooting
- **[Common Issues](./troubleshooting/common-issues.md)** - Frequently encountered problems
- **[Platform-Specific Issues](./troubleshooting/platform-specific.md)** - iOS, Android, React Native, Flutter
- **[Network Issues](./troubleshooting/network.md)** - Connection and timeout problems

---

## 🚀 Quick Start

1. **Read the [Quick Start Guide](./quick-start.md)**
2. **Set up authentication** - See [Authentication Guide](./authentication.md)
3. **Choose your platform** - Check examples for your platform
4. **Start integrating** - Use feature-specific documentation

---

## 📚 Documentation Structure

```
docs/mobile/
├── README.md (this file)
├── quick-start.md
├── authentication.md
├── api-client-setup.md
├── features/
│   ├── products.md
│   ├── transactions.md
│   ├── inventory.md
│   ├── categories.md
│   ├── bundles.md
│   ├── discounts.md
│   ├── users.md
│   ├── attendance.md
│   ├── cash-drawer.md
│   ├── expenses.md
│   ├── reports.md
│   └── bookings.md
├── reference/
│   ├── api-reference.md
│   ├── error-codes.md
│   └── data-models.md
├── examples/
│   ├── react-native.md
│   ├── flutter.md
│   ├── ios-swift.md
│   └── android-kotlin.md
└── troubleshooting/
    ├── common-issues.md
    ├── platform-specific.md
    └── network.md
```

---

## 🔑 Key Concepts

### Authentication
- JWT-based authentication
- Token storage (secure platform storage)
- Token expiration handling
- Multiple login methods (email, PIN, QR)

### API Structure
- RESTful API design
- JSON request/response format
- Standardized error responses
- Pagination support

### Multi-Tenant
- Tenant-scoped data
- Tenant slug in requests
- Automatic tenant isolation

---

## 📞 Support

For issues or questions:
- Check [Troubleshooting](./troubleshooting/common-issues.md)
- Review [API Reference](./reference/api-reference.md)
- Contact your development team

---

**Last Updated**: 2024
**API Version**: 1.0
