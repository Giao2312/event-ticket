import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import multer from "multer";
import { storage } from "../../config/cloudinary.js";
import User from "../../models/user.models.js";
import orderController from "../../controllers/order.controller.js";

const router = express.Router();

const upload = multer({ storage });

// Trang profile (render view)
router.get("/profile", authMiddleware, (req, res) => {
  if (!req.user) return res.redirect("/login");

  res.render("clients/page/profile/index", {
    pageTitle: "Hồ sơ người dùng",
    user: req.user,
  });
});

// API cập nhật profile
router.put(
  "/update",
  authMiddleware,
  upload.single("avatarFile"),
  async (req, res) => {
    try {
      const { name, phone, dob, address } = req.body;
      let avatarUrl = req.body.avatar;

      if (req.file) {
        avatarUrl = req.file.path;
      }

      const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        {
          $set: {
            name,
            phone,
            dob: dob ? new Date(dob) : null,
            address,
            avatar: avatarUrl,
          },
        },
        { new: true }
      );

      res.json({ success: true, message: "Cập nhật thành công", user: updatedUser });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: "Lỗi server" });
    }
  }
);

// Lịch sử đơn hàng (nếu gắn ở profile)
router.get("/profile/orders", authMiddleware, orderController.getOrderHistory);

export default router;
