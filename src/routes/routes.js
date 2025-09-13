const express = require('express');
const crypto = require('crypto');
const { authenticate,login,getCurrentUser,  oauthAuthorize,oauthCallback,oauthRefresh} = require('../middleware/auth');
const {  validateCreateGroup, validateAddMember, validateCreateGoal,validateRecordActivity,  validateObjectId,  validateLeaderboardQuery} = require('../middleware/validation');
const {getUserGroups, createGroup, getGroupDetails, getGroupMembers, addMemberToGroup,createGroupGoal,
  getActiveGoal,  recordActivity, getLeaderboard,  getGroupProgress, getUserProgress, getGroupMembersProgress
} = require('../controllers/groupsController');

const router = express.Router();


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




router.get('/api/groups', authenticate, getUserGroups);
router.post('/api/groups', authenticate, validateCreateGroup, createGroup);
router.get('/api/groups/:id', authenticate, validateObjectId('id'), getGroupDetails);
router.get('/api/groups/:id/members', authenticate, validateObjectId('id'), getGroupMembers);
router.post('/api/groups/:id/members', authenticate, validateObjectId('id'), validateAddMember, addMemberToGroup);
router.post('/api/groups/:id/goals', authenticate, validateObjectId('id'), validateCreateGoal, createGroupGoal);
router.get('/api/groups/:id/goals/active', authenticate, validateObjectId('id'), getActiveGoal);
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

// If No Endpoint found  
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