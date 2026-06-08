/**
 * Admin UI presets and unit-type catalog for product sale units.
 */

import {
  normalizeSaleUnits,
  type ProductSaleUnit,
} from '@/lib/product-units';

export type UnitTypeId =
  | 'piece'
  | 'box'
  | 'strip'
  | 'bottle'
  | 'pack'
  | 'kilogram'
  | 'gram'
  | 'liter'
  | 'milliliter'
  | 'custom';

export type UnitPresetId =
  | 'piece_only'
  | 'box_and_piece'
  | 'strip_and_piece'
  | 'bottle_and_piece'
  | 'pack_and_piece'
  | 'weight_kg'
  | 'custom';

export interface UnitTypeOption {
  id: UnitTypeId;
  code: string;
  label: string;
  defaultFactor: number;
  baseUnit: string;
}

export interface UnitPreset {
  id: UnitPresetId;
  baseUnit: string;
  saleUnits: ProductSaleUnit[];
}

export const UNIT_TYPE_OPTIONS: UnitTypeOption[] = [
  { id: 'piece', code: 'pc', label: 'Piece', defaultFactor: 1, baseUnit: 'pc' },
  { id: 'box', code: 'box', label: 'Box', defaultFactor: 100, baseUnit: 'pc' },
  { id: 'strip', code: 'strip', label: 'Strip', defaultFactor: 10, baseUnit: 'pc' },
  { id: 'bottle', code: 'bottle', label: 'Bottle', defaultFactor: 1, baseUnit: 'pc' },
  { id: 'pack', code: 'pack', label: 'Pack', defaultFactor: 12, baseUnit: 'pc' },
  { id: 'kilogram', code: 'kg', label: 'Kilogram', defaultFactor: 1, baseUnit: 'kg' },
  { id: 'gram', code: 'g', label: 'Gram', defaultFactor: 1, baseUnit: 'g' },
  { id: 'liter', code: 'L', label: 'Liter', defaultFactor: 1, baseUnit: 'L' },
  { id: 'milliliter', code: 'ml', label: 'Milliliter', defaultFactor: 1, baseUnit: 'ml' },
  { id: 'custom', code: '', label: '', defaultFactor: 1, baseUnit: '' },
];

export const COMMON_BASE_UNITS = ['pc', 'kg', 'g', 'L', 'ml'] as const;

