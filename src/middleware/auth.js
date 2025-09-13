const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

// ==================== Google OAuth Configuration ====================
const GOOGLE_OAUTH = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
};

// ==================== Authentication Middleware ====================

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No valid token provided.',
        error: {
          code: 'NO_TOKEN'
        },
        data: null
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.',
        error: {
          code: 'USER_NOT_FOUND'
        },
        data: null
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
        error: {
          code: 'INVALID_TOKEN'
        },
        data: null
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.',
        error: {
          code: 'TOKEN_EXPIRED'
        },
        data: null
      });
    }
    
    next(error);
  }
};

// ==================== Google OAuth Controllers ====================

// Google OAuth Authorization endpoint - redirects to Google
const oauthAuthorize = async (req, res) => {
  try {
    const { redirect_uri, state } = req.query;
    const stateParam = state || crypto.randomBytes(16).toString('hex');

    // Build the Google OAuth URL
    const authUrl = new URL(GOOGLE_OAUTH.authUrl);
    authUrl.searchParams.set('client_id', GOOGLE_OAUTH.clientId);
    
    // Use provided redirect_uri or default to localhost for development
    const defaultRedirectUri = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/callback/google`;
    const finalRedirectUri = redirect_uri || defaultRedirectUri;
    
    authUrl.searchParams.set('redirect_uri', finalRedirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', stateParam);

    // Redirect directly to Google OAuth
    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Google OAuth authorize error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Google OAuth URL',
      error: {
        code: 'GOOGLE_OAUTH_AUTHORIZE_ERROR',
        details: error.message
      },
      data: null
    });
  }
};

// Google OAuth Callback endpoint - handles Google's response
const oauthCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Google OAuth authorization failed',
        error: {
          code: 'GOOGLE_OAUTH_AUTHORIZATION_FAILED',
          details: error
        },
        data: null
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required',
        error: {
          code: 'MISSING_AUTHORIZATION_CODE'
        },
        data: null
      });
    }
    
    // Exchange code for access token with Google
    const tokenResponse = await fetch(GOOGLE_OAUTH.tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_OAUTH.clientId,
        client_secret: GOOGLE_OAUTH.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/callback/google`
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange code for Google access token',
        error: {
          code: 'GOOGLE_TOKEN_EXCHANGE_FAILED',
          details: tokenData
        },
        data: null
      });
    }

    // Get user info from Google
    const userInfoResponse = await fetch(GOOGLE_OAUTH.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json'
      }
    });

    const userInfo = await userInfoResponse.json();

    // Find or create user
    let user = await User.findOne({ 
      $or: [
        { email: userInfo.email },
        { googleId: userInfo.id }
      ]
    });

    if (!user) {
      user = await User.create({
        googleId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        avatar: userInfo.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.name)}&background=random`,
        providers: ['google']
      });
    } else {
      // Update user info
      user.googleId = userInfo.id;
      user.name = userInfo.name;
      user.avatar = userInfo.picture || user.avatar;
      
      // Add provider to providers array if not already present
      if (!user.providers.includes('google')) {
        user.providers.push('google');
      }
      
      await user.save();
    }


    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '5m' }
    );

    res.json({
      success: true,
      message: 'Google OAuth login successful',
      data: {
        token,
        oauth_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar
        }
      }
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Google OAuth callback failed',
      error: {
        code: 'GOOGLE_OAUTH_CALLBACK_ERROR',
        details: error.message
      },
      data: null
    });
  }
};

// OAuth Token Refresh endpoint
const oauthRefresh = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
        error: {
          code: 'MISSING_REFRESH_TOKEN'
        },
        data: null
      });
    }

    // Verify refresh token and generate new access token
    const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        error: {
          code: 'INVALID_REFRESH_TOKEN'
        },
        data: null
      });
    }

    // Generate new access token
    const newToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '5m' }
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar
        }
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Token refresh failed',
      error: {
        code: 'TOKEN_REFRESH_ERROR',
        details: error.message
      },
      data: null
    });
  }
};

// ==================== User management controllers ====================

// Get current user info
const getCurrentUser = (req, res) => {
  try {
    res.json({
      success: true,
      message: 'User information retrieved',
      data: {
        user: {
          id: req.user._id,
          email: req.user.email,
          name: req.user.name,
          avatar: req.user.avatar,
          createdAt: req.user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user information',
      error: {
        code: 'GET_USER_ERROR'
      },
      data: null
    });
  }
};

module.exports = {
  authenticate,
  getCurrentUser,
  oauthAuthorize,
  oauthCallback,
  oauthRefresh
};