import { prisma } from "@/lib/prisma.js";
import { ReceiptStatus } from "@/generated/enums.js";

export class AdminService {
	constructor(private logger: any) {}

	// Search receipts with advanced filtering
	async searchReceipts(
		adminId: string,
		filters: {
			storeId?: string;
			startDate?: string;
			endDate?: string;
			status?: ReceiptStatus;
			email?: string;
			orderNumber?: string;
			receiptNumber?: string;
			minAmount?: number;
			maxAmount?: number;
			pdfGenerated?: boolean;
			cloudinaryUploaded?: boolean;
			emailSent?: boolean;
		},
		pagination: {
			limit?: number;
			skip?: number;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
		} = {},
	) {
		const {
			storeId,
			startDate,
			endDate,
			status,
			email,
			orderNumber,
			receiptNumber,
			minAmount,
			maxAmount,
			pdfGenerated,
			cloudinaryUploaded,
			emailSent,
		} = filters;

		const {
			limit = 50,
			skip = 0,
			sortBy = "createdAt",
			sortOrder = "desc",
		} = pagination;

		// Get admin stores
		const stores = await prisma.store.findMany({
			where: { adminId },
			select: { id: true },
		});

		const storeIds = stores.map((s: any) => s.id);

		if (storeIds.length === 0) {
			return {
				receipts: [],
				pagination: {
					total: 0,
					limit,
					skip,
					hasMore: false,
				},
			};
		}

		// Build where clause
		const where: any = {
			storeId: storeId ? { equals: storeId } : { in: storeIds },
		};

		// Date range filter
		if (startDate || endDate) {
			where.createdAt = {};
			if (startDate) where.createdAt.gte = new Date(startDate);
			if (endDate) where.createdAt.lte = new Date(endDate);
		}

		// Status filter
		if (status) {
			where.status = status;
		}

		// Email filter (case-insensitive partial match)
		if (email) {
			where.emailRecipient = {
				contains: email,
				mode: "insensitive",
			};
		}

		// Receipt number filter
		if (receiptNumber) {
			where.receiptNumber = {
				contains: receiptNumber,
				mode: "insensitive",
			};
		}

		// Order number filter (in JSON field)
		if (orderNumber) {
			where.orderSnapshot = {
				path: ["orderNumber"],
				string_contains: orderNumber,
			};
		}

		// Amount range filter
		if (minAmount !== undefined || maxAmount !== undefined) {
			where.amount = {};
			if (minAmount !== undefined) where.amount.gte = minAmount;
			if (maxAmount !== undefined) where.amount.lte = maxAmount;
		}

		// Processing status filters
		if (pdfGenerated !== undefined) {
			where.pdfGenerated = pdfGenerated;
		}
		if (cloudinaryUploaded !== undefined) {
			where.cloudinaryUploaded = cloudinaryUploaded;
		}
		if (emailSent !== undefined) {
			where.emailSent = emailSent;
		}

		// Execute query with pagination
		const [receipts, total] = await Promise.all([
			prisma.receipt.findMany({
				where,
				orderBy: { [sortBy]: sortOrder },
				take: limit,
				skip,
				select: {
					id: true,
					receiptNumber: true,
					amount: true,
					currency: true,
					status: true,
					pdfGenerated: true,
					pdfGeneratedAt: true,
					pdfGenerationAttempts: true,
					cloudinaryUploaded: true,
					cloudinaryUploadedAt: true,
					cloudinaryUploadAttempts: true,
					cloudinarySecureUrl: true,
					emailSent: true,
					emailSentAt: true,
					emailSendAttempts: true,
					emailRecipient: true,
					emailLastError: true,
					createdAt: true,
					paidAt: true,
					orderSnapshot: true,
					user: {
						select: {
							id: true,
							email: true,
							firstName: true,
							lastName: true,
						},
					},
					order: {
						select: {
							id: true,
							orderNumber: true,
							status: true,
						},
					},
				},
			}),
			prisma.receipt.count({ where }),
		]);

		return {
			receipts,
			pagination: {
				total,
				limit,
				skip,
				hasMore: skip + limit < total,
			},
		};
	}

