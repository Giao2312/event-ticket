import mongoose from 'mongoose';
import User from './src/models/user.models.js';
import env from './src/config/env.js';

const connectDB = async () => {
  try {
    await mongoose.connect(env.DB_URL);
    console.log('MongoDB connected for seeding');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

const seedUsers = [
  {
    name: 'Admin Test',
    email: 'admin@demo.com',
    password: 'admin123',
    role: 'admin',
    phone: '0987654321',
    address: 'Ha Noi'
  },
  {
    name: 'Organizer Test',
    email: 'organizer@demo.com',
    password: 'organizer123',
    role: 'Organizer',
    phone: '0912345678',
    address: 'TP. Ho Chi Minh'
  },
  {
    name: 'Khach hang Test',
    email: 'user@demo.com',
    password: 'user123',
    role: 'user',
    phone: '0909876543',
    address: 'Da Nang'
  }
];

const seed = async () => {
  try {
    await connectDB();

    for (const userData of seedUsers) {
      const email = userData.email.toLowerCase();
      const existingUser = await User.findOne({ email });

      if (existingUser) {
        existingUser.name = userData.name;
        existingUser.role = userData.role;
        existingUser.phone = userData.phone;
        existingUser.address = userData.address;
        // Set plain password; model pre-save hook hashes exactly once.
        existingUser.password = userData.password;
        await existingUser.save();
        console.log(`Updated: ${email} (${userData.role})`);
        continue;
      }

      const newUser = new User({
        ...userData,
        email,
        // Set plain password; model pre-save hook hashes exactly once.
        password: userData.password
      });

      await newUser.save();
      console.log(`Created: ${email} (${userData.role})`);
    }

    console.log('Seed users completed');
    process.exit(0);
  } catch (err) {
    console.error('Error while seeding users:', err.message);
    process.exit(1);
  }
};

seed();
