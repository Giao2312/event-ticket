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

const extractProvince = (location = '') => {
  if (!location || typeof location !== 'string') return '';
  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const raw = parts.length ? parts[parts.length - 1] : location.trim();
  const candidate =
    /^(viet nam|vietnam)$/i.test(raw) && parts.length >= 2 ? parts[parts.length - 2] : raw;

  return candidate.replace(/^thanh pho\s+/i, '').replace(/^tp\.?\s*/i, '').trim();
};

const toDayRange = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { $gte: start, $lte: end };
};

const resolvePresetRange = (preset) => {
  const now = new Date();
  if (preset === 'today') return toDayRange(now);

  if (preset === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return toDayRange(tomorrow);
  }

  if (preset === 'this-weekend') {
    const start = new Date(now);
    const day = start.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7;
    start.setDate(start.getDate() + daysUntilSaturday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    end.setHours(23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  if (preset === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  return null;
};

const getDynamicPerUserLimit = (eventAvailableTickets) => {
  const total = Math.max(0, Number(eventAvailableTickets) || 0);
  if (total <= 20) return 3;
  if (total <= 40) return 4;
  if (total <= 80) return 5;
  if (total <= 150) return 6;
  if (total <= 250) return 7;
  if (total <= 400) return 8;
  if (total <= 700) return 9;
  return 10;
};

const hasCompleteBookingProfile = (user) => {
  if (!user) return false;
  const hasName = typeof user.name === 'string' && user.name.trim().length >= 2;
  const hasPhone = typeof user.phone === 'string' && user.phone.replace(/\D/g, '').length >= 10;
  const hasAddress = typeof user.address === 'string' && user.address.trim().length >= 10;
  return hasName && hasPhone && hasAddress;
};

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeText = (value = '') =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP_WORDS = new Set([
  'va',
  'voi',
  'cung',
  'cho',
  'tai',
  'tren',
  'duoc',
  'dang',
  'se',
  'dem',
  'show',
  'live',
  'tour',
  'music',
  'event',
  'su',
  'kien',
  'chuong',
  'trinh',
  'tham',
  'gia',
  'nam',
  '2024',
  '2025',
  '2026'
]);

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

const getEventMinPrice = (event = {}) => {
  const ticketTypes = Array.isArray(event.ticketTypes) ? event.ticketTypes : [];
  if (!ticketTypes.length) return null;

  const prices = ticketTypes
    .map((ticket) => Number(ticket?.price))
    .filter((price) => Number.isFinite(price));

  return prices.length ? Math.min(...prices) : null;
};

const getEventKeywordProfile = (event = {}) => {
  const nameTokens = extractMeaningfulTokens(event.name, 2);
  const descTokens = extractMeaningfulTokens(event.description, 4);
  const categoryTokens = extractMeaningfulTokens(event.category, 2);
  const provinceTokens = extractMeaningfulTokens(extractProvince(event.location), 2);
  const locationTokens = extractMeaningfulTokens(event.location, 3);

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

const countSharedTokens = (sourceTokens = [], targetTokens = []) => {
  if (!sourceTokens.length || !targetTokens.length) return 0;
  const targetSet = new Set(targetTokens);
  return sourceTokens.filter((token) => targetSet.has(token)).length;
};

const getRelatedEventScore = (currentEvent, candidateEvent) => {
  const currentProvince = normalizeText(extractProvince(currentEvent.location));
  const candidateProvince = normalizeText(extractProvince(candidateEvent.location));
  const currentLocation = normalizeText(currentEvent.location);
  const candidateLocation = normalizeText(candidateEvent.location);
  const currentCategory = normalizeText(currentEvent.category);
  const candidateCategory = normalizeText(candidateEvent.category);
  const currentKeywords = getEventKeywordProfile(currentEvent);
  const candidateKeywords = getEventKeywordProfile(candidateEvent);

  let score = 0;

  if (currentCategory && candidateCategory && currentCategory === candidateCategory) score += 35;
  if (currentProvince && candidateProvince && currentProvince === candidateProvince) score += 25;

  if (currentLocation && candidateLocation) {
    if (currentLocation === candidateLocation) score += 20;
    else if (currentLocation.includes(candidateLocation) || candidateLocation.includes(currentLocation)) score += 12;
  }

  const sharedNameTokens = countSharedTokens(currentKeywords.nameTokens, candidateKeywords.nameTokens);
  const sharedCombinedTokens = countSharedTokens(
    currentKeywords.combinedTokens,
    candidateKeywords.combinedTokens
  );

  score += Math.min(sharedNameTokens * 12, 36);
  score += Math.min(sharedCombinedTokens * 5, 25);

  const currentDate = new Date(currentEvent.date);
  const candidateDate = new Date(candidateEvent.date);
  if (!Number.isNaN(currentDate.getTime()) && !Number.isNaN(candidateDate.getTime())) {
    const diffDays = Math.abs(candidateDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) score += 10;
    else if (diffDays <= 30) score += 6;
    else if (diffDays <= 60) score += 3;
  }

  score += Math.min(Number(candidateEvent.views) || 0, 20) / 20;
  return score;
};

const buildRelatedEventCandidates = async (event, limit = 4) => {
  const currentProfile = getEventKeywordProfile(event);
  const candidateQuery = {
    _id: { $ne: event._id },
    status: { $in: ['published', 'upcoming', 'ongoing', 'approved'] }
  };

  const candidateOrConditions = [];
  if (event.category) {
    candidateOrConditions.push({ category: new RegExp(`^${escapeRegExp(event.category)}$`, 'i') });
  }

  const province = extractProvince(event.location);
  if (province) {
    candidateOrConditions.push({ location: new RegExp(escapeRegExp(province), 'i') });
  }

  currentProfile.nameTokens.slice(0, 5).forEach((token) => {
    const regex = new RegExp(`\\b${escapeRegExp(token)}`, 'i');
    candidateOrConditions.push({ name: regex });
    candidateOrConditions.push({ description: regex });
  });

  if (candidateOrConditions.length) {
    candidateQuery.$or = candidateOrConditions;
  }

  const candidates = await Event.find(candidateQuery).sort({ views: -1, date: 1 }).limit(40).lean();

  return candidates
    .map((candidate) => ({
      ...candidate,
      minPrice: getEventMinPrice(candidate),
      relatedScore: getRelatedEventScore(event, candidate)
    }))
    .filter((candidate) => candidate.relatedScore > 0)
    .sort((a, b) => {
      if (b.relatedScore !== a.relatedScore) return b.relatedScore - a.relatedScore;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    })
    .slice(0, limit);
};

const eventController = {
  detail: [
    param('id').isMongoId().withMessage('ID sự kiện không hợp lệ'),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg || 'Yêu cầu không hợp lệ',
          errors: errors.array()
        });
      }

      try {
        const event = await Event.findById(req.params.id).populate('organizer', 'name').lean();
        if (!event) {
          return res.status(404).render('clients/page/error/404', {
            pageTitle: 'Không tìm thấy sự kiện',
            message: 'Sự kiện này không tồn tại hoặc đã bị xóa'
          });
        }

        const ticketTypes = event.ticketTypes || [];
        const totalAvailable = ticketTypes.reduce(
          (sum, ticket) => sum + ((ticket.quantity || 0) - (ticket.sold || 0) - (ticket.holded || 0)),
          0
        );
        const perUserTicketLimit = getDynamicPerUserLimit(totalAvailable);
        let userReservedTickets = 0;
        const isLoggedIn = Boolean(req.user?._id);
        const isProfileComplete = hasCompleteBookingProfile(req.user);
        const verifyProfileRedirect = `/verify-profile?redirect=${encodeURIComponent(req.originalUrl)}`;

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

        const minPrice =
          ticketTypes.length > 0
            ? Math.min(...ticketTypes.map((ticket) => ticket.price || 0)).toLocaleString('vi-VN')
            : 'Liên hệ';

        const relatedEvents = await buildRelatedEventCandidates(event, 4);

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

  getAllWeb: async (req, res) => {
    try {
      const categoryQuery = req.query.category;
      const searchQuery = (req.query.search || '').trim();
      const province = (req.query.province || '').trim();
      const { startDate, endDate } = req.query;
      const freeOnly = req.query.free === '1';
      const allowedDayPresets = ['all', 'today', 'tomorrow', 'this-weekend', 'this-month'];
      const allowedTimeFilters = ['all', 'ongoing', 'upcoming', 'published'];
      const dayPreset = allowedDayPresets.includes(req.query.dayPreset) ? req.query.dayPreset : 'all';
      const timeFilter = allowedTimeFilters.includes(req.query.time) ? req.query.time : 'all';

      const categorySlug = categoryQuery ? toSlugLike(categoryQuery) : '';
      const categoryName = CATEGORY_MAP[categorySlug] || categoryQuery;
      const activeCategory = categorySlug || 'tat-ca';
      const matchStage = {};

      if (categoryQuery && categorySlug !== 'tat-ca') {
        matchStage.category = new RegExp(`^${categoryName}$`, 'i');
      }

      if (searchQuery) {
        matchStage.$or = [
          { name: new RegExp(searchQuery, 'i') },
          { description: new RegExp(searchQuery, 'i') },
          { location: new RegExp(searchQuery, 'i') }
        ];
      }

      if (province) {
        matchStage.location = new RegExp(province, 'i');
      }

      if (startDate || endDate) {
        matchStage.date = {};
        if (startDate) matchStage.date.$gte = new Date(startDate);
        if (endDate) matchStage.date.$lte = new Date(endDate);
      } else {
        const presetRange = resolvePresetRange(dayPreset);
        if (presetRange) matchStage.date = presetRange;
      }

      matchStage.status = timeFilter === 'all' ? { $in: ['ongoing', 'upcoming', 'published'] } : timeFilter;
      if (freeOnly) {
        matchStage['ticketTypes.price'] = 0;
      }

      const events = await Event.find(matchStage).sort({ date: 1 }).limit(50).lean();
      const allLocations = await Event.distinct('location');
      const provinceOptions = [...new Set(allLocations.map(extractProvince).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'vi')
      );

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

  getAllApi: async (req, res) => {
    try {
      const { category, search, time, startDate, endDate, province } = req.query;
      const freeOnly = req.query.free === '1';
      const allowedDayPresets = ['all', 'today', 'tomorrow', 'this-weekend', 'this-month'];
      const dayPreset = allowedDayPresets.includes(req.query.dayPreset) ? req.query.dayPreset : 'all';
      const queryFilter = {};

      if (category) queryFilter.category = CATEGORY_MAP[toSlugLike(category)] || category;
      if (search) queryFilter.name = { $regex: search, $options: 'i' };
      if (province) queryFilter.location = { $regex: province, $options: 'i' };

      const safeTime = ['all', 'ongoing', 'upcoming', 'published'].includes(time) ? time : 'all';
      queryFilter.status = safeTime === 'all' ? { $in: ['ongoing', 'upcoming', 'published'] } : safeTime;

      if (startDate || endDate) {
        queryFilter.date = {};
        if (startDate) queryFilter.date.$gte = new Date(startDate);
        if (endDate) queryFilter.date.$lte = new Date(endDate);
      } else {
        const presetRange = resolvePresetRange(dayPreset);
        if (presetRange) queryFilter.date = presetRange;
      }

      if (freeOnly) {
        queryFilter['ticketTypes.price'] = 0;
      }

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

  category: [
    query('slug').optional().isString(),
    async (req, res) => {
      try {
        const slug = req.params.slug || req.query.slug;
        const categoryName = CATEGORY_MAP[slug] || 'Tất cả';
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const events = await Event.find({ category: categoryName }).skip(skip).limit(limit).sort({ date: 1 });
        const total = await Event.countDocuments({ category: categoryName });

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

  createEvent: [
    authMiddleware,
    async (req, res) => {
      try {
        const event = await createUnifiedEvent({
          body: req.body,
          organizerId: req.user.id,
          status: 'pending',
          file: req.file
        });

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

  booking: [
    authMiddleware,
    async (req, res) => res.render('clients/page/event/booking', { pageTitle: 'Đặt vé' })
  ],

  confirmBooking: [
    authMiddleware,
    async (req, res) => res.render('clients/page/event/confirm', { pageTitle: 'Xác nhận đặt vé' })
  ],

  getDashboardEvents: [
    async (req, res) => {
      try {
        const events = await Event.find({}).sort({ date: 1 });
        const now = new Date();
        const processedEvents = events.map((event) => {
          const eventDate = new Date(event.date);
          const status = eventDate < now ? 'ended' : 'upcoming';
          return {
            ...event.toObject(),
            status
          };
        });

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
