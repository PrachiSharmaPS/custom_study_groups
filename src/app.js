require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes/routes');
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');


// Import maintenance functions - I added these to handle recurring goals automatically
const { runMaintenanceTasks } = require('./controllers/groupsController');

const app = express();

const initializeApp = async () => {
  await connectDB();
  await connectRedis();
};

initializeApp().catch(console.error);


app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


app.use('/', routes);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`StudySync API Server is running on port ${PORT}`);
  
  // Run maintenance tasks every 5 minutes - to handle recurring goals automatically
  setInterval(async () => {
    try {
      await runMaintenanceTasks();
      console.log('Maintenance tasks completed successfully');
    } catch (error) {
      console.error('Error running maintenance tasks:', error);
    }
  }, 5 * 60 * 1000); // 5-minutes
  
  // Run initial maintenance task -  to clean up any expired goals
  setTimeout(async () => {
    try {
      await runMaintenanceTasks();
      console.log('Initial maintenance tasks completed');
    } catch (error) {
      console.error('Error running initial maintenance tasks:', error);
    }
  }, 10000); // 10 seconds after startup
});