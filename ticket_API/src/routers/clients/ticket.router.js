import express from 'express';
import ticketControllers from '../../controllers/clients/ticket.controllers';

const router = express.Router();

router.get('/tickets/:orderId', ticketControllers.showTickets);

export default router;
