import { prisma } from "@/lib/prisma.js";

export class RecoveryService {
	constructor(
		private receiptService: any,
		private storageService: any,
		private emailService: any,
		private queueManager: any,
		private logger: any,
	) {}

	/**
	 * Recover failed PDF generations
	 */
	async recoverFailedGenerations() {
		const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

		const stuckReceipts = await prisma.receipt.findMany({
			where: {
				pdfGenerated: false,
				pdfGenerationAttempts: { lt: 3 },
				createdAt: { lt: fifteenMinutesAgo },
			},
			take: 50,
			select: {
				id: true,
				orderId: true,
				transactionId: true,
				userId: true,
			},
		});

		this.logger.info(
			`Found ${stuckReceipts.length} receipts with failed generation`,
		);

		const results = {
			requeued: 0,
			failed: 0,
		};

		for (const receipt of stuckReceipts) {
			try {
				await this.queueManager.enqueueReceiptGeneration({
					receiptId: receipt.id,
					orderId: receipt.orderId,
					transactionId: receipt.transactionId,
					userId: receipt.userId,
					isRecovery: true,
				});

				results.requeued++;
			} catch (error) {
				this.logger.error("Failed to requeue receipt generation", {
					receiptId: receipt.id,
					error,
				});
				results.failed++;
			}
		}

		return results;
	}

	/**
	 * Recover failed uploads
	 */
	async recoverFailedUploads() {
		const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

		const stuckUploads = await prisma.receipt.findMany({
			where: {
				pdfGenerated: true,
				cloudinaryUploaded: false,
				cloudinaryUploadAttempts: { lt: 5 },
				createdAt: { lt: thirtyMinutesAgo },
			},
			take: 50,
			select: { id: true },
		});

		this.logger.info(
			`Found ${stuckUploads.length} receipts with failed uploads`,
		);

		const results = { requeued: 0, failed: 0 };

		for (const receipt of stuckUploads) {
			try {
				await this.queueManager.enqueueCloudinaryUpload({
					receiptId: receipt.id,
					isRecovery: true,
				});

				results.requeued++;
			} catch (error) {
				this.logger.error("Failed to requeue upload", {
					receiptId: receipt.id,
					error,
				});
				results.failed++;
			}
		}

		return results;
	}

	/**
	 * Recover failed emails
	 */
	async recoverFailedEmails() {
		const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

		const stuckEmails = await prisma.receipt.findMany({
			where: {
				pdfGenerated: true,
				emailSent: false,
				emailSendAttempts: { lt: 5 },
				emailPermanentFailure: false,
				createdAt: { lt: thirtyMinutesAgo },
			},
			take: 50,
			select: { id: true },
		});

		this.logger.info(`Found ${stuckEmails.length} receipts with failed emails`);

		const results = { requeued: 0, failed: 0 };

		for (const receipt of stuckEmails) {
			try {
				await this.queueManager.enqueueEmailDelivery({
					receiptId: receipt.id,
					isRecovery: true,
				});

				results.requeued++;
			} catch (error) {
				this.logger.error("Failed to requeue email", {
					receiptId: receipt.id,
					error,
				});
				results.failed++;
			}
		}

		return results;
	}

	/**
	 * Alert on persistent failures
	 */
	async alertOnPersistentFailures() {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

		const criticalFailures = await prisma.receipt.findMany({
			where: {
				OR: [
					{
						pdfGenerated: false,
						pdfGenerationAttempts: { gte: 3 },
						createdAt: { lt: oneHourAgo },
					},
					{
						cloudinaryUploaded: false,
						cloudinaryUploadAttempts: { gte: 5 },
						createdAt: { lt: fourHoursAgo },
					},
					{
						emailSent: false,
						emailSendAttempts: { gte: 5 },
						createdAt: { lt: fourHoursAgo },
					},
				],
			},
			select: { id: true, receiptNumber: true, status: true },
		});

		if (criticalFailures.length > 0) {
			this.logger.error(
				`${criticalFailures.length} receipts require manual intervention`,
				{
					receiptIds: criticalFailures.map((r) => r.id),
				},
			);
		}

		return criticalFailures;
	}

	/**
	 * Run all recovery jobs
	 */
	async runAll() {
		const results = {
			generations: await this.recoverFailedGenerations(),
			uploads: await this.recoverFailedUploads(),
			emails: await this.recoverFailedEmails(),
			alerts: await this.alertOnPersistentFailures(),
		};

		this.logger.info("Recovery jobs completed", results);
		return results;
	}
}
