type Dict = { loyalty?: Record<string, string | undefined> } | null | undefined;

export const getSaveSuccessMessage = (dict?: Dict): string => {
  return dict?.loyalty?.settingsSaved || 'Loyalty settings saved';
};

export const getSaveErrorMessage = (error?: string, dict?: Dict): string => {
  return error || dict?.loyalty?.settingsSaveFailed || 'Failed to save settings';
};

export const getLoadErrorMessage = (dict?: Dict): string => {
  return dict?.loyalty?.failedToLoadConfig || 'Failed to load configuration';
};

export const getCustomersLoadErrorMessage = (dict?: Dict): string => {
  return dict?.loyalty?.failedToLoadCustomers || 'Failed to load customers';
};
