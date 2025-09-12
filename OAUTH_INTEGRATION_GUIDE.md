# OAuth Integration Guide for StudySync API

## 🚀 Complete OAuth Login Flow

Your StudySync API now supports OAuth authentication with Google and GitHub. After successful OAuth login, users can access all protected endpoints.

## 📋 Setup Requirements

### 1. Environment Variables
Add these to your `.env` file:

```env
# Google OAuth (Get from Google Cloud Console)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# GitHub OAuth (Get from GitHub Developer Settings)
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# Base URL for OAuth callbacks
BASE_URL=http://localhost:3000

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRE=7d
```

### 2. OAuth Provider Setup

#### Google OAuth Setup:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID and Client Secret to your `.env` file

#### GitHub OAuth Setup:
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Set Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
4. Copy Client ID and Client Secret to your `.env` file

## 🔄 OAuth Flow Implementation

### Step 1: Get OAuth Authorization URL

**Endpoint:** `GET /api/auth/oauth/:provider`

**Example Request:**
```javascript
// Frontend JavaScript
const getOAuthUrl = async (provider) => {
  const response = await fetch(`/api/auth/oauth/${provider}`);
  const data = await response.json();
  return data.data.auth_url;
};

// Usage
const googleUrl = await getOAuthUrl('google');
window.location.href = googleUrl;
```

**Example Response:**
```json
{
  "success": true,
  "message": "OAuth authorization URL generated",
  "data": {
    "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...",
    "state": "random_state_string"
  }
}
```

### Step 2: Handle OAuth Callback

The OAuth provider will redirect to: `/api/auth/callback/:provider`

**Example Callback URL:**
```
http://localhost:3000/api/auth/callback/google?code=4/0AX4XfWh...&state=xyz123
```

**Response:**
```json
{
  "success": true,
  "message": "OAuth login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "64f8a1b2c3d4e5f6a7b8c9d0",
      "email": "user@example.com",
      "name": "John Doe",
      "avatar": "https://lh3.googleusercontent.com/..."
    }
  }
}
```

### Step 3: Use JWT Token for API Calls

Store the token and use it in subsequent API calls:

```javascript
// Store token after OAuth success
localStorage.setItem('authToken', response.data.token);

// Use token in API calls
const makeAuthenticatedRequest = async (url, options = {}) => {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  return response.json();
};

// Example: Get user's study groups
const groups = await makeAuthenticatedRequest('/api/groups');
```

## 🧪 Testing OAuth Flow

### 1. Test OAuth URL Generation
```bash
# Get Google OAuth URL
curl "http://localhost:3000/api/auth/oauth/google"

# Get GitHub OAuth URL  
curl "http://localhost:3000/api/auth/oauth/github"
```

### 2. Test Authentication
```bash
# Test with JWT token (replace YOUR_JWT_TOKEN)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     "http://localhost:3000/api/test-auth"
```

### 3. Test Protected Endpoints
```bash
# Get user info
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     "http://localhost:3000/api/auth/me"

# Get user's groups
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     "http://localhost:3000/api/groups"
```

## 🔐 Available Protected Endpoints

After successful OAuth login, users can access:

- `GET /api/auth/me` - Get current user info
- `GET /api/test-auth` - Test authentication
- `GET /api/groups` - List user's study groups
- `POST /api/groups` - Create new study group
- `GET /api/groups/:id` - Get group details
- `POST /api/groups/:id/members` - Add member to group
- `POST /api/groups/:id/goals` - Create group goal
- `GET /api/groups/:id/goals/active` - Get active goal
- `POST /api/groups/:id/activities` - Record activity
- `GET /api/groups/:id/leaderboard` - Get leaderboard
- `GET /api/groups/:id/progress` - Get group progress

## 🎯 Frontend Integration Examples

