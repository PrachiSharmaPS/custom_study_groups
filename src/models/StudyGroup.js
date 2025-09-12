const mongoose = require('mongoose');

const studyGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 50,
    trim: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  maxMembers: {
    type: Number,
    default: 50,
    max: 50
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound indexes for performance
studyGroupSchema.index({ creator: 1 });
studyGroupSchema.index({ members: 1 });
studyGroupSchema.index({ isActive: 1 });
studyGroupSchema.index({ creator: 1, isActive: 1 });

// Virtual to check if group is full
studyGroupSchema.virtual('isFull').get(function() {
  return this.members.length >= this.maxMembers;
});

// Pre-save middleware to ensure creator is in members array
studyGroupSchema.pre('save', function(next) {
  if (this.isNew && !this.members.includes(this.creator)) {
    this.members.push(this.creator);
  }
  next();
});

module.exports = mongoose.model('StudyGroup', studyGroupSchema);