const express = require('express');
const crypto = require('crypto');
const { authenticate,login,getCurrentUser,  oauthAuthorize,oauthCallback,oauthRefresh} = require('../middleware/auth');
const {  validateCreateGroup, validateAddMember, validateCreateGoal,validateRecordActivity,  validateObjectId,  validateLeaderboardQuery} = require('../middleware/validation');

// Import controllers
const groupsController = require('../controllers/groupsController');

const router = express.Router();

// ==================== Health & documentation ====================
// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'StudySync API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});


// ==================== Authentication routes ====================
// Login endpoint to get JWT token
router.post('/api/auth/login', login);

// OAuth Authorization endpoint - get OAuth URL
router.get('/api/auth/oauth/:provider', oauthAuthorize);

// OAuth Authorization endpoint for Postman (redirects to provider)
router.get('/api/auth/oauth-redirect/:provider', (req, res) => {
  const { provider } = req.params;
  const { redirect_uri } = req.query;
  
  // Redirect directly to OAuth provider
  const authUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/oauth/${provider}?redirect_uri=${encodeURIComponent(redirect_uri || 'http://localhost:3000/api/auth/callback/' + provider)}`;
  
  res.redirect(authUrl);
});

// Direct OAuth redirect to Google (for easy testing)
router.get('/api/auth/google-login', (req, res) => {
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent('http://localhost:3000/api/auth/callback/google')}&response_type=code&scope=openid email profile&state=${crypto.randomBytes(16).toString('hex')}`;
  res.redirect(authUrl);
});

// OAuth configuration info endpoint
router.get('/api/auth/oauth-config', (req, res) => {
  res.json({
    success: true,
    message: 'OAuth configuration information',
    data: {
      base_url: process.env.BASE_URL || 'http://localhost:3000',
      redirect_uris: {
        google: `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/callback/google`
      },
      instructions: {
        google: 'Add this redirect URI to your Google OAuth app: ' + `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/callback/google`
      }
    }
  });
});

// OAuth Callback endpoint - handle OAuth response
router.get('/api/auth/callback/:provider', oauthCallback);

// OAuth Token Refresh endpoint
router.post('/api/auth/refresh', oauthRefresh);

// Get current user info (requires auth)
router.get('/api/auth/me', authenticate, getCurrentUser);

// Test endpoint to verify OAuth authentication works
router.get('/api/test-auth', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'OAuth authentication successful! You can access protected endpoints.',
    data: {
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        providers: req.user.providers
      },
      timestamp: new Date().toISOString()
    }
  });
});

// Simple test endpoint to create a test user and get token (for testing only)
router.post('/api/test/create-test-user', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { User } = require('../models');
    
    // Create or find test user
    let user = await User.findOne({ email: 'test@example.com' });
    
    if (!user) {
      user = await User.create({
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://ui-avatars.com/api/?name=Test+User&background=random',
        providers: ['test']
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '5m' }
    );
    
    res.json({
      success: true,
      message: 'Test user created and token generated',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create test user',
      error: {
        code: 'TEST_USER_ERROR',
        details: error.message
      },
      data: null
    });
  }
});

// ==================== Groups routes ====================

// GET /api/groups - List user's groups
router.get('/api/groups', authenticate, groupsController.getUserGroups);

// POST /api/groups - Create study group
router.post('/api/groups', authenticate, validateCreateGroup, groupsController.createGroup);

// GET /api/groups/:id - Get group details
router.get('/api/groups/:id', authenticate, validateObjectId, groupsController.getGroupDetails);

// POST /api/groups/:id/members - Add member to group
router.post('/api/groups/:id/members', authenticate, validateObjectId, validateAddMember, groupsController.addMemberToGroup);

// POST /api/groups/:id/goals - Create goal for group
router.post('/api/groups/:id/goals', authenticate, validateObjectId, validateCreateGoal, groupsController.createGroupGoal);

// GET /api/groups/:id/goals/active - Get active goal
router.get('/api/groups/:id/goals/active', authenticate, validateObjectId, groupsController.getActiveGoal);

// POST /api/groups/:id/activities - Record activity
router.post('/api/groups/:id/activities', authenticate, validateObjectId, validateRecordActivity, groupsController.recordActivity);

// GET /api/groups/:id/leaderboard - Get leaderboard
router.get('/api/groups/:id/leaderboard', authenticate, validateObjectId, validateLeaderboardQuery, groupsController.getLeaderboard);

// GET /api/groups/:id/progress - Get progress
router.get('/api/groups/:id/progress', authenticate, validateObjectId, groupsController.getGroupProgress);

// 404 handler for API routes
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    error: {
      code: 'ENDPOINT_NOT_FOUND'
    },
    data: {
      suggestion: 'Check the API documentation for available endpoints'
    }
  });
});

module.exports = router;