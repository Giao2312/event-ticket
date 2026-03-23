import express from "express";
import homeController from "../../controllers/home.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import Event from "../../models/event.models.js"; // import tĩnh

const router = express.Router();

// Trang chủ
router.get("/", authMiddleware, homeController.index); // nếu controller xử lý chính

// Hoặc nếu bạn muốn logic inline (ưu tiên cái này nếu controller chưa đầy đủ)
router.get("/", async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 }).limit(10).lean();

    console.log("Render trang chủ với user:", req.user ? req.user.name : "null");

    res.render("clients/page/home/index", {
      pageTitle: "Trang chủ - EventVé",
      events,
      user: req.user || null,
    });
  } catch (err) {
    console.error(err);
    res.render("clients/page/home/index", {
      pageTitle: "Trang chủ - EventVé",
      events: [],
      user: req.user || null,
    });
  }
});

export default router;


