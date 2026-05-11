import mongoose from 'mongoose';
import QRCode from 'qrcode';
import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import Ticket from '../models/ticket.models.js';
import { createTicketQRArtifact } from '../utils/ticketQR.js';

const CHECKOUT_HOLD_MINUTES = 15;
const MAX_RETRIES = 3;

export const getDynamicPerUserLimit = (eventAvailableTickets) => {
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

export const isTransientMongoError = (err) =>
  err?.errorLabels?.includes('TransientTransactionError') ||
  err?.errorLabels?.includes('UnknownTransactionCommitResult') ||
  err?.codeName === 'WriteConflict' ||
  err?.code === 112;

const createCheckoutError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const buildOrderItemsFromRequest = async (items, session) => {
  let totalAmount = 0;
  const orderItems = [];
  let eventId = null;
  let currentEvent = null;

  for (const item of items) {
    const event = await Event.findOne({ 'ticketTypes._id': item.ticketTypeId }).session(session);
    if (!event) {
      throw createCheckoutError(`Vé không tồn tại cho ID: ${item.ticketTypeId}`);
    }

    const ticketType = event.ticketTypes.id(item.ticketTypeId);
    if (!ticketType) {
      throw createCheckoutError(`Vé không tồn tại cho ID: ${item.ticketTypeId}`);
    }

    const holded = Number(ticketType.holded || 0);
    const available = Number(ticketType.quantity || 0) - Number(ticketType.sold || 0) - holded;
    if (available < item.quantity) {
      throw createCheckoutError(`Không đủ số lượng vé cho loại: ${ticketType.type}`);
    }

    if (!eventId) eventId = event._id;
    if (eventId.toString() !== event._id.toString()) {
      throw createCheckoutError('Tất cả vé trong một đơn hàng phải thuộc cùng một sự kiện');
    }

    currentEvent = event;
    totalAmount += Number(ticketType.price || 0) * Number(item.quantity || 0);
    orderItems.push({
      ticketTypeId: ticketType._id,
      quantity: Number(item.quantity || 0),
      price: Number(ticketType.price || 0)
    });
  }

  if (!eventId || !currentEvent) {
    throw createCheckoutError('Không thể xác định sự kiện từ danh sách vé');
  }

  return { eventId, currentEvent, orderItems, totalAmount };
};

const enforcePerUserLimit = async ({ userId, event, orderItems, session }) => {
  const totalRequestedTickets = orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalEventAvailable = (event.ticketTypes || []).reduce((sum, ticketType) => {
    const quantity = Number(ticketType.quantity || 0);
    const sold = Number(ticketType.sold || 0);
    const holded = Number(ticketType.holded || 0);
    return sum + Math.max(0, quantity - sold - holded);
  }, 0);

  const perUserLimit = getDynamicPerUserLimit(totalEventAvailable);

  const existingOrdersAgg = await Order.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
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
  ]).session(session);

  const alreadyReservedTickets = Number(existingOrdersAgg[0]?.total || 0);
  const remainingAllowance = Math.max(0, perUserLimit - alreadyReservedTickets);

  if (remainingAllowance <= 0) {
    throw createCheckoutError(`Bạn đã đạt giới hạn ${perUserLimit} vé cho sự kiện này`);
  }

  if (totalRequestedTickets > remainingAllowance) {
    throw createCheckoutError(`Bạn chỉ có thể mua thêm tối đa ${remainingAllowance} vé cho sự kiện này`);
  }
};

