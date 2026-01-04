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

interface ProductValidationData {
  name?: unknown;
  price?: unknown;
  stock?: unknown;
  sku?: unknown;
  trackInventory?: unknown;
  allowOutOfStockSales?: unknown;
}

/**
 * Validate product data
 */
export function validateProduct(data: ProductValidationData, t?: TranslationFunction): ValidationError[] {
  const errors: ValidationError[] = [];
  const translate = (key: string, fallback: string) => t ? t(key, fallback) : fallback;

  const name = typeof data.name === 'string' ? data.name : '';
  if (!name || name.trim().length === 0) {
    errors.push({ field: 'name', message: translate('validation.productNameRequired', 'Product name is required'), code: 'productNameRequired' });
  } else if (name.length > 200) {
    errors.push({ field: 'name', message: translate('validation.productNameMaxLength', 'Product name must be less than 200 characters'), code: 'productNameMaxLength' });
  }
  const price = typeof data.price === 'number' ? data.price : (data.price === undefined || data.price === null ? undefined : Number(data.price));
  if (price === undefined || price === null) {
    errors.push({ field: 'price', message: translate('validation.priceRequired', 'Price is required'), code: 'priceRequired' });
  }
  if (price !== undefined && price !== null && (isNaN(price) || price < 0)) {
    errors.push({ field: 'price', message: translate('validation.pricePositive', 'Price must be a positive number'), code: 'pricePositive' });
  }
  const stock = typeof data.stock === 'number' ? data.stock : (data.stock === undefined || data.stock === null ? undefined : Number(data.stock));
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

interface TransactionValidationData {
  items?: Array<{ productId?: unknown; quantity?: unknown }>;
  paymentMethod?: unknown;
  cashReceived?: unknown;
}

/**
 * Validate transaction data
 */
export function validateTransaction(data: TransactionValidationData, t?: TranslationFunction): ValidationError[] {
  const errors: ValidationError[] = [];
  const translate = (key: string, fallback: string) => t ? t(key, fallback) : fallback;

  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push({ field: 'items', message: translate('validation.itemsRequired', 'At least one item is required'), code: 'itemsRequired' });
  }
  if (data.items) {
    data.items.forEach((item, index: number) => {
      if (!item.productId) {
        errors.push({ field: `items[${index}].productId`, message: translate('validation.productIdRequired', 'Product ID is required'), code: 'productIdRequired' });
      }
      if (!item.quantity || item.quantity <= 0) {
        errors.push({ field: `items[${index}].quantity`, message: translate('validation.quantityGreaterThanZero', 'Quantity must be greater than 0'), code: 'quantityGreaterThanZero' });
      }
    });
  }
  const paymentMethod = typeof data.paymentMethod === 'string' ? data.paymentMethod : '';
  if (!paymentMethod || !['cash', 'card', 'digital'].includes(paymentMethod)) {
    errors.push({ field: 'paymentMethod', message: translate('validation.paymentMethodRequired', 'Valid payment method is required'), code: 'paymentMethodRequired' });
  }
  if (paymentMethod === 'cash') {
    const cashReceived = typeof data.cashReceived === 'number' ? data.cashReceived : (data.cashReceived ? Number(data.cashReceived) : 0);
    if (!cashReceived || cashReceived <= 0) {
      errors.push({ field: 'cashReceived', message: translate('validation.cashReceivedRequired', 'Cash received is required for cash payments'), code: 'cashReceivedRequired' });
    }
  }

  return errors;
}

/**
 * Validate tenant data
 */
interface TenantValidationData {
  slug?: unknown;
  name?: unknown;
}

export function validateTenant(data: TenantValidationData, t?: TranslationFunction): ValidationError[] {
  const errors: ValidationError[] = [];
  const translate = (key: string, fallback: string) => t ? t(key, fallback) : fallback;

  const slug = typeof data.slug === 'string' ? data.slug : '';
  if (!slug || slug.trim().length === 0) {
    errors.push({ field: 'slug', message: translate('validation.tenantSlugRequired', 'Tenant slug is required'), code: 'tenantSlugRequired' });
  } else if (!/^[a-z0-9-]+$/.test(slug)) {
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
interface CategoryValidationData {
  name?: unknown;
  description?: unknown;
}

export function validateCategory(data: CategoryValidationData, t?: TranslationFunction): ValidationError[] {
  const errors: ValidationError[] = [];
  const translate = (key: string, fallback: string) => t ? t(key, fallback) : fallback;

  const name = typeof data.name === 'string' ? data.name : '';
  if (!name || name.trim().length === 0) {
    errors.push({ field: 'name', message: translate('validation.categoryNameRequired', 'Category name is required'), code: 'categoryNameRequired' });
  } else if (name.length > 200) {
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
  return input.trim().replace(/[<>]/g, '');
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
  const sanitized = { ...data } as Record<string, unknown>;
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key]);
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
  tenantId: string | mongoose.Types.ObjectId,
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
  for (const user of users) {
    if (user.pin) {
      const isMatch = await bcrypt.compare(candidatePin, user.pin);
      if (isMatch) {
        return true; // PIN is already in use
      }
    }
  }
  
  return false; // PIN is not in use
}
