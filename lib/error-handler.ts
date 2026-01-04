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
export function handleApiError(error: unknown, defaultMessage: string = 'An error occurred'): NextResponse<ApiError> {
  console.error('API Error:', error);

  // Type guard for error objects
  const isErrorWithName = (e: unknown): e is { name: string; errors?: unknown; message?: string; code?: number; statusCode?: number } => {
    return typeof e === 'object' && e !== null && 'name' in e;
  };

  // Validation errors
  if (isErrorWithName(error) && error.name === 'ValidationException' && 'errors' in error && error.errors) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        errors: error.errors as Array<{ field: string; message: string }>,
      },
      { status: 400 }
    );
  }

  // Mongoose validation errors
  if (isErrorWithName(error) && error.name === 'ValidationError' && 'errors' in error && error.errors) {
    const mongooseErrors = error.errors as Record<string, { path: string; message: string }>;
    const errors = Object.values(mongooseErrors).map((err) => ({
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
  if (isErrorWithName(error) && 'code' in error && error.code === 11000) {
    const keyPattern = 'keyPattern' in error && typeof error.keyPattern === 'object' && error.keyPattern !== null
      ? error.keyPattern as Record<string, unknown>
      : {};
    const field = Object.keys(keyPattern)[0] || 'field';
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
  if (isErrorWithName(error) && error.message === 'Unauthorized') {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
      { status: 401 }
    );
  }

  if (isErrorWithName(error) && error.message && 
      (error.message.includes('Forbidden') || error.message.includes('permissions'))) {
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
  const errorMessage = isErrorWithName(error) && error.message ? error.message : defaultMessage;
  const statusCode = isErrorWithName(error) && error.statusCode ? error.statusCode : 500;
  return NextResponse.json(
    {
      success: false,
      error: errorMessage,
    },
    { status: statusCode }
  );
}

