const {StudyGroup,GroupGoal,GroupMemberActivity,User} = require("../models");

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
// Create a new study group
const createGroup = async (req, res) => {
  try {
    const { name, description, maxMembers, subject } = req.body;

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

// Add member to group
const addMemberToGroup = async (req, res) => {
  try {
    const { email } = req.body;
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
    const { title, description, targetDate, targetValue, unit } = req.body;
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
      targetDate: new Date(targetDate),
      targetValue,
      unit,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: "Goal created successfully",
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
    const { activityType, description, value, duration } = req.body;
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

    const activity = await GroupMemberActivity.create({
      groupId,
      userId: req.user._id,
      activityType,
      description,
      value: value || 0,
      duration: duration || 0,
    });

    res.status(201).json({
      success: true,
      message: "Activity recorded successfully",
      data: {
        activity: {
          id: activity._id,
          activityType: activity.activityType,
          description: activity.description,
          value: activity.value,
          duration: activity.duration,
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
    const { period = "week" } = req.query;

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
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get activities for the period
    const activities = await GroupMemberActivity.find({
      groupId,
      createdAt: { $gte: startDate },
    }).populate("userId", "name email avatar");

    // Calculate scores for each user
    const userScores = {};
    activities.forEach((activity) => {
      const userId = activity.userId._id.toString();
      if (!userScores[userId]) {
        userScores[userId] = {
          user: activity.userId,
          totalValue: 0,
          totalDuration: 0,
          activityCount: 0,
        };
      }
      userScores[userId].totalValue += activity.value;
      userScores[userId].totalDuration += activity.duration;
      userScores[userId].activityCount += 1;
    });

    // Convert to array and sort by total value
    const leaderboard = Object.values(userScores)
      .sort((a, b) => b.totalValue - a.totalValue)
      .map((entry, index) => ({
        rank: index + 1,
        user: entry.user,
        totalValue: entry.totalValue,
        totalDuration: entry.totalDuration,
        activityCount: entry.activityCount,
      }));

    res.json({
      success: true,
      message: "Leaderboard retrieved successfully",
      data: {
        leaderboard,
        period,
        startDate,
        endDate: now,
      },
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

    // Get total progress towards goal
    const totalProgress = await GroupMemberActivity.aggregate([
      { $match: { groupId: group._id } },
      { $group: { _id: null, totalValue: { $sum: "$value" } } },
    ]);

    const currentProgress =
      totalProgress.length > 0 ? totalProgress[0].totalValue : 0;
    const progressPercentage = Math.min(
      (currentProgress / activeGoal.targetValue) * 100,
      100
    );

    res.json({
      success: true,
      message: "Group progress retrieved successfully",
      data: {
        goal: {
          id: activeGoal._id,
          title: activeGoal.title,
          targetValue: activeGoal.targetValue,
          targetDate: activeGoal.targetDate,
          unit: activeGoal.unit,
        },
        progress: {
          currentValue: currentProgress,
          targetValue: activeGoal.targetValue,
          percentage: Math.round(progressPercentage * 100) / 100,
          remaining: Math.max(activeGoal.targetValue - currentProgress, 0),
        },
      },
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

module.exports = {
  getUserGroups,
  createGroup,
  getGroupDetails,
  addMemberToGroup,
  createGroupGoal,
  getActiveGoal,
  recordActivity,
  getLeaderboard,
  getGroupProgress,
};
