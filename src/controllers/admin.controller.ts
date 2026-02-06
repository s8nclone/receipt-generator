import { Request, Response } from "express";
import { createReadStream } from "fs";
import { prisma } from "../lib/prisma.js";
import { adminService } from "../services/index.js";

export class AdminController {
	/**
	 * Search receipts
	 * GET /api/v1/admin/receipts
	 */
	async searchReceipts(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}

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
				limit,
				skip,
				sortBy,
				sortOrder,
			} = req.query;

			const filters = {
				storeId: storeId as string,
				startDate: startDate as string,
				endDate: endDate as string,
				status: status as any,
				email: email as string,
				orderNumber: orderNumber as string,
				receiptNumber: receiptNumber as string,
				minAmount: minAmount ? parseInt(minAmount as string) : undefined,
				maxAmount: maxAmount ? parseInt(maxAmount as string) : undefined,
				pdfGenerated:
					pdfGenerated === "true"
						? true
						: pdfGenerated === "false"
							? false
							: undefined,
				cloudinaryUploaded:
					cloudinaryUploaded === "true"
						? true
						: cloudinaryUploaded === "false"
							? false
							: undefined,
				emailSent:
					emailSent === "true"
						? true
						: emailSent === "false"
							? false
							: undefined,
			};

			const pagination = {
				limit: limit ? parseInt(limit as string) : 50,
				skip: skip ? parseInt(skip as string) : 0,
				sortBy: (sortBy as string) || "createdAt",
				sortOrder: (sortOrder as "asc" | "desc") || "desc",
			};

			const result = await adminService.searchReceipts(
				req.user.userId,
				filters,
				pagination,
			);

			return res.json({
				success: true,
				data: result,
			});
		} catch (error: any) {
			console.error("Search receipts error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to search receipts",
			});
		}
	}

	/**
	 * Get analytics
	 * GET /api/v1/admin/analytics
	 */
	async getAnalytics(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}

			const { storeId, period = "month" } = req.query;

			if (!storeId) {
				return res.status(400).json({
					success: false,
					error: "storeId is required",
				});
			}

			const analytics = await adminService.getStoreAnalytics(
				req.user.userId,
				storeId as string,
				period as string,
			);

			return res.json({
				success: true,
				data: analytics,
			});
		} catch (error: any) {
			console.error("Get analytics error:", error);
			return res.status(500).json({
				success: false,
				error: error.message ?? "Failed to fetch analytics",
			});
		}
	}

	/**
	 * Get single receipt
	 * GET /api/v1/admin/receipts/:id
	 */
	async getReceipt(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}

			const { id } = req.params;

			const result = await adminService.getReceiptForAdmin(id, req.user.userId);

			if (!result.found) {
				return res.status(404).json({
					success: false,
					error: "Receipt not found",
				});
			}

			if (!result.authorized) {
				return res.status(403).json({
					success: false,
					error: "Access denied",
				});
			}

			return res.json({
				success: true,
				data: result.receipt,
			});
		} catch (error: any) {
			console.error("Get receipt error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to fetch receipt",
			});
		}
	}

	/**
	 * Download receipt PDF
	 * GET /api/v1/admin/receipts/:id/download
	 */
	async downloadReceipt(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}

			const { id } = req.params;

			const receipt = await prisma.receipt.findUnique({
				where: { id },
				include: {
					store: {
						select: { adminId: true },
					},
				},
			});

			if (!receipt) {
				return res.status(404).json({
					success: false,
					error: "Receipt not found",
				});
			}

			// Verify admin owns the store
			if (receipt.store.adminId !== req.user.userId) {
				return res.status(403).json({
					success: false,
					error: "Access denied",
				});
			}

			if (!receipt.pdfGenerated || !receipt.pdfLocalPath) {
				return res.status(404).json({
					success: false,
					error: "PDF not available",
				});
			}

			// Stream the file
			const filename = `receipt_${receipt.receiptNumber}.pdf`;
			res.setHeader("Content-Type", "application/pdf");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${filename}"`,
			);

			const fileStream = createReadStream(receipt.pdfLocalPath);
			fileStream.pipe(res);
		} catch (error: any) {
			console.error("Download receipt error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to load receipt",
			});
		}
	}

	/**
	 * Get system health
	 * GET /api/v1/admin/health
	 */
	async getHealth(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}
			const health = await adminService.getSystemHealth(req.user.userId);
			if (!health) {
				return res.json({
					success: true,
					data: {
						message: "No stores found for this admin",
					},
				});
			}
			return res.json({
				success: true,
				data: health,
			});
		} catch (error: any) {
			console.error("Get health error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to fetch system health",
			});
		}
	}

	/**
	 * Export receipts to CSV
	 * GET /api/v1/admin/receipts/export
	 */
	async exportReceipts(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}
			const { storeId, startDate, endDate, status } = req.query;
			const filters = {
				storeId: storeId as string,
				startDate: startDate as string,
				endDate: endDate as string,
				status: status as any,
			};
			const result = await adminService.exportReceiptsCSV(
				req.user.userId,
				filters,
			);
			res.setHeader("Content-Type", "text/csv");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${result.filename}"`,
			);
			return res.send(result.content);
		} catch (error: any) {
			console.error("Export receipts error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to export receipts",
			});
		}
	}

	/**
	 * Bulk retry failed receipts
	 * POST /api/v1/admin/receipts/bulk-retry
	 */
	async bulkRetry(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}
			const { storeId } = req.body;
			if (!storeId) {
				return res.status(400).json({
					success: false,
					error: "storeId is required",
				});
			}
			const result = await adminService.bulkRetryFailed(
				req.user.userId,
				storeId,
			);
			return res.json({
				success: true,
				data: result,
			});
		} catch (error: any) {
			console.error("Bulk retry error:", error);
			return res.status(500).json({
				success: false,
				error: error.message ?? "Failed to bulk retry",
			});
		}
	}

	/**
	 * Get top customers
	 * GET /api/v1/admin/customers/top
	 */
}

