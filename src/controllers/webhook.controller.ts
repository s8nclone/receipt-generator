import { Request, Response } from "express";
import { webhookService } from "../services/index.js";

export class WebhookController {
	/**
	 * Handle payment webhook from provider
	 * POST /api/v1/webhooks/payment/:provider
	 */
	async handlePaymentWebhook(req: Request, res: Response) {
		try {
			const { provider } = req.params;
			const signature = req.headers["x-signature"] as string;
			const webhookId =
				(req.headers["x-webhook-id"] as string) || `webhook_${Date.now()}`;

			const payload = req.body;

			// Process webhook
			const result = await webhookService.processPaymentWebhook(
				provider,
				webhookId,
				payload,
				signature,
			);

			// Always return 200 for successfully received webhooks
			// This prevents payment providers from retrying
			return res.status(200).json(result);
		} catch (error: any) {
			console.error("Webhook processing error:", error);

			// Return 500 for technical failures
			// Provider will retry
			return res.status(500).json({
				success: false,
				error: "Webhook processing failed",
			});  
		}
	}

	/**
	 * Mock webhook endpoint for testing
	 * POST /api/v1/webhooks/payment/mock
	 */
	async mockWebhook(req: Request, res: Response) {
		try {
			const {
				orderId,
				amount,
				shouldFail = false,
				delaySeconds = 0,
			} = req.body;
			// Simulate delay
			if (delaySeconds > 0) {
				await new Promise((resolve) =>
					setTimeout(resolve, delaySeconds * 1000),
				);
			}

			// Generate mock payload
			const transactionId = `txn_mock_${Date.now()}`;
			const webhookId = `whk_mock_${Date.now()}`;

			const mockPayload = {
				transaction_id: transactionId,
				order_id: orderId,
				status: shouldFail ? "failed" : "succeeded",
				amount: amount,
				currency: "NGN",
				timestamp: new Date().toISOString(),
			};

			// Generate mock signature
			const crypto = require("crypto");
			const signature = crypto
				.createHmac("sha256", "mock_secret_for_testing")
				.update(JSON.stringify(mockPayload))
				.digest("hex");

			// Process through webhook service
			const result = await webhookService.processPaymentWebhook(
				"mock",
				webhookId,
				mockPayload,
				signature,
			);

			return res.json({
				success: true,
				message: "Mock webhook processed",
				data: result,
			});
		} catch (error: any) {
			console.error("Mock webhook error:", error);
			return res.status(500).json({
				success: false,
				error: error.message,
			});
		}
	}
}

export const webhookController = new WebhookController();
