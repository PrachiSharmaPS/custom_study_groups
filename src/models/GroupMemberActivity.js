const mongoose = require('mongoose');

const groupMemberActivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudyGroup',
    required: true
  },
  goalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroupGoal',
    required: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  status: {
    type: String,
    enum: ['attempted', 'solved', 'correct'],
    required: true
  },
  timeSpent: {
    type: Number,
    required: true,
    min: 0 // Time in seconds
  }
}, {
  timestamps: true
});

// Compound indexes for optimal query performance
groupMemberActivitySchema.index({ userId: 1, goalId: 1, questionId: 1 }, { unique: true });
groupMemberActivitySchema.index({ goalId: 1, status: 1, createdAt: 1 });
groupMemberActivitySchema.index({ userId: 1, groupId: 1, createdAt: -1 });
groupMemberActivitySchema.index({ subjectId: 1, createdAt: -1 });

// Prevent duplicate activities for same user-question-goal combination
groupMemberActivitySchema.pre('save', async function(next) {
  if (this.isNew) {
    const existing = await this.constructor.findOne({
      userId: this.userId,
      goalId: this.goalId,
      questionId: this.questionId
    });
    
    if (existing) {
      next(new Error('Activity already recorded for this user-question-goal combination'));
    }
  }
  next();
});

module.exports = mongoose.model('GroupMemberActivity', groupMemberActivitySchema);