export const adminController = new AdminController();

// import { Request, Response } from 'express';
// import { prisma } from '../lib/prisma';

// export class AdminController {
//     /**
//      * Search receipts (admin only)
//      * GET /api/v1/admin/receipts
//      */
//     async searchReceipts(req: Request, res: Response) {
//         try {
//             if (!req.user) {
//                 return res.status(401).json({
//                     success: false,
//                     error: 'Authentication required'
//                 });
//             }

//             // Get admin's stores
//             const stores = await prisma.store.findMany({
//                 where: { adminId: req.user.userId },
//                 select: { id: true }
//             });

//             const storeIds = stores.map(s => s.id);

//             if (storeIds.length === 0) {
//                 return res.json({
//                     success: true,
//                     data: {
//                         receipts: [],
//                         pagination: { total: 0, limit: 20, skip: 0, hasMore: false }
//                     }
//                 });
//             }

//             const {
//                 limit = '50',
//                 skip = '0',
//                 status,
//                 startDate,
//                 endDate,
//                 email,
//                 orderNumber,
//                 receiptNumber
//             } = req.query;

//             // Build where clause
//             const where: any = {
//                 storeId: { in: storeIds }
//             };

//             if (status) where.status = status;
//             if (email) where.emailRecipient = { contains: email as string, mode: 'insensitive' };
//             if (receiptNumber) where.receiptNumber = receiptNumber;

//             if (startDate || endDate) {
//                 where.createdAt = {};
//                 if (startDate) where.createdAt.gte = new Date(startDate as string);
//                 if (endDate) where.createdAt.lte = new Date(endDate as string);
//             }

//             // Search in order snapshot if orderNumber provided
//             // Note: JSONB queries are provider-specific
//             // This is PostgreSQL syntax
//             if (orderNumber) {
//                 where.orderSnapshot = {
//                     path: ['orderNumber'],
//                     equals: orderNumber
//                 };
//             }

//             const [receipts, total] = await Promise.all([
//                 prisma.receipt.findMany({
//                     where,
//                     orderBy: { createdAt: 'desc' },
//                     take: parseInt(limit as string),
//                     skip: parseInt(skip as string),
//                     select: {
//                         id: true,
//                         receiptNumber: true,
//                         amount: true,
//                         currency: true,
//                         status: true,
//                         pdfGenerated: true,
//                         cloudinaryUploaded: true,
//                         emailSent: true,
//                         emailRecipient: true,
//                         createdAt: true,
//                         orderSnapshot: true
//                     }
//                 }),
//                 prisma.receipt.count({ where })
//             ]);

//             return res.json({
//                 success: true,
//                 data: {
//                     receipts,
//                     pagination: {
//                         total,
//                         limit: parseInt(limit as string),
//                         skip: parseInt(skip as string),
//                         hasMore: parseInt(skip as string) + parseInt(limit as string) < total
//                     }
//                 }
//             });

