export const typeColors: Record<string, string> = {
  earn: 'bg-green-100 text-green-700',
  redeem: 'bg-orange-100 text-orange-700',
  adjust: 'bg-blue-100 text-blue-700',
};

export const getAdjustPointsErrorMessage = (error: string): string => {
  return error;
};

export const getAdjustPointsSuccessMessage = (): string => {
  return 'Points adjusted successfully';
};

export const getLoadErrorMessage = (): string => {
  return 'Failed to load loyalty data';
};
