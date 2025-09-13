const mongoose = require('mongoose');

const groupGoalSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudyGroup',
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  subjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  }],
  targetMetric: {
    type: {
      type: String,
      enum: ['count', 'percentage', 'time'],
      required: true
    },
    value: {
      type: Number,
      required: true,
      min: 1
    }
  },
  deadline: {
    type: Date
  },
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    resetDay: {
      type: Number,
      min: 0,
      max: 31 // 0-6 for days of week, 1-31 for days of month
    },
    resetTime: {
      type: String,
      match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  archivedAt: {
    type: Date
  },
  progress: {
    total: {
      type: Number,
      default: 0
    },
    completed: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

// Compound indexes for performance
groupGoalSchema.index({ groupId: 1, isActive: 1 });
groupGoalSchema.index({ deadline: 1 });
groupGoalSchema.index({ 'recurringPattern.frequency': 1 });

// Validation for deadline or recurringPattern must be set
groupGoalSchema.pre('validate', function(next) {
  if (!this.deadline && !this.recurringPattern?.frequency) {
    next(new Error('Either deadline or recurringPattern must be specified'));
  } else if (this.deadline && this.recurringPattern?.frequency) {
    next(new Error('Cannot have both deadline and recurringPattern'));
  } else {
    next();
  }
});

// To Check if only one active goal per group
groupGoalSchema.pre('save', async function(next) {
  if (this.isActive && this.isNew) {
    const existingActive = await this.constructor.findOne({
      groupId: this.groupId,
      isActive: true,
      _id: { $ne: this._id }
    });
    
    if (existingActive) {
      next(new Error('Group can only have one active goal at a time'));
    }
  }
  next();
});

module.exports = mongoose.model('GroupGoal', groupGoalSchema);