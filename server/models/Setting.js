const mongoose = require('mongoose');

// Key-value store for site-wide settings (banner, etc.)
const settingSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
