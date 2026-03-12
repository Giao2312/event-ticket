import mongoose from 'mongoose';
import Event from './src/models/event.models.js';
import TicketType from './src/models/ticketType.models.js'; // Import Model đúng
import User from './src/models/user.models.js';
import env from './src/config/env.js';



const seed = async () => {
  await mongoose.connect(env.DB_URL);
  console.log("Kết nối DB thành công, đang bắt đầu seed...");

  // Xóa sạch dữ liệu cũ để tránh trùng lặp
  await Event.deleteMany({});
  await TicketType.deleteMany({});

  // 1. Tạo 1 User mẫu làm admin (nếu chưa có)
  const admin = await User.findOne({ role: 'admin' });
  const adminId = admin ? admin._id : new mongoose.Types.ObjectId();

  // 2. Tạo 10 sự kiện
  const events = [];
  for (let i = 1; i <= 10; i++) {
    events.push({
      name: `Sự kiện ${i} - Concert/Workshop`,
      date: new Date(Date.now() + i * 86400000),
      location: `Địa điểm ${i}`,
      organizer: adminId,
      status: 'upcoming'
    });
  }
  const createdEvents = await Event.insertMany(events);

  // 3. Tạo các loại vé (TicketType) gắn với từng sự kiện
  const ticketTypes = [];
  for (const event of createdEvents) {
    ticketTypes.push({
      eventId: event._id, // Key bắt buộc để tìm vé theo sự kiện
      type: 'Standard',   // Trường này dùng để render tên vé
      price: 200000,
      quantity: 100,
      holded: 0,
      sold: 0,
      status: 'active'
    });
    // Thêm loại vé VIP
    ticketTypes.push({
      eventId: event._id,
      type: 'VIP',
      price: 500000,
      quantity: 20,
      holded: 0,
      sold: 0,
      status: 'active'
    });
  }
  
  await TicketType.insertMany(ticketTypes);
  console.log("Seed dữ liệu hoàn tất!");
  process.exit();
};

seed();
