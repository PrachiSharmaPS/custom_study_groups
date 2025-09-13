const StudyGroup = require("../models/StudyGroup");
const GroupGoal = require("../models/GroupGoal");
const GroupMemberActivity = require("../models/GroupMemberActivity");
const User = require("../models/User");
const Subject = require("../models/Subject");
const { getRedisClient } = require("../config/redis");

// Helper function to update goal progress - I spent a lot of time getting this calculation right!
const updateGoalProgress = async (goalId) => {
  try {
    const goal = await GroupGoal.findById(goalId);
    if (!goal) return;

    // Count total activities for this goal (only count solved/correct answers)
    const totalActivities = await GroupMemberActivity.countDocuments({
      goalId,
      status: { $in: ['solved', 'correct'] }
    });

    // Calculate progress - I had to be careful with division by zero here
    const completed = totalActivities;
    const percentage = goal.targetMetric.value > 0 
      ? Math.min((completed / goal.targetMetric.value) * 100, 100)
      : 0;

    // Update goal progress - I round to 2 decimal places for cleaner display
    await GroupGoal.findByIdAndUpdate(goalId, {
      'progress.total': goal.targetMetric.value,
      'progress.completed': completed,
      'progress.percentage': Math.round(percentage * 100) / 100,
      'progress.lastUpdated': new Date()
    });

    // Invalidate related caches - this was crucial for real-time updates
    await invalidateGroupCaches(goal.groupId);
  } catch (error) {
    console.error('Error updating goal progress:', error);
  }
};

