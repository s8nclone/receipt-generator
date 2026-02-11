import Bull, { Queue, Job, JobOptions } from "bull";
import { redisConfig } from "../config/redis.js";

// Job data interfaces
export interface ReceiptGenerationJobData {
	receiptId: string;
	orderId: string;
	transactionId: string;
	userId: string;
	isRecovery?: boolean;
	[key: string]: any;
}

export interface CloudinaryUploadJobData {
	receiptId: string;
	isRecovery?: boolean;
	[key: string]: any;
}

export interface EmailDeliveryJobData {
	receiptId: string;
	isRecovery?: boolean;
	[key: string]: any;
}

// Queue names (centralized)
export const QUEUE_NAMES = {
	RECEIPT_GENERATION: "receipt-generation",
	CLOUDINARY_UPLOAD: "cloudinary-upload",
	EMAIL_DELIVERY: "email-delivery",
	RECOVERY_SCAN: "recovery-scan",
} as const;

// Queue Manager. Centralized queue creation and job enqueueing
export class QueueManager {
	private queues = new Map<string, Queue>();

	constructor() {
		this.initializeQueues();
	}

	// Initialize all queues
	private initializeQueues() {
		// Receipt Generation Queue
		this.queues.set(
			QUEUE_NAMES.RECEIPT_GENERATION,
			new Bull(QUEUE_NAMES.RECEIPT_GENERATION, {
				redis: redisConfig,
				defaultJobOptions: {
					attempts: 3,
					backoff: {
						type: "exponential",
						delay: 60000, // start with 1 minute
					},
					removeOnComplete: 100, // keep last 100 completed jobs
					removeOnFail: false, // keep failed jobs for debugging
				},
			}),
		);

		// Cloudinary Upload Queue
		this.queues.set(
			QUEUE_NAMES.CLOUDINARY_UPLOAD,
			new Bull(QUEUE_NAMES.CLOUDINARY_UPLOAD, {
				redis: redisConfig,
				defaultJobOptions: {
					attempts: 5,
					backoff: {
						type: "exponential",
						delay: 120000, // start with 2 minutes
					},
					removeOnComplete: 100,
					removeOnFail: false,
				},
			}),
		);

		// Email Delivery Queue
		this.queues.set(
			QUEUE_NAMES.EMAIL_DELIVERY,
			new Bull(QUEUE_NAMES.EMAIL_DELIVERY, {
				redis: redisConfig,
				defaultJobOptions: {
					attempts: 5,
					backoff: {
						type: "exponential",
						delay: 120000,
					},
					removeOnComplete: 100,
					removeOnFail: false,
				},
			}),
		);

		// Recovery Scan Queue (cron-based)
		this.queues.set(
			QUEUE_NAMES.RECOVERY_SCAN,
			new Bull(QUEUE_NAMES.RECOVERY_SCAN, {
				redis: redisConfig,
				defaultJobOptions: {
					attempts: 1,
					removeOnComplete: 10,
					removeOnFail: 10,
				},
			}),
		);

		console.log("All queues initialized");
	}

	// Get queue by name
	getQueue(name: string): Queue | undefined {
		return this.queues.get(name);
	}

	// Enqueue receipt generation job
	// async enqueueReceiptGeneration(
	// 	data: ReceiptGenerationJobData,
	// 	options?: JobOptions,
	// ): Promise<Job<ReceiptGenerationJobData>> {
	// 	const queue = this.queues.get(QUEUE_NAMES.RECEIPT_GENERATION);

	// 	if (!queue) {
	// 		throw new Error("Receipt generation queue not initialized");
	// 	}

	// 	const job = await queue.add(data, {
	// 		priority: data.isRecovery ? 2 : 1, // recovery jobs lower priority
	// 		jobId: `receipt-gen-${data.receiptId}`, // prevent duplicates
	// 		...options,
	// 	});

	// 	console.log(`Receipt generation job enqueued: ${job.id}`);
	// 	return job;
	// }

