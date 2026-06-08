import { Router } from 'express';
import { signup, verifyOTPAndSetPassword, login, refreshToken } from '../controllers/auth.controller';

const router = Router();
router.post('/signup', signup);
router.post('/verify-otp', verifyOTPAndSetPassword);
router.post('/login', login);
router.post('/refresh', refreshToken);

export default router;