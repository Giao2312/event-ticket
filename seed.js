import mongoose from 'mongoose';
import slugify from 'slugify';
import env from './src/config/env.js';
import Event from './src/models/event.models.js';
import Order from './src/models/order.models.js';
import Settlement from './src/models/settlement.models.js';
import User from './src/models/user.models.js';
import Withdrawal from './src/models/withdrawal.models.js';

const seedUsers = {
  admin: {
    name: 'Admin Test',
    email: 'admin@demo.com',
    password: 'admin123',
    role: 'admin',
    phone: '0987654321',
    address: 'Ha Noi'
  },
  organizers: [
    {
      name: 'Organizer Test 1',
      email: 'organizer1@demo.com',
      password: 'organizer123',
      role: 'Organizer',
      phone: '0912345678',
      address: 'TP. Ho Chi Minh',
      bankInfo: {
        bankName: 'Vietcombank',
        accountNumber: '001100000001',
        accountName: 'ORGANIZER TEST 1'
      }
    },
    {
      name: 'Organizer Test 2',
      email: 'organizer2@demo.com',
      password: 'organizer123',
      role: 'Organizer',
      phone: '0912345679',
      address: 'Ha Noi',
      bankInfo: {
        bankName: 'Techcombank',
        accountNumber: '001100000002',
        accountName: 'ORGANIZER TEST 2'
      }
    },
    {
      name: 'Organizer Test 3',
      email: 'organizer3@demo.com',
      password: 'organizer123',
      role: 'Organizer',
      phone: '0912345680',
      address: 'Da Nang',
      bankInfo: {
        bankName: 'BIDV',
        accountNumber: '001100000003',
        accountName: 'ORGANIZER TEST 3'
      }
    }
  ],
  customers: [
    {
      name: 'Customer Test 1',
      email: 'customer1@demo.com',
      password: 'user123',
      role: 'user',
      phone: '0901111111',
      address: 'Can Tho'
    },
    {
      name: 'Customer Test 2',
      email: 'customer2@demo.com',
      password: 'user123',
      role: 'user',
      phone: '0902222222',
      address: 'Hai Phong'
    },
    {
      name: 'Customer Test 3',
      email: 'customer3@demo.com',
      password: 'user123',
      role: 'user',
      phone: '0903333333',
      address: 'Hue'
    },
    {
      name: 'Customer Test 4',
      email: 'customer4@demo.com',
      password: 'user123',
      role: 'user',
      phone: '0904444444',
      address: 'Nha Trang'
    },
    {
      name: 'Customer Test 5',
      email: 'customer5@demo.com',
      password: 'user123',
      role: 'user',
      phone: '0905555555',
      address: 'Vung Tau'
    }
  ]
};

const images = [
  '24kRight.jpg',
  'ANHTRAISAY HI2025CONCERT.jpg',
  'BachCongKhanh.jpg',
  'HoaNhacXuanCa.jpg',
  'HoQuynhHuong.jpg',
  'SUPER JUNIOR 20th Anniversary TOUR in HO CHI MINH CITY.jpg',
  'ThuyDung.jpg',
  '[BẾN THÀNH] Đêm nhạc Bùi Anh Tuấn - Lâm Bảo Ngọc.jpg',
  '[BẾN THÀNH] Đêm nhạc Thanh Hà - Nguyễn Đình Tuấn Dũng.jpg',
  'BINHJAMA PARTY - FAN MUSIC MEETING IN HA NOI.jpg'
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

const paymentMethods = ['momo', 'vnpay', 'paypal'];
const basicStatuses = ['upcoming', 'ongoing', 'ended'];

const roundToThousand = (value) => Math.round(value / 1000) * 1000;
const randomPrice = (min, max) => {
  const value = min + Math.floor(Math.random() * (max - min + 1));
  return roundToThousand(value);
};

const buildEventDateByStatus = (status, offsetDays) => {
  const now = new Date();

  if (status === 'ended') {
    return new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
  }

  if (status === 'ongoing') {
    return new Date(now.getTime() + 6 * 60 * 60 * 1000 + offsetDays * 60 * 60 * 1000);
  }

  return new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
};

const upsertUser = async (userData) => {
  const email = userData.email.toLowerCase();
  let user = await User.findOne({ email });

  if (!user) {
    user = new User({
      ...userData,
      email,
      password: userData.password
    });
  } else {
    user.name = userData.name;
    user.role = userData.role;
    user.phone = userData.phone || '';
    user.address = userData.address || '';
    user.avatar = userData.avatar || '';
    user.bankInfo = userData.bankInfo || user.bankInfo || {};
    user.balance = 0;
    user.pendingBalance = 0;
    user.password = userData.password;
  }

  if (!user.bankInfo && userData.bankInfo) {
    user.bankInfo = userData.bankInfo;
  }

  user.isActive = true;
  await user.save();
  return user;
};

const createOrderDoc = ({ customerId, eventId, ticketTypes, itemSpecs, paymentMethod, createdAt, status }) => {
  const items = itemSpecs
    .map(({ ticketType, quantity }) => {
      if (!ticketType || quantity <= 0) return null;

      return {
        ticketTypeId: ticketType._id,
        quantity,
        price: ticketType.price
      };
    })
    .filter(Boolean);

  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    _id: new mongoose.Types.ObjectId(),
    userId: customerId,
    eventId,
    items,
    totalAmount,
    status,
    paymentMethod,
    holdUntil: status === 'PAID' ? null : new Date(Date.now() + 15 * 60 * 1000),
    profileVerifiedAt: new Date(createdAt),
    createdAt,
    paidAt: status === 'PAID' ? new Date(createdAt.getTime() + 5 * 60 * 1000) : null
  };
};

