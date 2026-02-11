import { Job } from "bull";
import {
	queueManager,
	ReceiptGenerationJobData,
	QUEUE_NAMES,
} from "../queue-manager.js";
import { prisma } from "@/lib/prisma.js";
import { receiptService } from "@/services/index.js";

// Receipt Generation Worker. Processes jobs from receipt-generation queue
export const processReceiptGeneration = async (
	job: Job<ReceiptGenerationJobData>,
): Promise<void> => {
	const { receiptId, orderId, userId, isRecovery } = job.data;

	console.log(`Processing receipt generation for ${receiptId}`);
	console.log(`Attempt: ${job.attemptsMade + 1}/${job.opts.attempts}`);

	if (isRecovery) {
		console.log("Recovery job");
	}

	try {
		// Update job progress
		await job.progress(10);

		// Generate PDF
		const result = await receiptService.generatePDF(receiptId);

		await job.progress(50);

		if (result.alreadyGenerated) {
			console.log(`PDF already generated for ${receiptId}`);
		} else {
			console.log(`PDF generated for ${receiptId}: ${result.sizeBytes} bytes`);
		}

		// Log job completion to database
		await prisma.jobLog.create({
			data: {
				jobId: job.id?.toString() || `job-${Date.now()}`,
				queueName: QUEUE_NAMES.RECEIPT_GENERATION,
				jobType: "receipt-generation",
				receiptId,
				orderId,
				userId,
				status: "COMPLETED",
				attempts: job.attemptsMade + 1,
				maxAttempts: job.opts.attempts ?? 3,
				data: job.data,
				result: result,
				queuedAt: new Date(job.timestamp),
				startedAt: new Date(job.processedOn ?? Date.now()),
				completedAt: new Date(),
				isRecoveryJob: isRecovery ?? false,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
			},
		});

		await job.progress(100);

		// Enqueue next steps (upload and email) in parallel
		await Promise.all([
			queueManager.enqueueCloudinaryUpload({ receiptId }),
			queueManager.enqueueEmailDelivery({ receiptId }),
		]);

		console.log(
			`Receipt ${receiptId} generation complete, next steps enqueued`,
		);
	} catch (error: any) {
		console.error(`Receipt generation failed for ${receiptId}:`, error.message);

		// Log failure to database
		await prisma.jobLog.create({
			data: {
				jobId: job.id?.toString() || `job-${Date.now()}`,
				queueName: QUEUE_NAMES.RECEIPT_GENERATION,
				jobType: "receipt-generation",
				receiptId,
				orderId,
				userId,
				status: "FAILED",
				attempts: job.attemptsMade + 1,
				maxAttempts: job.opts.attempts ?? 3,
				data: job.data,
				error: {
					message: error.message,
					stack: error.stack,
					code: error.code,
				},
				queuedAt: new Date(job.timestamp),
				startedAt: new Date(job.processedOn ?? Date.now()),
				failedAt: new Date(),
				isRecoveryJob: isRecovery ?? false,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			},
		});

		// Re-throw to trigger Bull's retry mechanism
		throw error;
	}
}

// Start worker
export const startReceiptGenerationWorker = () => {
	const queue = queueManager.getQueue(QUEUE_NAMES.RECEIPT_GENERATION);

	if (!queue) {
		throw new Error("Receipt generation queue not found");
	}

	// Process jobs with concurrency of 2
	queue.process(2, processReceiptGeneration);

	// Event handlers
	queue.on("completed", (job) => {
		console.log(`Job ${job.id} completed`);
	});

	queue.on("failed", (job, error) => {
		console.error(`Job ${job?.id} failed:`, error.message);
	});

	queue.on("stalled", (job) => {
		console.warn(`Job ${job.id} stalled`);
	});

	console.log("Receipt generation worker started (concurrency: 2)");
}
