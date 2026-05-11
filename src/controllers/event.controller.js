import { param, query, validationResult } from 'express-validator';
import Event from '../models/event.models.js';
import Order from '../models/order.models.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import logger from '../utils/logger.js';
import {
  CATEGORY_MAP,
  CATEGORY_OPTIONS,
  createUnifiedEvent,
  toSlugLike
} from '../services/event.service.js';


// Trich xuat tinh/thanh tu dia chi (lay phan cuoi truoc)
const extractProvince = (location = '') => {
  if (!location || typeof location !== 'string') return '';
  // Tach dia chi theo dau phay
  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  // Lay phan cuoi lam tinh/thanh
  const raw = parts.length ? parts.at(-1) : location.trim();
  // Neu phan cuoi la "Viet Nam" thi lay phan truoc do
  const candidate =
    /^(viet nam|vietnam)$/i.test(raw) && parts.length >= 2 ? parts.at(-2) : raw;

  // Loai bo tieu de "thanh pho", "tp." de lay ten chinh
  return candidate.replace(/^thanh pho\s+/i, '').replace(/^tp\.?\s*/i, '').trim();
};

// Chuyen doi ngay thanh khoang thoi gian trong ngay (00:00:00 - 23:59:59)
const toDayRange = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { $gte: start, $lte: end };
};

