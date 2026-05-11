import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import Notification from '../models/notification.models.js';
import Withdrawal from '../models/withdrawal.models.js';
import User from '../models/user.models.js';
import { body, validationResult } from 'express-validator';
import logger from '../utils/logger.js';
import { createUnifiedEvent } from '../services/event.service.js';
import {
  requestWithdrawal,
  getOrganizerBalance,
  getWithdrawals
} from '../services/withdrawal.service.js';

const sendAdminNotification = async () => {};

const ORDER_STATUS_MAP = {
  all: 'all',
  pending: 'PENDING',
  paid: 'PAID',
  cancelled: 'CANCELLED',
  refunded: 'REFUNDED',
  expired: 'EXPIRED'
};

const WITHDRAWAL_STATUS_MAP = {
  all: '',
  pending: 'PENDING',
  approved: 'APPROVED',
  completed: 'COMPLETED',
  rejected: 'REJECTED',
  failed: 'FAILED'
};

const normalizeEventStatus = (event) => {
  const status = String(event?.status || '').toLowerCase();
  if (['pending', 'rejected', 'cancelled', 'upcoming', 'ongoing', 'ended'].includes(status)) {
    return status;
  }

  const eventDate = new Date(event?.date);
  if (Number.isNaN(eventDate.getTime())) return 'upcoming';

  const now = new Date();
  if (eventDate < now) return 'ended';

  const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return eventDate <= threshold ? 'ongoing' : 'upcoming';
};

const summarizeEventTickets = (event) => {
  const ticketTypes = Array.isArray(event?.ticketTypes) ? event.ticketTypes : [];
  const totalTickets = ticketTypes.reduce((sum, ticket) => sum + Number(ticket.quantity || 0), 0);
  const totalSold = ticketTypes.reduce((sum, ticket) => sum + Number(ticket.sold || 0), 0);

  return {
    totalTickets,
    totalSold,
    fillRate: totalTickets > 0 ? Math.round((totalSold / totalTickets) * 100) : 0
  };
};

const enrichOrganizerEvent = (event) => {
  const summary = summarizeEventTickets(event);
  return {
    ...event,
    ...summary,
    displayStatus: normalizeEventStatus(event)
  };
};

const buildEventCounts = (events = []) =>
  events.reduce(
    (acc, event) => {
      const status = event.displayStatus || normalizeEventStatus(event);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { pending: 0, rejected: 0, upcoming: 0, ongoing: 0, ended: 0, cancelled: 0 }
  );

const summarizeWithdrawals = (withdrawals = []) =>
  withdrawals.reduce(
    (acc, withdrawal) => {
      const status = String(withdrawal?.status || '').toUpperCase();
      const amount = Number(withdrawal?.amount || 0);
      const netAmount = Number(withdrawal?.netAmount || 0);

      acc.totalRequests += 1;
      acc.totalRequestedAmount += amount;
      acc.totalNetAmount += netAmount;

      if (status === 'PENDING') {
        acc.pendingCount += 1;
        acc.pendingNetAmount += netAmount;
      }

      if (status === 'APPROVED') {
        acc.approvedCount += 1;
      }

      if (status === 'COMPLETED') {
        acc.completedCount += 1;
      }

      if (status === 'REJECTED') {
        acc.rejectedCount += 1;
      }

      if (status === 'FAILED') {
        acc.failedCount += 1;
      }

      if (!acc.latestRequestAt || new Date(withdrawal.createdAt) > new Date(acc.latestRequestAt)) {
        acc.latestRequestAt = withdrawal.createdAt;
      }

      return acc;
    },
    {
      totalRequests: 0,
      totalRequestedAmount: 0,
      totalNetAmount: 0,
      pendingCount: 0,
      pendingNetAmount: 0,
      approvedCount: 0,
      completedCount: 0,
      rejectedCount: 0,
      failedCount: 0,
      latestRequestAt: null
    }
  );

const normalizeTextInput = (value = '') => String(value ?? '').trim();

const normalizeIndexedCollection = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input !== 'object') return [];

  return Object.keys(input)
    .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10))
    .map((key) => input[key]);
};

const buildCreateEventFieldErrors = (errors = []) =>
  errors.reduce((acc, error) => {
    if (error?.path && !acc[error.path]) {
      acc[error.path] = error.msg;
    }
    return acc;
  }, {});

