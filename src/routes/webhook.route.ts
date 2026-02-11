import { Router } from "express";
import { webhookController } from "@/controllers/webhook.controller.js";

const router = Router();

router.post(
	"/payment/mock",
	webhookController.mockWebhook.bind(webhookController),
);
router.post(
	"/payment/:provider",
	webhookController.handlePaymentWebhook.bind(webhookController),
);

export default router;
