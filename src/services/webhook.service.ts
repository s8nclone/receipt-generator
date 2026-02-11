import { prisma } from "@/lib/prisma.js";
import { WebhookOutcome } from "@/generated/enums.js";
import crypto from "crypto";
import { PaymentService } from "./payment.service.js";
import { OrderService } from "./order.service.js";
import { ReceiptService } from "./receipt.service.js";
import { QueueManager } from "@/queues/queue-manager.js";
import dotenv from "dotenv";
dotenv.config();

interface WebhookPayload {
	transaction_id: string;
	order_id: string;
	status: "succeeded" | "failed";
	amount: number;
	currency: string;
}

interface ServiceResult {
	success: boolean;
	type: string;
	message?: string;
	data?: any;
}

export class WebhookService {
	constructor(
		private readonly paymentService: PaymentService,
		private readonly orderService: OrderService,
		private readonly receiptService: ReceiptService,
		private readonly queueManager: QueueManager,
		private readonly logger: any,
	) {}

	// Validate webhook signature
	validateSignature(
		provider: string,
		payload: Buffer | any,
		signature?: string,
	): boolean {
		// Allow mock provider to pass
		if (provider === "mock") {
			return true;
		}

		// No signature? Fail fast, no crypto
		if (!signature) {
			return false;
		}

		const secret = this.getWebhookSecret(provider);

		const expectedSignature = crypto
			.createHmac("sha256", secret)
			.update(Buffer.isBuffer(payload) ? payload : JSON.stringify(payload))
			.digest("hex");

		return crypto.timingSafeEqual(
			Buffer.from(signature, "hex"),
			Buffer.from(expectedSignature, "hex"),
		);
	}

	private getWebhookSecret(provider: string): string {
		const secrets: Record<string, string> = {
			mock: "mock_secret_for_testing",
		};

		return secrets[provider] || "";
	}

	// Check for duplicate webhook
	async checkDuplicate(webhookId: string): Promise<boolean> {
		const existing = await prisma.webhookLog.findUnique({
			where: { webhookId },
			select: { id: true }, // Only need to know if exists
		});

		return existing !== null;
	}

	// Parse webhook payload
	parsePayload(provider: string, payload: any): WebhookPayload {
		if (provider === "paystack") {
			return {
				transaction_id: payload.data.object.id,
				order_id: payload.data.object.metadata.order_id,
				status:
					payload.type === "payment_intent.succeeded" ? "succeeded" : "failed",
				amount: payload.data.object.amount,
				currency: payload.data.object.currency,
			};
		}

		// Default/mock format
		return {
			transaction_id: payload.transaction_id,
			order_id: payload.order_id,
			status: payload.status,
			amount: payload.amount,
			currency: payload.currency,
		};
	}

	// Log webhook to database
	async logWebhook(data: {
		webhookId: string;
		provider: string;
		eventType?: string;
		payload: any;
		signature?: string;
		signatureValid: boolean;
		parsedData?: WebhookPayload;
		processed?: boolean;
		outcome?: WebhookOutcome;
	}) {
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 3); // 3 days from now