// ============================================================
// ATOMIC TICKET HOLD - Ngăn chặn race condition khi 2 người cùng bấm "Thanh toán"
// Sử dụng MongoDB Transaction + atomic $inc operator
// Transaction đảm bảo các request đồng thời được xử lý tuần tự ở document level
// $inc là atomic operator - không có race condition
// ============================================================
const applyTicketHoldAtomic = async (eventId, orderItems, session) => {
  // Tìm event trong transaction - document sẽ bị lock cho đến khi transaction kết thúc
  const event = await Event.findById(eventId).session(session);

  for (const item of orderItems) {
    const ticketType = event.ticketTypes.id(item.ticketTypeId);
    if (!ticketType) {
      throw createCheckoutError(`Vé không tồn tại cho ID: ${item.ticketTypeId}`);
    }

    // Kiểm tra available tại thời điểm hiện tại (trong transaction)
    // Do document đã bị lock by transaction, nên đây là giá trị mới nhất
    const available = Number(ticketType.quantity || 0)
                    - Number(ticketType.sold || 0)
                    - Number(ticketType.holded || 0);

    if (available < item.quantity) {
      throw createCheckoutError('Rất tiếc, vé cuối cùng vừa được mua bởi người khác');
    }

    // Tăng holded bằng atomic $inc
    // Query đảm bảo chỉ update nếu ticketType còn tồn tại
    const result = await Event.updateOne(
      {
        _id: eventId,
        'ticketTypes._id': item.ticketTypeId
      },
      {
        $inc: { 'ticketTypes.$.holded': item.quantity }
      }
    ).session(session);

    if (result.modifiedCount === 0) {
      throw createCheckoutError('Vé không tồn tại hoặc đã hết');
    }
  }
};

// ============================================================
// ATOMIC TICKET RELEASE - Giải phóng vé khi hủy đơn
// ============================================================
const releaseTicketHoldAtomic = async (eventId, orderItems, session) => {
  for (const item of orderItems) {
    // Giảm holded nguyên tử bằng $inc (âm)
    await Event.updateOne(
      {
        _id: eventId,
        'ticketTypes._id': item.ticketTypeId
      },
      {
        $inc: { 'ticketTypes.$.holded': -item.quantity }
      }
    ).session(session);
  }
};

// ============================================================
// ATOMIC MARK SOLD - Chuyển từ holded sang sold khi thanh toán thành công
// ============================================================
const markTicketsSoldAtomic = async (eventId, orderItems, session) => {
  for (const item of orderItems) {
    // Tăng sold và giảm holded trong cùng 1 lệnh $inc
    await Event.updateOne(
      {
        _id: eventId,
        'ticketTypes._id': item.ticketTypeId
      },
      {
        $inc: {
          'ticketTypes.$.sold': item.quantity,
          'ticketTypes.$.holded': -item.quantity
        }
      }
    ).session(session);
  }
};


export const createPendingOrder = async ({ userId, items, paymentMethod = 'momo' }) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const session = await mongoose.startSession();

    try {
      let createdOrderId = null;

      await session.withTransaction(async () => {
        // Bước 1: Validate các item, kiểm tra sự kiện tồn tại (không tăng holded ở bước này)
        const { eventId, currentEvent, orderItems, totalAmount } = await buildOrderItemsFromRequest(items, session);

        // Bước 2: Kiểm tra giới hạn vé per-user
        await enforcePerUserLimit({ userId, event: currentEvent, orderItems, session });

        // Bước 3: ATOMIC HOLD - Tăng holded nguyên tử cho từng loại vé
        // Nếu vé cuối cùng đã được người khác mua, sẽ throw ngay lập tức
        await applyTicketHoldAtomic(eventId, orderItems, session);

        // Bước 4: Tạo đơn hàng
        const order = new Order({
          userId,
          eventId,
          items: orderItems,
          totalAmount,
          paymentMethod,
          holdUntil: new Date(Date.now() + CHECKOUT_HOLD_MINUTES * 60 * 1000)
        });

        await order.save({ session });
        createdOrderId = order._id;
      });

      return createdOrderId;
    } catch (err) {
      if (!isTransientMongoError(err) || attempt === MAX_RETRIES) {
        throw err;
      }
    } finally {
      await session.endSession();
    }
  }

  throw createCheckoutError('Không thể tạo đơn hàng lúc này, vui lòng thử lại');
};

export const releasePendingOrder = async ({ orderId, userId, markAs = 'CANCELLED' }) => {
  const session = await mongoose.startSession();

  try {
    let updatedOrder = null;

    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: orderId, userId }).session(session);
      if (!order) throw createCheckoutError('Không tìm thấy đơn hàng', 404);
      if (order.status !== 'PENDING') {
        throw createCheckoutError('Chỉ có thể hủy đơn hàng đang chờ thanh toán');
      }

      // ATOMIC RELEASE - Giải phóng holded nguyên tử
      await releaseTicketHoldAtomic(order.eventId, order.items, session);

      order.status = markAs;
      await order.save({ session });
      updatedOrder = order;
    });

    return updatedOrder;
  } finally {
    await session.endSession();
  }
};