	// Get store analytics
	async getStoreAnalytics(adminId: string, storeId: string, period = "month") {
		// Verify admin owns this store
		const store = await prisma.store.findFirst({
			where: {
				id: storeId,
				adminId,
			},
		});

		if (!store) {
			throw new Error("Store not found or access denied");
		}

		const startDate = this.getStartDate(period);

		// Get receipt statistics
		const [completed, failed, pending, total] = await Promise.all([
			prisma.receipt.aggregate({
				where: {
					storeId,
					status: "COMPLETED",
					createdAt: { gte: startDate },
				},
				_count: true,
				_sum: { amount: true },
				_avg: { amount: true },
				_min: { amount: true },
				_max: { amount: true },
			}),
			prisma.receipt.count({
				where: {
					storeId,
					status: "FAILED",
					createdAt: { gte: startDate },
				},
			}),
			prisma.receipt.count({
				where: {
					storeId,
					status: "PENDING",
					createdAt: { gte: startDate },
				},
			}),
			prisma.receipt.count({
				where: {
					storeId,
					createdAt: { gte: startDate },
				},
			}),
		]);

		// Get order statistics
		const orderStats = await prisma.order.aggregate({
			where: {
				storeId,
				createdAt: { gte: startDate },
			},
			_count: true,
			_sum: { total: true },
		});

		// Get daily breakdown
		const dailyStats = await this.getDailyBreakdown(storeId, startDate);

		// Calculate success metrics
		const successRate = total > 0 ? (completed._count / total) * 100 : 0;
		const failureRate = total > 0 ? (failed / total) * 100 : 0;

		// Processing time analysis
		const avgProcessingTime = await this.getAverageProcessingTime(
			storeId,
			startDate,
		);

		return {
			period,
			dateRange: {
				start: startDate,
				end: new Date(),
			},
			receipts: {
				total,
				completed: completed._count,
				failed,
				pending,
				successRate: parseFloat(successRate.toFixed(2)),
				failureRate: parseFloat(failureRate.toFixed(2)),
			},
			revenue: {
				total: completed._sum.amount ?? 0,
				average: completed._avg.amount ?? 0,
				min: completed._min.amount ?? 0,
				max: completed._max.amount ?? 0,
			},
			orders: {
				total: orderStats._count,
				totalValue: orderStats._sum.total ?? 0,
			},
			processing: {
				averageTimeSeconds: avgProcessingTime,
			},
			daily: dailyStats,
		};
	}

