import mongoose from 'mongoose';
import Event from './src/models/event.models.js';
import User from './src/models/user.models.js';
import env from './src/config/env.js';
import slugify from 'slugify'; // npm install slugify nếu chưa có

const seed = async () => {
  try {
    await mongoose.connect(env.DB_URL);
    console.log("Kết nối DB thành công, đang bắt đầu seed...");

    // Xóa dữ liệu cũ
    await Event.deleteMany({});

    // Tìm admin
    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.warn("Không tìm thấy admin, dùng ID giả");
      admin = { _id: new mongoose.Types.ObjectId() };
    }
    const adminId = admin._id;

    // Danh sách ảnh
    const images = [
      '24KRight.jpg', 'ANHTRAISAY HI2025CONCERT.jpg', 'BachCongKhanh.jpg',
      'HoaNhacXuanCa.jpg', 'HoQuynhHuong.jpg', 'SUPER JUNIOR 20th Anniversary TOUR in HO CHI MINH CITY.jpg',
      'ThuyDung.jpg', '[BẾN THÀNH] Đêm nhạc Bùi Anh Tuấn - Lâm Bảo Ngọc.jpg',
      '[BẾN THÀNH] Đêm nhạc Thanh Hà - Nguyễn Đình Tuấn Dũng.jpg', 'BINHJAMA PARTY - FAN MUSIC MEETING IN HA NOI.jpg'
    ];

    // 1. Chuẩn bị dữ liệu sự kiện (ticketTypes đã gộp vào Event)
    const eventsData = [];
    for (let i = 1; i <= 10; i++) {
      const imageName = images[i - 1] || 'placeholder.jpg';
      const eventName = `Sự kiện Test ${i} - ${i % 2 === 0 ? 'Concert' : 'Workshop'}`;
      const standardPrice = 2500 + Math.floor(Math.random() * 1500);
      const vipPrice = 6500 + Math.floor(Math.random() * 3500);

      eventsData.push({
        name: eventName,
        slug: slugify(eventName, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-6),
        description: `Mô tả chi tiết cho sự kiện test số ${i}. Dữ liệu seed để kiểm tra hệ thống.`,
        date: new Date(Date.now() + i * 3 * 86400000), // cách nhau 3 ngày
        location: `Trung tâm Hội nghị ${i}, Quận ${i}, TP. Hồ Chí Minh`,
        organizer: adminId,
        status: 'published', // để hook tự cập nhật upcoming/ongoing/ended
        image: `/events/images/${imageName}`,
        category: i % 3 === 0 ? 'âm nhạc' : i % 3 === 1 ? 'workshop' : 'thể thao',
        isFeatured: i <= 3,
        ticketTypes: [
          {
            type: 'Standard',
            price: standardPrice,
            quantity: 150,
            sold: 0,
            holded: 0,
            status: 'active'
          },
          {
            type: 'VIP',
            price: vipPrice,
            quantity: 30,
            sold: 0,
            holded: 0,
            status: 'active'
          },
          {
            type: 'VVIP',
            price: 12000,
            quantity: 10,
            sold: 0,
            holded: 0,
            status: 'active'
          }
        ]
      });
    }

    // 2. Tạo sự kiện
    const createdEvents = await Event.insertMany(eventsData);
    console.log(`Đã tạo ${createdEvents.length} sự kiện`);

    console.log("✅ Seed dữ liệu thành công!");
  } catch (error) {
    console.error("❌ Lỗi khi seed dữ liệu:", error);
    if (error.errors) {
      console.error("Chi tiết validation errors:", error.errors);
    }
  } finally {
    await mongoose.disconnect();
    console.log("Đã ngắt kết nối DB");
    process.exit(0);
  }
};

seed();
