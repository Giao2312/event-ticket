// src/scripts/seed-users.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import User from './src/models/user.models.js'; // Đường dẫn đến model User của bạn
import env from './src/config/env.js';


// Kết nối MongoDB (sử dụng cùng config với dự án)
const connectDB = async () => {
  try {
    await mongoose.connect(env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected for seeding');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

// Danh sách tài khoản mẫu
const seedUsers = [
  {
    name: 'Admin Test',
    email: 'admin@test.com',
    password:'admin123',
    role: 'admin',
    phone: '0987654321',
    address: 'Hà Nội',
  },
  {
    name: 'Organizer Test',
    email: 'organizer@test.com',
    password: 'organizer123',
    role: 'Organizer',
    phone: '0912345678',
    address: 'TP. Hồ Chí Minh',
  },
  {
    name: 'Khách hàng Test',
    email: 'user@test.com',
    password: 'user123',
    role: 'user', // hoặc 'customer' tùy model của bạn
    phone: '0909876543',
    address: 'Đà Nẵng',
  },
];

// Hàm hash mật khẩu và tạo user
const seed = async () => {
  try {
    await connectDB();

    // Xóa user cũ nếu cần (cẩn thận khi dùng trên production!)
    // await User.deleteMany({ email: { $in: seedUsers.map(u => u.email) } });

    for (const userData of seedUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        console.log(`User ${userData.email} đã tồn tại, bỏ qua...`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const password = userData.password;
      const newUser = new User({
        ...userData,
        password: hashedPassword ,
      });

      await newUser.save();
      console.log(`Đã tạo thành công: ${userData.email} (${userData.role})`);
      console.log(`Đã tạo thành công: ${userData.password}`);
    }

    console.log('🌱 Seeding hoàn tất!');
    process.exit(0);
  } catch (err) {
    console.error('Lỗi khi seed users:', err.message);
    process.exit(1);
  }
};

seed();
