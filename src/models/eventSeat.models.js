import mongoose from 'mongoose';

const eventSeatSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true
    },
    ticketTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    ticketTypeName: {
      type: String,
      trim: true,
      required: true
    },
    sectionName: {
      type: String,
      trim: true,
      required: true
    },
    sectionCode: {
      type: String,
      trim: true,
      uppercase: true,
      required: true
    },
    rowLabel: {
      type: String,
      trim: true,
      required: true
    },
    seatNumber: {
      type: Number,
      min: 1,
      required: true
    },
    seatLabel: {
      type: String,
      trim: true,
      required: true
    },
    seatKey: {
      type: String,
      trim: true,
      uppercase: true,
      required: true
    },
    rowIndex: {
      type: Number,
      min: 0,
      required: true
    },
    seatIndex: {
      type: Number,
      min: 0,
      required: true
    },
    status: {
      type: String,
      enum: ['available', 'held', 'sold', 'blocked'],
      default: 'available'
    },
    holdExpiresAt: {
      type: Date,
      default: null
    },
    heldByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null
    }
  },
  {
    timestamps: true
  }
);

eventSeatSchema.index({ eventId: 1, seatKey: 1 }, { unique: true });
eventSeatSchema.index({ eventId: 1, status: 1, ticketTypeId: 1 });

const EventSeat = mongoose.model('EventSeat', eventSeatSchema);

export default EventSeat;
