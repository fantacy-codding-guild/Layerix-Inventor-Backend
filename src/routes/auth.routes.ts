import { Router } from 'express';
import {
    signup,
    verifyOTPAndSetPassword,
    login,
    refreshToken,
    forgotPassword,
    verifyResetOTP,
    resetPassword,
} from '../controllers/auth.controller';

import { forceResetPassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/signup', signup);
router.post('/verify-otp', verifyOTPAndSetPassword);
router.post('/login', login);
router.post('/refresh', refreshToken);

// Forgot password
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOTP);
router.post('/reset-password', resetPassword);

router.post('/force-reset-password', authenticate, forceResetPassword);

export default router;