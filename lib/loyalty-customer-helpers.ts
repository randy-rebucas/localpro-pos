export const typeColors: Record<string, string> = {
  earn: 'bg-win8-success text-white',
  redeem: 'bg-win8-suspended text-white',
  adjust: 'bg-brand text-white',
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
