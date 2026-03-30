/* eslint-disable @typescript-eslint/no-explicit-any */

export const getSaveSuccessMessage = (dict: any): string => {
  return dict?.admin?.multiCurrencySaved || 'Multi-currency settings saved successfully!';
};

export const getSaveErrorMessage = (dict: any, statusCode?: number): string => {
  if (statusCode === 401 || statusCode === 403) {
    return dict?.settings?.unauthorized || 'Unauthorized. Please login with admin account.';
  }
  return dict?.admin?.failedToSaveMultiCurrency || 'Failed to save settings';
};

export const getConnectionErrorMessage = (dict: any): string => {
  return (
    dict?.admin?.failedToSaveMultiCurrencyConnection ||
    'Failed to save settings. Please check your connection.'
  );
};

export const getLoadErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettings || 'Unable to load tenant settings. Please check your connection and try again.';
};

export const getLoadConnectionErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettingsConnection || 'Failed to load settings. Please check your connection.';
};

export const getExchangeRateFetchSuccessMessage = (dict: any): string => {
  return dict?.admin?.exchangeRatesUpdated || 'Exchange rates updated successfully';
};

export const getExchangeRateFetchErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToFetchRates || 'Failed to fetch exchange rates';
};
