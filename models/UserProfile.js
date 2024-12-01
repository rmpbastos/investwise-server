const mongoose = require('mongoose');

const UserProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' }
});

module.exports = mongoose.model('UserProfile', UserProfileSchema);
