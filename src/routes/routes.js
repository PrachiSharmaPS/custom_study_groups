const express = require('express');
const { authenticate, getCurrentUser, oauthAuthorize, oauthCallback, oauthRefresh } = require('../middleware/auth');
const { validateCreateGroup, validateAddMember, validateCreateGoal, validateRecordActivity, validateObjectId, validateLeaderboardQuery } = require('../middleware/validation');
const { getUserGroups, createGroup, getGroupDetails, getGroupMembers, addMemberToGroup, createGroupGoal,
  getActiveGoal, recordActivity, getLeaderboard, getGroupProgress, getUserProgress, getGroupMembersProgress
} = require('../controllers/groupsController');

const router = express.Router();

// ==================== Google OAuth Authentication routes ====================
router.get('/api/auth/google', oauthAuthorize);
router.get('/api/auth/callback/google', oauthCallback);
router.post('/api/auth/refresh', oauthRefresh);
router.get('/api/auth/me', authenticate, getCurrentUser);



router.get('/api/groups', authenticate, getUserGroups);
router.post('/api/groups', authenticate, validateCreateGroup, createGroup);
router.get('/api/groups/:id', authenticate, validateObjectId('id'), getGroupDetails);
router.get('/api/groups/:id/members', authenticate, validateObjectId('id'), getGroupMembers);
router.post('/api/groups/:id/members', authenticate, validateObjectId('id'), validateAddMember, addMemberToGroup);
router.post('/api/groups/:id/goals', authenticate, validateObjectId('id'), validateCreateGoal, createGroupGoal);
router.get('/api/groups/:id/goals/active', authenticate, validateObjectId('id'), getActiveGoal);
router.post('/api/groups/:id/activities', authenticate, validateObjectId('id'), validateRecordActivity, recordActivity);
router.get('/api/groups/:id/leaderboard', authenticate, validateObjectId('id'), validateLeaderboardQuery, getLeaderboard);
router.get('/api/groups/:id/progress', authenticate, validateObjectId('id'), getGroupProgress);
router.get('/api/groups/:id/members/progress', authenticate, validateObjectId('id'), getGroupMembersProgress);
router.get('/api/groups/:id/users/:userId/progress', authenticate, validateObjectId('id'), getUserProgress);
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