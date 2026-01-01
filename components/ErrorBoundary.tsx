'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  dict: any;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, dict: null };
  }

  async componentDidMount() {
    try {
      const params = new URLSearchParams(window.location.search);
      const lang = params.get('lang') || 'en';
      const dict = await getDictionaryClient(lang as 'en' | 'es');
      this.setState({ dict });
    } catch (error) {
      console.error('Failed to load dictionary:', error);
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    // In production, you could send this to an error reporting service
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
          <div className="max-w-md w-full bg-white border-2 border-red-300 p-6 sm:p-8 text-center">
            <div className="mb-6">
              <svg
                className="mx-auto h-16 w-16 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              {this.state.dict?.components?.errorBoundary?.somethingWentWrong || this.state.dict?.common?.somethingWentWrong || 'Something went wrong'}
            </h1>
            <p className="text-gray-600 mb-6 text-sm sm:text-base">
              {this.state.error?.message || (this.state.dict?.components?.errorBoundary?.unexpectedError || this.state.dict?.common?.unexpectedError || 'An unexpected error occurred. Please try again.')}
            </p>
            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full bg-blue-600 text-white px-4 py-2.5 sm:py-3 rounded-md hover:bg-blue-700 font-medium transition-colors text-sm sm:text-base"
              >
                {this.state.dict?.components?.errorBoundary?.tryAgain || this.state.dict?.common?.tryAgain || 'Try Again'}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-gray-100 text-gray-700 px-4 py-2.5 sm:py-3 rounded-md hover:bg-gray-200 font-medium transition-colors text-sm sm:text-base"
              >
                {this.state.dict?.components?.errorBoundary?.reloadPage || this.state.dict?.common?.reloadPage || 'Reload Page'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