	// // Enqueue Cloudinary upload job
	// async enqueueCloudinaryUpload(
	// 	data: CloudinaryUploadJobData,
	// 	options?: JobOptions,
	// ): Promise<Job<CloudinaryUploadJobData>> {
	// 	const queue = this.queues.get(QUEUE_NAMES.CLOUDINARY_UPLOAD);

	// 	if (!queue) {
	// 		throw new Error("Cloudinary upload queue not initialized");
	// 	}

	// 	const job = await queue.add(data, {
	// 		priority: data.isRecovery ? 2 : 1,
	// 		jobId: `cloudinary-${data.receiptId}`,
	// 		...options,
	// 	});

	// 	console.log(`Cloudinary upload job enqueued: ${job.id}`);
	// 	return job;
	// }

	// // Enqueue email delivery job
	// async enqueueEmailDelivery(
	// 	data: EmailDeliveryJobData,
	// 	options?: JobOptions,
	// ): Promise<Job<EmailDeliveryJobData>> {
	// 	const queue = this.queues.get(QUEUE_NAMES.EMAIL_DELIVERY);

	// 	if (!queue) {
	// 		throw new Error("Email delivery queue not initialized");
	// 	}

	// 	const job = await queue.add(data, {
	// 		priority: data.isRecovery ? 2 : 1,
	// 		jobId: `email-${data.receiptId}`,
	// 		...options,
	// 	});

	// 	console.log(`Email delivery job enqueued: ${job.id}`);
	// 	return job;
	// }
	async enqueueReceiptGeneration(data: any) {
		const queue = this.getQueue(QUEUE_NAMES.RECEIPT_GENERATION);
		if (!queue) throw new Error("Receipt generation queue not found");

		const job = await queue.add(data, {
			attempts: 3,
			backoff: {
				type: "exponential",
				delay: 2000,
			},
		});

		return job;
	}

	async enqueueCloudinaryUpload(data: any) {
		const queue = this.getQueue(QUEUE_NAMES.CLOUDINARY_UPLOAD);
		if (!queue) throw new Error("Cloudinary upload queue not found");

		const job = await queue.add(data, {
			attempts: 3,
			backoff: {
				type: "exponential",
				delay: 2000,
			},
		});

		return job;
	}

	async enqueueEmailDelivery(data: any) {
		const queue = this.getQueue(QUEUE_NAMES.EMAIL_DELIVERY);
		if (!queue) throw new Error("Email delivery queue not found");

		const job = await queue.add(data, {
			attempts: 3,
			backoff: {
				type: "exponential",
				delay: 2000,
			},
		});

		return job;
	}

	// Schedule recovery scan job (cron)
	async scheduleRecoveryScan(cronExpression = "*/15 * * * *") {
		const queue = this.queues.get(QUEUE_NAMES.RECOVERY_SCAN);

		if (!queue) {
			throw new Error("Recovery scan queue not initialized");
		}

		// Add repeatable job
		await queue.add(
			{ scanType: "all" },
			{
				repeat: {
					cron: cronExpression, // 15 minutes
				},
				jobId: "recovery-scan-cron",
			},
		);

		console.log(`Recovery scan scheduled: ${cronExpression}`);
	}

	// Get queue statistics
	async getQueueStats(queueName: string) {
		const queue = this.queues.get(queueName);

		if (!queue) {
			throw new Error(`Queue ${queueName} not found`);
		}

		const [waiting, active, completed, failed, delayed] = await Promise.all([
			queue.getWaitingCount(),
			queue.getActiveCount(),
			queue.getCompletedCount(),
			queue.getFailedCount(),
			queue.getDelayedCount(),
		]);

		return {
			waiting,
			active,
			completed,
			failed,
			delayed,
			total: waiting + active + completed + failed + delayed,
		};
	}

	/**
	 * Close all queues gracefully
	 */
	async closeAll(): Promise<void> {
		console.log("Closing all queues...");

		const closePromises = Array.from(this.queues.values()).map((queue) =>
			queue.close(),
		);

		await Promise.all(closePromises);
		console.log("All queues closed");
	}
}

export const queueManager = new QueueManager();
