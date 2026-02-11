import { prisma } from "@/lib/prisma.js";
import { EmailStatus } from "@/generated/enums.js";
import { promises as fs } from "fs";
import { emailTemplates } from "@/utils/email-template-engine.js";
import dotenv from "dotenv";
dotenv.config();

export class EmailService {
	constructor(
		private emailProvider: any,
		private logger: any,
	) {}

	// Send receipt email
	async sendReceiptEmail(receiptId: string) {
		const receipt = await prisma.receipt.findUnique({
			where: { id: receiptId },
			include: {
				user: {
					select: {
						email: true,
						firstName: true,
						lastName: true,
					},
				},
			},
		});

		if (!receipt) {
			throw new Error(`Receipt ${receiptId} not found`);
		}

		// Idempotency check
		if (receipt.emailSent) {
			this.logger.info("Email already sent", { receiptId });
			return {
				alreadySent: true,
				sentAt: receipt.emailSentAt,
			};
		}

		if (!receipt.pdfGenerated || !receipt.pdfLocalPath) {
			throw new Error(`PDF not generated for receipt ${receiptId}`);
		}

		const user = receipt.user;
		const recipientEmail = user.email;

		try {
			const pdfBuffer = await fs.readFile(receipt.pdfLocalPath);

			const emailContent = this.composeReceiptEmail(receipt, user);

			const result = await this.emailProvider.send({
				from: process.env.EMAIL_FROM ?? "receipts@yourstore.com",
				to: recipientEmail,
				subject: emailContent.subject,
				html: emailContent.html,
				text: emailContent.text,
				attachments: [
					{
						filename: `receipt_${receipt.receiptNumber}.pdf`,
						content: pdfBuffer,
						contentType: "application/pdf",
					},
				],
			});

			// Update receipt
			await prisma.receipt.update({
				where: { id: receiptId },
				data: {
					emailSent: true,
					emailSentAt: new Date(),
					emailSendAttempts: {
						increment: 1,
					},
				},
			});

			// Log email delivery
			await prisma.emailLog.create({
				data: {
					receiptId,
					userId: receipt.userId,
					to: recipientEmail,
					from: process.env.EMAIL_FROM ?? "receipts@yourstore.com",
					subject: emailContent.subject,
					status: EmailStatus.SENT,
					messageId: result.messageId,
					sentAt: new Date(),
					expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
				},
			});

			this.logger.info("Receipt email sent", {
				receiptId,
				to: recipientEmail,
				messageId: result.messageId,
			});

			return {
				success: true,
				messageId: result.messageId,
			};
		} catch (error: any) {
			await prisma.receipt.update({
				where: { id: receiptId },
				data: {
					emailSendAttempts: {
						increment: 1,
					},
					emailLastError: error.message,
				},
			});

			const errorCategory = this.categorizeEmailError(error);

			await prisma.emailLog.create({
				data: {
					receiptId,
					userId: receipt.userId,
					to: recipientEmail,
					from: process.env.EMAIL_FROM ?? "receipts@yourstore.com",
					subject: `Receipt ${receipt.receiptNumber}`,
					status: EmailStatus.FAILED,
					attempts: receipt.emailSendAttempts + 1,
					error: {
						code: error.code,
						message: error.message,
						category: errorCategory,
					},
					lastAttemptAt: new Date(),
					expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
				},
			});

			if (errorCategory === "invalid_email") {
				await prisma.receipt.update({
					where: { id: receiptId },
					data: {
						emailPermanentFailure: true,
					},
				});
			}

			this.logger.error("Email send failed", {
				receiptId,
				to: recipientEmail,
				error,
				category: errorCategory,
			});

			throw error;
		}
	}

	// private composeReceiptEmail(receipt: any, user: any) {
	//     const firstName = user.firstName || 'Customer';
	//     const orderSnapshot = receipt.orderSnapshot as any;

	//     return {
	//         subject: `Your Receipt - Order ${orderSnapshot.orderNumber}`,

