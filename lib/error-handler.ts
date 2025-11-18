import { NextResponse } from 'next/server';

export interface ApiError {
  success: false;
  error: string;
  errors?: Array<{ field: string; message: string }>;
  code?: string;
}

/**
 * Standardized error handler for API routes
 */
export function handleApiError(error: any, defaultMessage: string = 'An error occurred'): NextResponse<ApiError> {
  console.error('API Error:', error);

  // Validation errors
  if (error.name === 'ValidationException' && error.errors) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        errors: error.errors,
      },
      { status: 400 }
    );
  }

  // Mongoose validation errors
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map((err: any) => ({
      field: err.path,
      message: err.message,
    }));
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        errors,
      },
      { status: 400 }
    );
  }

  // Duplicate key errors
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    return NextResponse.json(
      {
        success: false,
        error: `${field} already exists`,
        code: 'DUPLICATE_KEY',
      },
      { status: 400 }
    );
  }

  // Authentication/Authorization errors
  if (error.message === 'Unauthorized') {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
      { status: 401 }
    );
  }

  if (error.message.includes('Forbidden') || error.message.includes('permissions')) {
    return NextResponse.json(
      {
        success: false,
        error: 'Forbidden: Insufficient permissions',
        code: 'FORBIDDEN',
      },
      { status: 403 }
    );
  }

  // Default error
  return NextResponse.json(
    {
      success: false,
      error: error.message || defaultMessage,
    },
    { status: error.statusCode || 500 }
  );
}

