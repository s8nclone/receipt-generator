import { Request, Response } from "express";
import { webhookService } from "@/services/index.js";

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

            const result = await webhookService.processPaymentWebhook(
                provider,
                webhookId,
                payload,
                signature,
            );

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Webhook processing error:", error);
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
        console.log("mockWebhook called");
        console.log("req.body:", JSON.stringify(req.body, null, 2));
        
        try {
            const { orderId, amount, shouldFail = false, delaySeconds = 0 } = req.body;

            // Simulate delay
            if (delaySeconds > 0) {
                await new Promise((r) => setTimeout(r, delaySeconds * 1000));
            }

            // Construct mock webhook payload
            const mockPayload = {
                transaction_id: `txn_mock_${Date.now()}`,
                order_id: orderId,
                status: shouldFail ? "failed" : "succeeded",
                amount: amount,
                currency: "NGN",
                timestamp: new Date().toISOString(),
            };

            console.log("About to call webhookService.processPaymentWebhook");
            console.log("mockPayload:", JSON.stringify(mockPayload, null, 2));
            console.log("typeof mockPayload:", typeof mockPayload);

            // Process through webhook service
            const result = await webhookService.processPaymentWebhook(
                "mock",
                `whk_mock_${Date.now()}`,
                mockPayload,
            );

            console.log("Result received:", JSON.stringify(result, null, 2));

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