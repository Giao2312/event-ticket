import express from "express";
import apievent from './event.api.js';
import apiorder from './oder.api.js';
import apipayment from './payment.api.js';
import apinotification from './notification.api.js';

const router = express.Router();

router.use('/api/event' , apievent);
router.use('/api/order', apiorder);
router.use('/api/payment', apipayment);
router.use('/api/notifications', apinotification);

export default router ;
