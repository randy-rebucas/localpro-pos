import { describe, expect, it } from 'vitest';
import {
  applyUnitPreset,
  applyUnitType,
  detectUnitPreset,
  matchUnitType,
} from '@/lib/product-unit-presets';
import {
  findProductByBarcode,
  findSaleUnit,
  formatStockWithUnits,
  getBaseQuantity,
  getMaxSaleUnitQuantity,
  getSaleUnits,
  normalizeSaleUnits,
  resolveSaleUnitPrice,
  validateSaleUnitsConfig,
} from '@/lib/product-units';

describe('product-units', () => {
  it('defaults to piece when saleUnits missing', () => {
    const units = getSaleUnits({});
    expect(units).toHaveLength(1);
    expect(units[0].code).toBe('pc');
    expect(units[0].factor).toBe(1);
  });

  it('resolves box price override', () => {
    const unit = findSaleUnit(
      {
        saleUnits: [
          { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
          { code: 'box', label: 'Box of 100', factor: 100, price: 450 },
        ],
      },
      'box'
    );
    expect(resolveSaleUnitPrice({ price: 5 }, unit)).toBe(450);
  });

  it('derives price from base price and factor', () => {
    const unit = findSaleUnit(
      {
        saleUnits: [
          { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
          { code: 'box', label: 'Box of 100', factor: 100 },
        ],
      },
      'box'
    );
    expect(resolveSaleUnitPrice({ price: 5 }, unit)).toBe(500);
  });

  it('computes max sale unit quantity from base stock', () => {
    expect(getMaxSaleUnitQuantity(250, 100)).toBe(2);
    expect(getMaxSaleUnitQuantity(99, 100)).toBe(0);
  });

  it('computes base quantity for stock deduction', () => {
    expect(getBaseQuantity(2, 100)).toBe(200);
  });

  it('formats stock with pack unit breakdown', () => {
    const text = formatStockWithUnits(250, 'pc', [
      { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
      { code: 'box', label: 'Box of 100', factor: 100 },
    ]);
    expect(text).toBe('2 Box of 100 + 50 pc');
  });

  it('finds product by unit barcode', () => {
    const products = [
      {
        _id: 'p1',
        name: 'Med',
        saleUnits: [
          { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
          { code: 'box', label: 'Box', factor: 10, barcode: 'BOX123' },
        ],
      },
    ];
    const match = findProductByBarcode(products, 'BOX123');
    expect(match?.saleUnit.code).toBe('box');
  });

  it('validates duplicate sale unit codes', () => {
    const errors = validateSaleUnitsConfig('pc', [
      { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
      { code: 'pc', label: 'Duplicate', factor: 2 },
    ]);
    expect(errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('normalizes sale unit codes to lowercase', () => {
    const units = normalizeSaleUnits([{ code: 'BOX', label: 'Box', factor: 10 }]);
    expect(units[0].code).toBe('box');
    expect(units[0].isDefault).toBe(true);
  });
});

describe('product-unit-presets', () => {
  it('detects piece_only preset', () => {
    expect(
      detectUnitPreset('pc', [{ code: 'pc', label: 'Piece', factor: 1, isDefault: true }])
    ).toBe('piece_only');
  });

  it('detects box_and_piece preset', () => {
    expect(
      detectUnitPreset('pc', [
        { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
        { code: 'box', label: 'Box', factor: 100, isDefault: false },
      ])
    ).toBe('box_and_piece');
  });

  it('returns custom when box factor differs from preset', () => {
    expect(
      detectUnitPreset('pc', [
        { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
        { code: 'box', label: 'Box', factor: 50, isDefault: false },
      ])
    ).toBe('custom');
  });

  it('applyUnitPreset preserves barcode and price by code', () => {
    const result = applyUnitPreset('box_and_piece', [
      { code: 'pc', label: 'Piece', factor: 1, isDefault: true, price: 5 },
      { code: 'box', label: 'Box', factor: 100, isDefault: false, barcode: 'BOX99', price: 450 },
    ]);
    expect(result?.saleUnits.find((u) => u.code === 'box')?.barcode).toBe('BOX99');
    expect(result?.saleUnits.find((u) => u.code === 'box')?.price).toBe(450);
    expect(result?.saleUnits.find((u) => u.code === 'pc')?.price).toBe(5);
  });

  it('applyUnitType fills catalog defaults', () => {
    expect(applyUnitType('box')).toEqual({
      code: 'box',
      label: 'Box',
      factor: 100,
      isDefault: undefined,
    });
  });

  it('applyUnitType preserves extras from existing row', () => {
    expect(
      applyUnitType('strip', {
        code: 'pc',
        label: 'Piece',
        factor: 1,
        isDefault: false,
        barcode: 'STR1',
        price: 120,
      })
    ).toEqual({
      code: 'strip',
      label: 'Strip',
      factor: 10,
      barcode: 'STR1',
      price: 120,
      isDefault: false,
    });
  });

  it('matchUnitType reverse lookup', () => {
    expect(matchUnitType('box', 'Box', 100)).toBe('box');
    expect(matchUnitType('box', 'Box', 50)).toBe('custom');
  });
});
