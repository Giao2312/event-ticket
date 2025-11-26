import express from 'express';
import authController from '../../controllers/clients/auth.controller.js';

const router = express.Router();

router.get('/register', authController.showRegister);
router.post('/register', authController.register);

router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

export default router;
