import toast from 'react-hot-toast';

/**
 * Toast notification utilities
 * Provides user-friendly toast notifications to replace alert() calls
 */

export const showToast = {
  success: (message: string) => {
    toast.success(message, {
      duration: 4000,
    });
  },
  error: (message: string) => {
    toast.error(message, {
      duration: 5000,
    });
  },
  info: (message: string) => {
    toast(message, {
      duration: 4000,
      icon: 'ℹ️',
    });
  },
  loading: (message: string) => {
    return toast.loading(message);
  },
  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return toast.promise(promise, messages);
  },
};
