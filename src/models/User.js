import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, default: null },
    lastName:  { type: String, trim: true, default: null },
    email:     { type: String, required: true, lowercase: true, trim: true },
  },
  { collection: 'users', timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
