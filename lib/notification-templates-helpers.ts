/* eslint-disable @typescript-eslint/no-explicit-any */

export const getLoadErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettings || 'Unable to load tenant settings. Please check your connection and try again.';
};

export const getLoadConnectionErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettingsConnection || 'Failed to load settings. Please check your connection.';
};
