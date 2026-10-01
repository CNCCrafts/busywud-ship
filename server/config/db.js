const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || '';

async function connectDB() {
  if (!MONGO_URI) {
    console.warn('⚠️  MONGODB_URI not set — database not connected. Set it in your .env or Replit Secrets.');
    return;
  }
  try {
    await mongoose.connect(MONGO_URI, { dbName: process.env.MONGODB_DB_NAME || 'cnc_ecom' });
    console.log('✅ MongoDB connected:', mongoose.connection.host);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.warn('⚠️  Server will continue without database. Fix MONGODB_URI and restart.');
  }
}

module.exports = connectDB;
