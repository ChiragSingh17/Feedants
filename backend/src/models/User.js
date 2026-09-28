const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, sparse: true },
  email: { type: String, sparse: true },
  avatarUrl: String,
  referralCode: { type: String, unique: true, sparse: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
