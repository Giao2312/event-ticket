import dotenv from 'dotenv';
dotenv.config();
const env = {
  PORT: process.env.PORT || 5000,
  DB_URL: process.env.DB_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  
  tmnCode: process.env.VNPAY_TMN_CODE,
  secureSecret: process.env.VNPAY_SECRET,
  vnpayHost: process.env.VNPAY_HOST,
  returnUrl: process.env.VNPAY_RETURN_URL,

  MOMO_ACCESS_KEY : process.env.MOMO_ACCESS_KEY,
  MOMO_SECRET_KEY: process.env.MOMO_SECRET_KEY,
  MOMO_PARTNER_CODE : process.env.MOMO_PARTNER_CODE,
  MOMO_API_URL: process.env.MOMO_API_URL ,
  MOMO_RETURN_URL : process.env.MOMO_RETURN_URL

};
export default env;