// Helper function to invalidate group-related caches
const invalidateGroupCaches = async (groupId) => {
  try {
    const redis = getRedisClient();
    if (!redis) return;

    // Delete all leaderboard caches for this group
    const keys = await redis.keys(`leaderboard:${groupId}:*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }

    // Delete progress cache for this group
    await redis.del(`progress:${groupId}`);
  } catch (error) {
    console.error('Error invalidating caches:', error);
  }
};

// Helper function to get cached data
const getCachedData = async (key) => {
  try {
    const redis = getRedisClient();
    if (!redis) return null;

    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('Error getting cached data:', error);
    return null;
  }
};

// Helper function to set cached data
const setCachedData = async (key, data, ttl = 300) => { // 5 minutes default TTL
  try {
    const redis = getRedisClient();
    if (!redis) return;

    await redis.setEx(key, ttl, JSON.stringify(data));
  } catch (error) {
    console.error('Error setting cached data:', error);
  }
};

// Helper function to archive expired goals
const archiveExpiredGoals = async () => {
  try {
    const now = new Date();
    
    // Find all active goals that have passed their deadline
    const expiredGoals = await GroupGoal.find({
      isActive: true,
      deadline: { $lt: now }
    });

    if (expiredGoals.length > 0) {
      // Archive all expired goals
      const goalIds = expiredGoals.map(goal => goal._id);
      await GroupGoal.updateMany(
        { _id: { $in: goalIds } },
        { 
          isActive: false, 
          archivedAt: now 
        }
      );

      // Invalidate caches for affected groups
      for (const goal of expiredGoals) {
        await invalidateGroupCaches(goal.groupId);
      }

      console.log(`Archived ${expiredGoals.length} expired goals`);
    }
  } catch (error) {
    console.error('Error archiving expired goals:', error);
  }
};

// Helper function to handle recurring goal resets
const handleRecurringGoalResets = async () => {
  try {
    const now = new Date();
    
    // Find active recurring goals that need reset
    const recurringGoals = await GroupGoal.find({
      isActive: true,
      'recurringPattern.frequency': { $exists: true }
    });

    for (const goal of recurringGoals) {
      const { frequency, resetDay, resetTime } = goal.recurringPattern;
      let shouldReset = false;

      switch (frequency) {
        case 'daily':
          // Reset every day at specified time
          const dailyResetTime = resetTime ? resetTime.split(':') : ['00', '00'];
          const dailyResetHour = parseInt(dailyResetTime[0]);
          const dailyResetMinute = parseInt(dailyResetTime[1]);
          
          if (now.getHours() === dailyResetHour && now.getMinutes() === dailyResetMinute) {
            shouldReset = true;
          }
          break;

        case 'weekly':
          // Reset on specified day of week (0-6, Sunday = 0)
          if (now.getDay() === resetDay) {
            shouldReset = true;
          }
          break;

        case 'monthly':
          // Reset on specified day of month
          if (now.getDate() === resetDay) {
            shouldReset = true;
          }
          break;
      }

      if (shouldReset) {
        // Reset progress for this goal
        await GroupGoal.findByIdAndUpdate(goal._id, {
          'progress.completed': 0,
          'progress.percentage': 0,
          'progress.lastUpdated': now
        });

        // Invalidate caches
        await invalidateGroupCaches(goal.groupId);
        
        console.log(`Reset recurring goal: ${goal.title}`);
      }
    }
  } catch (error) {
    console.error('Error handling recurring goal resets:', error);
  }
};

// List user's groups
const getUserGroups = async (req, res) => {
  try {
    const groups = await StudyGroup.find({
      members: req.user._id,
      isActive: true,
    })
      .populate("creator", "name email avatar")
      .populate("members", "name email avatar")
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      message: "Groups retrieved successfully",
      data: {
        groups: groups.map((group) => ({
          id: group._id,
          name: group.name,
          description: group.description,
          creator: group.creator,
          memberCount: group.members.length,
          maxMembers: group.maxMembers,
          isCreator: group.creator._id.toString() === req.user._id.toString(),
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error("Get groups error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve groups",
      error: {
        code: "GET_GROUPS_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};
// Create a new study group - I limited users to one group creation to prevent spam
const createGroup = async (req, res) => {
  try {
    const { name, description, maxMembers, subject } = req.body;

    // Check if user is already a creator of another group - I added this business rule
    const existingCreatorGroup = await StudyGroup.findOne({
      creator: req.user._id,
      isActive: true
    });

    if (existingCreatorGroup) {
      return res.status(400).json({
        success: false,
        message: "You can only be a creator of one group at a time (I set this limit to prevent spam)",
        error: {
          code: "ALREADY_CREATOR",
          existingGroup: {
            id: existingCreatorGroup._id,
            name: existingCreatorGroup.name
          }
        },
        data: null,
      });
    }

    const group = await StudyGroup.create({
      name,
      description,
      maxMembers: maxMembers || 10,
      subject,
      creator: req.user._id,
      members: [req.user._id],
    });

    await group.populate("creator", "name email avatar");
    await group.populate("members", "name email avatar");

    res.status(201).json({
      success: true,
      message: "Study group created successfully",
      data: {
        group: {
          id: group._id,
          name: group.name,
          description: group.description,
          creator: group.creator,
          memberCount: group.members.length,
          maxMembers: group.maxMembers,
          subject: group.subject,
          isCreator: true,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Create group error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create study group",
      error: {
        code: "CREATE_GROUP_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};

// Get specific group details
const getGroupDetails = async (req, res) => {
  try {
    const group = await StudyGroup.findById(req.params.id)
      .populate("creator", "name email avatar")
      .populate("members", "name email avatar");

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: {
          code: "GROUP_NOT_FOUND",
        },
        data: null,
      });
    }

    // Check if user is a member
    const isMember = group.members.some(
      (member) => member._id.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
        error: {
          code: "ACCESS_DENIED",
        },
        data: null,
      });
    }

    res.json({
      success: true,
      message: "Group details retrieved successfully",
      data: {
        group: {
          id: group._id,
          name: group.name,
          description: group.description,
          creator: group.creator,
          members: group.members,
          memberCount: group.members.length,
          maxMembers: group.maxMembers,
          subject: group.subject,
          isCreator: group.creator._id.toString() === req.user._id.toString(),
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Get group details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve group details",
      error: {
        code: "GET_GROUP_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};

// Get group members
const getGroupMembers = async (req, res) => {
  try {
    const groupId = req.params.id;

    const group = await StudyGroup.findById(groupId)
      .populate("creator", "name email avatar")
      .populate("members", "name email avatar");

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: {
          code: "GROUP_NOT_FOUND",
        },
        data: null,
      });
    }

    // Check if user is a member
    const isMember = group.members.some(
      (member) => member._id.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
        error: {
          code: "ACCESS_DENIED",
        },
        data: null,
      });
    }

    // Get active goal to show progress context
    const activeGoal = await GroupGoal.findOne({ groupId, isActive: true });

    res.json({
      success: true,
      message: "Group members retrieved successfully",
      data: {
        group: {
          id: group._id,
          name: group.name,
          description: group.description,
          memberCount: group.members.length,
          maxMembers: group.maxMembers,
          isCreator: group.creator._id.toString() === req.user._id.toString(),
        },
        creator: group.creator,
        members: group.members,
        activeGoal: activeGoal ? {
          id: activeGoal._id,
          title: activeGoal.title,
          targetValue: activeGoal.targetMetric.value,
          targetType: activeGoal.targetMetric.type,
          deadline: activeGoal.deadline
        } : null
      },
    });
  } catch (error) {
    console.error("Get group members error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve group members",
      error: {
        code: "GET_GROUP_MEMBERS_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};

// Add member to group
const addMemberToGroup = async (req, res) => {
  try {
    const { email } = req.body;
    const groupId = req.params.id;
  console.log("test data "+groupId);
    const group = await StudyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: {
          code: "GROUP_NOT_FOUND",
        },
        data: null,
      });
    }

    // Check if user is the creator
    if (group.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only group creators can add members",
        error: {
          code: "ACCESS_DENIED",
        },
        data: null,
      });
    }

    // Check if group is full
    if (group.members.length >= group.maxMembers) {
      return res.status(400).json({
        success: false,
        message: "Group is full",
        error: {
          code: "GROUP_FULL",
        },
        data: null,
      });
    }

    // Find user by email
    const userToAdd = await User.findOne({ email });
    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: {
          code: "USER_NOT_FOUND",
        },
        data: null,
      });
    }

    // Check if user is already a member
    if (group.members.includes(userToAdd._id)) {
      return res.status(400).json({
        success: false,
        message: "User is already a member of this group",
        error: {
          code: "ALREADY_MEMBER",
        },
        data: null,
      });
    }

    // Add user to group
    group.members.push(userToAdd._id);
    await group.save();

    await group.populate("members", "name email avatar");

    res.json({
      success: true,
      message: "Member added successfully",
      data: {
        group: {
          id: group._id,
          name: group.name,
          members: group.members,
          memberCount: group.members.length,
        },
      },
    });
  } catch (error) {
    console.error("Add member error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add member",
      error: {
        code: "ADD_MEMBER_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};

// Create goal for group
const createGroupGoal = async (req, res) => {
  try {
    const { title, description, subjects, targetMetric, deadline, recurringPattern } = req.body;
    const groupId = req.params.id;

    // Validate that either deadline or recurringPattern is provided
    if (!deadline && !recurringPattern) {
      return res.status(400).json({
        success: false,
        message: "Failed to create goal",
        error: {
          code: "CREATE_GOAL_ERROR",
          details: "Either deadline or recurringPattern must be specified"
        },
        data: null,
      });
    }

    const group = await StudyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: {
          code: "GROUP_NOT_FOUND",
        },
        data: null,
      });
    }

    // Check if user is a member
    const isMember = group.members.includes(req.user._id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
        error: {
          code: "ACCESS_DENIED",
        },
        data: null,
      });
    }

    // Handle subjects - find or create subjects by name
    const subjectIds = [];
    for (const subjectName of subjects) {
      let subject = await Subject.findOne({ name: subjectName });
      if (!subject) {
        // Create new subject if it doesn't exist
        subject = await Subject.create({ name: subjectName });
      }
      subjectIds.push(subject._id);
    }

    // Deactivate current active goal if exists
    await GroupGoal.updateMany(
      { groupId, isActive: true },
      { isActive: false }
    );

    // Create new goal
    const goal = await GroupGoal.create({
      groupId,
      title,
      description,
      subjects: subjectIds,
      targetMetric,
      deadline: deadline ? new Date(deadline) : null,
      recurringPattern,
      isActive: true,
      createdBy: req.user._id,
      progress: {
        total: targetMetric.value,
        completed: 0,
        percentage: 0,
        lastUpdated: new Date()
      }
    });

    // Populate subjects with names for response
    const populatedGoal = await GroupGoal.findById(goal._id).populate('subjects', 'name');

    res.status(201).json({
      success: true,
      message: "Goal created successfully",
      data: {
        goal: {
          id: populatedGoal._id,
          title: populatedGoal.title,
          description: populatedGoal.description,
          subjects: populatedGoal.subjects.map(subject => subject.name),
          targetMetric: populatedGoal.targetMetric,
          deadline: populatedGoal.deadline,
          recurringPattern: populatedGoal.recurringPattern,
          progress: populatedGoal.progress,
          isActive: populatedGoal.isActive,
          createdAt: populatedGoal.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Create goal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create goal",
      error: {
        code: "CREATE_GOAL_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};

// Get active goal
const getActiveGoal = async (req, res) => {
  try {
    const groupId = req.params.id;

    const group = await StudyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: {
          code: "GROUP_NOT_FOUND",
        },
        data: null,
      });
    }

    // Check if user is a member
    const isMember = group.members.includes(req.user._id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
        error: {
          code: "ACCESS_DENIED",
        },
        data: null,
      });
    }

    const goal = await GroupGoal.findOne({ groupId, isActive: true });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "No active goal found",
        error: {
          code: "NO_ACTIVE_GOAL",
        },
        data: null,
      });
    }

    res.json({
      success: true,
      message: "Active goal retrieved successfully",
      data: {
        goal: {
          id: goal._id,
          title: goal.title,
          description: goal.description,
          targetDate: goal.targetDate,
          targetValue: goal.targetValue,
          unit: goal.unit,
          isActive: goal.isActive,
          createdAt: goal.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Get active goal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve active goal",
      error: {
        code: "GET_GOAL_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};

// Record activity
const recordActivity = async (req, res) => {
  try {
    const { questionId, subjectId, status, timeSpent } = req.body;
    const groupId = req.params.id;

    // Validate required fields
    if (!questionId || !subjectId || !status || timeSpent === undefined) {
      return res.status(400).json({
        success: false,
        message: "questionId, subjectId, status, and timeSpent are required",
        error: {
          code: "MISSING_FIELDS",
        },
        data: null,
      });
    }

    // Validate status
    if (!['solved', 'correct'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Only 'solved' or 'correct' status activities count towards goals",
        error: {
          code: "INVALID_STATUS",
        },
        data: null,
      });
    }

    const group = await StudyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: {
          code: "GROUP_NOT_FOUND",
        },
        data: null,
      });
    }

    // Check if user is a member
    const isMember = group.members.includes(req.user._id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
        error: {
          code: "ACCESS_DENIED",
        },
        data: null,
      });
    }

    // Get active goal for the group
    const activeGoal = await GroupGoal.findOne({ groupId, isActive: true });
    if (!activeGoal) {
      return res.status(404).json({
        success: false,
        message: "No active goal found for this group",
        error: {
          code: "NO_ACTIVE_GOAL",
        },
        data: null,
      });
    }

    // Check if subject matches goal subjects
    const subjectMatches = activeGoal.subjects.some(goalSubject => 
      goalSubject.toString() === subjectId
    );
    if (!subjectMatches) {
      return res.status(400).json({
        success: false,
        message: "Activity subject does not match any of the goal subjects",
        error: {
          code: "SUBJECT_MISMATCH",
        },
        data: null,
      });
    }

    // Check if activity is within goal deadline
    const now = new Date();
    if (activeGoal.deadline && now > activeGoal.deadline) {
      return res.status(400).json({
        success: false,
        message: "Goal deadline has passed. Please create a new goal.",
        error: {
          code: "GOAL_EXPIRED",
        },
        data: null,
      });
    }

    // Check if activity is after goal start date
    if (now < activeGoal.createdAt) {
      return res.status(400).json({
        success: false,
        message: "Activity cannot be recorded before goal creation date",
        error: {
          code: "INVALID_TIMESTAMP",
        },
        data: null,
      });
    }

    // Create activity record
    const activity = await GroupMemberActivity.create({
      groupId,
      goalId: activeGoal._id,
      userId: req.user._id,
      questionId,
      subjectId,
      status,
      timeSpent: Math.max(0, timeSpent), // Ensure non-negative
    });

    // Update goal progress and invalidate caches
    await updateGoalProgress(activeGoal._id);

    res.status(201).json({
      success: true,
      message: "Activity recorded successfully",
      data: {
        activity: {
          id: activity._id,
          questionId: activity.questionId,
          subjectId: activity.subjectId,
          status: activity.status,
          timeSpent: activity.timeSpent,
          createdAt: activity.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Record activity error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record activity",
      error: {
        code: "RECORD_ACTIVITY_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};

// Get leaderboard
const getLeaderboard = async (req, res) => {
  try {
    const groupId = req.params.id;
    const { 
      period = "all", 
      sortBy = "questionsSolved", 
      sortOrder = "desc",
      subjects,
      page = 1,
      limit = 10
    } = req.query;

    const group = await StudyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: {
          code: "GROUP_NOT_FOUND",
        },
        data: null,
      });
    }

    // Check if user is a member
    const isMember = group.members.includes(req.user._id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
        error: {
          code: "ACCESS_DENIED",
        },
        data: null,
      });
    }

    // Get active goal
    const activeGoal = await GroupGoal.findOne({ groupId, isActive: true });
    if (!activeGoal) {
      return res.status(404).json({
        success: false,
        message: "No active goal found for this group",
        error: {
          code: "NO_ACTIVE_GOAL",
        },
        data: null,
      });
    }

    // Create cache key based on filters
    const cacheKey = `leaderboard:${groupId}:${period}:${sortBy}:${sortOrder}:${subjects || 'all'}:${page}:${limit}`;
    
    // Try to get cached data
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      return res.json({
        success: true,
        message: "Leaderboard retrieved successfully (cached)",
        data: cachedData,
      });
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case "day":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "all":
      default:
        startDate = activeGoal.createdAt;
    }

    // Build query for activities
    const activityQuery = {
      groupId,
      goalId: activeGoal._id,
      status: { $in: ['solved', 'correct'] },
      createdAt: { $gte: startDate, $lte: now }
    };

    // Add subject filter if specified
    if (subjects) {
      const subjectArray = Array.isArray(subjects) ? subjects : [subjects];
      activityQuery.subjectId = { $in: subjectArray };
    }

    // Get activities with aggregation for better performance
    const activities = await GroupMemberActivity.aggregate([
      { $match: activityQuery },
      {
        $group: {
          _id: "$userId",
          questionsSolved: { $sum: 1 },
          totalTimeSpent: { $sum: "$timeSpent" },
          lastActivity: { $max: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" },
      {
        $project: {
          userId: "$_id",
          user: {
            _id: "$user._id",
            name: "$user.name",
            email: "$user.email",
            avatar: "$user.avatar"
          },
          questionsSolved: 1,
          totalTimeSpent: 1,
          lastActivity: 1,
          contributionPercentage: {
            $multiply: [
              { $divide: ["$questionsSolved", activeGoal.targetMetric.value] },
              100
            ]
          }
        }
      }
    ]);

    // Sort the results
    const sortField = sortBy === "questionsSolved" ? "questionsSolved" :
                     sortBy === "contributionPercentage" ? "contributionPercentage" :
                     sortBy === "totalTimeSpent" ? "totalTimeSpent" :
                     sortBy === "userName" ? "user.name" : "questionsSolved";

    activities.sort((a, b) => {
      let aVal, bVal;
      
      if (sortBy === "userName") {
        aVal = a.user.name.toLowerCase();
        bVal = b.user.name.toLowerCase();
      } else {
        aVal = a[sortField] || 0;
        bVal = b[sortField] || 0;
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Add ranks (handle ties)
    let currentRank = 1;
    let previousValue = null;
    const rankedActivities = activities.map((entry, index) => {
      const currentValue = entry[sortField] || 0;
      
      if (index === 0 || currentValue !== previousValue) {
        currentRank = index + 1;
      }
      
      previousValue = currentValue;
      
      return {
        rank: currentRank,
        ...entry,
        contributionPercentage: Math.round(entry.contributionPercentage * 100) / 100
      };
    });

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    
    const paginatedResults = rankedActivities.slice(startIndex, endIndex);
    
    // Find current user's position (even if not in top results)
    const currentUserEntry = rankedActivities.find(entry => 
      entry.userId.toString() === req.user._id.toString()
    );

    const responseData = {
      leaderboard: paginatedResults,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(rankedActivities.length / limitNum),
        totalEntries: rankedActivities.length,
        hasNextPage: endIndex < rankedActivities.length,
        hasPrevPage: pageNum > 1
      },
      currentUser: currentUserEntry || null,
      filters: {
        period,
        sortBy,
        sortOrder,
        subjects: subjects ? (Array.isArray(subjects) ? subjects : [subjects]) : null
      },
      goal: {
        id: activeGoal._id,
        title: activeGoal.title,
        targetValue: activeGoal.targetMetric.value,
        targetType: activeGoal.targetMetric.type
      }
    };

    // Cache the result (TTL based on goal deadline)
    const cacheTTL = activeGoal.deadline ? 
      Math.max(300, Math.floor((activeGoal.deadline - now) / 1000)) : 300;
    await setCachedData(cacheKey, responseData, cacheTTL);

    res.json({
      success: true,
      message: "Leaderboard retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Get leaderboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve leaderboard",
      error: {
        code: "GET_LEADERBOARD_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};
// Get group progress
const getGroupProgress = async (req, res) => {
  try {
    const groupId = req.params.id;

    const group = await StudyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: {
          code: "GROUP_NOT_FOUND",
        },
        data: null,
      });
    }

    // Check if user is a member
    const isMember = group.members.includes(req.user._id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
        error: {
          code: "ACCESS_DENIED",
        },
        data: null,
      });
    }

    const activeGoal = await GroupGoal.findOne({ groupId, isActive: true });
    if (!activeGoal) {
      return res.status(404).json({
        success: false,
        message: "No active goal found",
        error: {
          code: "NO_ACTIVE_GOAL",
        },
        data: null,
      });
    }

    // Try to get cached progress data
    const cacheKey = `progress:${groupId}`;
    const cachedProgress = await getCachedData(cacheKey);
    
    if (cachedProgress) {
      return res.json({
        success: true,
        message: "Group progress retrieved successfully (cached)",
        data: cachedProgress,
      });
    }

    // Get total progress towards goal
    const totalProgress = await GroupMemberActivity.aggregate([
      { $match: { groupId: group._id, goalId: activeGoal._id, status: { $in: ['solved', 'correct'] } } },
      { $group: { _id: null, totalCount: { $sum: 1 } } },
    ]);

    const currentProgress = totalProgress.length > 0 ? totalProgress[0].totalCount : 0;
    const progressPercentage = Math.min(
      (currentProgress / activeGoal.targetMetric.value) * 100,
      100
    );

    const responseData = {
      goal: {
        id: activeGoal._id,
        title: activeGoal.title,
        targetValue: activeGoal.targetMetric.value,
        targetType: activeGoal.targetMetric.type,
        deadline: activeGoal.deadline,
        subjects: activeGoal.subjects
      },
      progress: {
        current: currentProgress,
        target: activeGoal.targetMetric.value,
        percentage: Math.round(progressPercentage * 100) / 100,
        remaining: Math.max(activeGoal.targetMetric.value - currentProgress, 0),
        lastUpdated: new Date()
      },
    };

    // Cache the progress data
    const cacheTTL = activeGoal.deadline ? 
      Math.max(300, Math.floor((activeGoal.deadline - new Date()) / 1000)) : 300;
    await setCachedData(cacheKey, responseData, cacheTTL);

    res.json({
      success: true,
      message: "Group progress retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Get group progress error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve group progress",
      error: {
        code: "GET_PROGRESS_ERROR",
        details: error.message,
      },
      data: null,
    });
  }
};

// Get individual user progress in a group
const getUserProgress = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.params.userId || req.user._id; // Allow viewing own or others' progress

    const group = await StudyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: { code: "GROUP_NOT_FOUND" },
        data: null,
      });
    }

    // Check if user is a member
    const isMember = group.members.includes(req.user._id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
        error: { code: "ACCESS_DENIED" },
        data: null,
      });
    }

    // Get active goal
    const activeGoal = await GroupGoal.findOne({ groupId, isActive: true });
    if (!activeGoal) {
      return res.status(404).json({
        success: false,
        message: "No active goal found for this group",
        error: { code: "NO_ACTIVE_GOAL" },
        data: null,
      });
    }

    // Get user's activities for this goal
    const userActivities = await GroupMemberActivity.find({
      groupId,
      goalId: activeGoal._id,
      userId,
      status: { $in: ['solved', 'correct'] }
    }).populate('questionId', 'title difficulty').populate('subjectId', 'name');

    // Calculate user's progress
    const totalQuestionsSolved = userActivities.length;
    const totalTimeSpent = userActivities.reduce((sum, activity) => sum + activity.timeSpent, 0);
    const contributionPercentage = activeGoal.targetMetric.value > 0 
      ? (totalQuestionsSolved / activeGoal.targetMetric.value) * 100 
      : 0;

    // Get recent activities (last 10)
    const recentActivities = userActivities
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10)
      .map(activity => ({
        id: activity._id,
        questionTitle: activity.questionId?.title || 'Unknown Question',
        subject: activity.subjectId?.name || 'Unknown Subject',
        timeSpent: activity.timeSpent,
        completedAt: activity.createdAt
      }));

    // Get subject-wise breakdown
    const subjectBreakdown = {};
    userActivities.forEach(activity => {
      const subjectName = activity.subjectId?.name || 'Unknown';
      if (!subjectBreakdown[subjectName]) {
        subjectBreakdown[subjectName] = { count: 0, timeSpent: 0 };
      }
      subjectBreakdown[subjectName].count++;
      subjectBreakdown[subjectName].timeSpent += activity.timeSpent;
    });

    // Get user info
    const user = await User.findById(userId).select('name email avatar');

    res.json({
      success: true,
      message: "User progress retrieved successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar
        },
        goal: {
          id: activeGoal._id,
          title: activeGoal.title,
          targetValue: activeGoal.targetMetric.value,
          targetType: activeGoal.targetMetric.type
        },
        progress: {
          questionsSolved: totalQuestionsSolved,
          totalTimeSpent: totalTimeSpent,
          contributionPercentage: Math.round(contributionPercentage * 100) / 100,
          remainingQuestions: Math.max(activeGoal.targetMetric.value - totalQuestionsSolved, 0),
          isCompleted: totalQuestionsSolved >= activeGoal.targetMetric.value
        },
        subjectBreakdown: Object.entries(subjectBreakdown).map(([subject, stats]) => ({
          subject,
          questionsSolved: stats.count,
          timeSpent: stats.timeSpent
        })),
        recentActivities
      },
    });
  } catch (error) {
    console.error("Get user progress error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve user progress",
      error: { code: "GET_USER_PROGRESS_ERROR", details: error.message },
      data: null,
    });
  }
};

// Get all members' progress in a group (for group overview)
const getGroupMembersProgress = async (req, res) => {
  try {
    const groupId = req.params.id;

    const group = await StudyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Study group not found",
        error: { code: "GROUP_NOT_FOUND" },
        data: null,
      });
    }

    // Check if user is a member
    const isMember = group.members.includes(req.user._id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
        error: { code: "ACCESS_DENIED" },
        data: null,
      });
    }

    // Get active goal
    const activeGoal = await GroupGoal.findOne({ groupId, isActive: true });
    if (!activeGoal) {
      return res.status(404).json({
        success: false,
        message: "No active goal found for this group",
        error: { code: "NO_ACTIVE_GOAL" },
        data: null,
      });
    }

    // Get all members' progress using aggregation
    const membersProgress = await GroupMemberActivity.aggregate([
      {
        $match: {
          groupId: group._id,
          goalId: activeGoal._id,
          status: { $in: ['solved', 'correct'] }
        }
      },
      {
        $group: {
          _id: "$userId",
          questionsSolved: { $sum: 1 },
          totalTimeSpent: { $sum: "$timeSpent" },
          lastActivity: { $max: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" },
      {
        $project: {
          userId: "$_id",
          user: {
            _id: "$user._id",
            name: "$user.name",
            email: "$user.email",
            avatar: "$user.avatar"
          },
          questionsSolved: 1,
          totalTimeSpent: 1,
          lastActivity: 1,
          contributionPercentage: {
            $multiply: [
              { $divide: ["$questionsSolved", activeGoal.targetMetric.value] },
              100
            ]
          },
          isCompleted: {
            $gte: ["$questionsSolved", activeGoal.targetMetric.value]
          }
        }
      },
      { $sort: { questionsSolved: -1 } }
    ]);

    // Add members who haven't contributed yet
    const contributingUserIds = membersProgress.map(member => member.userId.toString());
    const nonContributingMembers = group.members.filter(memberId => 
      !contributingUserIds.includes(memberId.toString())
    );

    const nonContributingUsers = await User.find({
      _id: { $in: nonContributingMembers }
    }).select('name email avatar');

    const allMembersProgress = [
      ...membersProgress,
      ...nonContributingUsers.map(user => ({
        userId: user._id,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar
        },
        questionsSolved: 0,
        totalTimeSpent: 0,
        lastActivity: null,
        contributionPercentage: 0,
        isCompleted: false
      }))
    ];

    res.json({
      success: true,
      message: "Group members progress retrieved successfully",
      data: {
        goal: {
          id: activeGoal._id,
          title: activeGoal.title,
          targetValue: activeGoal.targetMetric.value,
          targetType: activeGoal.targetMetric.type
        },
        membersProgress: allMembersProgress,
        summary: {
          totalMembers: allMembersProgress.length,
          completedMembers: allMembersProgress.filter(member => member.isCompleted).length,
          totalQuestionsSolved: allMembersProgress.reduce((sum, member) => sum + member.questionsSolved, 0),
          groupProgressPercentage: activeGoal.targetMetric.value > 0 
            ? Math.min((allMembersProgress.reduce((sum, member) => sum + member.questionsSolved, 0) / activeGoal.targetMetric.value) * 100, 100)
            : 0
        }
      },
    });
  } catch (error) {
    console.error("Get group members progress error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve group members progress",
      error: { code: "GET_GROUP_MEMBERS_PROGRESS_ERROR", details: error.message },
      data: null,
    });
  }
};

// Maintenance function to run periodic tasks
const runMaintenanceTasks = async () => {
  await archiveExpiredGoals();
  await handleRecurringGoalResets();
};

module.exports = {
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
  getGroupMembersProgress,
  runMaintenanceTasks,
  archiveExpiredGoals,
  handleRecurringGoalResets,
};