//         } catch (error: any) {
//             console.error('Search receipts error:', error);
//             return res.status(500).json({
//                 success: false,
//                 error: 'Failed to search receipts'
//             });
//         }
//     }

//     /**
//      * Get store analytics
//      * GET /api/v1/admin/analytics
//      */
//     async getAnalytics(req: Request, res: Response) {
//         try {
//             if (!req.user) {
//                 return res.status(401).json({
//                 success: false,
//                 error: 'Authentication required'
//                 });
//             }

//             const { storeId, period = 'month' } = req.query;

//             // Verify admin owns this store
//             const store = await prisma.store.findFirst({
//                 where: {
//                 id: storeId as string,
//                 adminId: req.user.userId
//                 }
//             });

//             if (!store) {
//                 return res.status(404).json({
//                 success: false,
//                 error: 'Store not found'
//                 });
//             }

//             // Calculate date range
//             const startDate = this.getStartDate(period as string);

//             // Get analytics
//             const [completed, failed, total] = await Promise.all([
//                 prisma.receipt.aggregate({
//                     where: {
//                         storeId: storeId as string,
//                         status: 'COMPLETED',
//                         createdAt: { gte: startDate }
//                     },
//                     _count: true,
//                     _sum: { amount: true },
//                     _avg: { amount: true }
//                 }),
//                 prisma.receipt.count({
//                     where: {
//                         storeId: storeId as string,
//                         status: 'FAILED',
//                         createdAt: { gte: startDate }
//                     }
//                 }),
//                 prisma.receipt.count({
//                     where: {
//                         storeId: storeId as string,
//                         createdAt: { gte: startDate }
//                     }
//                 })
//             ]);

//             return res.json({
//                 success: true,
//                 data: {
//                     period,
//                     totalReceipts: total,
//                     completedReceipts: completed._count,
//                     failedReceipts: failed,
//                     totalRevenue: completed._sum.amount || 0,
//                     averageOrderValue: completed._avg.amount || 0,
//                     failureRate: total > 0 ? (failed / total) * 100 : 0
//                 }
//             });

//         } catch (error: any) {
//             console.error('Get analytics error:', error);
//             return res.status(500).json({
//                 success: false,
//                 error: 'Failed to fetch analytics'
//             });
//         }
//     }

//     /**
//      * Download receipt (admin access)
//      * GET /api/v1/admin/receipts/:id/download
//      */
//     async downloadReceipt(req: Request, res: Response) {
//         try {
//             if (!req.user) {
//                 return res.status(401).json({
//                     success: false,
//                     error: 'Authentication required'
//                 });
//             }

//             const { id } = req.params;

//             const receipt = await prisma.receipt.findUnique({
//                 where: { id },
//                 include: {
//                     store: {
//                         select: { adminId: true }
//                     }
//                 }
//             });

//             if (!receipt) {
//                 return res.status(404).json({
//                     success: false,
//                     error: 'Receipt not found'
//                 });
//             }

//             // Verify admin owns the store
//             if (receipt.store.adminId !== req.user.userId) {
//                 return res.status(403).json({
//                     success: false,
//                     error: 'Access denied'
//                 });
//             }

//             if (!receipt.pdfGenerated || !receipt.pdfLocalPath) {
//                 return res.status(404).json({
//                     success: false,
//                     error: 'PDF not available'
//                 });
//             }

//             // Stream the file
//             const { createReadStream } = require('fs');
//             const filename = `receipt_${receipt.receiptNumber}.pdf`;
//             res.setHeader('Content-Type', 'application/pdf');
//             res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

//             const fileStream = createReadStream(receipt.pdfLocalPath);
//             fileStream.pipe(res);

//         } catch (error: any) {
//             console.error('Download receipt error:', error);
//             return res.status(500).json({
//                 success: false,
//                 error: 'Failed to download receipt'
//             });
//         }
//     }

//     private getStartDate(period: string): Date {
//         const now = new Date();
//         switch (period) {
//             case 'day':
//                 now.setHours(0, 0, 0, 0);
//                 return now;
//             case 'week':
//                 now.setDate(now.getDate() - 7);
//                 return now;
//             case 'month':
//                 now.setMonth(now.getMonth() - 1);
//                 return now;
//             case 'year':
//                 now.setFullYear(now.getFullYear() - 1);
//                 return now;
//             default:
//                 now.setMonth(now.getMonth() - 1);
//                 return now;
//         }
//     }
// }

// export const adminController = new AdminController();
