import { Job } from "bull";
import { queueManager, QUEUE_NAMES } from "@/queues/queue-manager.js";
import { recoveryService } from "@/services/index.js";

// Recovery Scan Worker. Runs periodically to recover stuck jobs
export const processRecoveryScan = async (_job: Job): Promise<any> => {
	console.log("Running recovery scan...");

	try {
		const results = await recoveryService.runAll();

		console.log("Recovery scan complete:", {
			generationsRequeued: results.generations.requeued,
			uploadsRequeued: results.uploads.requeued,
			emailsRequeued: results.emails.requeued,
			criticalFailures: results.alerts.length,
		});

		return results;
	} catch (error: any) {
		console.error("Recovery scan failed: ", error.message);
		throw error;
	}
}

// Start recovery worker
export const startRecoveryWorker = () => {
	const queue = queueManager.getQueue(QUEUE_NAMES.RECOVERY_SCAN);

	if (!queue) {
		throw new Error("Recovery scan queue not found");
	}

	queue.process(1, processRecoveryScan); // Only one recovery scan at a time

	queue.on("completed", (job, result) => {
		console.log("Recovery scan completed: ", result);
	});

	console.log("Recovery worker started");
}
