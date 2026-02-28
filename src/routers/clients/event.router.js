import express from "express";
import EventController from "../../controllers/event.controller.js";
import { param, query } from "express-validator";

const router = express.Router();
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('client/pages/error/400', {
      pageTitle: 'Lỗi yêu cầu',
      message: 'ID sự kiện không hợp lệ',
      errors: errors.array()
    });
  }
  next();
};

// Áp dụng
router.get('/events/:id', [
  param('id').isMongoId().withMessage('ID sự kiện không hợp lệ'),
  handleValidationErrors,
  query('includeTickets').optional().isBoolean().withMessage('includeTickets phải là boolean')
], EventController.detail);

export default router;