export const expirePendingOrders = async () => {
  const now = new Date();
  const expiredOrders = await Order.find({ status: 'PENDING', holdUntil: { $lt: now } }).lean();

  for (const order of expiredOrders) {
    await releasePendingOrder({
      orderId: order._id,
      userId: order.userId,
      markAs: 'EXPIRED'
    }).catch(() => null);
  }

  return expiredOrders.length;
};

export const finalizePaidOrder = async ({ orderId, allowedStatuses = ['PENDING', 'PAYMENT_FAILED'] }) => {
  const session = await mongoose.startSession();

  try {
    let finalizedOrder = null;

    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw createCheckoutError('Không tìm thấy đơn hàng', 404);
      if (order.status === 'PAID' || order.status === 'PROCESSING') {
        finalizedOrder = order;
        return;
      }
      if (!allowedStatuses.includes(order.status)) {
        throw createCheckoutError('Đơn hàng không ở trạng thái có thể xác nhận thanh toán');
      }

      // ATOMIC MARK SOLD - Chuyển holded -> sold nguyên tử
      await markTicketsSoldAtomic(order.eventId, order.items, session);

      // Cập nhật trạng thái PROCESSING - chờ admin duyệt trước khi tạo vé
      order.status = 'PROCESSING';
      order.paidAt = new Date();
      order.paymentError = null;
      await order.save({ session });

      finalizedOrder = order;
    });

    return finalizedOrder;
  } catch (error) {
    await Order.findByIdAndUpdate(orderId, {
      status: 'PAYMENT_FAILED',
      paymentError: error.message
    });
    throw error;
  } finally {
    await session.endSession();
  }
};

// ============================================================
// APPROVE ORDER - Admin duyệt order và tạo vé
// ============================================================
export const approveOrder = async ({ orderId, adminId }) => {
  const session = await mongoose.startSession();

  try {
    let approvedOrder = null;

    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw createCheckoutError('Không tìm thấy đơn hàng', 404);
      if (order.status !== 'PROCESSING') {
        throw createCheckoutError('Đơn hàng không ở trạng thái chờ duyệt');
      }

      // Tạo vé với signed JWT-based QR
      const ticketsToCreate = [];
      for (const item of order.items) {
        for (let i = 0; i < item.quantity; i += 1) {
          // Tạo ticket document trước để có _id
          const ticketData = {
            user: order.userId,
            event: order.eventId,
            ticketType: String(item.ticketTypeId),
            quantity: 1,
            price: item.price,
            status: 'paid'
          };
          ticketsToCreate.push(ticketData);
        }
      }

      const createdTickets = await Ticket.insertMany(ticketsToCreate, { session });

      // Gán signed JWT QR cho từng ticket sau khi có _id
      for (let i = 0; i < createdTickets.length; i += 1) {
        const ticket = createdTickets[i];
        // Tìm item tương ứng trong order
        let itemIndex = 0;
        let foundItem = null;
        let foundItemIndex = 0;
        for (const item of order.items) {
          for (let j = 0; j < item.quantity; j += 1) {
            if (itemIndex === i) {
              foundItem = item;
              foundItemIndex = j;
              break;
            }
            itemIndex += 1;
          }
          if (foundItem) break;
        }

        // Generate signed JWT QR token
        const { qrToken, qrTokenHash, qrJti } = createTicketQRArtifact({
          ticketId: ticket._id.toString(),
          orderId: order._id.toString(),
          eventId: order.eventId.toString(),
          userId: order.userId.toString(),
          ticketTypeId: foundItem?.ticketTypeId?.toString() || ticket.ticketType,
          index: foundItemIndex
        });

        // Update ticket với QR token (stored as string, not DataURL)
        ticket.qrToken = undefined;
        ticket.qrTokenHash = qrTokenHash;
        ticket.qrJti = qrJti;
        ticket.qrCode = await QRCode.toDataURL(qrToken); // Keep DataURL for backward compat if needed
        await ticket.save({ session });
      }

      order.status = 'PAID';
      order.tickets = createdTickets.map((ticket) => ticket._id);
      order.approvedBy = adminId;
      order.approvedAt = new Date();
      await order.save({ session });

      approvedOrder = order;
    });

    return approvedOrder;
  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};
