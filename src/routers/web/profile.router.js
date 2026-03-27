import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import multer from "multer";
import { storage } from "../../config/cloudinary.js";
import User from "../../models/user.models.js";
import orderController from "../../controllers/order.controller.js";

const router = express.Router();

const upload = multer({ storage });

const updateProfileHandler = async (req, res) => {
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
};

router.get("/profile", authMiddleware, (req, res) => {
  if (!req.user) return res.redirect("/login");

  res.render("clients/page/profile/index", {
    pageTitle: "Hồ sơ người dùng",
    user: req.user,
  });
});

router.get("/verify-profile", authMiddleware, (req, res) => {
  if (!req.user) return res.redirect("/login");

  res.render("clients/page/auth/verify-profile", {
    pageTitle: "Xác minh thông tin",
    user: req.user,
    redirectUrl: req.query.redirect || "/events",
    bookingData: req.query.booking || "",
  });
});

router.put(
  "/update",
  authMiddleware,
  upload.single("avatarFile"),
  updateProfileHandler
);

router.put(
  "/profile/update",
  authMiddleware,
  upload.single("avatarFile"),
  updateProfileHandler
);

router.get("/profile/orders", authMiddleware, orderController.getOrderHistory);

export default router;
