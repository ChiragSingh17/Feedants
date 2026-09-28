const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/feedants';
  if (isConnected) return mongoose.connection;
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
      autoIndex: true,
      maxPoolSize: 20,
    });
    isConnected = true;
    console.log(`[DB] Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    console.warn('[DB] Running WITHOUT DB — using in-memory fallback for demo. Set MONGO_URI to persist.');
    throw err;
  }
}

module.exports = connectDB;
