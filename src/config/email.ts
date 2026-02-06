import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Email transporter configuration
export const emailConfig = {
	host: process.env.EMAIL_HOST ?? "smtp.gmail.com",
	port: parseInt(process.env.EMAIL_PORT ?? "587"),
	secure: process.env.EMAIL_PORT === "465", // true for 465, false for other ports
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASSWORD,
	},
};

// Create email transporter
export const emailProvider = nodemailer.createTransport(emailConfig);

// Verify email configuration
emailProvider.verify((error, success) => {
	if (error) {
		console.error("Email configuration error:", error);
	} else {
		console.log("Email server ready");

		// return emailProvider.sendMail({
		// 	from: process.env.EMAIL_FROM,
		// 	to: process.env.EMAIL_USER, // Send to yourself
		// 	subject: 'Test Email from Receipt Generator',
		// 	text: 'If you receive this, your email configuration is working!',
		// 	html: '<h1>Success!</h1><p>Your email configuration is working!</p>',
		// });

	}
});
