import jwt from "jsonwebtoken";
import User from "../models/user.models.js";
import logger from "../utils/logger.js";
import errorMiddleware from "./error.middleware.js"; 


export const authMiddleware = async (req,res,next)=>{
  try{

    const token = req.cookies.token;

    // console.log("TOKEN:", token)

    if(!token) return next()

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // console.log("DECODED:", decoded)

    const user = await User.findById(decoded.id)

    // console.log("USER:", user)

    req.user = user
    res.locals.user = user

    next()

  }catch(err){

    console.log("JWT ERROR:", err.message)

    next()
  }
};


export const isAdmin = async (req, res, next) => {
    if (!req.user) {
        return next(new errorMiddleware.AuthFailureError("Bạn cần đăng nhập"));
    }
    if (req.user.role !== 'admin' && req.user.isAdmin !== true) {
        return next(new errorMiddleware.ForbiddenError("Bạn không có quyền truy cập"));
    }
    next();
};


export const verifyToken = async (req, res) => {
    try {
        const token = req.cookies.accessToken;

        if (!token) {
            return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);


        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Người dùng không tồn tại' });
        }


        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {

        res.clearCookie('accessToken');
        res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
    }
};