		return await prisma.webhookLog.create({
			data: {
				webhookId: data.webhookId,
				provider: data.provider,
				eventType: data.eventType ?? "unknown",
				rawPayload: data.payload,
				headers: {},
				signature: data.signature,
				signatureValid: data.signatureValid,
				processed: data.processed ?? false,
				orderId: data.parsedData?.order_id,
				transactionId: data.parsedData?.transaction_id,
				amount: data.parsedData?.amount,
				currency: data.parsedData?.currency,
				paymentStatus: data.parsedData?.status,
				outcome: data.outcome,
				expiresAt,
			},
		});
	}

	// Mark webhook as processed
	async markWebhookProcessed(webhookLogId: string, outcome: string) {
		await prisma.webhookLog.update({
			where: { id: webhookLogId },
			data: {
				processed: true,
				processedAt: new Date(),
				outcome: outcome.toUpperCase() as WebhookOutcome,
			},
		});
	}

	// Mark webhook as failed
	async markWebhookFailed(webhookLogId: string, errorMessage: string) {
		await prisma.webhookLog.update({
			where: { id: webhookLogId },
			data: {
				processed: false,
				outcome: "PROCESSING_FAILED",
				errorMessage,
				processingAttempts: {
					increment: 1,
				},
			},
		});
	}

	// Main webhook processing entry point
	// async processPaymentWebhook(
	// 	provider: string,
	// 	webhookId: string,
	// 	rawPayload: string,
	// 	signature: string,
	// ): Promise<ServiceResult> {
	// 	// Validate signature using RAW payload
	// 	const signatureValid = this.validateSignature(
	// 		provider,
	// 		rawPayload,
	// 		signature,
	// 	);

	// 	if (!signatureValid) {
	// 		await this.logWebhook({
	// 			webhookId,
	// 			provider,
	// 			payload: rawPayload,
	// 			signature,
	// 			signatureValid: false,
	// 			outcome: "VALIDATION_FAILED",
	// 		});

	// 		return {
	// 			success: false,
	// 			type: "invalid_signature",
	// 			message: "Webhook signature validation failed",
	// 		};
	// 	}

	// 	// Parse AFTER validation
	// 	const parsedData = this.parsePayload(provider, JSON.parse(rawPayload));

	// 	const { order_id, transaction_id, status, amount, currency } = parsedData;

	// 	// Check for duplicate
	// 	const isDuplicate = await this.checkDuplicate(webhookId);
	// 	if (isDuplicate) {
	// 		this.logger.info("Duplicate webhook detected", { webhookId });
	// 		return {
	// 			success: true,
	// 			type: "duplicate",
	// 			message: "Webhook already processed",
	// 			data: { webhookId },
	// 		};
	// 	}

	// 	// Log webhook
	// 	const webhookLog = await this.logWebhook({
	// 		webhookId,
	// 		provider,
	// 		eventType: `payment.${status}`,
	// 		payload: parsedData,
	// 		signature,
	// 		signatureValid: true,
	// 		parsedData,
	// 		processed: false,
	// 	});

	// 	// Process webhook
	// 	try {
	// 		if (status === "succeeded") {
	// 			const result = await this.handlePaymentSuccess({
	// 				orderId: order_id,
	// 				transactionId: transaction_id,
	// 				amount,
	// 				currency,
	// 				webhookLogId: webhookLog.id,
	// 			});

	// 			await this.markWebhookProcessed(webhookLog.id, "success");
	// 			return result;
	// 		}

	// 		if (status === "failed") {
	// 			const result = await this.handlePaymentFailure({
	// 				orderId: order_id,
	// 				transactionId: transaction_id,
	// 				webhookLogId: webhookLog.id,
	// 			});

	// 			await this.markWebhookProcessed(webhookLog.id, "success");
	// 			return result;
	// 		}

	// 		await this.markWebhookProcessed(webhookLog.id, "unknown_status");
	// 		return {
	// 			success: true,
	// 			type: "ignored",
	// 			message: `Webhook with status '${status}' was logged but not processed`,
	// 		};
	// 	} catch (error: any) {
	// 		this.logger.error("Webhook processing failed", {
	// 			error,
	// 			webhookId,
	// 			orderId: order_id,
	// 		});

	// 		await this.markWebhookFailed(webhookLog.id, error.message);
	// 		throw error;
	// 	}
	// }
	// async processPaymentWebhook(
	// 	provider: string,
	// 	webhookId: string,
	// 	payload: any,
	// 	signature?: string,
	// ): Promise<ServiceResult> {
	// 	if (provider === "mock") {
	// 		// if (!payload.order_id || !payload.transaction_id || !payload.status) {
	// 		// 	throw new Error("Invalid mock webhook payload");
	// 		// };

	// 		return this.processParsedWebhook({
	// 			webhookId,
	// 			provider,
	// 			parsedData: payload,
	// 			signatureValid: true,
	// 		});
	// 	}

	// 	if (!signature) {
	// 		throw new Error("No webhook signature");
	// 	}

	// 	const signatureValid = this.validateSignature(
	// 		provider,
	// 		payload,
	// 		signature!,
	// 	);

	// 	if (!signatureValid) {
	// 		await this.logWebhook({
	// 			webhookId,
	// 			provider,
	// 			payload,
	// 			signature,
	// 			signatureValid: false,
	// 			outcome: "VALIDATION_FAILED",
	// 		});

	// 		return {
	// 			success: false,
	// 			type: "invalid_signature",
	// 			message: "Webhook signature validation failed",
	// 		};
	// 	}

	// 	const parsedData = this.parsePayload(provider, JSON.parse(payload));

	// 	return this.processParsedWebhook({
	// 		webhookId,
	// 		provider,
	// 		parsedData,
	// 		signature,
	// 		signatureValid: true,
	// 	});
	// }
	async processPaymentWebhook(
    provider: string,
    webhookId: string,
    payload: any,
    signature?: string,
): Promise<ServiceResult> {
	console.log("processPaymentWebhook called with:", {
        provider,
        webhookId,
        payload: JSON.stringify(payload, null, 2),
        hasSignature: !!signature,
    });

    if (provider === "mock") {
        console.log("Processing as mock webhook");
        
        return this.processParsedWebhook({
            webhookId,
            provider,
            parsedData: payload,
            signatureValid: true,
        });
    }
    if (provider === "mock") {
        return this.processParsedWebhook({
            webhookId,
            provider,
            parsedData: payload,
            signatureValid: true,
        });
    }

    if (!signature) {
        throw new Error("No webhook signature");
    }

    const signatureValid = this.validateSignature(
        provider,
        payload,
        signature!,
    );

    if (!signatureValid) {
        await this.logWebhook({
            webhookId,
            provider,
            payload,
            signature,
            signatureValid: false,
            outcome: "VALIDATION_FAILED",
        });

        return {
            success: false,
            type: "invalid_signature",
            message: "Webhook signature validation failed",
        };
    }

    const parsedData = this.parsePayload(provider, JSON.parse(payload));

    return this.processParsedWebhook({
        webhookId,
        provider,
        parsedData,
        signature,
        signatureValid: true,
    });
}

	// private async processParsedWebhook({
	// 	webhookId,
	// 	provider,
	// 	parsedData,
	// 	signature,
	// 	signatureValid,
	// }: {
	// 	webhookId: string;
	// 	provider: string;
	// 	parsedData: any;
	// 	signature?: string;
	// 	signatureValid: boolean;
	// }): Promise<ServiceResult> {
	// 	const { order_id, transaction_id, status, amount, currency } = parsedData;

	// 	const isDuplicate = await this.checkDuplicate(webhookId);
	// 	if (isDuplicate) {
	// 		return {
	// 			success: true,
	// 			type: "duplicate",
	// 			message: "Webhook already processed",
	// 			data: { webhookId },
	// 		};
	// 	}

	// 	const webhookLog = await this.logWebhook({
	// 		webhookId,
	// 		provider,
	// 		eventType: `payment.${status}`,
	// 		payload: parsedData,
	// 		signature,
	// 		signatureValid,
	// 		parsedData,
	// 		processed: false,
	// 	});

	// 	if (provider === "mock") {
	// 		await this.markWebhookProcessed(webhookLog.id, "success");

	// 		return {
	// 			success: true,
	// 			type: "mock",
	// 			message: `Mock payment ${status}`,
	// 			data: parsedData,
	// 		};
	// 	}

	// 	if (status === "succeeded") {
	// 		const result = await this.handlePaymentSuccess({
	// 			orderId: order_id,
	// 			transactionId: transaction_id,
	// 			amount,
	// 			currency,
	// 			webhookLogId: webhookLog.id,
	// 		});

	// 		await this.markWebhookProcessed(webhookLog.id, "success");
	// 		return result;
	// 	}

	// 	if (status === "failed") {
	// 		const result = await this.handlePaymentFailure({
	// 			orderId: order_id,
	// 			transactionId: transaction_id,
	// 			webhookLogId: webhookLog.id,
	// 		});

	// 		await this.markWebhookProcessed(webhookLog.id, "success");
	// 		return result;
	// 	}

	// 	await this.markWebhookProcessed(webhookLog.id, "validation_failed");

	// 	return {
	// 		success: true,
	// 		type: "ignored",
	// 		message: `Webhook with status '${status}' was logged but not processed`,
	// 	};
	// }
	private async processParsedWebhook({
		webhookId,
		provider,
		parsedData,
		signature,
		signatureValid,
	}: {
		webhookId: string;
		provider: string;
		parsedData: any;
		signature?: string;
		signatureValid: boolean;
	}): Promise<ServiceResult> {
		console.log("🔍 Processing webhook:", {
			provider,
			parsedData,
			status: parsedData?.status,
		});

		const { order_id, transaction_id, status, amount, currency } = parsedData;

		console.log("🔍 Destructured values:", {
			order_id,
			transaction_id,
			status,
			amount,
			currency,
		});

		const isDuplicate = await this.checkDuplicate(webhookId);
		if (isDuplicate) {
			return {
				success: true,
				type: "duplicate",
				message: "Webhook already processed",
				data: { webhookId },
			};
		}

		const webhookLog = await this.logWebhook({
			webhookId,
			provider,
			eventType: `payment.${status}`,
			payload: parsedData,
			signature,
			signatureValid,
			parsedData,
			processed: false,
		});

		// ✅ REMOVE THIS BLOCK - let mock webhooks process normally
		// if (provider === "mock") {
		//     await this.markWebhookProcessed(webhookLog.id, "success");
		//     return {
		//         success: true,
		//         type: "mock",
		//         message: `Mock payment ${status}`,
		//         data: parsedData,
		//     };
		// }

		// Process success/failure for ALL providers (including mock)
		if (status === "succeeded") {
			const result = await this.handlePaymentSuccess({
				orderId: order_id,
				transactionId: transaction_id,
				amount,
				currency,
				webhookLogId: webhookLog.id,
			});

			await this.markWebhookProcessed(webhookLog.id, "success");
			return result;
		}

		if (status === "failed") {
			const result = await this.handlePaymentFailure({
				orderId: order_id,
				transactionId: transaction_id,
				webhookLogId: webhookLog.id,
			});

			await this.markWebhookProcessed(webhookLog.id, "success");
			return result;
		}

		await this.markWebhookProcessed(webhookLog.id, "validation_failed");

		return {
			success: true,
			type: "ignored",
			message: `Webhook with status '${status}' was logged but not processed`,
		};
	}

	// Handle successful payment
	// async handlePaymentSuccess(params: {
	// 	orderId: string;
	// 	transactionId: string;
	// 	amount: number;
	// 	currency: string;
	// 	webhookLogId: string;
	// }): Promise<ServiceResult> {
	// 	const { orderId, transactionId, amount, currency, webhookLogId } = params;

	// 	// Validate order
	// 	const orderValidation = await this.orderService.validateForPayment(
	// 		orderId,
	// 		amount,
	// 	);

	// 	if (!orderValidation) {
	// 		throw new Error("new error")
	// 	}

	// 	if (!orderValidation.valid) {
	// 		this.logger.warn("Order validation failed", {
	// 			orderId,
	// 			reason: orderValidation.reason,
	// 		});

	// 		return {
	// 			success: true,
	// 			type: "validation_failed",
	// 			message: orderValidation.reason,
	// 			data: { orderId },
	// 		};
	// 	}

	// 	// Check if transaction already processed
	// 	const existingReceipt =
	// 		await this.receiptService.findByTransactionId(transactionId);
	// 	if (existingReceipt) {
	// 		this.logger.info("Receipt already exists for transaction", {
	// 			transactionId,
	// 			receiptId: existingReceipt.id,
	// 		});

	// 		return {
	// 			success: true,
	// 			type: "already_processed",
	// 			message: "Receipt already generated for this transaction",
	// 			data: { receiptId: existingReceipt.id },
	// 		};
	// 	}

	// 	// Process payment (atomic transaction)
	// 	const paymentResult = await this.paymentService.recordSuccessfulPayment({
	// 		orderId,
	// 		transactionId,
	// 		amount,
	// 		currency,
	// 		webhookLogId,
	// 	});

	// 	// Enqueue receipt generation
	// 	const queueResult = await this.queueManager.enqueueReceiptGeneration({
	// 		orderId,
	// 		transactionId,
	// 		userId: paymentResult.userId,
	// 		receiptId: paymentResult.receiptId,
	// 	});

	// 	return {
	// 		success: true,
	// 		type: "processed",
	// 		message: "Payment processed and receipt generation queued",
	// 		data: {
	// 			orderId,
	// 			transactionId,
	// 			receiptId: paymentResult.receiptId,
	// 			jobId: queueResult.id,
	// 		},
	// 	};
	// }
	async handlePaymentSuccess(params: {
		orderId: string;
		transactionId: string;
		amount: number;
		currency: string;
		webhookLogId: string;
	}): Promise<ServiceResult> {
		const { orderId, transactionId, amount, currency, webhookLogId } = params;

		// Validate order
		const orderValidation = await this.orderService.validateForPayment(
			orderId,
			amount,
		);

		if (!orderValidation) {
			throw new Error("Order validation failed");
		}

		if (!orderValidation.valid) {
			this.logger.warn("Order validation failed", {
				orderId,
				reason: orderValidation.reason,
			});

			return {
				success: true,
				type: "validation_failed",
				message: orderValidation.reason,
				data: { orderId },
			};
		}

		// Check if transaction already processed
		const existingReceipt = await this.receiptService.findByTransactionId(transactionId);

		if (existingReceipt) {
			this.logger.info("Receipt already exists for transaction", {
				transactionId,
				receiptId: existingReceipt.id,
			});

			return {
				success: true,
				type: "already_processed",
				message: "Receipt already generated for this transaction",
				data: { receiptId: existingReceipt.id },
			};
		}

		// Process payment (atomic transaction)
		const paymentResult = await this.paymentService.recordSuccessfulPayment({
			orderId,
			transactionId,
			amount,
			currency,
			webhookLogId,
		});

		// Queue all jobs and capture their ids
		const pdfJob = await this.queueManager.enqueueReceiptGeneration({
			orderId,
			transactionId,
			userId: paymentResult.userId,
			receiptId: paymentResult.receiptId,
		});

		// const uploadJob = await this.queueManager.enqueueCloudinaryUpload({
		// 	receiptId: paymentResult.receiptId,
		// 	orderId,
		// });

		// const emailJob = await this.queueManager.enqueueEmailDelivery({
		// 	receiptId: paymentResult.receiptId,
		// 	userId: paymentResult.userId,
		// });

		// Get order and receipt details for response
		const order = await this.orderService.findById(orderId);
		const receipt = await this.receiptService.findById(paymentResult.receiptId);

		return {
			success: true,
			type: "processed",
			message: "Payment processed and receipt generation queued",
			data: {
				orderId,
				orderNumber: order.orderNumber,
				transactionId,
				receiptId: paymentResult.receiptId,
				receiptNumber: receipt.receiptNumber,
				status: "PAID",
				queuedJobs: {
					pdfGeneration: pdfJob.id,
					// cloudinaryUpload: uploadJob.id,
					// emailDelivery: emailJob.id,
				},
			},
		};
	}

	// Handle failed payment
	async handlePaymentFailure(params: {
		orderId: string;
		transactionId: string;
		webhookLogId: string;
	}): Promise<ServiceResult> {
		const { orderId, transactionId, webhookLogId } = params;

		await this.paymentService.recordFailedPayment({
			orderId,
			transactionId,
			webhookLogId,
		});

		await this.orderService.markPaymentFailed(orderId);

		return {
			success: true,
			type: "payment_failed",
			message: "Payment failure recorded",
			data: { orderId, transactionId },
		};
	}
}