// Chuyen preset thoi gian (today, tomorrow, this-weekend, this-month) thanh khoang ngay MongoDB
const resolvePresetRange = (preset) => {
  const now = new Date();
  // Neu la "today" thi tra ve khoang ngay hom nay
  if (preset === 'today') return toDayRange(now);

  // Neu la "tomorrow" thi tra ve khoang ngay mai
  if (preset === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return toDayRange(tomorrow);
  }

  // Neu la "this-weekend" thi tinh ngay thu 7 gan nhat va chu nhat
  if (preset === 'this-weekend') {
    const start = new Date(now);
    const day = start.getDay();
    // Tinh so ngay den thu 7
    const daysUntilSaturday = (6 - day + 7) % 7;
    start.setDate(start.getDate() + daysUntilSaturday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    end.setHours(23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  // Neu la "this-month" thi tra ve khoang ngay trong thang hien tai
  if (preset === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  // Neu khong co preset thi tra ve null
  return null;
};

// Tinh gioi han so ve moi nguoi dua tren so ve con lai cua su kien
const getDynamicPerUserLimit = (eventAvailableTickets) => {
  const total = Math.max(0, Number(eventAvailableTickets) || 0);
  // Bang cach tang gioi han khi so ve tang
  if (total <= 20) return 3;
  if (total <= 40) return 4;
  if (total <= 80) return 5;
  if (total <= 150) return 6;
  if (total <= 250) return 7;
  if (total <= 400) return 8;
  if (total <= 700) return 9;
  return 10;
};

// Kiem tra nguoi dung da dien day thong tin ho so dat ve chua
const hasCompleteBookingProfile = (user) => {
  if (!user) return false;
  // Kiem tra ten (it nhat 2 ky tu)
  const hasName = typeof user.name === 'string' && user.name.trim().length >= 2;
  // Kiem tra so dien thoai (it nhat 10 so)
  const hasPhone = typeof user.phone === 'string' && user.phone.replaceAll(/\D/g, '').length >= 10;
  // Kiem tra dia chi (it nhat 10 ky tu)
  const hasAddress = typeof user.address === 'string' && user.address.trim().length >= 10;
  return hasName && hasPhone && hasAddress;
};

// Escape ky tu dac biet trong regex de tranh loi
const escapeRegExp = (value = '') => value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

// Chuan hoa van ban: xoa dau, chuyen thanh chu thuong, loai bo ky tu dac biet
const normalizeText = (value = '') =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9\s]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

// Tap hop cac tu dung (stop words) can loai bo khi trich xuat tu khoa
const STOP_WORDS = new Set([
  'va', 'voi', 'cung', 'cho', 'tai', 'tren', 'duoc', 'dang', 'se', 'dem',
  'show', 'live', 'tour', 'music', 'event', 'su', 'kien', 'chuong', 'trinh',
  'tham', 'gia', 'nam', '2024', '2025', '2026'
]);

// Trich xuat cac tu co y nghia (loai bo stop words va tu ngan)
const extractMeaningfulTokens = (value = '', minLength = 2) => {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  return [
    ...new Set(
      normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= minLength && !STOP_WORDS.has(token))
    )
  ];
};

// Lay gia ve thap nhat cua su kien
const getEventMinPrice = (event = {}) => {
  const ticketTypes = Array.isArray(event.ticketTypes) ? event.ticketTypes : [];
  if (!ticketTypes.length) return null;

  // Lay gia tri so va loc bo NaN
  const prices = ticketTypes
    .map((ticket) => Number(ticket?.price))
    .filter((price) => Number.isFinite(price));

  return prices.length ? Math.min(...prices) : null;
};

// Tao profile tu khoa cho su kien de so sanh
const getEventKeywordProfile = (event = {}) => {
  // Trich xuat token tu cac truong khac nhau
  const nameTokens = extractMeaningfulTokens(event.name, 2);
  const descTokens = extractMeaningfulTokens(event.description, 4);
  const categoryTokens = extractMeaningfulTokens(event.category, 2);
  const provinceTokens = extractMeaningfulTokens(extractProvince(event.location), 2);
  const locationTokens = extractMeaningfulTokens(event.location, 3);

  // Tra ve tap hop token hop nhat
  return {
    nameTokens,
    descTokens,
    categoryTokens,
    provinceTokens,
    locationTokens,
    combinedTokens: [
      ...new Set([
        ...nameTokens,
        ...descTokens.slice(0, 10),
        ...categoryTokens,
        ...provinceTokens,
        ...locationTokens.slice(0, 6)
      ])
    ]
  };
};

// Dem so token chung giua hai tap hop
const countSharedTokens = (sourceTokens = [], targetTokens = []) => {
  if (!sourceTokens.length || !targetTokens.length) return 0;
  const targetSet = new Set(targetTokens);
  return sourceTokens.filter((token) => targetSet.has(token)).length;
};

// Tinh diem tương đồng giữa hai sự kiện để gợi ý sự kiện liên quan
const getRelatedEventScore = (currentEvent, candidateEvent) => {
  // Chuan hoa cac truong de so sanh
  const currentProvince = normalizeText(extractProvince(currentEvent.location));
  const candidateProvince = normalizeText(extractProvince(candidateEvent.location));
  const currentLocation = normalizeText(currentEvent.location);
  const candidateLocation = normalizeText(candidateEvent.location);
  const currentCategory = normalizeText(currentEvent.category);
  const candidateCategory = normalizeText(candidateEvent.category);
  const currentKeywords = getEventKeywordProfile(currentEvent);
  const candidateKeywords = getEventKeywordProfile(candidateEvent);

  let score = 0;

  // Cung danh muc thi +35 diem
  if (currentCategory && candidateCategory && currentCategory === candidateCategory) score += 35;
  // Cung tinh/thanh thi +25 diem
  if (currentProvince && candidateProvince && currentProvince === candidateProvince) score += 25;

  // Cung dia diem thi +20 diem, giong mot phan thi +12 diem
  if (currentLocation && candidateLocation) {
    if (currentLocation === candidateLocation) score += 20;
    else if (currentLocation.includes(candidateLocation) || candidateLocation.includes(currentLocation)) score += 12;
  }

  // Tinh diem theo token chung trong ten
  const sharedNameTokens = countSharedTokens(currentKeywords.nameTokens, candidateKeywords.nameTokens);
  const sharedCombinedTokens = countSharedTokens(
    currentKeywords.combinedTokens,
    candidateKeywords.combinedTokens
  );

  // Cong diem: token ten * 12 (toi da 36), token chung * 5 (toi da 25)
  score += Math.min(sharedNameTokens * 12, 36);
  score += Math.min(sharedCombinedTokens * 5, 25);

  // Gan ngay thi +diem (cang gan cang nhieu diem)
  const currentDate = new Date(currentEvent.date);
  const candidateDate = new Date(candidateEvent.date);
  if (!Number.isNaN(currentDate.getTime()) && !Number.isNaN(candidateDate.getTime())) {
    const diffDays = Math.abs(candidateDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) score += 10;
    else if (diffDays <= 30) score += 6;
    else if (diffDays <= 60) score += 3;
  }

  // Cong diem theo luot xem (toi da 20 diem)
  score += Math.min(Number(candidateEvent.views) || 0, 20) / 20;
  return score;
};

// Tim cac su kien lien quan de goi y
const buildRelatedEventCandidates = async (event, limit = 4) => {
  const currentProfile = getEventKeywordProfile(event);
  // Query de tim su kien cung danh muc, dia diem, hoac tu khoa
  const candidateQuery = {
    _id: { $ne: event._id },
    status: { $in: ['published', 'upcoming', 'ongoing', 'approved'] }
  };

  // Tao cac dieu kien OR de tim kiem
  const candidateOrConditions = [];
  // Tim theo danh muc
  if (event.category) {
    candidateOrConditions.push({ category: new RegExp(`^${escapeRegExp(event.category)}$`, 'i') });
  }

  // Tim theo tinh/thanh
  const province = extractProvince(event.location);
  if (province) {
    candidateOrConditions.push({ location: new RegExp(escapeRegExp(province), 'i') });
  }

  // Tim theo token trong ten va mo ta
  currentProfile.nameTokens.slice(0, 5).forEach((token) => {
    const regex = new RegExp(`\\b${escapeRegExp(token)}`, 'i');
    candidateOrConditions.push({ name: regex }, { description: regex });
  });

  // Neu co dieu kien OR thi them vao query
  if (candidateOrConditions.length) {
    candidateQuery.$or = candidateOrConditions;
  }

  // Lay nhieu uu tien theo luot xem va ngay
  const candidates = await Event.find(candidateQuery).sort({ views: -1, date: 1 }).limit(40).lean();

  // Tinh diem va loc su kien co diem > 0
  return candidates
    .map((candidate) => ({
      ...candidate,
      minPrice: getEventMinPrice(candidate),
      relatedScore: getRelatedEventScore(event, candidate)
    }))
    .filter((candidate) => candidate.relatedScore > 0)
    .sort((a, b) => {
      // Sap xep theo diem giam dan, neu bang nhau thi theo ngay tang dan
      if (b.relatedScore !== a.relatedScore) return b.relatedScore - a.relatedScore;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    })
    .slice(0, limit);
};

const eventController = {
  // Hien thi chi tiet su kien
  detail: [
    param('id').isMongoId().withMessage('ID sự kiện không hợp lệ'),
    async (req, res) => {
      // Kiem tra loi validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg || 'Yêu cầu không hợp lệ',
          errors: errors.array()
        });
      }

      try {
        // Lay thong tin su kien
        const event = await Event.findById(req.params.id).populate('organizer', 'name').lean();
        if (!event) {
          return res.status(404).render('clients/page/error/404', {
            pageTitle: 'Không tìm thấy sự kiện',
            message: 'Sự kiện này không tồn tại hoặc đã bị xóa'
          });
        }

        // Tinh so ve con lai
        const ticketTypes = event.ticketTypes || [];
        const totalAvailable = ticketTypes.reduce(
          (sum, ticket) => sum + ((ticket.quantity || 0) - (ticket.sold || 0) - (ticket.holded || 0)),
          0
        );
        // Tinh gioi han ve moi nguoi
        const perUserTicketLimit = getDynamicPerUserLimit(totalAvailable);
        let userReservedTickets = 0;
        const isLoggedIn = Boolean(req.user?._id);
        // Kiem tra ho so dat ve da day du chua
        const isProfileComplete = hasCompleteBookingProfile(req.user);
        // Tao duong dan chuyen huong neu can xac minh ho so
        const verifyProfileRedirect = `/verify-profile?redirect=${encodeURIComponent(req.originalUrl)}`;

        // Neu da dang nhap, dem so ve da dat cua nguoi dung cho su kien nay
        if (isLoggedIn) {
          const reservedAgg = await Order.aggregate([
            {
              $match: {
                userId: req.user._id,
                eventId: event._id,
                status: { $in: ['PENDING', 'PAID'] }
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: { $sum: '$items.quantity' } }
              }
            }
          ]);
          userReservedTickets = Number(reservedAgg[0]?.total || 0);
        }

        // Tinh gia ve thap nhat
        const minPrice =
          ticketTypes.length > 0
            ? Math.min(...ticketTypes.map((ticket) => ticket.price || 0)).toLocaleString('vi-VN')
            : 'Liên hệ';

        // Tim cac su kien lien quan
        const relatedEvents = await buildRelatedEventCandidates(event, 4);

        // Render trang chi tiet su kien
        return res.render('clients/page/events/detail', {
          pageTitle: `${event.name} - TicketEvent`,
          event,
          ticketTypes,
          available: totalAvailable,
          minPrice,
          perUserTicketLimit,
          userReservedTickets,
          isLoggedIn,
          isProfileComplete,
          verifyProfileRedirect,
          relatedEvents
        });
      } catch (err) {
        logger.error('Error in event detail:', err);
        return res.status(500).render('clients/page/error/500', {
          pageTitle: 'Lỗi máy chủ',
          message: 'Không thể tải thông tin sự kiện. Vui lòng thử lại sau.'
        });
      }
    }
  ],

  // Lay danh sach su kien cho trang web
  getAllWeb: async (req, res) => {
    try {
      // Lay cac tham so tu query string
      const categoryQuery = req.query.category;
      const searchQuery = (req.query.search || '').trim();
      const province = (req.query.province || '').trim();
      const { startDate, endDate } = req.query;
      const freeOnly = req.query.free === '1';
      // Kiem tra cac gia tri preset hop le
      const allowedDayPresets = ['all', 'today', 'tomorrow', 'this-weekend', 'this-month'];
      const allowedTimeFilters = ['all', 'ongoing', 'upcoming', 'published'];
      const dayPreset = allowedDayPresets.includes(req.query.dayPreset) ? req.query.dayPreset : 'all';
      const timeFilter = allowedTimeFilters.includes(req.query.time) ? req.query.time : 'all';

      // Chuyen doi danh muc sang slug va lay ten chinh xac
      const categorySlug = categoryQuery ? toSlugLike(categoryQuery) : '';
      const categoryName = CATEGORY_MAP[categorySlug] || categoryQuery;
      const activeCategory = categorySlug || 'tat-ca';
      const matchStage = {};

      // Loc theo danh muc
      if (categoryQuery && categorySlug !== 'tat-ca') {
        matchStage.category = new RegExp(`^${categoryName}$`, 'i');
      }

      // Tim kiem theo tu khoa trong ten, mo ta, dia diem
      if (searchQuery) {
        matchStage.$or = [
          { name: new RegExp(searchQuery, 'i') },
          { description: new RegExp(searchQuery, 'i') },
          { location: new RegExp(searchQuery, 'i') }
        ];
      }

      // Loc theo tinh/thanh
      if (province) {
        matchStage.location = new RegExp(province, 'i');
      }

      // Loc theo khoang ngay hoac preset
      if (startDate || endDate) {
        matchStage.date = {};
        if (startDate) matchStage.date.$gte = new Date(startDate);
        if (endDate) matchStage.date.$lte = new Date(endDate);
      } else {
        const presetRange = resolvePresetRange(dayPreset);
        if (presetRange) matchStage.date = presetRange;
      }

      // Loc theo trang thai thoi gian
      matchStage.status = timeFilter === 'all' ? { $in: ['ongoing', 'upcoming', 'published'] } : timeFilter;
      // Loc su kien mien phi
      if (freeOnly) {
        matchStage['ticketTypes.price'] = 0;
      }

      // Lay danh sach su kien
      const events = await Event.find(matchStage).sort({ date: 1 }).limit(50).lean();
      // Lay danh sach dia diem de hien thi loc
      const allLocations = await Event.distinct('location');
      // Trich xuat va sap xep danh sach tinh/thanh
      const provinceOptions = [...new Set(allLocations.map(extractProvince).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'vi')
      );

      // Render trang danh sach su kien
      return res.render('clients/page/events/index', {
        pageTitle: 'Danh sách sự kiện',
        events,
        categories: CATEGORY_OPTIONS,
        activeCategory,
        searchQuery,
        startDate: startDate || '',
        endDate: endDate || '',
        dayPreset,
        timeFilter,
        freeOnly,
        selectedProvince: province,
        provinceOptions,
        user: req.user || null
      });
    } catch (err) {
      logger.error('Lỗi render trang sự kiện:', err);
      return res.status(500).render('clients/page/error/500');
    }
  },

  // API lay danh sach su kien (JSON)
  getAllApi: async (req, res) => {
    try {
      // Lay cac tham so query
      const { category, search, time, startDate, endDate, province } = req.query;
      const freeOnly = req.query.free === '1';
      const allowedDayPresets = ['all', 'today', 'tomorrow', 'this-weekend', 'this-month'];
      const dayPreset = allowedDayPresets.includes(req.query.dayPreset) ? req.query.dayPreset : 'all';
      const queryFilter = {};

      // Loc theo danh muc
      if (category) queryFilter.category = CATEGORY_MAP[toSlugLike(category)] || category;
      // Tim kiem theo ten
      if (search) queryFilter.name = { $regex: search, $options: 'i' };
      // Loc theo tinh/thanh
      if (province) queryFilter.location = { $regex: province, $options: 'i' };

      // Loc theo trang thai thoi gian
      const safeTime = ['all', 'ongoing', 'upcoming', 'published'].includes(time) ? time : 'all';
      queryFilter.status = safeTime === 'all' ? { $in: ['ongoing', 'upcoming', 'published'] } : safeTime;

      // Loc theo khoang ngay
      if (startDate || endDate) {
        queryFilter.date = {};
        if (startDate) queryFilter.date.$gte = new Date(startDate);
        if (endDate) queryFilter.date.$lte = new Date(endDate);
      } else {
        const presetRange = resolvePresetRange(dayPreset);
        if (presetRange) queryFilter.date = presetRange;
      }

      // Loc su kien mien phi
      if (freeOnly) {
        queryFilter['ticketTypes.price'] = 0;
      }

      // Lay danh sach su kien
      const events = await Event.find(queryFilter).sort({ date: 1 });
      return res.status(200).json(
        events.map((event) => ({
          ...event.toObject(),
          image: event.image || '/events/images/placeholder.jpg'
        }))
      );
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Lỗi server API' });
    }
  },

  // Hien thi su kien theo danh muc
  category: [
    query('slug').optional().isString(),
    async (req, res) => {
      try {
        // Lay slug danh muc tu params hoac query
        const slug = req.params.slug || req.query.slug;
        const categoryName = CATEGORY_MAP[slug] || 'Tất cả';
        // Phan trang
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        // Lay su kien theo danh muc
        const events = await Event.find({ category: categoryName }).skip(skip).limit(limit).sort({ date: 1 });
        // Dem tong so de phan trang
        const total = await Event.countDocuments({ category: categoryName });

        // Render trang danh muc
        return res.render('clients/page/event/category', {
          pageTitle: `${categoryName} - TicketEvent`,
          categoryName,
          events,
          pagination: { page, totalPages: Math.ceil(total / limit) }
        });
      } catch (err) {
        logger.error('Error in event category:', err);
        return res.status(500).send('Lỗi Server');
      }
    }
  ],

  // Tao su kien moi
  createEvent: [
    authMiddleware,
    async (req, res) => {
      try {
        // Goi service de tao su kien voi trang thai pending (can duyet)
        const event = await createUnifiedEvent({
          body: req.body,
          organizerId: req.user.id,
          status: 'pending',
          file: req.file
        });

        // Tra ve ket qua tao thanh cong
        return res.status(201).json({
          success: true,
          message: 'Tạo sự kiện thành công',
          event
        });
      } catch (err) {
        logger.error('Error creating event:', err);
        return res.status(err.status || 500).json({
          success: false,
          message: err.message || 'Lỗi server'
        });
      }
    }
  ],

  // Trang dat ve
  booking: [
    authMiddleware,
    async (req, res) => res.render('clients/page/event/booking', { pageTitle: 'Đặt vé' })
  ],

  // Trang xac nhan dat ve
  confirmBooking: [
    authMiddleware,
    async (req, res) => res.render('clients/page/event/confirm', { pageTitle: 'Xác nhận đặt vé' })
  ],

  // Lay danh sach su kien cho dashboard (admin/organizer)
  getDashboardEvents: [
    async (req, res) => {
      try {
        // Lay tat ca su kien sap sep theo ngay
        const events = await Event.find({}).sort({ date: 1 });
        const now = new Date();
        // Xu ly trang thai su kien (da ket thuc hoac sap dien ra)
        const processedEvents = events.map((event) => {
          const eventDate = new Date(event.date);
          const status = eventDate < now ? 'ended' : 'upcoming';
          return {
            ...event.toObject(),
            status
          };
        });

        // Render trang quan ly su kien
        return res.render('admin/dashboard/events', {
          pageTitle: 'Quản lý sự kiện',
          events: processedEvents
        });
      } catch (err) {
        logger.error('Lỗi lấy danh sách sự kiện:', err);
        return res.status(500).send('Lỗi Server');
      }
    }
  ]
};

export default eventController;
