import { Job } from "bull";
import {
	queueManager,
	EmailDeliveryJobData,
	QUEUE_NAMES,
} from "../queue-manager.js";
import { prisma } from "@/lib/prisma.js";
import { receiptService, emailService } from "@/services/index.js"

// Email Delivery Worker
export const processEmailDelivery = async (
	job: Job<EmailDeliveryJobData>,
): Promise<void> => {
	const { receiptId, isRecovery } = job.data;

	console.log(`Processing email delivery for ${receiptId}`);
	console.log(`Attempt: ${job.attemptsMade + 1}/${job.opts.attempts}`);

	try {
		await job.progress(10);

		// Send email
		const result = await emailService.sendReceiptEmail(receiptId);

		await job.progress(80);

		if (result.alreadySent) {
			console.log(`ℹEmail already sent for ${receiptId}`);
		} else {
			console.log(`Email sent for ${receiptId}: ${result.messageId}`);
		}

		// Check if receipt is fully completed
		await receiptService.markCompleted(receiptId);

		await job.progress(100);

		// Log success
		await prisma.jobLog.create({
			data: {
				jobId: job.id?.toString() || `job-${Date.now()}`,
				queueName: QUEUE_NAMES.EMAIL_DELIVERY,
				jobType: "email-delivery",
				receiptId,
				status: "COMPLETED",
				attempts: job.attemptsMade + 1,
				maxAttempts: job.opts.attempts ?? 5,
				data: job.data,
				result: result,
				queuedAt: new Date(job.timestamp),
				startedAt: new Date(job.processedOn ?? Date.now()),
				completedAt: new Date(),
				isRecoveryJob: isRecovery ?? false,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			},
		});
	} catch (error: any) {
		console.error(`Email delivery failed for ${receiptId}:`, error.message);

		await prisma.jobLog.create({
			data: {
				jobId: job.id?.toString() || `job-${Date.now()}`,
				queueName: QUEUE_NAMES.EMAIL_DELIVERY,
				jobType: "email-delivery",
				receiptId,
				status: "FAILED",
				attempts: job.attemptsMade + 1,
				maxAttempts: job.opts.attempts ?? 5,
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

		throw error;
	}
}

// Start worker
export const startEmailDeliveryWorker = () => {
	const queue = queueManager.getQueue(QUEUE_NAMES.EMAIL_DELIVERY);

	if (!queue) {
		throw new Error("Email delivery queue not found");
	}

	queue.process(10, processEmailDelivery); // Higher concurrency

	queue.on("completed", (job) => {
		console.log(`Email job ${job.id} completed`);
	});

	queue.on("failed", (job, error) => {
		console.error(`Email job ${job?.id} failed:`, error.message);
	});

	console.log(`Email delivery worker started (concurrency: 10)`);
}
