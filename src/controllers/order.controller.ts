import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { orderService } from "../services/index.js";

export class OrderController {
	/**
	 * Create new order
	 * POST /api/v1/orders
	 */
	async createOrder(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}

			const { storeId, items } = req.body;

			const order = await orderService.createOrder({
				userId: req.user.userId,
				storeId,
				items,
			});

			return res.status(201).json({
				success: true,
				data: order,
			});
		} catch (error: any) {
			console.error("Create order error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to create order",
			});
		}
	}

	/**
	 * Get all user's orders
	 * GET /api/v1/orders
	 */
	async getUserOrders(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}

			const { limit = "20", skip = "0", status } = req.query;

			const where: any = { userId: req.user.userId };
			if (status) {
				where.status = status;
			}

			const [orders, total] = await Promise.all([
				prisma.order.findMany({
					where,
					orderBy: { createdAt: "desc" },
					take: parseInt(limit as string),
					skip: parseInt(skip as string),
					select: {
						id: true,
						orderNumber: true,
						status: true,
						total: true,
						createdAt: true,
						paidAt: true,
					},
				}),
				prisma.order.count({ where }),
			]);

			return res.json({
				success: true,
				data: {
					orders,
					pagination: {
						total,
						limit: parseInt(limit as string),
						skip: parseInt(skip as string),
						hasMore:
							parseInt(skip as string) + parseInt(limit as string) < total,
					},
				},
			});
		} catch (error: any) {
			console.error("Get orders error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to fetch orders",
			});
		}
	}

	/**
	 * Get single order
	 * GET /api/v1/orders/:id
	 */
	async getOrder(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}

			const { id } = req.params;

			const order = await prisma.order.findUnique({
				where: { id },
				include: {
					receipt: {
						select: {
							id: true,
							receiptNumber: true,
							status: true,
							pdfGenerated: true,
							cloudinaryUploaded: true,
							emailSent: true,
						},
					},
				},
			});

			if (!order) {
				return res.status(404).json({
					success: false,
					error: "Order not found",
				});
			}

			// Authorization: User can only view their own orders
			if (order.userId !== req.user.userId) {
				return res.status(403).json({
					success: false,
					error: "Access denied",
				});
			}

			return res.json({
				success: true,
				data: order,
			});
		} catch (error: any) {
			console.error("Get order error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to fetch order",
			});
		}
	}

	/**
	 * Cancel order (only if not paid)
	 * POST /api/v1/orders/:id/cancel
	 */
	async cancelOrder(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Authentication required",
				});
			}

			const { id } = req.params;

			const order = await prisma.order.findUnique({
				where: { id },
				select: { userId: true, status: true },
			});

			if (!order) {
				return res.status(404).json({
					success: false,
					error: "Order not found",
				});
			}

			if (order.userId !== req.user.userId) {
				return res.status(403).json({
					success: false,
					error: "Access denied",
				});
			}

			if (order.status === "PAID") {
				return res.status(400).json({
					success: false,
					error: "Cannot cancel paid order",
				});
			}

			if (order.status === "CANCELLED") {
				return res.status(400).json({
					success: false,
					error: "Order already cancelled",
				});
			}

			const updatedOrder = await prisma.order.update({
				where: { id },
				data: {
					status: "CANCELLED",
					cancelledAt: new Date(),
				},
			});

			return res.json({
				success: true,
				data: updatedOrder,
			});
		} catch (error: any) {
			console.error("Cancel order error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to cancel order",
			});
		}
	}
}

export const orderController = new OrderController();
