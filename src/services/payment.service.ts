import { prisma } from "@/lib/prisma.js";
import { OrderStatus, PaymentStatus } from "@/generated/enums.js";

export class PaymentService {
	constructor(private logger: any) {}

	// Record successful payment (atomic transaction)
	async recordSuccessfulPayment(params: {
		orderId: string;
		transactionId: string;
		amount: number;
		currency: string;
		webhookLogId: string;
	}) {
		const { orderId, transactionId, amount, currency, webhookLogId } = params;

		// Use Prisma transaction - all operations succeed or fail together
		const result = await prisma.$transaction(async (tx) => {
			// Get order details
			const order = await tx.order.findUnique({
				where: { id: orderId },
				include: {
					user: {
						select: { id: true, email: true },
					},
				},
			});

			if (!order) {
				throw new Error(`Order ${orderId} not found`);
			}

			// Create payment transaction record
			const transaction = await tx.paymentTransaction.create({
				data: {
					transactionId,
					orderId,
					userId: order.userId,
					storeId: order.storeId,
					provider: "paystack",
					amount,
					currency,
					status: PaymentStatus.SUCCEEDED,
					webhookLogId,
					succeededAt: new Date(),
				},
			});

			// Update order status
			await tx.order.update({
				where: { id: orderId },
				data: {
					status: OrderStatus.PAID,
					paidAt: new Date(),
				},
			});

			// Generate receipt number
			const receiptNumber = await this.generateReceiptNumber(order.storeId, tx);

			// Create receipt record
			const receipt = await tx.receipt.create({
				data: {
					receiptNumber,
					orderId,
					transactionId: transaction.id,
					userId: order.userId,
					storeId: order.storeId,
					orderSnapshot: this.createOrderSnapshot(order),
					paymentMethod: "card",
					paidAt: new Date(),
					amount,
					currency,
					emailRecipient: order.user.email,
					status: "PENDING",
				},
			});

			return {
				userId: order.userId,
				receiptId: receipt.id,
				transactionId: transaction.id,
			};
		});

		this.logger.info("Payment recorded successfully", {
			transactionId,
			orderId,
			receiptId: result.receiptId,
		});

		return result;
	}

	// Record failed payment
	async recordFailedPayment(params: {
		orderId: string;
		transactionId: string;
		webhookLogId: string;
	}) {
		const { orderId, transactionId, webhookLogId } = params;

		const order = await prisma.order.findUnique({
			where: { id: orderId },
			select: {
				userId: true,
				storeId: true,
				total: true,
			},
		});

		if (!order) {
			throw new Error(`Order ${orderId} not found`);
		}

		await prisma.paymentTransaction.create({
			data: {
				transactionId,
				orderId,
				userId: order.userId,
				storeId: order.storeId,
				provider: "paystack",
				amount: order.total,
				currency: "NGN",
				status: PaymentStatus.FAILED,
				webhookLogId,
				failedAt: new Date(),
				failureReason: "Payment declined",
			},
		});

		this.logger.info("Payment failure recorded", { transactionId, orderId });
	}

	// Create immutable order snapshot for receipt
	private createOrderSnapshot(order: any): any {
		return {
			orderNumber: order.orderNumber,
			items: order.items, // Already JSON in database
			pricing: {
				subtotal: order.subtotal,
				tax: order.tax,
				shipping: order.shipping,
				discount: order.discount,
				total: order.total,
			},
			shippingAddress: order.shippingAddress,
		};
	}

	// Generate unique receipt number - Format: RCP-2026-000001
	private async generateReceiptNumber(
		storeId: string,
		tx: any,
	): Promise<string> {
		const year = new Date().getFullYear();

		// Count receipts for this store this year
		const count = await tx.receipt.count({
			where: {
				storeId,
				createdAt: {
					gte: new Date(`${year}-01-01`),
					lt: new Date(`${year + 1}-01-01`),
				},
			},
		});

		return `RCP-${year}-${String(count + 1).padStart(6, "0")}`;
	}
}
