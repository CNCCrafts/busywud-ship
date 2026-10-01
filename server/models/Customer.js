const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  google_id:     { type: String, default: null },   // for Google SSO customers
  avatar:        { type: String, default: '' },
}, { timestamps: true });

customerSchema.virtual('id').get(function () { return this._id.toHexString(); });
customerSchema.set('toJSON', { virtuals: true, transform: (doc, ret) => { delete ret.password_hash; return ret; } });

module.exports = mongoose.model('Customer', customerSchema);
