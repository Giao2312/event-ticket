import express from "express";
import { register, login, logout } from "../../controllers/auth.controller.js";
import { loginRateLimiter, registerRateLimiter } from "../../middlewares/rateLimit.middleware.js";


const router = express.Router();

// Trang đăng nhập (render form)
router.get("/login", (req, res) => {
  console.log("Render trang login với user:", req.user ? req.user.name : "null");
  res.render("clients/page/auth/login", {
    pageTitle: "Đăng nhập - EventVé",
    user: req.user || null,
    errors: [],
    oldInput: {},
  });
});

// Trang đăng ký (render form)
router.get("/register", (req, res) => {
  res.render("clients/page/auth/register", {
    pageTitle: "Đăng ký - EventVé",
    user: req.user || null,
    errors: [],
    oldInput: {},
  });
});

// API endpoints
router.post("/api/auth/login", loginRateLimiter, login);
router.post("/api/auth/register", registerRateLimiter, register);
router.post("/api/auth/logout", logout);

export default router;


