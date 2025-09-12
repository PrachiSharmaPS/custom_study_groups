# StudySync Backend

StudySync - Custom Study Groups with Live Leaderboards Backend Service

## 🎯 Overview

StudySync enables students to form collaborative learning communities through private study groups with shared learning goals, tracked progress, and gamified leaderboards. This backend system powers a modern education platform that increases student engagement through positive competition and social accountability.

##  Features

- **Authentication & Security**: JWT-based Google OAuth authentication
- **Study Group Management**: Create and manage private study groups (max 50 members)
- **Goal Management**: Set fixed or recurring learning objectives
- **Activity Tracking**: Record and validate user activities on questions
- **Live Leaderboards**: Real-time rankings with filtering options
- **Progress Tracking**: Individual and group performance metrics
- **Performance Optimized**: <500ms API response times with caching

## 🚀 Quick Start

### Prerequisites

- Node.js v16+ 
- MongoDB
- Redis (optional, for caching)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd prachi
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL
```
http://localhost:3000
```

### Authentication
All API endpoints except `/auth/*` and `/health` require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Quick Test Setup

1. **Create a test user** (mock login for development):
```bash
curl -X POST http://localhost:3000/auth/mock-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "googleId": "test123"
  }'
```

2. **Use the returned token** in subsequent requests.

### API Endpoints

#### Authentication

| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/auth/mock-login` | POST | Mock login for testing | `{email, name, googleId}` |
| `/auth/me` | GET | Get current user info | - |

#### Study Groups

| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/api/groups` | GET | List user's groups | - |
| `/api/groups` | POST | Create study group | `{name, description?, members?}` |
| `/api/groups/:id` | GET | Get group details | - |
| `/api/groups/:id/members` | POST | Add member to group | `{email}` |

#### Goals

| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/api/groups/:id/goals` | POST | Create goal for group | `{title, description?, subjects, targetMetric, deadline?, recurringPattern?}` |
| `/api/groups/:id/goals/active` | GET | Get active goal | - |

#### Activities & Progress

| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/api/groups/:id/activities` | POST | Record activity | `{questionId, status, timeSpent}` |
| `/api/groups/:id/leaderboard` | GET | Get leaderboard | Query: `metric, timeWindow, sort, page, limit` |
| `/api/groups/:id/progress` | GET | Get progress | Query: `breakdown` |

### Example Requests

#### 1. Create a Study Group
```bash
curl -X POST http://localhost:3000/api/groups \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Calculus Masters",
    "description": "Advanced calculus study group",
    "members": ["friend@example.com"]
  }'
```

#### 2. Create a Goal
```bash
curl -X POST http://localhost:3000/api/groups/GROUP_ID/goals \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "100 Calculus Problems",
    "description": "Complete 100 calculus problems by end of month",
    "subjects": ["SUBJECT_ID"],
    "targetMetric": {
      "type": "count",
      "value": 100
    },
    "deadline": "2025-10-01T23:59:59.000Z"
  }'
```

#### 3. Record Activity
```bash
curl -X POST http://localhost:3000/api/groups/GROUP_ID/activities \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "questionId": "QUESTION_ID",
    "status": "solved",
    "timeSpent": 300
  }'
```

#### 4. Get Leaderboard
```bash
curl "http://localhost:3000/api/groups/GROUP_ID/leaderboard?metric=count&timeWindow=weekly&sort=desc&limit=10" \
  -H "Authorization: Bearer <token>"
```

## 🗄️ Database Schema

### Key Models

- **User**: User authentication and profile data
- **StudyGroup**: Group information and membership
- **GroupGoal**: Learning objectives for groups
- **GroupMemberActivity**: Individual activity records
- **Subject**: Available study subjects
- **Question**: Practice questions with difficulty levels

See `/src/models/` directory for complete schema definitions.

## 🏗️ Project Structure

```
src/
├── app.js                 # Main application entry point
├── config/               # Database and Redis configuration
├── middleware/           # Authentication, validation, error handling
├── models/               # MongoDB schemas
├── routes/               # API route handlers
├── services/             # Business logic services
└── utils/                # Utility functions and seed data
```

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `MONGODB_URI` | MongoDB connection string | mongodb://localhost:27017/study_groups_db |
| `REDIS_URL` | Redis connection string | redis://localhost:6379 |
| `JWT_SECRET` | JWT signing secret | (required) |
| `JWT_EXPIRE` | JWT expiration time | 5m |
| `RATE_LIMIT_MAX_REQUESTS` | Rate limit per window | 100 |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 60000 |

## 🧪 Testing

The API includes comprehensive validation and error handling. Test the endpoints using:

1. **Health Check**: `GET /health`
2. **API Info**: `GET /api`
3. **Authentication**: Use mock login endpoint for testing
4. **All Endpoints**: Follow the API documentation above

## 🚀 Deployment

### Production Setup

1. Set environment variables in production
2. Use a proper MongoDB instance (MongoDB Atlas recommended)
3. Set up Redis for caching (ElastiCache or Redis Labs)
4. Configure proper Google OAuth credentials
5. Use process managers like PM2 for Node.js

### Performance Notes

- API responses <500ms for 95th percentile
- Supports 1000+ concurrent users
- Handles 100+ activities per second during peak usage
- Includes intelligent caching for leaderboards and progress data

## 🔒 Security Features

- JWT-based authentication
- Input validation and sanitization
- Rate limiting (100 requests/minute per user)
- HTTPS-only in production
- Helmet.js security headers
- MongoDB injection prevention

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

**StudySync Backend v1.0.0** - Empowering collaborative learning through technology
