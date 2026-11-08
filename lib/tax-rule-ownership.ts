import Category from '@/models/Category';
import Product from '@/models/Product';

/**
 * Whether every category and product a tax rule names belongs to this tenant.
 * Without it a rule could hold ids from another store (or ids that no longer exist).
 */
export async function taxRuleIdsBelongToTenant(
  tenantId: string,
  categoryIds?: string[],
  productIds?: string[]
): Promise<boolean> {
  if (categoryIds && categoryIds.length > 0) {
    const n = await Category.countDocuments({ _id: { $in: categoryIds }, tenantId });
    if (n !== categoryIds.length) return false;
  }
  if (productIds && productIds.length > 0) {
    const n = await Product.countDocuments({ _id: { $in: productIds }, tenantId });
    if (n !== productIds.length) return false;
  }
  return true;
}
