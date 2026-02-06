import { startReceiptGenerationWorker } from "./receipt-generation.worker.js";
import { startCloudinaryUploadWorker } from "./cloudinary-upload.worker.js";
import { startEmailDeliveryWorker } from "./email-delivery.worker.js";
import { startRecoveryWorker } from "./recovery.worker.js";
import { queueManager } from "../queue-manager.js";

// Start all workers
export const startAllWorkers = () => {
	console.log("Starting all workers...");

	startReceiptGenerationWorker();
	startCloudinaryUploadWorker();
	startEmailDeliveryWorker();
	startRecoveryWorker();

	// Schedule recovery scans (every 15 minutes)
	queueManager.scheduleRecoveryScan("*/15 * * * *");

	console.log("All workers started");
}

// Graceful shutdown
export const stopAllWorkers = async () => {
	console.log("Stopping all workers...");
	await queueManager.closeAll();
	console.log("All workers stopped");
}
