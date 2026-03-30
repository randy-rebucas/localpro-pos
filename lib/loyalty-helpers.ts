export const getSaveSuccessMessage = (): string => {
  return 'Loyalty settings saved';
};

export const getSaveErrorMessage = (error?: string): string => {
  return error || 'Failed to save settings';
};

export const getLoadErrorMessage = (): string => {
  return 'Failed to load configuration';
};

export const getCustomersLoadErrorMessage = (): string => {
  return 'Failed to load customers';
};
