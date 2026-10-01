const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  id:       { type: mongoose.Schema.Types.Mixed }, // product _id or legacy int
  name:     String,
  price:    Number,
  quantity: Number,
  image:    String,
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customerName:  { type: String, required: true },
  customerEmail: { type: String, required: true, lowercase: true, trim: true },
  customerPhone: { type: String, default: '' },
  address:       { type: String, default: '' },
  items:         { type: [orderItemSchema], required: true },
  total:         { type: Number, required: true },
  status:        { type: String, enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
}, { timestamps: true });

orderSchema.virtual('id').get(function () { return this._id.toHexString(); });
orderSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);
