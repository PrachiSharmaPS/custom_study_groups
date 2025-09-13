const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  githubId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: ''
  },
  // Track which OAuth providers are linked
  providers: [{
    type: String,
    enum: ['google'],
    default: []
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);