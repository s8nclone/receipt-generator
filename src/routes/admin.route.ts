import { Router } from "express";
import { adminController } from "@/controllers/admin.controller.js";
import { authenticate, authorize } from "@/middleware/auth.middleware.js";

const router = Router();

// All admin routes require admin role
router.use(authenticate);
router.use(authorize("ADMIN"));

// Receipts
router.get("/receipts", adminController.searchReceipts.bind(adminController));
router.get(
	"/receipts/export",
	adminController.exportReceipts.bind(adminController),
);
router.get("/receipts/:id", adminController.getReceipt.bind(adminController));
router.get(
	"/receipts/:id/download",
	adminController.downloadReceipt.bind(adminController),
);
router.post(
	"/receipts/bulk-retry",
	adminController.bulkRetry.bind(adminController),
);

// Analytics
router.get("/analytics", adminController.getAnalytics.bind(adminController));
router.get("/health", adminController.getHealth.bind(adminController));

export default router;