const buildOrdersForEvent = ({ event, eventOrder, customers }) => {
  const standard = event.ticketTypes.find((ticketType) => ticketType.type === 'Standard');
  const vip = event.ticketTypes.find((ticketType) => ticketType.type === 'VIP');
  const vvip = event.ticketTypes.find((ticketType) => ticketType.type === 'VVIP');

  const paidPatterns = [
    [{ ticketType: standard, quantity: 2 }],
    [
      { ticketType: standard, quantity: 1 },
      { ticketType: vip, quantity: 1 + (eventOrder % 2) }
    ]
  ];

  if (eventOrder % 4 === 0) {
    paidPatterns.push([{ ticketType: vvip, quantity: 1 }]);
  }

  const orders = [];
  const soldMap = new Map(event.ticketTypes.map((ticketType) => [String(ticketType._id), 0]));

  paidPatterns.forEach((pattern, index) => {
    const createdAt = new Date(event.date.getTime() - (index + 3) * 24 * 60 * 60 * 1000);
    const customer = customers[(eventOrder + index) % customers.length];
    const paymentMethod = paymentMethods[(eventOrder + index) % paymentMethods.length];
    const orderDoc = createOrderDoc({
      customerId: customer._id,
      eventId: event._id,
      ticketTypes: event.ticketTypes,
      itemSpecs: pattern,
      paymentMethod,
      createdAt,
      status: 'PAID'
    });

    orderDoc.items.forEach((item) => {
      const key = String(item.ticketTypeId);
      soldMap.set(key, (soldMap.get(key) || 0) + item.quantity);
    });

    orders.push(orderDoc);
  });

  if (eventOrder % 3 === 0) {
    const pendingCustomer = customers[(eventOrder + paidPatterns.length) % customers.length];
    orders.push(
      createOrderDoc({
        customerId: pendingCustomer._id,
        eventId: event._id,
        ticketTypes: event.ticketTypes,
        itemSpecs: [{ ticketType: standard, quantity: 1 }],
        paymentMethod: paymentMethods[eventOrder % paymentMethods.length],
        createdAt: new Date(),
        status: 'PENDING'
      })
    );
  }

  return { orders, soldMap };
};

