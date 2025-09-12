const express = require('express');
const crypto = require('crypto');
const { authenticate,login,getCurrentUser,  oauthAuthorize,oauthCallback,oauthRefresh} = require('../middleware/auth');
const {  validateCreateGroup, validateAddMember, validateCreateGoal,validateRecordActivity,  validateObjectId,  validateLeaderboardQuery} = require('../middleware/validation');

// Import controllers
const {
  getUserGroups,
  createGroup,
  getGroupDetails,
  getGroupMembers,
  addMemberToGroup,
  createGroupGoal,
  getActiveGoal,
  recordActivity,
  getLeaderboard,
  getGroupProgress,
  getUserProgress,
  getGroupMembersProgress
} = require('../controllers/groupsController');

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


// ==================== Groups routes ====================

// GET /api/groups - List user's groups
router.get('/api/groups', authenticate, getUserGroups);

// POST /api/groups - Create study group
router.post('/api/groups', authenticate, validateCreateGroup, createGroup);

// GET /api/groups/:id - Get group details
router.get('/api/groups/:id', authenticate, validateObjectId('id'), getGroupDetails);

// GET /api/groups/:id/members - Get group members
router.get('/api/groups/:id/members', authenticate, validateObjectId('id'), getGroupMembers);

// POST /api/groups/:id/members - Add member to group
router.post('/api/groups/:id/members', authenticate, validateObjectId('id'), validateAddMember, addMemberToGroup);

// POST /api/groups/:id/goals - Create goal for group
router.post('/api/groups/:id/goals', authenticate, validateObjectId('id'), validateCreateGoal, createGroupGoal);

// GET /api/groups/:id/goals/active - Get active goal
router.get('/api/groups/:id/goals/active', authenticate, validateObjectId('id'), getActiveGoal);

// POST /api/groups/:id/activities - Record activity
router.post('/api/groups/:id/activities', authenticate, validateObjectId('id'), validateRecordActivity, recordActivity);

// GET /api/groups/:id/leaderboard - Get leaderboard
router.get('/api/groups/:id/leaderboard', authenticate, validateObjectId('id'), validateLeaderboardQuery, getLeaderboard);

// GET /api/groups/:id/progress - Get group progress
router.get('/api/groups/:id/progress', authenticate, validateObjectId('id'), getGroupProgress);

// GET /api/groups/:id/members/progress - Get all members' progress
router.get('/api/groups/:id/members/progress', authenticate, validateObjectId('id'), getGroupMembersProgress);

// GET /api/groups/:id/users/:userId/progress - Get specific user's progress
router.get('/api/groups/:id/users/:userId/progress', authenticate, validateObjectId('id'), getUserProgress);

// GET /api/groups/:id/my-progress - Get current user's progress
router.get('/api/groups/:id/my-progress', authenticate, validateObjectId('id'), getUserProgress);

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