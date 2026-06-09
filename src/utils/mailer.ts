//backend\src\utils\mailer.ts

import { Resend } from 'resend';

// Create a Resend instance only if the API key is provided
const resendApiKey = process.env.RESEND_API_KEY;
let resend: Resend | null = null;
if (resendApiKey) {
    resend = new Resend(resendApiKey);
}

export const sendOTPEmail = async (email: string, otp: string) => {
    // If Resend is configured, send a real email
    if (resend) {
        try {
            await resend.emails.send({
                from: process.env.SMTP_FROM || 'Layerix Inventory <sales@layerixnetworks.com>',
                to: email,
                subject: 'Your Verification Code',
                text: `Your OTP is: ${otp}. It expires in 10 minutes.`,
                html: `<p>Your OTP is: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p>`,
            });
            console.log(`OTP email sent to ${email}`);
        } catch (error) {
            console.error('Failed to send OTP email:', error);
            // Fallback – log OTP to console
            console.log(`[DEV OTP] ${email} → ${otp}`);
        }
    } else {
        // No API key – log OTP to console for development
        console.log(`[DEV OTP] ${email} → ${otp}`);
    }
};