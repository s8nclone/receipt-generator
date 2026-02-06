import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { createReadStream } from "fs";
import { queueManager } from "../queues/queue-manager.js";
import { receiptService } from "../services/index.js";

export class ReceiptController {
	/**
	 * Get user's receipts
	 * GET /api/v1/receipts
	 */
	async getUserReceipts(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}

			const { limit = "20", skip = "0" } = req.query;

			const result = await receiptService.getUserReceipts(req.user.userId, {
				limit: parseInt(limit as string),
				skip: parseInt(skip as string),
			});

			return res.json({
				success: true,
				data: result,
			});
		} catch (error: any) {
			console.error("Get receipts error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to fetch receipts",
			});
		}
	}

	/**
	 * Get single receipt with download URL
	 * GET /api/v1/receipts/:id
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

			const result = await receiptService.getReceiptWithURL(
				id,
				req.user.userId,
			);

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
				data: result,
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
	 * Download receipt PDF (local file)
	 * GET /api/v1/receipts/:id/download/local
	 */
	async downloadLocal(req: Request, res: Response) {
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
				select: {
					userId: true,
					pdfGenerated: true,
					pdfLocalPath: true,
					receiptNumber: true,
				},
			});

			if (!receipt) {
				return res.status(404).json({
					success: false,
					error: "Receipt not found",
				});
			}

			if (receipt.userId !== req.user.userId) {
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
				error: "Failed to download receipt",
			});
		}
	}

	/**
	 * Resend receipt email
	 * POST /api/v1/receipts/:id/resend
	 */
	async resendEmail(req: Request, res: Response) {
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
				select: { userId: true },
			});

			if (!receipt) {
				return res.status(404).json({
					success: false,
					error: "Receipt not found",
				});
			}

			if (receipt.userId !== req.user.userId) {
				return res.status(403).json({
					success: false,
					error: "Access denied",
				});
			}

			// Reset email status
			await prisma.receipt.update({
				where: { id },
				data: {
					emailSent: false,
					emailLastError: null,
				},
			});

			// Enqueue email job 
			await queueManager.enqueueEmailDelivery({ receiptId: id });

			return res.json({
				success: true,
				message: "Email resend queued",
			});
		} catch (error: any) {
			console.error("Resend email error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to resend email",
			});
		}
	}
}

export const receiptController = new ReceiptController();
