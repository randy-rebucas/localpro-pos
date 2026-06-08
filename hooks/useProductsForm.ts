import { useCallback, useState } from 'react';
import { Product } from './useProductsList';
import { getSaleUnits, type ProductSaleUnit } from '@/lib/product-units';

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
  modifiers: Array<{
    name: string;
    options: Array<{ name: string; price: number }>;
    required: boolean;
  }>;
  allergens: string[];
  nutritionInfo?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  serviceType: 'wash' | 'dry-clean' | 'press' | 'repair' | 'other';
  weightBased: boolean;
  pickupDelivery: boolean;
  estimatedDuration?: number;
  serviceDuration?: number;
  staffRequired: number;
  equipmentRequired: string[];
  baseUnit: string;
  saleUnits: ProductSaleUnit[];
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
    modifiers: product?.modifiers || [],
    allergens: product?.allergens || [],
    nutritionInfo: product?.nutritionInfo || { calories: undefined, protein: undefined, carbs: undefined, fat: undefined },
    serviceType: product?.serviceType || 'wash',
    weightBased: product?.weightBased || false,
    pickupDelivery: product?.pickupDelivery || false,
    estimatedDuration: product?.estimatedDuration || undefined,
    serviceDuration: product?.serviceDuration || undefined,
    staffRequired: product?.staffRequired || 1,
    equipmentRequired: product?.equipmentRequired || [],
    baseUnit: product?.baseUnit || 'pc',
    saleUnits: getSaleUnits(product ?? {}),
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
    async (settings: { businessType?: string } | null): Promise<{ success: boolean; error?: string }> => {
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
          baseUnit: formData.baseUnit?.trim() || 'pc',
          saleUnits: formData.saleUnits,
        };

        // Add restaurant-specific fields
        if (settings?.businessType?.toLowerCase() === 'restaurant') {
          if (formData.allergens && formData.allergens.length > 0) {
            body.allergens = formData.allergens;
          }
          if (formData.nutritionInfo && (formData.nutritionInfo.calories || formData.nutritionInfo.protein)) {
            body.nutritionInfo = formData.nutritionInfo;
          }
          if (formData.modifiers && formData.modifiers.length > 0) {
            body.modifiers = formData.modifiers;
          }
        }

        // Add laundry-specific fields
        if (settings?.businessType?.toLowerCase() === 'laundry') {
          body.serviceType = formData.serviceType;
          body.weightBased = formData.weightBased;
          body.pickupDelivery = formData.pickupDelivery;
          if (formData.estimatedDuration) {
            body.estimatedDuration = formData.estimatedDuration;
          }
        }

        // Add service-specific fields
        if (settings?.businessType?.toLowerCase() === 'service') {
          if (formData.serviceDuration) {
            body.serviceDuration = formData.serviceDuration;
          }
          body.staffRequired = formData.staffRequired;
          if (formData.equipmentRequired && formData.equipmentRequired.length > 0) {
            body.equipmentRequired = formData.equipmentRequired;
          }
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