	// Get daily breakdown of receipts
	private async getDailyBreakdown(storeId: string, startDate: Date) {
		const dailyData = await prisma.$queryRaw<
			{
				date: Date;
				count: bigint;
				revenue: bigint;
			}[]
		>`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count,
                SUM(amount) as revenue
            FROM receipts
            WHERE store_id = ${storeId}
                AND created_at >= ${startDate}
                AND status = 'COMPLETED'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;

		return dailyData.map((day: any) => ({
			date: day.date,
			count: Number(day.count),
			revenue: Number(day.revenue),
		}));
	}

	// Calculate average processing time
	private async getAverageProcessingTime(
		storeId: string,
		startDate: Date,
	): Promise<number> {
		const receipts = await prisma.receipt.findMany({
			where: {
				storeId,
				createdAt: { gte: startDate },
				status: "COMPLETED",
				emailSentAt: { not: null },
			},
			select: {
				createdAt: true,
				emailSentAt: true,
			},
			take: 100,
		});

		if (receipts.length === 0) return 0;

		const totalTime = receipts.reduce((sum: number, receipt: any) => {
			if (!receipt.emailSentAt) return sum;
			const diff = receipt.emailSentAt.getTime() - receipt.createdAt.getTime();
			return sum + diff;
		}, 0);

		return Math.round(totalTime / receipts.length / 1000); // Convert to seconds
	}

	// Get start date based on period
	private getStartDate(period: string): Date {
		const now = new Date();

		switch (period) {
			case "today":
				now.setHours(0, 0, 0, 0);
				return now;

			case "yesterday":
				now.setDate(now.getDate() - 1);
				now.setHours(0, 0, 0, 0);
				return now;

			case "week":
				now.setDate(now.getDate() - 7);
				return now;

			case "month":
				now.setMonth(now.getMonth() - 1);
				return now;

			case "quarter":
				now.setMonth(now.getMonth() - 3);
				return now;

			case "year":
				now.setFullYear(now.getFullYear() - 1);
				return now;

			default:
				now.setMonth(now.getMonth() - 1);
				return now;
		}
	}

	// Get receipt by ID (admin access)
	async getReceiptForAdmin(receiptId: string, adminId: string) {
		const receipt = await prisma.receipt.findUnique({
			where: { id: receiptId },
			include: {
				store: {
					select: {
						id: true,
						name: true,
						adminId: true,
					},
				},
				user: {
					select: {
						id: true,
						email: true,
						firstName: true,
						lastName: true,
					},
				},
				order: {
					select: {
						id: true,
						orderNumber: true,
						status: true,
						total: true,
						createdAt: true,
						paidAt: true,
					},
				},
				transaction: {
					select: {
						id: true,
						transactionId: true,
						provider: true,
						status: true,
					},
				},
				emailLogs: {
					orderBy: { lastAttemptAt: "desc" },
					take: 5,
				},
				storageLogs: {
					orderBy: { uploadedAt: "desc" },
					take: 5,
				},
			},
		});

		if (!receipt) {
			return { found: false };
		}

		// Verify admin owns the store
		if (receipt.store.adminId !== adminId) {
			return { found: true, authorized: false };
		}

		return {
			found: true,
			authorized: true,
			receipt,
		};
	}

	// Get system health metrics
	async getSystemHealth(adminId: string) {
		// Get admin's stores
		const stores = await prisma.store.findMany({
			where: { adminId },
			select: { id: true },
		});

		const storeIds = stores.map((s: any) => s.id);

		if (storeIds.length === 0) {
			return null;
		}

		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
		const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

		// Get health metrics
		const [
			totalReceipts,
			recentReceipts,
			stuckPdfGeneration,
			stuckUploads,
			stuckEmails,
			recentFailures,
		] = await Promise.all([
			// Total receipts
			prisma.receipt.count({
				where: { storeId: { in: storeIds } },
			}),

			// Recent receipts (last hour)
			prisma.receipt.count({
				where: {
					storeId: { in: storeIds },
					createdAt: { gte: oneHourAgo },
				},
			}),

			// Stuck PDF generation
			prisma.receipt.count({
				where: {
					storeId: { in: storeIds },
					pdfGenerated: false,
					pdfGenerationAttempts: { gte: 3 },
					createdAt: { gte: oneDayAgo },
				},
			}),

			// Stuck uploads
			prisma.receipt.count({
				where: {
					storeId: { in: storeIds },
					pdfGenerated: true,
					cloudinaryUploaded: false,
					cloudinaryUploadAttempts: { gte: 5 },
					createdAt: { gte: oneDayAgo },
				},
			}),

			// Stuck emails
			prisma.receipt.count({
				where: {
					storeId: { in: storeIds },
					pdfGenerated: true,
					emailSent: false,
					emailSendAttempts: { gte: 5 },
					emailPermanentFailure: false,
					createdAt: { gte: oneDayAgo },
				},
			}),

			// Recent failures (last 24h)
			prisma.receipt.count({
				where: {
					storeId: { in: storeIds },
					status: "FAILED",
					createdAt: { gte: oneDayAgo },
				},
			}),
		]);

		// Calculate health score (0-100)
		const totalIssues =
			stuckPdfGeneration + stuckUploads + stuckEmails + recentFailures;
		const healthScore =
			recentReceipts > 0
				? Math.max(0, 100 - (totalIssues / recentReceipts) * 100)
				: 100;

		return {
			overall: {
				healthScore: parseFloat(healthScore.toFixed(2)),
				status:
					healthScore >= 95
						? "healthy"
						: healthScore >= 80
							? "warning"
							: "critical",
			},
			receipts: {
				total: totalReceipts,
				lastHour: recentReceipts,
				last24Hours: recentReceipts,
			},
			issues: {
				stuckPdfGeneration,
				stuckUploads,
				stuckEmails,
				recentFailures,
				total: totalIssues,
			},
			timestamp: now,
		};
	}

	// Export receipts to CSV
	async exportReceiptsCSV(adminId: string, filters: any) {
		const { receipts } = await this.searchReceipts(adminId, filters, {
			limit: 10000,
			skip: 0,
		});

		// Generate CSV
		const headers = [
			"Receipt Number",
			"Order Number",
			"Date",
			"Customer Email",
			"Amount",
			"Currency",
			"Status",
			"PDF Generated",
			"Uploaded",
			"Email Sent",
		];

		const rows = receipts.map((receipt: any) => {
			const orderSnapshot = receipt.orderSnapshot as any;
			return [
				receipt.receiptNumber,
				orderSnapshot?.orderNumber ?? "N/A",
				receipt.createdAt.toISOString(),
				receipt.emailRecipient,
				(receipt.amount / 100).toFixed(2),
				receipt.currency,
				receipt.status,
				receipt.pdfGenerated ? "Yes" : "No",
				receipt.cloudinaryUploaded ? "Yes" : "No",
				receipt.emailSent ? "Yes" : "No",
			];
		});

		// Convert to CSV string
		const csvContent = [
			headers.join(","),
			...rows.map((row: any) => row.map((cell: any) => `"${cell}"`).join(",")),
		].join("\n");

		return {
			content: csvContent,
			filename: `receipts-export-${new Date().toISOString().split("T")[0]}.csv`,
			count: receipts.length,
		};
	}

	// Bulk retry failed receipts
	async bulkRetryFailed(adminId: string, storeId: string) {
		// Verify store ownership
		const store = await prisma.store.findFirst({
			where: { id: storeId, adminId },
		});

		if (!store) {
			throw new Error("Store not found or access denied");
		}

		// Find failed receipts
		const failedReceipts = await prisma.receipt.findMany({
			where: {
				storeId,
				status: "FAILED",
				OR: [
					{ pdfGenerated: false, pdfGenerationAttempts: { lt: 3 } },
					{
						pdfGenerated: true,
						cloudinaryUploaded: false,
						cloudinaryUploadAttempts: { lt: 5 },
					},
					{
						pdfGenerated: true,
						emailSent: false,
						emailSendAttempts: { lt: 5 },
						emailPermanentFailure: false,
					},
				],
			},
			select: { id: true },
			take: 50,
		});

		return {
			found: failedReceipts.length,
			receiptIds: failedReceipts.map((r: any) => r.id),
			message: `Found ${failedReceipts.length} receipts eligible for retry. Use manual recovery endpoint to retry them.`,
		};
	}
}
