export const createError = ({type, defaultMessage}) => {
  const errorCreator = (message = defaultMessage, options = {}) => {
    const error = new Error(message);
    error.name = type;
    error.status = options.status || 500;
    error.details = options.details || {};
    error.isOperational = true;
    
    Error.captureStackTrace(error, errorCreator);
    return error;
  };
  return errorCreator;
};

// Erros específicos
export const createDatabaseError = ({message, details}) => 
  createError('DatabaseError', 'Database operation failed')(message, {
    status: 500,
    details: { type: 'DATABASE_ERROR', ...details }
  });

export const createValidationError = ({errors, message = 'Validation failed'}) => {
  const error = createError('ValidationError', message)(message, {
    status: 422,
    details: { type: 'VALIDATION_ERROR', errors }
  });
  error.errors = errors;
  return error;
};

export const createAuthError = ({message = 'Unauthorized'}) => 
  createError('AuthError', message)(message, { status: 401 });

// Uso exemplo:
// throw createValidationError([{ field: 'email', message: 'Invalid email' }]);