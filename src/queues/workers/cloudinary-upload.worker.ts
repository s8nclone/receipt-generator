import { Job } from "bull";
import {
	queueManager,
	CloudinaryUploadJobData,
	QUEUE_NAMES,
} from "../queue-manager.js";
import { prisma } from "../../lib/prisma.js";
import { receiptService, storageService } from "../../services/index.js";

// Cloudinary Upload Worker
export const processCloudinaryUpload = async (
	job: Job<CloudinaryUploadJobData>,
): Promise<void> => {
	const { receiptId, isRecovery } = job.data;

	console.log(`Processing Cloudinary upload for ${receiptId}`);
	console.log(`Attempt: ${job.attemptsMade + 1}/${job.opts.attempts}`);

	try {
		await job.progress(10);

		// Upload to Cloudinary
		const result = await storageService.uploadReceipt(receiptId);

		await job.progress(80);

		if (result.alreadyUploaded) {
			console.log(`Already uploaded: ${receiptId}`);
		} else {
			console.log(`Uploaded to Cloudinary: ${result.publicId}`);
		}

		// Check if receipt is fully completed
		await receiptService.markCompleted(receiptId);

		await job.progress(100);

		// Log success
		await prisma.jobLog.create({
			data: {
				jobId: job.id?.toString() || `job-${Date.now()}`,
				queueName: QUEUE_NAMES.CLOUDINARY_UPLOAD,
				jobType: "cloudinary-upload",
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
		console.error(`Cloudinary upload failed for ${receiptId}:`, error.message);

		await prisma.jobLog.create({
			data: {
				jobId: job.id?.toString() || `job-${Date.now()}`,
				queueName: QUEUE_NAMES.CLOUDINARY_UPLOAD,
				jobType: "cloudinary-upload",
				receiptId,
				status: "FAILED",
				attempts: job.attemptsMade + 1,
				maxAttempts: job.opts.attempts ?? 5,
				data: job.data,
				error: {
					message: error.message,
					stack: error.stack,
					code: error.code ?? error.http_code,
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
export const startCloudinaryUploadWorker = () => {
	const queue = queueManager.getQueue(QUEUE_NAMES.CLOUDINARY_UPLOAD);

	if (!queue) {
		throw new Error("Cloudinary upload queue not found");
	}

	queue.process(5, processCloudinaryUpload); // Higher concurrency

	queue.on("completed", (job) => {
		console.log(`Upload job ${job.id} completed`);
	});

	queue.on("failed", (job, error) => {
		console.error(`Upload job ${job?.id} failed:`, error.message);
	});

	console.log(`Cloudinary upload worker started (concurrency: 5)`);
}
