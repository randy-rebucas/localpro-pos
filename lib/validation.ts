/**
 * Validation utilities for enterprise-grade validation
 */

export interface ValidationError {
  field: string;
  message: string;
}

export class ValidationException extends Error {
  errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super('Validation failed');
    this.errors = errors;
    this.name = 'ValidationException';
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate product data
 */
export function validateProduct(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Product name is required' });
  }
  if (data.name && data.name.length > 200) {
    errors.push({ field: 'name', message: 'Product name must be less than 200 characters' });
  }
  if (data.price === undefined || data.price === null) {
    errors.push({ field: 'price', message: 'Price is required' });
  }
  if (data.price !== undefined && (isNaN(data.price) || data.price < 0)) {
    errors.push({ field: 'price', message: 'Price must be a positive number' });
  }
  if (data.stock === undefined || data.stock === null) {
    errors.push({ field: 'stock', message: 'Stock is required' });
  }
  if (data.stock !== undefined && (!Number.isInteger(data.stock) || data.stock < 0)) {
    errors.push({ field: 'stock', message: 'Stock must be a non-negative integer' });
  }
  if (data.sku && data.sku.length > 50) {
    errors.push({ field: 'sku', message: 'SKU must be less than 50 characters' });
  }
  if (data.trackInventory !== undefined && typeof data.trackInventory !== 'boolean') {
    errors.push({ field: 'trackInventory', message: 'Track inventory must be a boolean' });
  }
  if (data.allowOutOfStockSales !== undefined && typeof data.allowOutOfStockSales !== 'boolean') {
    errors.push({ field: 'allowOutOfStockSales', message: 'Allow out of stock sales must be a boolean' });
  }
  return errors;
}

/**
 * Validate transaction data
 */
export function validateTransaction(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push({ field: 'items', message: 'At least one item is required' });
  }
  if (data.items) {
    data.items.forEach((item: any, index: number) => {
      if (!item.productId) {
        errors.push({ field: `items[${index}].productId`, message: 'Product ID is required' });
      }
      if (!item.quantity || item.quantity <= 0) {
        errors.push({ field: `items[${index}].quantity`, message: 'Quantity must be greater than 0' });
      }
    });
  }
  if (!data.paymentMethod || !['cash', 'card', 'digital'].includes(data.paymentMethod)) {
    errors.push({ field: 'paymentMethod', message: 'Valid payment method is required' });
  }
  if (data.paymentMethod === 'cash') {
    if (!data.cashReceived || data.cashReceived <= 0) {
      errors.push({ field: 'cashReceived', message: 'Cash received is required for cash payments' });
    }
  }

  return errors;
}

/**
 * Validate tenant data
 */
export function validateTenant(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.slug || data.slug.trim().length === 0) {
    errors.push({ field: 'slug', message: 'Tenant slug is required' });
  }
  if (data.slug && !/^[a-z0-9-]+$/.test(data.slug)) {
    errors.push({ field: 'slug', message: 'Slug can only contain lowercase letters, numbers, and hyphens' });
  }
  if (!data.name || data.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Tenant name is required' });
  }

  return errors;
}

/**
 * Validate category data
 */
export function validateCategory(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Category name is required' });
  }
  if (data.name && data.name.length > 200) {
    errors.push({ field: 'name', message: 'Category name must be less than 200 characters' });
  }
  if (data.description && data.description.length > 1000) {
    errors.push({ field: 'description', message: 'Description must be less than 1000 characters' });
  }

  return errors;
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Validate and sanitize input
 */
export function validateAndSanitize<T extends Record<string, any>>(
  data: T,
  validator: (data: T) => ValidationError[]
): { data: T; errors: ValidationError[] } {
  const errors = validator(data);
  
  // Sanitize string fields
  const sanitized = { ...data } as any;
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key]);
    }
  });

  return { data: sanitized as T, errors };
}

