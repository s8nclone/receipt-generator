import { prisma } from "@/lib/prisma.js";
import { ReceiptStatus } from "@/generated/enums.js";
import { promises as fs } from "fs";
import path from "path";
import { generateReceiptPDF } from "@/utils/pdf-generator.js";

export class ReceiptService {
	constructor(
		private pdfGenerator: any,
		private logger: any,
	) {}

	// Find receipt by transaction ID (idempotency check)
	async findByTransactionId(transactionId: string) {
		return await prisma.receipt.findUnique({
			where: { transactionId },
			select: { id: true }, // Just need to know if exists
		});
	}

	// Generate PDF for receipt
	async generatePDF(receiptId: string) {
		const receipt = await prisma.receipt.findUnique({
			where: { id: receiptId },
			include: {
				store: {
					select: { name: true },
				},
			},
		});

		if (!receipt) {
			throw new Error(`Receipt ${receiptId} not found`);
		}

		if (receipt.pdfGenerated) {
			this.logger.info("PDF already generated", { receiptId });
			return {
				alreadyGenerated: true,
				localPath: receipt.pdfLocalPath,
			};
		}

		try {
			// Generate PDF using our utility
			const pdfBuffer = await generateReceiptPDF({
				receiptNumber: receipt.receiptNumber,
				orderSnapshot: receipt.orderSnapshot as any,
				paymentDetails: {
					method: receipt.paymentMethod ?? undefined,
					last4: receipt.paymentLast4 ?? undefined,
					paidAt: receipt.paidAt,
					amount: receipt.amount,
					currency: receipt.currency,
				},
				createdAt: receipt.createdAt,
				storeName: receipt.store.name,
			});

			// Save to local filesystem
			const localPath = await this.savePDFLocally(receiptId, pdfBuffer);

			// Update receipt record
			await prisma.receipt.update({
				where: { id: receiptId },
				data: {
					pdfGenerated: true,
					pdfGeneratedAt: new Date(),
					pdfLocalPath: localPath,
					pdfSizeBytes: pdfBuffer.length,
					pdfGenerationAttempts: {
						increment: 1,
					},
				},
			});

			this.logger.info("PDF generated successfully", {
				receiptId,
				sizeBytes: pdfBuffer.length,
			});

			return {
				success: true,
				localPath,
				sizeBytes: pdfBuffer.length,
			};
		} catch (error: any) {
			await prisma.receipt.update({
				where: { id: receiptId },
				data: {
					pdfGenerationAttempts: {
						increment: 1,
					},
				},
			});

			this.logger.error("PDF generation failed", { receiptId, error });
			throw error;
		}
	}

	// Save PDF locally
	private async savePDFLocally(
		receiptId: string,
		pdfBuffer: Buffer,
	): Promise<string> {
		const uploadsDir = path.join(process.cwd(), "uploads", "receipts");
		await fs.mkdir(uploadsDir, { recursive: true });

		const filename = `${receiptId}.pdf`;
		const filepath = path.join(uploadsDir, filename);

		await fs.writeFile(filepath, pdfBuffer);

		return filepath;
	}

