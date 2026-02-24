
import mongoose from 'mongoose';
import QRCode from 'qrcode'; 

const ticketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  ticketType: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
  qrCode: { type: String, unique: true }, // DataURL QR real
  purchasedAt: { type: Date, default: Date.now }
});

ticketSchema.index({ qrCode: 1 }, { unique: true });
ticketSchema.index({ event: 1, user: 1 });

ticketSchema.virtual('isValid').get(function () {
  return this.event.date > new Date(); 
});


ticketSchema.pre('save', async function (next) {
  if (!this.qrCode) {
    const qrData = { id: this._id, user: this.user, event: this.event, type: this.ticketType };
    this.qrCode = await QRCode.toDataURL(JSON.stringify(qrData));
  }
  next();
});

const Ticket = mongoose.model('Ticket', ticketSchema);

export default Ticket;
