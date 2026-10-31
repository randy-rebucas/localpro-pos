import { useCallback, useState } from 'react';
import { Product } from './useProductsList';

export interface ProductFormData {
  name: string;
  description: string;
  image: string;
  price: number;
  stock: number;
  sku: string;
  barcode: string;
  categoryId: string;
  productType: 'regular' | 'bundle' | 'service';
  trackInventory: boolean;
  lowStockThreshold: number;
}

interface BusinessTypeConfig {
  productTypes?: string[];
  defaultFeatures?: { enableInventory?: boolean };
  [key: string]: unknown;
}

const getDefaultFormData = (
  product: Product | null,
  businessTypeConfig: BusinessTypeConfig | null
): ProductFormData => {
  const extractCategoryId = (): string => {
    if (!product?.categoryId) return '';
    if (typeof product.categoryId === 'object' && product.categoryId._id) {
      return product.categoryId._id;
    }
    if (typeof product.categoryId === 'string') {
      return product.categoryId;
    }
    return '';
  };

  return {
    name: product?.name || '',
    description: product?.description || '',
    image: product?.image || '',
    price: product?.price || 0,
    stock: product?.stock || 0,
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    categoryId: extractCategoryId(),
    productType: (product?.productType || businessTypeConfig?.productTypes?.[0] || 'regular') as 'service' | 'regular' | 'bundle',
    trackInventory: product?.trackInventory !== undefined ? product.trackInventory : (businessTypeConfig?.defaultFeatures?.enableInventory ?? true),
    lowStockThreshold: product?.lowStockThreshold || 10,
  };
};

export const useProductsForm = (product: Product | null, businessTypeConfig: BusinessTypeConfig | null) => {
  const [formData, setFormData] = useState<ProductFormData>(
    getDefaultFormData(product, businessTypeConfig)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateFormData = useCallback((updates: Partial<ProductFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetError = useCallback(() => {
    setError('');
  }, []);

  const setErrorMessage = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const submitForm = useCallback(
    async (
      confirmDuplicate = false
    ): Promise<{
      success: boolean;
      error?: string;
      duplicate?: boolean;
      existingProduct?: { _id: string; name: string; sku?: string; stock: number };
    }> => {
      setSaving(true);
      setError('');

      try {
        const url = product ? `/api/products/${product._id}` : '/api/products';
        const method = product ? 'PUT' : 'POST';
        const body: Record<string, unknown> = {
          name: formData.name,
          description: formData.description || undefined,
          image: formData.image || undefined,
          price: formData.price,
          stock: formData.stock,
          sku: formData.sku || undefined,
          barcode: formData.barcode || undefined,
          categoryId: formData.categoryId || undefined,
          productType: formData.productType,
          trackInventory: formData.trackInventory,
          lowStockThreshold: formData.lowStockThreshold,
        };

        if (!product && confirmDuplicate) {
          body.confirmDuplicate = true;
        }

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (data.success) {
          return { success: true };
        } else if (res.status === 409 && data.code === 'DUPLICATE_PRODUCT_NAME') {
          return { success: false, duplicate: true, existingProduct: data.existingProduct };
        } else {
          const errorMsg = data.error || 'Failed to save product';
          setError(errorMsg);
          return { success: false, error: errorMsg };
        }
      } catch (error) {
        const errorMsg = 'Failed to save product';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setSaving(false);
      }
    },
    [product, formData]
  );

  return {
    formData,
    saving,
    error,
    updateFormData,
    resetError,
    setErrorMessage,
    submitForm,
  };
};
