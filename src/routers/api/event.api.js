import express from 'express';
import eventController from '../../controllers/event.controller.js';
import { uploadSingle } from "../../middlewares/upload.middlewares.js";
const router = express.Router();


router.get('/list', eventController.getAllApi); 
router.post('/create', uploadSingle, eventController.createEvent);

export default router;
