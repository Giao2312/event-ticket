
import express from 'express';
import User from '../../models/user.models.js';
import { storage } from '../../config/cloudinary.js';
import orderHistoryController from "../../controllers/orderhistory.controller.js";
import authMiddleware from '../../middlewares/auth.middleware.js';
import multer from 'multer';  

const router = express.Router();
    router.get(
      "/profile",
      authMiddleware,
      orderHistoryController.getOrderHistory
    );

const upload = multer({ storage: storage });

router.put('/update', authMiddleware, upload.single('avatarFile'), async (req, res) => {
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
          avatar: avatarUrl
        }
      },
      { new: true }
    );

    res.json({ success: true, message: 'Cập nhật thành công', user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;


