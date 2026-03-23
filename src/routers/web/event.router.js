// routes/client/events.router.js
import express from "express";
import eventController from "../../controllers/event.controller.js";
import { param, validationResult } from "express-validator";
import Event from "../../models/event.models.js";  
const router = express.Router();


router.use(async (req, res, next) => {
  try {
    const recentEvents = await Event.find()
      .sort({ date: 1 })
      .limit(10)
      .lean();

    res.locals.recentEvents = recentEvents;
    next();
  } catch (err) {
    console.error("Lỗi load recent events:", err);
    res.locals.recentEvents = [];
    next();
  }
});

router.get("/", eventController.getAllWeb);

router.get("/category/:slug?", eventController.category);

router.get("/booking", eventController.booking);
router.get("/confirm", eventController.confirmBooking);

const validateId = [
  param("id").isMongoId().withMessage("ID sự kiện không hợp lệ"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.redirect("/404");
    }
    next();
  },
];

router.get("/:id", validateId, eventController.detail);

export default router;