### React Example:
```jsx
import React, { useState, useEffect } from 'react';

const OAuthLogin = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleOAuthLogin = async (provider) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/oauth/${provider}`);
      const data = await response.json();
      
      if (data.success) {
        // Redirect to OAuth provider
        window.location.href = data.data.auth_url;
      }
    } catch (error) {
      console.error('OAuth login failed:', error);
    }
  };

  const checkAuth = async () => {
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        const response = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
          setUser(data.data.user);
        }
      } catch (error) {
        localStorage.removeItem('authToken');
      }
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (user) {
    return (
      <div>
        <h2>Welcome, {user.name}!</h2>
        <p>Email: {user.email}</p>
        <button onClick={() => {
          localStorage.removeItem('authToken');
          setUser(null);
        }}>Logout</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Login with OAuth</h2>
      <button 
        onClick={() => handleOAuthLogin('google')}
        disabled={loading}
      >
        Login with Google
      </button>
      <button 
        onClick={() => handleOAuthLogin('github')}
        disabled={loading}
      >
        Login with GitHub
      </button>
    </div>
  );
};

export default OAuthLogin;
```

### HTML/JavaScript Example:
```html
<!DOCTYPE html>
<html>
<head>
    <title>StudySync OAuth Login</title>
</head>
<body>
    <div id="app">
        <div id="login-section">
            <h2>Login to StudySync</h2>
            <button onclick="loginWithGoogle()">Login with Google</button>
            <button onclick="loginWithGitHub()">Login with GitHub</button>
        </div>
        
        <div id="user-section" style="display: none;">
            <h2>Welcome, <span id="user-name"></span>!</h2>
            <p>Email: <span id="user-email"></span></p>
            <button onclick="logout()">Logout</button>
            <button onclick="testAuth()">Test Authentication</button>
        </div>
    </div>

    <script>
        // Check if user is already logged in
        window.onload = function() {
            checkAuth();
        };

        async function loginWithGoogle() {
            try {
                const response = await fetch('/api/auth/oauth/google');
                const data = await response.json();
                if (data.success) {
                    window.location.href = data.data.auth_url;
                }
            } catch (error) {
                console.error('Login failed:', error);
            }
        }

        async function loginWithGitHub() {
            try {
                const response = await fetch('/api/auth/oauth/github');
                const data = await response.json();
                if (data.success) {
                    window.location.href = data.data.auth_url;
                }
            } catch (error) {
                console.error('Login failed:', error);
            }
        }

        async function checkAuth() {
            const token = localStorage.getItem('authToken');
            if (token) {
                try {
                    const response = await fetch('/api/auth/me', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await response.json();
                    if (data.success) {
                        showUser(data.data.user);
                    }
                } catch (error) {
                    localStorage.removeItem('authToken');
                }
            }
        }

        function showUser(user) {
            document.getElementById('user-name').textContent = user.name;
            document.getElementById('user-email').textContent = user.email;
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('user-section').style.display = 'block';
        }

        function logout() {
            localStorage.removeItem('authToken');
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('user-section').style.display = 'none';
        }

        async function testAuth() {
            const token = localStorage.getItem('authToken');
            try {
                const response = await fetch('/api/test-auth', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                alert('Auth test: ' + data.message);
            } catch (error) {
                alert('Auth test failed: ' + error.message);
            }
        }
    </script>
</body>
</html>
```

## 🔄 Token Refresh

If your JWT token expires, use the refresh endpoint:

```javascript
const refreshToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  
  const data = await response.json();
  if (data.success) {
    localStorage.setItem('authToken', data.data.token);
    return data.data.token;
  }
  throw new Error('Token refresh failed');
};
```

## ✅ Your OAuth System is Ready!

Your StudySync API now has complete OAuth authentication. Users can:

1. **Login with Google or GitHub** using OAuth flow
2. **Get JWT tokens** for API authentication  
3. **Access all protected endpoints** with the token
4. **Refresh tokens** when they expire
5. **Link multiple OAuth providers** to the same account

The authentication middleware automatically protects all `/api/groups/*` endpoints, so users must be logged in via OAuth to access them.
