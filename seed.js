import mongoose from 'mongoose';
import Event from './src/models/event.models.js';
import User from './src/models/user.models.js';
import env from './src/config/env.js';
import slugify from 'slugify';

const seed = async () => {
  try {
    await mongoose.connect(env.DB_URL);
    console.log('Ket noi DB thanh cong, dang bat dau seed...');

    await Event.deleteMany({});

    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.warn('Khong tim thay admin, dung ID gia');
      admin = { _id: new mongoose.Types.ObjectId() };
    }
    const adminId = admin._id;

    const images = [
      '24KRight.jpg', 'ANHTRAISAY HI2025CONCERT.jpg', 'BachCongKhanh.jpg',
      'HoaNhacXuanCa.jpg', 'HoQuynhHuong.jpg', 'SUPER JUNIOR 20th Anniversary TOUR in HO CHI MINH CITY.jpg',
      'ThuyDung.jpg', '[BẾN THÀNH] Đêm nhạc Bùi Anh Tuấn - Lâm Bảo Ngọc.jpg',
      '[BẾN THÀNH] Đêm nhạc Thanh Hà - Nguyễn Đình Tuấn Dũng.jpg', 'BINHJAMA PARTY - FAN MUSIC MEETING IN HA NOI.jpg'
    ];

    const categories = ['âm nhạc', 'ẩm thực', 'công nghệ', 'giải trí', 'kinh doanh', 'nghệ thuật', 'thể thao', 'workshop', 'khác'];
    const cityVenues = [
      { city: 'Hà Nội', venue: 'Trung tâm Hội nghị Quốc Gia' },
      { city: 'TP. Hồ Chí Minh', venue: 'Nhà Văn hóa Thanh Niên' },
      { city: 'Đà Nẵng', venue: 'Cung Thể thao Tiên Sơn' },
      { city: 'Hải Phòng', venue: 'Nhà hát Lớn Hải Phòng' },
      { city: 'Cần Thơ', venue: 'Trung tâm Hội chợ Cần Thơ' },
      { city: 'Huế', venue: 'Trung tâm Văn hóa Huế' },
      { city: 'Nha Trang', venue: 'Quảng trường 2/4' },
      { city: 'Đà Lạt', venue: 'Quảng trường Lâm Viên' },
      { city: 'Vũng Tàu', venue: 'Nhà Văn hóa Thanh niên Vũng Tàu' },
      { city: 'Quy Nhơn', venue: 'Trung tâm Hội nghị Quy Nhơn' }
    ];

    const roundToThousand = (value) => Math.round(value / 1000) * 1000;
    const randomPrice = (min, max) => {
      const value = min + Math.floor(Math.random() * (max - min + 1));
      return roundToThousand(value);
    };
    const basicStatuses = ['upcoming', 'ongoing', 'ended'];

    const eventsData = [];
    categories.forEach((category, categoryIndex) => {
      cityVenues.forEach((cityVenue, eventIndex) => {
        const order = categoryIndex * cityVenues.length + eventIndex + 1;
        const eventName = `${category.toUpperCase()} TEST ${eventIndex + 1} - ${cityVenue.city}`;
        const imageName = images[Math.floor(Math.random() * images.length)];
        const standardPrice = randomPrice(180000, 420000);
        const vipPrice = randomPrice(450000, 900000);
        const vvipPrice = randomPrice(950000, 1800000);
        const eventStatus = basicStatuses[eventIndex % basicStatuses.length];

        eventsData.push({
          name: eventName,
          slug: `${slugify(category, { lower: true, strict: true })}-${eventIndex + 1}-${slugify(cityVenue.city, { lower: true, strict: true })}`,
          description: `Du lieu test cho category ${category}, su kien thu ${eventIndex + 1} tai ${cityVenue.city}.`,
          date: new Date(Date.now() + order * 86400000),
          location: `${cityVenue.venue}, ${cityVenue.city}, Việt Nam`,
          organizer: adminId,
          status: eventStatus,
          image: `/events/images/${imageName}`,
          category,
          isFeatured: eventIndex < 2,
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
              quantity: 40,
              sold: 0,
              holded: 0,
              status: 'active'
            },
            {
              type: 'VVIP',
              price: vvipPrice,
              quantity: 15,
              sold: 0,
              holded: 0,
              status: 'active'
            }
          ]
        });
      });
    });

    if (eventsData.length !== categories.length * cityVenues.length) {
      throw new Error('So luong su kien tao ra khong khop yeu cau');
    }

    const createdEvents = await Event.insertMany(eventsData);
    console.log(`Da tao ${createdEvents.length} su kien`);

    console.log('Seed du lieu thanh cong!');
  } catch (error) {
    console.error('Loi khi seed du lieu:', error);
    if (error.errors) {
      console.error('Chi tiet validation errors:', error.errors);
    }
  } finally {
    await mongoose.disconnect();
    console.log('Da ngat ket noi DB');
    process.exit(0);
  }
};

seed();
