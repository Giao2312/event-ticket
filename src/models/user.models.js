import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto'; 

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: {
    type: String,
    required: [true, 'Email là bắt buộc'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ']
  },
  password: {
    type: String,
    required: [true, 'Mật khẩu là bắt buộc'],
    minlength: [6, 'Mật khẩu phải ít nhất 6 ký tự']
  },
  role: {
    type: String,
    enum: ['user','Organizer' ,'admin'],
    default: 'user'
  },
  phone: { type: String, default: '' }, 
  dob: { type: Date, default: null },
  address: { type: String, default: '' },
  avatar: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});


userSchema.index({ role: 1 }); 


userSchema.pre('save', async function (next) {
  console.log('Pre-save hook triggered for user:', this.email);
  if (!this.isModified('password')) return next();
  console.log('Hashing password for:', this.email);
  this.password = await bcrypt.hash(this.password, 10);
  console.log('Hashed password:', this.password);
  next();
});

userSchema.methods.generateResetToken = function () {
  const resetToken = crypto.randomBytes(20).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 min
  return resetToken;
};
userSchema.methods.comparePassword = async function (candidatePassword) {
  console.log('[COMPARE] Candidate password (nhập vào):', candidatePassword);
  console.log('[COMPARE] Stored hash (trong DB):', this.password);
  const match = await bcrypt.compare(candidatePassword, this.password);
  console.log('[COMPARE] Kết quả so sánh:', match);
  if (!match) {
    console.log('[COMPARE] Lý do có thể: mật khẩu nhập không khớp với lúc đăng ký');
  }
  return match;
};
const User = mongoose.model('User', userSchema);

export default User;
