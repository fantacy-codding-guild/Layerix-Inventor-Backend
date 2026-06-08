//backend\src\utils\mailer.ts
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

const getTransporter = async () => {
    // If real SMTP is configured, use it
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const options: SMTPTransport.Options = {
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        };
        return nodemailer.createTransport(options);
    }
    // Fallback to Ethereal (fake emails) for development
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
            user: testAccount.user,
            pass: testAccount.pass,
        },
    });
};

export const sendOTPEmail = async (email: string, otp: string) => {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Layerix Inventory" <no-reply@layerixnetworks.com>',
        to: email,
        subject: 'Your Verification Code',
        text: `Your OTP is: ${otp}. It expires in 10 minutes.`,
        html: `<p>Your OTP is: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p>`,
    });

    console.log('Message sent: %s', info.messageId);
    if (!process.env.SMTP_HOST) {
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }
};