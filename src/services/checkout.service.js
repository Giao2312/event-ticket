import mongoose from 'mongoose';
import QRCode from 'qrcode';
import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import Ticket from '../models/ticket.models.js';

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

const applyTicketHold = (event, orderItems) => {
  for (const item of orderItems) {
    const ticketType = event.ticketTypes.id(item.ticketTypeId);
    if (!ticketType) {
      throw createCheckoutError(`Vé không tồn tại cho ID: ${item.ticketTypeId}`);
    }
    ticketType.holded = Number(ticketType.holded || 0) + Number(item.quantity || 0);
  }
};

const releaseTicketHold = (event, orderItems) => {
  for (const item of orderItems) {
    const ticketType = event.ticketTypes.id(item.ticketTypeId);
    if (!ticketType) continue;
    ticketType.holded = Math.max(0, Number(ticketType.holded || 0) - Number(item.quantity || 0));
  }
};

const markTicketsSold = async ({ order, event, session }) => {
  const ticketsToCreate = [];

  for (const item of order.items) {
    const ticketType = event.ticketTypes.id(item.ticketTypeId);
    if (!ticketType) {
      throw createCheckoutError(`Không tìm thấy loại vé: ${item.ticketTypeId}`);
    }

    ticketType.holded = Math.max(0, Number(ticketType.holded || 0) - Number(item.quantity || 0));
    ticketType.sold = Math.min(
      Number(ticketType.quantity || 0),
      Number(ticketType.sold || 0) + Number(item.quantity || 0)
    );

    for (let i = 0; i < item.quantity; i += 1) {
      const qrData = `Ticket:${order._id}-${item.ticketTypeId}-${Date.now()}-${i}`;
      ticketsToCreate.push({
        user: order.userId,
        event: order.eventId,
        ticketType: ticketType.type || String(item.ticketTypeId),
        quantity: 1,
        price: item.price,
        status: 'paid',
        qrCode: await QRCode.toDataURL(qrData)
      });
    }
  }

  const createdTickets = await Ticket.insertMany(ticketsToCreate, { session });
  await event.save({ session });

  order.status = 'PAID';
  order.paidAt = new Date();
  order.paymentError = null;
  order.tickets = createdTickets.map((ticket) => ticket._id);
  await order.save({ session });

  return order;
};

export const createPendingOrder = async ({ userId, items, paymentMethod = 'momo' }) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const session = await mongoose.startSession();

    try {
      let createdOrderId = null;

      await session.withTransaction(async () => {
        const { eventId, currentEvent, orderItems, totalAmount } = await buildOrderItemsFromRequest(items, session);
        await enforcePerUserLimit({ userId, event: currentEvent, orderItems, session });
        applyTicketHold(currentEvent, orderItems);
        await currentEvent.save({ session });

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

      const event = await Event.findById(order.eventId).session(session);
      if (!event) throw createCheckoutError('Không tìm thấy sự kiện của đơn hàng');

      releaseTicketHold(event, order.items);
      await event.save({ session });

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
      if (order.status === 'PAID') {
        finalizedOrder = order;
        return;
      }
      if (!allowedStatuses.includes(order.status)) {
        throw createCheckoutError('Đơn hàng không ở trạng thái có thể xác nhận thanh toán');
      }

      const event = await Event.findById(order.eventId).session(session);
      if (!event) {
        throw createCheckoutError('Không tìm thấy sự kiện cho đơn hàng');
      }

      finalizedOrder = await markTicketsSold({ order, event, session });
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
