require('dotenv').config();
const express = require('express');
const helmet = require('helmet');

// Import configuration
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Import routes
const routes = require('./routes/routes');

const app = express();

// Connect to databases
const initializeApp = async () => {
  await connectDB();
  await connectRedis();
};

initializeApp().catch(console.error);

// Security middleware
app.use(helmet());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Mount all routes
app.use('/', routes);

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`StudySync API Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API Documentation: http://localhost:${PORT}/api`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
});