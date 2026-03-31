/* eslint-disable @typescript-eslint/no-explicit-any */

export const getSaveSuccessMessage = (dict: any): string => {
  return dict?.admin?.hardwareSettingsSavedSuccess || 'Hardware settings saved successfully!';
};

export const getSaveErrorMessage = (dict: any, statusCode?: number): string => {
  if (statusCode === 401 || statusCode === 403) {
    return dict?.settings?.unauthorized || 'Unauthorized. Please login with admin account.';
  }
  return dict?.admin?.failedToSaveHardwareSettings || 'Failed to save hardware settings';
};

export const getConnectionErrorMessage = (dict: any): string => {
  return (
    dict?.admin?.failedToSaveHardwareSettingsConnection ||
    'Failed to save hardware settings. Please check your connection.'
  );
};

export const getLoadErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettings || 'Unable to load tenant settings. Please check your connection and try again.';
};

export const getLoadConnectionErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettingsConnection || 'Failed to load settings. Please check your connection.';
};
