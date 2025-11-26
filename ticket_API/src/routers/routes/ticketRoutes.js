import express from 'express';
import mongoose from 'mongoose';
import Ticket from '../../models/ticket.models.js';
import User from '../../models/user.models.js';

const router = express.Router();

// Helper: basic validation for create/update
function validateTicketPayload(body) {
  const errors = [];
  if (!body.title || typeof body.title !== 'string') errors.push('`title` is required and must be a string');
  if (!body.description || typeof body.description !== 'string') errors.push('`description` is required and must be a string');
  if (!body.date || isNaN(Date.parse(body.date))) errors.push('`date` is required and must be a valid date');
  if (body.price === undefined || typeof body.price !== 'number') errors.push('`price` is required and must be a number');
  if (!body.seat_number || typeof body.seat_number !== 'string') errors.push('`seat_number` is required and must be a string');
  if (body.user && !mongoose.Types.ObjectId.isValid(body.user)) errors.push('`user` must be a valid user id');
  return errors;
}

// GET /tickets - list tickets with pagination and optional available filter
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.available !== undefined) filter.available = req.query.available === 'true';

    const [items, total] = await Promise.all([
      Ticket.find(filter).populate('user', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Ticket.countDocuments(filter),
    ]);

    res.json({ page, limit, total, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// GET /tickets/:id - include user info
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const ticket = await Ticket.findById(req.params.id).populate('user', 'name email');
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// POST /tickets - create ticket (basic validation)
router.post('/', async (req, res) => {
  try {
    const errors = validateTicketPayload(req.body);
    if (errors.length) return res.status(400).json({ errors });

    if (req.body.user) {
      const user = await User.findById(req.body.user);
      if (!user) return res.status(400).json({ error: 'User not found' });
    }

    const ticket = new Ticket({
      title: req.body.title,
      description: req.body.description,
      date: new Date(req.body.date),
      user: req.body.user,
      status: req.body.status,
      price: req.body.price,
      seat_number: req.body.seat_number,
      available: req.body.available !== undefined ? !!req.body.available : true,
    });

    await ticket.save();
    const populated = await ticket.populate('user', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create ticket', details: err.message });
  }
});

// PUT /tickets/:id - update with validation
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const errors = validateTicketPayload({ ...req.body, // allow partial updates: skip required checks by providing defaults
      title: req.body.title ?? 'x',
      description: req.body.description ?? 'x',
      date: req.body.date ?? new Date().toISOString(),
      price: req.body.price ?? 0,
      seat_number: req.body.seat_number ?? 'x',
    });
    if (errors.length) return res.status(400).json({ errors });

    if (req.body.user) {
      const user = await User.findById(req.body.user);
      if (!user) return res.status(400).json({ error: 'User not found' });
    }

    const updated = await Ticket.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('user', 'name email');
    if (!updated) return res.status(404).json({ error: 'Ticket not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update ticket', details: err.message });
  }
});

// DELETE /tickets/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const removed = await Ticket.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ message: 'Ticket deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
});

export default router;
