import { Router } from "express";
import { receiptController } from "@/controllers/receipt.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", receiptController.getUserReceipts.bind(receiptController));
router.get("/:id", receiptController.getReceipt.bind(receiptController));
router.get(
	"/:id/download/local",
	receiptController.downloadLocal.bind(receiptController),
);
router.post(
	"/:id/resend",
	receiptController.resendEmail.bind(receiptController),
);

export default router;
