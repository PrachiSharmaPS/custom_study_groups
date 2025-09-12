const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Use meaningful database name: study_groups_db
    const mongoUri = process.env.MONGODB_URI ;
    const conn = await mongoose.connect(mongoUri);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database Name: ${conn.connection.name}`);
  } catch (error) {
    console.error('Database connection error:', error.message);
    console.log('Running without MongoDB - some features may be limited');
  }
};

module.exports = connectDB;