import bcrypt from "bcryptjs";
import User from "../../models/user.models.js";
import { signToken } from "../../utils/jwt.js";

const authController = {

  // REGISTER
  register: async (req, res) => {
    try {
      const { name, email, password } = req.body;

      // 1. Check tồn tại
      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(400).json({ message: "Email đã tồn tại" });
      }

      // 2. Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // 3. Tạo user
      const user = await User.create({
        name,
        email,
        password: hashedPassword
      });

      // 4. Tạo token
      const token = signToken({
        id: user._id,
        role: user.role
      });

      res.status(201).json({
        message: "Đăng ký thành công",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      });

    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  },

  // LOGIN
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      // 1. Check user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ message: "Email hoặc mật khẩu sai" });
      }

      // 2. Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Email hoặc mật khẩu sai" });
      }

      // 3. Token
      const token = signToken({
        id: user._id,
        role: user.role
      });

      res.json({
        message: "Đăng nhập thành công",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });

    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  },

  // LOGOUT (frontend xử lý là chính)
  logout: async (req, res) => {
    res.json({ message: "Đăng xuất thành công" });
  }
};

export default authController;
