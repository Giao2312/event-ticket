import dotenv from 'dotenv';
dotenv.config();
const env = {
  PORT: process.env.PORT || 5000,
  DB_URL: process.env.DB_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET

};
export default env;