	// Get receipts by a user - receipt history
	async getUserReceipts(
		userId: string,
		options: {
			limit?: number;
			skip?: number;
			status?: ReceiptStatus;
			startDate?: Date;
			endDate?: Date;
		} = {},
	) {
		const { limit = 20, skip = 0, status, startDate, endDate } = options;

		// Build where clause
		const where: any = { userId };

		if (status) {
			where.status = status;
		}

		if (startDate || endDate) {
			where.createdAt = {};
			if (startDate) where.createdAt.gte = startDate;
			if (endDate) where.createdAt.lte = endDate;
		}

		// Execute query
		const [receipts, total] = await Promise.all([
			prisma.receipt.findMany({
				where,
				orderBy: { createdAt: "desc" },
				take: limit,
				skip,
				select: {
					id: true,
					receiptNumber: true,
					amount: true,
					currency: true,
					status: true,
					pdfGenerated: true,
					cloudinaryUploaded: true,
					cloudinarySecureUrl: true,
					emailSent: true,
					paidAt: true,
					createdAt: true,
					// Include order snapshot for displaying items
					orderSnapshot: true,
				},
			}),
			prisma.receipt.count({ where }),
		]);

		// Format receipts for response
		const formattedReceipts = receipts.map((receipt) => {
			const orderSnapshot = receipt.orderSnapshot as any;

			return {
				id: receipt.id,
				receiptNumber: receipt.receiptNumber,
				amount: receipt.amount,
				currency: receipt.currency,
				formattedAmount: this.formatCurrency(receipt.amount, receipt.currency),
				status: receipt.status,
				orderNumber: orderSnapshot?.orderNumber,
				itemCount: orderSnapshot?.items?.length ?? 0,
				pdfReady: receipt.pdfGenerated,
				downloadable: receipt.cloudinaryUploaded ?? receipt.pdfGenerated,
				emailSent: receipt.emailSent,
				paidAt: receipt.paidAt,
				createdAt: receipt.createdAt,
			};
		});

		return {
			receipts: formattedReceipts,
			pagination: {
				total,
				limit,
				skip,
				hasMore: skip + limit < total,
				page: Math.floor(skip / limit) + 1,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	// Get receipt with url
	async getReceiptWithURL(receiptId: string, userId: string) {
		const receipt = await prisma.receipt.findUnique({
			where: { id: receiptId },
			include: {
				order: {
					select: {
						id: true,
						orderNumber: true,
						status: true,
					},
				},
				user: {
					select: {
						email: true,
						firstName: true,
						lastName: true,
					},
				},
			},
		});

		if (!receipt) {
			return {
				found: false,
				error: "Receipt not found",
			};
		}

		// Authorization check
		if (receipt.userId !== userId) {
			return {
				found: true,
				authorized: false,
				error: "You do not have permission to access this receipt",
			};
		}

		// Format receipt data
		const orderSnapshot = receipt.orderSnapshot as any;
		const formattedReceipt = {
			id: receipt.id,
			receiptNumber: receipt.receiptNumber,
			orderNumber: orderSnapshot?.orderNumber,
			amount: receipt.amount,
			currency: receipt.currency,
			formattedAmount: this.formatCurrency(receipt.amount, receipt.currency),
			status: receipt.status,
			paidAt: receipt.paidAt,
			createdAt: receipt.createdAt,

			// Order details
			order: {
				id: receipt.order.id,
				orderNumber: receipt.order.orderNumber,
				status: receipt.order.status,
			},

			// Processing status
			processing: {
				pdfGenerated: receipt.pdfGenerated,
				pdfGeneratedAt: receipt.pdfGeneratedAt,
				cloudinaryUploaded: receipt.cloudinaryUploaded,
				cloudinaryUploadedAt: receipt.cloudinaryUploadedAt,
				emailSent: receipt.emailSent,
				emailSentAt: receipt.emailSentAt,
			},

			// Items from order snapshot
			items: orderSnapshot?.items ?? [],
			pricing: orderSnapshot?.pricing ?? null,
			shippingAddress: orderSnapshot?.shippingAddress ?? null,
		};

		// Determine download URL
		let downloadUrl = null;
		let downloadMethod = null;

		// Priority 1: Cloudinary (if uploaded and URL exists)
		if (receipt.cloudinaryUploaded && receipt.cloudinarySecureUrl) {
			// Check if signed URL needs refresh
			const needsRefresh =
				!receipt.cloudinarySignedUrl ||
				!receipt.cloudinarySignedUrlExpiresAt ||
				receipt.cloudinarySignedUrlExpiresAt < new Date();

			if (needsRefresh && receipt.cloudinaryPublicId) {
				// Generate new signed URL
				const signedUrl = await this.generateSignedURL(
					receipt.cloudinaryPublicId,
				);

				// Update database with new signed URL
				await prisma.receipt.update({
					where: { id: receiptId },
					data: {
						cloudinarySignedUrl: signedUrl,
						cloudinarySignedUrlExpiresAt: new Date(
							Date.now() + 24 * 60 * 60 * 1000,
						), // 24 hours
					},
				});

				downloadUrl = signedUrl;
				downloadMethod = "cloudinary";
			} else {
				// Use existing signed URL
				downloadUrl = receipt.cloudinarySignedUrl;
				downloadMethod = "cloudinary";
			}
		}
		// Priority 2: Local file (if PDF generated but not uploaded)
		else if (receipt.pdfGenerated && receipt.pdfLocalPath) {
			downloadUrl = `/api/receipts/${receiptId}/download/local`;
			downloadMethod = "local";
		}

		return {
			found: true,
			authorized: true,
			receipt: formattedReceipt,
			download: {
				available: downloadUrl !== null,
				url: downloadUrl,
				method: downloadMethod,
				expiresAt:
					downloadMethod === "cloudinary"
						? receipt.cloudinarySignedUrlExpiresAt
						: null,
			},
		};
	}

	private async generateSignedURL(publicId: string): Promise<string> {
		const cloudinary = require("cloudinary").v2;

		return cloudinary.url(publicId, {
			sign_url: true,
			type: "authenticated",
			resource_type: "raw",
			expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
		});
	}

	// Refresh download URL for a receipt
	async refreshDownloadURL(receiptId: string, userId: string) {
		const receipt = await prisma.receipt.findUnique({
			where: { id: receiptId },
			select: {
				userId: true,
				cloudinaryPublicId: true,
				cloudinaryUploaded: true,
			},
		});

		if (!receipt) {
			throw new Error("Receipt not found");
		}

		if (receipt.userId !== userId) {
			throw new Error("Unauthorized");
		}

		if (!receipt.cloudinaryUploaded || !receipt.cloudinaryPublicId) {
			throw new Error("Receipt not available in cloud storage");
		}

		// Generate new signed URL
		const signedUrl = await this.generateSignedURL(receipt.cloudinaryPublicId);

		// Update database
		await prisma.receipt.update({
			where: { id: receiptId },
			data: {
				cloudinarySignedUrl: signedUrl,
				cloudinarySignedUrlExpiresAt: new Date(
					Date.now() + 24 * 60 * 60 * 1000,
				),
			},
		});

		return {
			url: signedUrl,
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		};
	}

	// Mark receipt as completed
	async markCompleted(receiptId: string) {
		const receipt = await prisma.receipt.findUnique({
			where: { id: receiptId },
			select: {
				pdfGenerated: true,
				cloudinaryUploaded: true,
				emailSent: true,
				status: true,
			},
		});

		if (!receipt) {
			return;
		}

		// Only mark as completed if all steps are done and not already completed
		if (
			receipt.pdfGenerated &&
			receipt.cloudinaryUploaded &&
			receipt.emailSent &&
			receipt.status !== ReceiptStatus.COMPLETED
		) {
			await prisma.receipt.update({
				where: { id: receiptId },
				data: {
					status: ReceiptStatus.COMPLETED,
				},
			});

			this.logger.info("Receipt marked as completed", { receiptId });
		}
	}

	// Get receipt statistics for a user
	async getUserReceiptStats(userId: string) {
		const [total, byStatus, totalSpent] = await Promise.all([
			// Total receipts
			prisma.receipt.count({
				where: { userId },
			}),

			// Count by status
			prisma.receipt.groupBy({
				by: ["status"],
				where: { userId },
				_count: true,
			}),

			// Total amount spent
			prisma.receipt.aggregate({
				where: {
					userId,
					status: ReceiptStatus.COMPLETED,
				},
				_sum: {
					amount: true,
				},
			}),
		]);

		const statusCounts = byStatus.reduce(
			(acc, item) => {
				acc[item.status] = item._count;
				return acc;
			},
			{} as Record<string, number>,
		);

		return {
			total,
			completed: statusCounts[ReceiptStatus.COMPLETED] ?? 0,
			pending: statusCounts[ReceiptStatus.PENDING] ?? 0,
			failed: statusCounts[ReceiptStatus.FAILED] ?? 0,
			totalSpent: totalSpent._sum.amount ?? 0,
			formattedTotalSpent: this.formatCurrency(
				totalSpent._sum.amount ?? 0,
				"NGN",
			),
		};
	}

	// Format currency amount
	private formatCurrency(
		amountInCents: number,
		currency: string,
	): string {
		const amount = amountInCents / 100;
		return new Intl.NumberFormat("en-NG", {
			style: "currency",
			currency: currency,
		}).format(amount);
	}

	// Delete local PDF file - for cleanup after successful cloud upload
	async deleteLocalPDF(receiptId: string): Promise<boolean> {
		try {
			const receipt = await prisma.receipt.findUnique({
				where: { id: receiptId },
				select: { pdfLocalPath: true },
			});

			if (!receipt?.pdfLocalPath) {
				return false;
			}

			await fs.unlink(receipt.pdfLocalPath);

			// Update database to clear local path
			await prisma.receipt.update({
				where: { id: receiptId },
				data: { pdfLocalPath: null },
			});

			this.logger.info("Local PDF deleted", { receiptId });
			return true;
		} catch (error: any) {
			this.logger.warn("Failed to delete local PDF", {
				receiptId,
				error: error.message,
			});
			return false;
		}
	}
}
