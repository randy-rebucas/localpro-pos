/**
 * Validation utilities for enterprise-grade validation
 */

export interface ValidationError {
  field: string;
  message: string;
  code?: string; // Error code for translation
}
export type TranslationFunction = (key: string, fallback: string) => string;

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
export function validatePassword(password: string, t?: TranslationFunction): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const translate = (key: string, fallback: string) => t ? t(key, fallback) : fallback;

  if (password.length < 8) {
    errors.push(translate('validation.passwordMinLength', 'Password must be at least 8 characters'));
  }
  if (password.length > 128) {
    errors.push(translate('validation.passwordMaxLength', 'Password must be less than 128 characters'));
  }
  if (!/[A-Z]/.test(password)) {
    errors.push(translate('validation.passwordUppercase', 'Password must contain at least one uppercase letter'));
  }
  if (!/[a-z]/.test(password)) {
    errors.push(translate('validation.passwordLowercase', 'Password must contain at least one lowercase letter'));
  }
  if (!/[0-9]/.test(password)) {
    errors.push(translate('validation.passwordNumber', 'Password must contain at least one number'));
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push(translate('validation.passwordSpecial', 'Password must contain at least one special character'));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate product data
 */
export function validateProduct(data: Record<string, unknown>, t?: TranslationFunction): ValidationError[] {
  const errors: ValidationError[] = [];
  const translate = (key: string, fallback: string) => t ? t(key, fallback) : fallback;

  const name = typeof data.name === 'string' ? data.name : '';
  if (!name || name.trim().length === 0) {
    errors.push({ field: 'name', message: translate('validation.productNameRequired', 'Product name is required'), code: 'productNameRequired' });
  }
  if (name && name.length > 200) {
    errors.push({ field: 'name', message: translate('validation.productNameMaxLength', 'Product name must be less than 200 characters'), code: 'productNameMaxLength' });
  }
  const price = typeof data.price === 'number' ? data.price : null;
  if (price === undefined || price === null) {
    errors.push({ field: 'price', message: translate('validation.priceRequired', 'Price is required'), code: 'priceRequired' });
  }
  if (price !== undefined && price !== null && (isNaN(price) || price < 0)) {
    errors.push({ field: 'price', message: translate('validation.pricePositive', 'Price must be a positive number'), code: 'pricePositive' });
  }
  const stock = typeof data.stock === 'number' ? data.stock : null;
  if (stock === undefined || stock === null) {
    errors.push({ field: 'stock', message: translate('validation.stockRequired', 'Stock is required'), code: 'stockRequired' });
  }
  if (stock !== undefined && stock !== null && (!Number.isInteger(stock) || stock < 0)) {
    errors.push({ field: 'stock', message: translate('validation.stockNonNegative', 'Stock must be a non-negative integer'), code: 'stockNonNegative' });
  }
  const sku = typeof data.sku === 'string' ? data.sku : '';
  if (sku && sku.length > 50) {
    errors.push({ field: 'sku', message: translate('validation.skuMaxLength', 'SKU must be less than 50 characters'), code: 'skuMaxLength' });
  }
  if (data.trackInventory !== undefined && typeof data.trackInventory !== 'boolean') {
    errors.push({ field: 'trackInventory', message: translate('validation.trackInventoryBoolean', 'Track inventory must be a boolean'), code: 'trackInventoryBoolean' });
  }
  if (data.allowOutOfStockSales !== undefined && typeof data.allowOutOfStockSales !== 'boolean') {
    errors.push({ field: 'allowOutOfStockSales', message: translate('validation.allowOutOfStockSalesBoolean', 'Allow out of stock sales must be a boolean'), code: 'allowOutOfStockSalesBoolean' });
  }
  return errors;
}

/**
 * Validate transaction data
 */
export function validateTransaction(data: Record<string, unknown>, t?: TranslationFunction): ValidationError[] {
  const errors: ValidationError[] = [];
  const translate = (key: string, fallback: string) => t ? t(key, fallback) : fallback;

  const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
  if (!items || items.length === 0) {
    errors.push({ field: 'items', message: translate('validation.itemsRequired', 'At least one item is required'), code: 'itemsRequired' });
  }
  items.forEach((item, index: number) => {
    if (!item.productId) {
      errors.push({ field: `items[${index}].productId`, message: translate('validation.productIdRequired', 'Product ID is required'), code: 'productIdRequired' });
    }
    const quantity = typeof item.quantity === 'number' ? item.quantity : null;
    if (!quantity || quantity <= 0) {
      errors.push({ field: `items[${index}].quantity`, message: translate('validation.quantityGreaterThanZero', 'Quantity must be greater than 0'), code: 'quantityGreaterThanZero' });
    }
  });
  const paymentMethod = typeof data.paymentMethod === 'string' ? data.paymentMethod : '';
  if (!paymentMethod || !['cash', 'card', 'digital'].includes(paymentMethod)) {
    errors.push({ field: 'paymentMethod', message: translate('validation.paymentMethodRequired', 'Valid payment method is required'), code: 'paymentMethodRequired' });
  }
  if (paymentMethod === 'cash') {
    const cashReceived = typeof data.cashReceived === 'number' ? data.cashReceived : null;
    if (!cashReceived || cashReceived <= 0) {
      errors.push({ field: 'cashReceived', message: translate('validation.cashReceivedRequired', 'Cash received is required for cash payments'), code: 'cashReceivedRequired' });
    }
  }
  return errors;
}

/**
 * Validate tenant data
 */
export function validateTenant(data: Record<string, unknown>, t?: TranslationFunction): ValidationError[] {
  const errors: ValidationError[] = [];
  const translate = (key: string, fallback: string) => t ? t(key, fallback) : fallback;

  const slug = typeof data.slug === 'string' ? data.slug : '';
  if (!slug || slug.trim().length === 0) {
    errors.push({ field: 'slug', message: translate('validation.tenantSlugRequired', 'Tenant slug is required'), code: 'tenantSlugRequired' });
  }
  if (slug && !/^[a-z0-9-]+$/.test(slug)) {
    errors.push({ field: 'slug', message: translate('validation.slugFormat', 'Slug can only contain lowercase letters, numbers, and hyphens'), code: 'slugFormat' });
  }
  const name = typeof data.name === 'string' ? data.name : '';
  if (!name || name.trim().length === 0) {
    errors.push({ field: 'name', message: translate('validation.tenantNameRequired', 'Tenant name is required'), code: 'tenantNameRequired' });
  }
  return errors;
}

/**
 * Validate category data
 */
export function validateCategory(data: Record<string, unknown>, t?: TranslationFunction): ValidationError[] {
  const errors: ValidationError[] = [];
  const translate = (key: string, fallback: string) => t ? t(key, fallback) : fallback;

  const name = typeof data.name === 'string' ? data.name : '';
  if (!name || name.trim().length === 0) {
    errors.push({ field: 'name', message: translate('validation.categoryNameRequired', 'Category name is required'), code: 'categoryNameRequired' });
  }
  if (name && name.length > 200) {
    errors.push({ field: 'name', message: translate('validation.categoryNameMaxLength', 'Category name must be less than 200 characters'), code: 'categoryNameMaxLength' });
  }
  const description = typeof data.description === 'string' ? data.description : '';
  if (description && description.length > 1000) {
    errors.push({ field: 'description', message: translate('validation.descriptionMaxLength', 'Description must be less than 1000 characters'), code: 'descriptionMaxLength' });
  }
  return errors;
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');
}

/**
 * Validate and sanitize input
 */
export function validateAndSanitize<T extends Record<string, unknown>>(
  data: T,
  validator: (data: T, t?: TranslationFunction) => ValidationError[],
  t?: TranslationFunction
): { data: T; errors: ValidationError[] } {
  const errors = validator(data, t);
  // Sanitize string fields
  const sanitized: Record<string, unknown> = { ...data };
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key] as string);
    }
  });
  return { data: sanitized as T, errors };
}

/**
 * Check if a PIN is already in use by another user in the same tenant
 * This function compares the candidate PIN with all existing hashed PINs
 * @param tenantId - The tenant ID to check within
 * @param candidatePin - The plain text PIN to check
 * @param excludeUserId - User ID to exclude from the check (the user being updated)
 * @returns Promise<boolean> - true if PIN is already in use, false otherwise
 */
export async function isPinDuplicate(
  tenantId: string,
  candidatePin: string,
  excludeUserId?: string
): Promise<boolean> {
  const User = (await import('@/models/User')).default;
  const bcrypt = (await import('bcryptjs')).default;
  // Get all users in the tenant with PINs (excluding the current user if specified)
  const query: Record<string, unknown> = { tenantId, pin: { $exists: true, $ne: null } };
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }
  const users = await User.find(query).select('+pin').lean();
  // Compare candidate PIN with each hashed PIN
  for (const user of users as Array<{ pin?: string }>) {
    if (user.pin) {
      const isMatch = await bcrypt.compare(candidatePin, user.pin);
      if (isMatch) {
        return true; // PIN is already in use
      }
    }
  }
  return false; // PIN is not in use
}