const resolveCreateEventErrorField = (message = '') => {
  const normalizedMessage = String(message || '').toLowerCase();

  if (normalizedMessage.includes('tên sự kiện')) return 'name';
  if (normalizedMessage.includes('mô tả')) return 'description';
  if (normalizedMessage.includes('ngày bắt đầu') || normalizedMessage.includes('thời gian bắt đầu')) {
    return 'dateStart';
  }
  if (normalizedMessage.includes('địa điểm') || normalizedMessage.includes('link sự kiện')) {
    return 'location';
  }
  if (normalizedMessage.includes('phân khu') || normalizedMessage.includes('ghế')) {
    return 'seatSections';
  }
  if (normalizedMessage.includes('hạng vé')) {
    return normalizedMessage.includes('phân khu') || normalizedMessage.includes('ghế')
      ? 'seatSections'
      : 'tickets';
  }

  return '';
};

const buildCreateEventFormData = (body = {}, user = null) => {
  const hasSubmittedValues = Object.keys(body || {}).length > 0;
  const fallbackBankInfo = hasSubmittedValues ? {} : user?.bankInfo || {};

  const tickets = normalizeIndexedCollection(body.tickets)
    .map((ticket) => ({
      type: normalizeTextInput(ticket?.type),
      price: ticket?.price ?? '',
      quantity: ticket?.quantity ?? ''
    }))
    .filter((ticket) => ticket.type || ticket.price !== '' || ticket.quantity !== '');

  const seatSections = normalizeIndexedCollection(body.seatSections)
    .map((section) => ({
      name: normalizeTextInput(section?.name),
      code: normalizeTextInput(section?.code),
      ticketTypeName: normalizeTextInput(section?.ticketTypeName),
      rows: section?.rows ?? '',
      seatsPerRow: section?.seatsPerRow ?? '',
      rowLabelType: section?.rowLabelType === 'numbers' ? 'numbers' : 'letters'
    }))
    .filter(
      (section) =>
        section.name ||
        section.code ||
        section.ticketTypeName ||
        section.rows !== '' ||
        section.seatsPerRow !== ''
    );

  return {
    name: normalizeTextInput(body.name),
    description: normalizeTextInput(body.description),
    category: normalizeTextInput(body.category) || 'khac',
    dateStart: normalizeTextInput(body.dateStart),
    dateEnd: normalizeTextInput(body.dateEnd),
    timeStart: normalizeTextInput(body.timeStart),
    timeEnd: normalizeTextInput(body.timeEnd),
    eventMode: body.eventMode === 'online' ? 'online' : 'offline',
    venueName: normalizeTextInput(body.venueName),
    city: normalizeTextInput(body.city),
    ward: normalizeTextInput(body.ward),
    street: normalizeTextInput(body.street),
    mapLink: normalizeTextInput(body.mapLink),
    onlineLink: normalizeTextInput(body.onlineLink),
    ticketingMode: body.ticketingMode === 'reserved_seating' ? 'reserved_seating' : 'general_admission',
    isPublic: body.isPublic === undefined ? true : Boolean(body.isPublic),
    requireApproval: Boolean(body.requireApproval),
    saleStart: normalizeTextInput(body.saleStart),
    payoutMethod: normalizeTextInput(body.payoutMethod),
    accountName: normalizeTextInput(body.accountName) || normalizeTextInput(fallbackBankInfo.accountName),
    accountNumber:
      normalizeTextInput(body.accountNumber) || normalizeTextInput(fallbackBankInfo.accountNumber),
    bankName: normalizeTextInput(body.bankName) || normalizeTextInput(fallbackBankInfo.bankName),
    tickets: tickets.length ? tickets : [{ type: '', price: '', quantity: '' }],
    seatSections
  };
};

