const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID';
    error = {
      code: 'INVALID_RESOURCE_ID',
      message
    };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = {
      code: 'DUPLICATE_FIELD',
      message,
      details: `${field}: ${err.keyValue[field]}`
    };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      code: 'VALIDATION_ERROR',
      message,
      details: Object.values(err.errors).reduce((acc, curr) => {
        acc[curr.path] = curr.message;
        return acc;
      }, {})
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = {
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token'
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      code: 'TOKEN_EXPIRED',
      message: 'Authentication token expired'
    };
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal Server Error',
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      details: error.details || null
    },
    data: null
  });
};

module.exports = errorHandler;