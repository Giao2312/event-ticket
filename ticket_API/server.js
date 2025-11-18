import express from 'express';
import connectDB from './src/config/db';
import dotenv from 'dotenv';
dotenv.config();


connectDB();
const app = express();
const PORT = process.env.PORT || 3000;