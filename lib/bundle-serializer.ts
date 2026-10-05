import type { Prisma } from '@prisma/client';

type BundleItemRow = Prisma.ProductBundleItemGetPayload<object> & {
  product?: { id: string; name: string; price: Prisma.Decimal | number; stock: number } | null;
};

type BundleRow = Prisma.ProductBundleGetPayload<object> & {
  items?: BundleItemRow[];
  category?: { id: string; name: string } | null;
};

/**
 * Shape a ProductBundle row into the legacy `_id`-keyed payload the client
 * (`hooks/useBundlesList.ts` `Bundle`) expects — same convention as the
 * products route's serializer. Also converts Decimal price to a number.
 */
export function serializeBundle(bundle: BundleRow) {
  const { items = [], category, ...rest } = bundle;
  return {
    ...rest,
    _id: bundle.id,
    price: Number(bundle.price),
    categoryId: category
      ? { _id: category.id, name: category.name }
      : (bundle.categoryId ?? undefined),
    items: items.map((item) => ({
      _id: item.id,
      productId: item.product
        ? {
            _id: item.product.id,
            name: item.product.name,
            price: Number(item.product.price),
            stock: item.product.stock,
          }
        : item.productId,
      productName: item.productName || item.product?.name || '',
      quantity: item.quantity,
      variation:
        item.variationSize || item.variationColor || item.variationType
          ? {
              size: item.variationSize ?? undefined,
              color: item.variationColor ?? undefined,
              type: item.variationType ?? undefined,
            }
          : undefined,
    })),
  };
}