const seed = async () => {
  try {
    await mongoose.connect(env.DB_URL);
    console.log('Ket noi DB thanh cong, dang bat dau seed...');

    const admin = await upsertUser(seedUsers.admin);
    const organizers = [];
    const customers = [];

    for (const organizerData of seedUsers.organizers) {
      organizers.push(await upsertUser(organizerData));
    }

    for (const customerData of seedUsers.customers) {
      customers.push(await upsertUser(customerData));
    }

    if (organizers.length === 0) {
      throw new Error('Khong tao duoc organizer that de dung ten cho su kien');
    }

    await Promise.all([
      Event.deleteMany({}),
      Order.deleteMany({}),
      Withdrawal.deleteMany({}),
      Settlement.deleteMany({})
    ]);

    await User.updateMany(
      { role: 'Organizer' },
      {
        $set: {
          balance: 0,
          pendingBalance: 0
        }
      }
    );

    const eventsData = [];
    const ordersData = [];

    categories.forEach((category, categoryIndex) => {
      cityVenues.forEach((cityVenue, eventIndex) => {
        const order = categoryIndex * cityVenues.length + eventIndex + 1;
        const eventStatus = basicStatuses[eventIndex % basicStatuses.length];
        const eventId = new mongoose.Types.ObjectId();
        const organizer = organizers[(categoryIndex + eventIndex) % organizers.length];
        const imageName = images[Math.floor(Math.random() * images.length)];
        const standardPrice = randomPrice(18000, 42000);
        const vipPrice = randomPrice(45000, 90000);
        const vvipPrice = randomPrice(95000, 180000);
        const eventDate = buildEventDateByStatus(eventStatus, order);

        const eventDoc = {
          _id: eventId,
          name: `${category.toUpperCase()} TEST ${eventIndex + 1} - ${cityVenue.city}`,
          slug: `${slugify(category, { lower: true, strict: true })}-${eventIndex + 1}-${slugify(cityVenue.city, { lower: true, strict: true })}`,
          description: `Du lieu test cho category ${category}, su kien thu ${eventIndex + 1} tai ${cityVenue.city}. Su kien nay duoc gan truc tiep cho organizer ${organizer.name} de test doanh thu va rut tien.`,
          date: eventDate,
          endDate: new Date(eventDate.getTime() + 3 * 60 * 60 * 1000),
          location: `${cityVenue.venue}, ${cityVenue.city}, Viet Nam`,
          venueName: cityVenue.venue,
          organizer: organizer._id,
          approvedBy: admin._id,
          approvedAt: new Date(),
          status: eventStatus,
          image: `/events/images/${imageName}`,
          category,
          isFeatured: eventIndex < 2,
          ticketTypes: [
            {
              _id: new mongoose.Types.ObjectId(),
              type: 'Standard',
              price: standardPrice,
              quantity: 150,
              sold: 0,
              holded: 0,
              status: 'active'
            },
            {
              _id: new mongoose.Types.ObjectId(),
              type: 'VIP',
              price: vipPrice,
              quantity: 40,
              sold: 0,
              holded: 0,
              status: 'active'
            },
            {
              _id: new mongoose.Types.ObjectId(),
              type: 'VVIP',
              price: vvipPrice,
              quantity: 15,
              sold: 0,
              holded: 0,
              status: 'active'
            }
          ]
        };

        const { orders, soldMap } = buildOrdersForEvent({
          event: eventDoc,
          eventOrder: order,
          customers
        });

        eventDoc.ticketTypes = eventDoc.ticketTypes.map((ticketType) => ({
          ...ticketType,
          sold: soldMap.get(String(ticketType._id)) || 0
        }));

        eventsData.push(eventDoc);
        ordersData.push(...orders);
      });
    });

    if (eventsData.length !== categories.length * cityVenues.length) {
      throw new Error('So luong su kien tao ra khong khop yeu cau');
    }

    await Event.insertMany(eventsData);
    await Order.insertMany(ordersData);

    const organizerStats = await Promise.all(
      organizers.map(async (organizer) => {
        const organizerEvents = eventsData.filter(
          (event) => String(event.organizer) === String(organizer._id)
        );
        const organizerEventIds = organizerEvents.map((event) => event._id);
        const paidOrders = ordersData.filter(
          (order) =>
            order.status === 'PAID' &&
            organizerEventIds.some((eventId) => String(eventId) === String(order.eventId))
        );
        const totalRevenue = paidOrders.reduce((sum, order) => sum + order.totalAmount, 0);

        return {
          name: organizer.name,
          eventCount: organizerEvents.length,
          paidOrderCount: paidOrders.length,
          totalRevenue
        };
      })
    );

    console.log(`Da tao ${eventsData.length} su kien`);
    console.log(`Da tao ${ordersData.length} don hang seed de test doanh thu organizer`);
    organizerStats.forEach((stat) => {
      console.log(
        `Organizer ${stat.name}: ${stat.eventCount} su kien, ${stat.paidOrderCount} don PAID, doanh thu ${stat.totalRevenue.toLocaleString('vi-VN')} VND`
      );
    });
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
