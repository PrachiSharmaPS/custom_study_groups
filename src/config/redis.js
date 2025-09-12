const redis = require('redis');

let client;

const connectRedis = async () => {
  try {
    client = redis.createClient({
      url: process.env.REDIS_URL
    });

    client.on('error', (err) => {
      console.error('Redis Client Error:', err.message);
    });

    client.on('connect', () => {
      console.log('Redis Connected');
    });

    await client.connect();
    return client;
  } catch (error) {
    console.error('Redis connection error:', error.message);
    console.log('Running without Redis - caching will be disabled');
    // Don't exit process, app can work without Redis (degraded performance)
  }
};

const getRedisClient = () => client;

module.exports = {
  connectRedis,
  getRedisClient
};