const renderCreateEventPage = (
  req,
  res,
  { statusCode = 200, formData = {}, fieldErrors = {}, formErrorMessage = '', formToastMessage = '' } = {}
) => {
  const normalizedFieldErrors = { ...fieldErrors };

  if (formErrorMessage) {
    const inferredField = resolveCreateEventErrorField(formErrorMessage);
    if (inferredField && !normalizedFieldErrors[inferredField]) {
      normalizedFieldErrors[inferredField] = formErrorMessage;
    }
  }

  const toastMessage =
    formToastMessage ||
    formErrorMessage ||
    (Object.keys(normalizedFieldErrors).length ? 'Vui lòng kiểm tra lại các thông tin còn thiếu.' : '');

  return res.status(statusCode).render('organizer/dashboard/events/create', {
    pageTitle: 'Tạo sự kiện',
    user: req.user,
    isAdminCreatingForOrganizer: false,
    formData: buildCreateEventFormData(formData, req.user),
    fieldErrors: normalizedFieldErrors,
    formErrorMessage,
    formToastMessage: toastMessage
  });
};

const OrganizerOrderController = {
  getCreateEventPage: async (req, res) => renderCreateEventPage(req, res),

  handleCreateEventUploadError: (err, req, res, next) => {
    const uploadMessage =
      err?.code === 'LIMIT_FILE_SIZE'
        ? 'Mỗi ảnh tải lên phải nhỏ hơn hoặc bằng 5MB.'
        : err?.message || 'Không thể tải ảnh lên. Vui lòng thử lại.';

    return renderCreateEventPage(req, res, {
      statusCode: 400,
      formData: req.body,
      formErrorMessage: uploadMessage
    });
  },

  getDashboard: async (req, res) => {
    try {
      const notifications = await Notification.find({ userId: req.user._id })
        .populate('eventId', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      const rawEvents = await Event.find({ organizer: req.user._id }).sort({ createdAt: -1 }).lean();
      const events = rawEvents.map(enrichOrganizerEvent);
      const eventIds = events.map((event) => event._id);
      const eventCounts = buildEventCounts(events);

      const [recentOrders, orderStats] = await Promise.all([
        Order.find({ eventId: { $in: eventIds } })
          .populate('userId', 'name avatar')
          .populate('eventId', 'name')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
        Order.aggregate([
          { $match: { eventId: { $in: eventIds } } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              paidOrders: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, 1, 0] } },
              totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$totalAmount', 0] } }
            }
          }
        ])
      ]);

      const totalTickets = events.reduce((sum, event) => sum + Number(event.totalTickets || 0), 0);
      const totalTicketsSold = events.reduce((sum, event) => sum + Number(event.totalSold || 0), 0);
      const totalRevenue = orderStats[0]?.totalRevenue || 0;
      const totalOrders = orderStats[0]?.totalOrders || 0;
      const paidOrders = orderStats[0]?.paidOrders || 0;

      return res.render('organizer/dashboard/index', {
        pageTitle: 'Bảng điều khiển nhà tổ chức',
        user: req.user,
        notifications,
        recentEvents: events.slice(0, 5),
        recentOrders,
        stats: {
          totalEvents: events.length,
          totalOrders,
          paidOrders,
          totalRevenue,
          totalTickets,
          totalTicketsSold,
          fillRate: totalTickets > 0 ? Math.round((totalTicketsSold / totalTickets) * 100) : 0,
          pendingEvents: eventCounts.pending || 0,
          rejectedEvents: eventCounts.rejected || 0,
          upcomingEvents: eventCounts.upcoming || 0,
          ongoingEvents: eventCounts.ongoing || 0,
          endedEvents: eventCounts.ended || 0
        }
      });
    } catch (err) {
      logger.error('Organizer getDashboard error:', err);
      return res.status(500).render('clients/page/error/500');
    }
  },

  getEventsPage: async (req, res) => {
    try {
      const notifications = await Notification.find({ userId: req.user._id })
        .populate('eventId', 'name')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();

      const q = (req.query.q || '').trim().toLowerCase();
      const status = (req.query.status || '').trim().toLowerCase();
      const rawEvents = await Event.find({ organizer: req.user._id }).sort({ createdAt: -1 }).lean();
      const allEvents = rawEvents.map(enrichOrganizerEvent);
      const counts = buildEventCounts(allEvents);
      const events = allEvents.filter((event) => {
        const matchesStatus = !status || status === 'all' || event.displayStatus === status;
        const matchesKeyword =
          !q ||
          String(event.name || '').toLowerCase().includes(q) ||
          String(event.location || '').toLowerCase().includes(q);
        return matchesStatus && matchesKeyword;
      });

      res.render('organizer/dashboard/events/index', {
        pageTitle: 'Sự kiện của tôi',
        user: req.user,
        events,
        counts,
        notifications,
        filters: { q, status },
        created: req.query.created === '1'
      });
    } catch (err) {
      logger.error('Organizer getEventsPage error:', err);
      res.status(500).render('clients/page/error/500');
    }
  },

  createEvent: [
    body('name').trim().isLength({ min: 5 }).withMessage('Tên sự kiện tối thiểu 5 ký tự'),
    body('description')
      .trim()
      .isLength({ min: 20 })
      .withMessage('Mô tả sự kiện cần chi tiết hơn'),
    body('dateStart').isISO8601().withMessage('Ngày bắt đầu không hợp lệ'),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return renderCreateEventPage(req, res, {
          statusCode: 400,
          formData: req.body,
          fieldErrors: buildCreateEventFieldErrors(errors.array()),
          formErrorMessage: 'Vui lòng kiểm tra lại các trường bắt buộc.'
        });
      }

      try {
        if ((req.user.role || '').toLowerCase() !== 'organizer') {
          return renderCreateEventPage(req, res, {
            statusCode: 403,
            formData: req.body,
            formErrorMessage: 'Chỉ organizer mới được tạo sự kiện.',
            message: 'Chỉ organizer mới được tạo sự kiện'
          });
        }

        const newEvent = await createUnifiedEvent({
          body: req.body,
          organizerId: req.user._id,
          status: 'pending',
          files: req.files
        });

        await sendAdminNotification({
          type: 'new_event_pending',
          eventId: newEvent._id,
          eventName: newEvent.name,
          organizerName: req.user.name
        });

        logger.info(
          `Organizer ${req.user.name} tạo sự kiện mới "${newEvent.name}" - seating=${newEvent.seating?.mode || 'general_admission'}`
        );

        return res.redirect('/organizer/events?created=1');
      } catch (err) {
        logger.error('Organizer createEvent error:', err);
        return renderCreateEventPage(req, res, {
          statusCode: err.status || 500,
          formData: req.body,
          formErrorMessage: err.message || 'Lỗi server khi tạo sự kiện.',
          message: err.message || 'Lỗi server khi tạo sự kiện'
        });
      }
    }
  ],

  getOrders: async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;
      const statusFilter = String(req.query.status || 'all').toLowerCase();

      const myEventIds = await Event.find({ organizer: req.user.id }).distinct('_id');
      const query = { eventId: { $in: myEventIds } };

      if (statusFilter !== 'all' && ORDER_STATUS_MAP[statusFilter]) {
        query.status = ORDER_STATUS_MAP[statusFilter];
      }

      const [orders, total, statsData] = await Promise.all([
        Order.find(query)
          .populate('userId', 'name avatar')
          .populate('eventId', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Order.countDocuments(query),
        Order.aggregate([
          { $match: { eventId: { $in: myEventIds } } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              paidOrders: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, 1, 0] } },
              pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
              totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$totalAmount', 0] } }
            }
          }
        ])
      ]);

      const stats =
        statsData[0] || { totalOrders: 0, paidOrders: 0, pendingOrders: 0, totalRevenue: 0 };

      res.render('organizer/dashboard/order/index', {
        pageTitle: 'Quản lý đơn hàng',
        user: req.user,
        orders,
        stats,
        statusFilter,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit))
      });
    } catch (err) {
      logger.error('Organizer getOrders error:', err);
      res.status(500).render('clients/page/error/500');
    }
  },

  getSalesHistory: async (req, res) => {
    try {
      const myEvents = await Event.find({ organizer: req.user.id }).distinct('_id');

      const orders = await Order.find({ eventId: { $in: myEvents } })
        .populate('userId', 'name email')
        .populate('eventId', 'name')
        .sort({ createdAt: -1 });

      const stats = {
        totalOrders: orders.length,
        paidOrders: orders.filter((order) => order.status === 'PAID').length
      };

      res.render('organizer/dashboard/order/index', {
        pageTitle: 'Lịch sử bán hàng',
        user: req.user,
        orders,
        stats
      });
    } catch (error) {
      logger.error('Organizer getSalesHistory error:', error);
      res.status(500).send('Lỗi truy xuất dữ liệu bán hàng');
    }
  },

  // ============================================================
  // WITHDRAWAL - Yêu cầu rút tiền
  // ============================================================

  // Trang tổng quan tài chính
  getFinancialOverview: async (req, res) => {
    try {
      const [balance, organizerWithdrawals] = await Promise.all([
        getOrganizerBalance(req.user.id),
        Withdrawal.find({ organizerId: req.user.id })
          .select('amount netAmount status createdAt paymentMethod bankAccount adminNote')
          .sort({ createdAt: -1 })
          .lean()
      ]);

      const withdrawalStats = summarizeWithdrawals(organizerWithdrawals);
      const topEventRevenues = [...(balance.eventRevenues || [])]
        .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
        .slice(0, 6);

      res.render('organizer/dashboard/finance', {
        pageTitle: 'Tài chính',
        user: req.user,
        balance,
        withdrawalStats,
        topEventRevenues
      });
    } catch (err) {
      logger.error('Organizer getFinancialOverview error:', err);
      res.status(500).render('clients/page/error/500');
    }
  },

  // Trang lịch sử rút tiền
  getWithdrawalHistory: async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = 10;
      const rawStatusFilter = String(req.query.status || 'all').trim().toLowerCase();
      const statusFilter = WITHDRAWAL_STATUS_MAP[rawStatusFilter] !== undefined ? rawStatusFilter : 'all';
      const status = WITHDRAWAL_STATUS_MAP[statusFilter];

      const [{ withdrawals, pagination }, balance, organizerWithdrawals] = await Promise.all([
        getWithdrawals({
          page,
          limit,
          organizerId: req.user.id,
          status
        }),
        getOrganizerBalance(req.user.id),
        Withdrawal.find({ organizerId: req.user.id })
          .select('amount netAmount status createdAt')
          .sort({ createdAt: -1 })
          .lean()
      ]);

      const stats = summarizeWithdrawals(organizerWithdrawals);

      res.render('organizer/dashboard/withdrawal', {
        pageTitle: 'Lịch sử rút tiền',
        user: req.user,
        withdrawals,
        balance,
        filters: { status: statusFilter },
        pagination,
        stats
      });
    } catch (err) {
      logger.error('Organizer getWithdrawalHistory error:', err);
      res.status(500).render('clients/page/error/500');
    }
  },

  // API: Yêu cầu rút tiền
  requestWithdrawal: async (req, res) => {
    try {
      const { amount, paymentMethod, bankAccount } = req.body;
      const normalizedBankAccount = {
        bankName: String(bankAccount?.bankName || '').trim(),
        accountNumber: String(bankAccount?.accountNumber || '').trim(),
        accountName: String(bankAccount?.accountName || '').trim()
      };

      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Số tiền không hợp lệ' });
      }

      if (
        paymentMethod === 'bank_transfer' &&
        (!normalizedBankAccount.bankName ||
          !normalizedBankAccount.accountNumber ||
          !normalizedBankAccount.accountName)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập đầy đủ thông tin tài khoản ngân hàng'
        });
      }

      if (
        normalizedBankAccount.bankName ||
        normalizedBankAccount.accountNumber ||
        normalizedBankAccount.accountName
      ) {
        await User.findByIdAndUpdate(req.user.id, { bankInfo: normalizedBankAccount });
      }

      const withdrawal = await requestWithdrawal({
        organizerId: req.user.id,
        amount: Number(amount),
        paymentMethod: paymentMethod || 'bank_transfer',
        bankAccount: normalizedBankAccount
      });

      logger.info(`Organizer ${req.user.name} requested withdrawal of ${amount}`);

      res.json({ success: true, message: 'Yêu cầu rút tiền đã được gửi', withdrawal });
    } catch (err) {
      logger.error('Organizer requestWithdrawal error:', err);
      res.status(err.status || 500).json({ success: false, message: err.message });
    }
  },

  // API: Cập nhật thông tin tài khoản ngân hàng
  updateBankInfo: async (req, res) => {
    try {
      const { bankName, accountNumber, accountName } = req.body;

      await User.findByIdAndUpdate(req.user.id, {
        bankInfo: { bankName, accountNumber, accountName }
      });

      res.json({ success: true, message: 'Đã cập nhật thông tin tài khoản' });
    } catch (err) {
      logger.error('Organizer updateBankInfo error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

export default OrganizerOrderController;
