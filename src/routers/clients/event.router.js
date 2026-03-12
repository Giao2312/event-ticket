// src/routers/web/event.router.js
import express from "express";
import eventController from "../../controllers/event.controller.js";

import { param, validationResult } from "express-validator";

const router = express.Router();

const validateId = [
  param('id').isMongoId().withMessage('ID sự kiện không hợp lệ'),
  (req, res, next) => {
    if (!validationResult(req).isEmpty()) return res.redirect('/404'); // Với web, lỗi ID nên redirect về trang lỗi
    next();
  }
];

// --- CÁC ROUTE TRẢ VỀ GIAO DIỆN (VIEW) ---
router.get('/', eventController.getAllWeb);
router.get('/category/:slug?', eventController.category);
router.get('/booking', eventController.booking);
router.get('/confirm', eventController.confirmBooking);
router.get('/:id', validateId, eventController.detail);


export default router;