	//         html: `
	//             <h2>Thank you for your purchase!</h2>
	//             <p>Hi ${firstName},</p>
	//             <p>Your payment has been processed successfully. Please find your receipt attached.</p>

	//             <h3>Order Summary</h3>
	//             <p>Order Number: <strong>${orderSnapshot.orderNumber}</strong></p>
	//             <p>Receipt Number: <strong>${receipt.receiptNumber}</strong></p>
	//             <p>Total: <strong>$${(receipt.amount / 100).toFixed(2)}</strong></p>

	//             <p>You can also download your receipt anytime from your account dashboard.</p>

	//             <p>Thank you for shopping with us!</p>
	//         `,

	//         text: `
	//             Thank you for your purchase!

	//             Hi ${firstName},

	//             Your payment has been processed successfully. Please find your receipt attached.

	//             Order Number: ${orderSnapshot.orderNumber}
	//             Receipt Number: ${receipt.receiptNumber}
	//             Total: $${(receipt.amount / 100).toFixed(2)}

	//             You can also download your receipt anytime from your account dashboard.

	//             Thank you for shopping with us!
	//         `
	//     };
	// }

	private composeReceiptEmail(receipt: any, user: any) {
		const orderSnapshot = receipt.orderSnapshot as any;
		const firstName = user.firstName ?? "Valued Customer";

		const formattedAmount = new Intl.NumberFormat("en-NG", {
			style: "currency",
			currency: receipt.currency ?? "NGN",
		}).format(receipt.amount / 100);

		const formattedDate = new Intl.DateTimeFormat("en-NG", {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}).format(receipt.paidAt);

		// Generate items HTML
		const itemsHTML = orderSnapshot.items
			.map(
				(item: any) => `
            <tr>
                <td class="item-name">${item.name}</td>
                <td class="item-quantity">${item.quantity}</td>
                <td class="item-price">${new Intl.NumberFormat("en-NG", {
									style: "currency",
									currency: receipt.currency ?? "NGN",
								}).format(item.totalPrice / 100)}
                </td>
            </tr>
        `,
			)
			.join("");

		// Generate items text
		const itemsText = orderSnapshot.items
			.map(
				(item: any) =>
					`- ${item.name} (Qty: ${item.quantity}) - ${new Intl.NumberFormat(
						"en-NG",
						{
							style: "currency",
							currency: receipt.currency ?? "NGN",
						},
					).format(item.totalPrice / 100)}`,
			)
			.join("\n");

		const data = {
			storeName: "Your Store Name",
			customerName: firstName,
			receiptNumber: receipt.receiptNumber,
			orderNumber: orderSnapshot.orderNumber,
			formattedDate,
			formattedAmount,
			itemsHTML,
			itemsText,
			dashboardUrl: "https://yourstore.com/account/receipts",
			storeAddress: "123 Business Street, Lagos, Nigeria",
			storeEmail: "support@yourstore.com",
			storePhone: "+234 123 456 7890",
			twitterUrl: "https://twitter.com/yourstore",
			facebookUrl: "https://facebook.com/yourstore",
			instagramUrl: "https://instagram.com/yourstore",
			year: new Date().getFullYear(),
		};

		return {
			subject: `Your Receipt - Order ${orderSnapshot.orderNumber}`,
			html: emailTemplates.render("receipt-html", data),
			text: emailTemplates.render("receipt-text", data),
		};
	}

	private categorizeEmailError(error: any): string {
		const message = error.message?.toLowerCase() ?? "";
		const code = error.code;

		if (
			message.includes("invalid") ||
			message.includes("does not exist") ||
			code === "EENVELOPE"
		) {
			return "invalid_email";
		}

		if (
			message.includes("timeout") ||
			message.includes("connection") ||
			code === "ETIMEDOUT" ||
			code === "ECONNECTION"
		) {
			return "server_error";
		}

		if (message.includes("rate limit") || message.includes("quota")) {
			return "rate_limit";
		}

		if (message.includes("too large") || message.includes("size")) {
			return "attachment_too_large";
		}

		return "unknown";
	}
}
