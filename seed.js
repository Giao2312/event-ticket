import mongoose from 'mongoose';
import Event from './src/models/event.models.js';
import TicketType from './src/models/ticketType.models.js';
import User from './src/models/user.models.js';
import env from './src/config/env.js';

const seed = async () => {
  try {
    await mongoose.connect(env.DB_URL);
    console.log("Kết nối DB thành công, đang bắt đầu seed...");

    // Xóa sạch dữ liệu cũ
    await Event.deleteMany({});
    await TicketType.deleteMany({});

    const admin = await User.findOne({ role: 'admin' });
    const adminId = admin ? admin._id : new mongoose.Types.ObjectId();

    // Danh sách tên file ảnh có sẵn trong thư mục public/events/images
    // Bạn hãy thay đổi tên file này cho đúng với các file bạn có trong thư mục
    const images = [
      '24KRight.jpg', 'ANHTRAISAY HI2025CONCERT.jpg', 'BachCongKhanh.jpg', 'HoaNhacXuanCa.jpg', 'HoQuynhHuong.jpg',
      'SUPER JUNIOR 20th Anniversary TOUR in HO CHI MINH CITY.jpg', 'ThuyDung.jpg', '[BẾN THÀNH] Đêm nhạc Bùi Anh Tuấn - Lâm Bảo Ngọc.jpg', 
      '[BẾN THÀNH] Đêm nhạc Thanh Hà - Nguyễn Đình Tuấn Dũng.jpg', 'BINHJAMA PARTY - FAN MUSIC MEETING IN HA NOI.jpg'
    ];

    // 1. Tạo 10 sự kiện với ảnh khác nhau
    const events = [];
    for (let i = 1; i <= 10; i++) {
      // Chọn ảnh theo thứ tự i, nếu i lớn hơn số lượng ảnh thì dùng ảnh mặc định hoặc quay vòng
      const imageName = images[i - 1] || 'placeholder.jpg';
      
      events.push({
        name: `Sự kiện ${i} - Concert/Workshop`,
        description: `Mô tả chi tiết cho sự kiện số ${i}. Khám phá những trải nghiệm tuyệt vời cùng TicketEvent Pro.`,
        date: new Date(Date.now() + i * 86400000),
        location: `Trung tâm sự kiện ${i}, TP. Hồ Chí Minh`,
        organizer: adminId,
        status: 'upcoming',
        // Đường dẫn lưu vào DB: /events/images/tên-file
        image: `/events/images/${imageName}`, 
        category: i % 2 === 0 ? 'Âm nhạc' : 'Hội thảo', // Thêm category cho phong phú
        featured: i <= 4 // Đánh dấu 4 sự kiện đầu là nổi bật (Featured)
      });
    }
    const createdEvents = await Event.insertMany(events);

    // 2. Tạo các loại vé (TicketType)
    const ticketTypes = [];
    for (const event of createdEvents) {
      ticketTypes.push({
        eventId: event._id,
        type: 'Standard',
        price: 200000 + (Math.floor(Math.random() * 5) * 50000), // Giá ngẫu nhiên từ 200k-400k
        quantity: 100,
        holded: 0,
        sold: 0,
        status: 'active'
      });
      
      ticketTypes.push({
        eventId: event._id,
        type: 'VIP',
        price: 500000 + (Math.floor(Math.random() * 5) * 100000), // Giá VIP ngẫu nhiên
        quantity: 20,
        holded: 0,
        sold: 0,
        status: 'active'
      });
    }

    await TicketType.insertMany(ticketTypes);
    console.log("✅ Seed dữ liệu thành công với ảnh và trạng thái nổi bật!");
    process.exit();
  } catch (error) {
    console.error("❌ Lỗi khi seed dữ liệu:", error);
    process.exit(1);
  }
};

seed();