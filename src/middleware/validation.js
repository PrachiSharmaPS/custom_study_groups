const { body, param, query, validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: {
        code: 'VALIDATION_ERROR',
        details: errors.array().reduce((acc, error) => {
          acc[error.path] = error.msg;
          return acc;
        }, {})
      },
      data: null
    });
  }
  next();
};

// Group validation rules
const validateCreateGroup = [
  body('name')
    .isLength({ min: 3, max: 50 })
    .withMessage('Group name must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9\s]+$/)
    .withMessage('Group name can only contain letters, numbers, and spaces'),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('members')
    .optional()
    .isArray()
    .withMessage('Members must be an array')
    .custom((members) => {
      if (members && members.length > 49) { // 49 + creator = 50 max
        throw new Error('Cannot add more than 49 initial members');
      }
      return true;
    }),
  
  handleValidationErrors
];

const validateAddMember = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  
  handleValidationErrors
];

// Goal validation rules
const validateCreateGoal = [
  body('title')
    .isLength({ min: 1, max: 100 })
    .withMessage('Goal title must be between 1 and 100 characters'),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('subjects')
    .isArray({ min: 1 })
    .withMessage('At least one subject is required'),
  
  body('targetMetric.type')
    .isIn(['count', 'percentage', 'time'])
    .withMessage('Target metric type must be count, percentage, or time'),
  
  body('targetMetric.value')
    .isInt({ min: 1 })
    .withMessage('Target metric value must be a positive integer'),
  
  body('deadline')
    .optional()
    .isISO8601()
    .withMessage('Deadline must be a valid date')
    .custom((deadline) => {
      if (deadline && new Date(deadline) <= new Date()) {
        throw new Error('Deadline must be in the future');
      }
      return true;
    }),
  
  body('recurringPattern.frequency')
    .optional()
    .isIn(['daily', 'weekly', 'monthly'])
    .withMessage('Recurring frequency must be daily, weekly, or monthly'),
  
  handleValidationErrors
];

// Activity validation rules
const validateRecordActivity = [
  body('questionId')
    .isMongoId()
    .withMessage('Valid question ID is required'),
  
  body('status')
    .isIn(['attempted', 'solved', 'correct'])
    .withMessage('Status must be attempted, solved, or correct'),
  
  body('timeSpent')
    .isInt({ min: 0 })
    .withMessage('Time spent must be a non-negative integer (seconds)'),
  
  handleValidationErrors
];

// Parameter validation
const validateObjectId = (paramName) => [
  param(paramName)
    .isMongoId()
    .withMessage(`Valid ${paramName} is required`),
  
  handleValidationErrors
];

// Query validation for leaderboard
const validateLeaderboardQuery = [
  query('metric')
    .optional()
    .isIn(['count', 'percentage', 'time'])
    .withMessage('Metric must be count, percentage, or time'),
  
  query('timeWindow')
    .optional()
    .isIn(['daily', 'weekly', 'monthly', 'all-time'])
    .withMessage('Time window must be daily, weekly, monthly, or all-time'),
  
  query('sort')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort must be asc or desc'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

module.exports = {
  validateCreateGroup,
  validateAddMember,
  validateCreateGoal,
  validateRecordActivity,
  validateObjectId,
  validateLeaderboardQuery,
  handleValidationErrors
};