export const UNIT_PRESETS: UnitPreset[] = [
  {
    id: 'piece_only',
    baseUnit: 'pc',
    saleUnits: [{ code: 'pc', label: 'Piece', factor: 1, isDefault: true }],
  },
  {
    id: 'box_and_piece',
    baseUnit: 'pc',
    saleUnits: [
      { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
      { code: 'box', label: 'Box', factor: 100, isDefault: false },
    ],
  },
  {
    id: 'strip_and_piece',
    baseUnit: 'pc',
    saleUnits: [
      { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
      { code: 'strip', label: 'Strip', factor: 10, isDefault: false },
    ],
  },
  {
    id: 'bottle_and_piece',
    baseUnit: 'pc',
    saleUnits: [
      { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
      { code: 'bottle', label: 'Bottle', factor: 1, isDefault: false },
    ],
  },
  {
    id: 'pack_and_piece',
    baseUnit: 'pc',
    saleUnits: [
      { code: 'pc', label: 'Piece', factor: 1, isDefault: true },
      { code: 'pack', label: 'Pack', factor: 12, isDefault: false },
    ],
  },
  {
    id: 'weight_kg',
    baseUnit: 'kg',
    saleUnits: [{ code: 'kg', label: 'Kilogram', factor: 1, isDefault: true }],
  },
];

function getUnitTypeById(id: UnitTypeId): UnitTypeOption {
  return UNIT_TYPE_OPTIONS.find((u) => u.id === id) || UNIT_TYPE_OPTIONS.find((u) => u.id === 'custom')!;
}

function saleUnitsMatchPreset(
  baseUnit: string,
  saleUnits: ProductSaleUnit[],
  preset: UnitPreset
): boolean {
  const bu = (baseUnit || 'pc').trim().toLowerCase();
  if (bu !== preset.baseUnit.toLowerCase()) return false;

  const normalized = normalizeSaleUnits(saleUnits, { ensureDefault: false });
  if (normalized.length !== preset.saleUnits.length) return false;

  const sortedActual = [...normalized].sort((a, b) => a.code.localeCompare(b.code));
  const sortedPreset = [...preset.saleUnits].sort((a, b) => a.code.localeCompare(b.code));

  return sortedActual.every((unit, i) => {
    const expected = sortedPreset[i];
    return (
      unit.code === expected.code &&
      unit.label === expected.label &&
      unit.factor === expected.factor &&
      unit.isDefault === expected.isDefault
    );
  });
}

export function detectUnitPreset(
  baseUnit: string | undefined,
  saleUnits: ProductSaleUnit[] | undefined
): UnitPresetId {
  const bu = baseUnit?.trim() || 'pc';
  const units = saleUnits ?? [];

  for (const preset of UNIT_PRESETS) {
    if (saleUnitsMatchPreset(bu, units, preset)) {
      return preset.id;
    }
  }

  return 'custom';
}

function mergeSaleUnitExtras(
  presetUnits: ProductSaleUnit[],
  currentUnits?: ProductSaleUnit[]
): ProductSaleUnit[] {
  const currentByCode = new Map(
    (currentUnits ?? []).map((u) => [u.code.trim().toLowerCase(), u])
  );

  return presetUnits.map((unit) => {
    const existing = currentByCode.get(unit.code.trim().toLowerCase());
    if (!existing) return { ...unit };
    return {
      ...unit,
      ...(existing.price !== undefined ? { price: existing.price } : {}),
      ...(existing.barcode?.trim() ? { barcode: existing.barcode } : {}),
    };
  });
}

export function applyUnitPreset(
  presetId: UnitPresetId,
  currentSaleUnits?: ProductSaleUnit[]
): { baseUnit: string; saleUnits: ProductSaleUnit[] } | null {
  if (presetId === 'custom') return null;

  const preset = UNIT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;

  return {
    baseUnit: preset.baseUnit,
    saleUnits: mergeSaleUnitExtras(preset.saleUnits, currentSaleUnits),
  };
}

export function applyUnitType(
  unitTypeId: UnitTypeId,
  existingUnit?: ProductSaleUnit
): Partial<ProductSaleUnit> {
  const type = getUnitTypeById(unitTypeId);

  if (unitTypeId === 'custom') {
    return {
      code: existingUnit?.code ?? '',
      label: existingUnit?.label ?? '',
      factor: existingUnit?.factor ?? 1,
      ...(existingUnit?.price !== undefined ? { price: existingUnit.price } : {}),
      ...(existingUnit?.barcode ? { barcode: existingUnit.barcode } : {}),
      isDefault: existingUnit?.isDefault,
    };
  }

  return {
    code: type.code,
    label: type.label,
    factor: type.defaultFactor,
    ...(existingUnit?.price !== undefined ? { price: existingUnit.price } : {}),
    ...(existingUnit?.barcode ? { barcode: existingUnit.barcode } : {}),
    isDefault: existingUnit?.isDefault,
  };
}

export function matchUnitType(
  code?: string,
  label?: string,
  factor?: number
): UnitTypeId {
  const normalizedCode = code?.trim().toLowerCase() ?? '';
  const normalizedLabel = label?.trim() ?? '';
  const normalizedFactor = factor ?? 1;

  for (const type of UNIT_TYPE_OPTIONS) {
    if (type.id === 'custom') continue;
    if (
      type.code === normalizedCode &&
      type.label === normalizedLabel &&
      type.defaultFactor === normalizedFactor
    ) {
      return type.id;
    }
  }

  return 'custom';
}

export function getPresetLabelKey(presetId: UnitPresetId): string {
  const keys: Record<UnitPresetId, string> = {
    piece_only: 'unitPresetPieceOnly',
    box_and_piece: 'unitPresetBoxPiece',
    strip_and_piece: 'unitPresetStripPiece',
    bottle_and_piece: 'unitPresetBottlePiece',
    pack_and_piece: 'unitPresetPackPiece',
    weight_kg: 'unitPresetWeightKg',
    custom: 'unitPresetCustom',
  };
  return keys[presetId];
}

export function getUnitTypeLabelKey(unitTypeId: UnitTypeId): string {
  const keys: Record<UnitTypeId, string> = {
    piece: 'unitTypePiece',
    box: 'unitTypeBox',
    strip: 'unitTypeStrip',
    bottle: 'unitTypeBottle',
    pack: 'unitTypePack',
    kilogram: 'unitTypeKilogram',
    gram: 'unitTypeGram',
    liter: 'unitTypeLiter',
    milliliter: 'unitTypeMilliliter',
    custom: 'unitTypeCustom',
  };
  return keys[unitTypeId];
}
