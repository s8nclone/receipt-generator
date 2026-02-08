import { prisma } from "@/lib/prisma.js";
import { OrderStatus } from "@/generated/enums.js";

export class OrderService {
	constructor(private logger: any) {}

	// Find single order
	async findById(orderId: string) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                store: {
                    select: {
                        id: true,
                        name: true,
                        logoUrl: true,
                    },
                },
            },
        });

        if (!order) {
            throw new Error(`Order not found: ${orderId}`);
        }

        return order;
    }

	//	Validate order is ready for payment
	async validateForPayment(orderId: string, webhookAmount: number) {
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				status: true,
				total: true,
			},
		});

		if (!order) {
			return {
				valid: false,
				reason: "Order not found",
			};
		}

		if (order.status === OrderStatus.PAID) {
			return {
				valid: false,
				reason: "Order already paid",
			};
		}

		if (order.status === OrderStatus.CANCELLED) {
			return {
				valid: false,
				reason: "Order was cancelled",
				requiresRefund: true,
			};
		}

		// Security check: amount must match
		if (order.total !== webhookAmount) {
			this.logger.error("Payment amount mismatch", {
				orderId,
				orderTotal: order.total,
				webhookAmount,
			});

			return {
				valid: false,
				reason: `Amount mismatch: order total ${order.total} but webhook reported ${webhookAmount}`,
			};
		}

		return {
			valid: true,
			order,
		};
	}

	// Mark order as payment failed
	async markPaymentFailed(orderId: string) {
		const order = await prisma.order.update({
			where: { id: orderId },
			data: {
				status: OrderStatus.PAYMENT_FAILED,
			},
		});

		this.logger.info("Order marked as payment failed", { orderId });
		return order;
	}

	// Create new order
	async createOrder(params: {
		userId: string;
		storeId: string;
		items: {
			productId: string;
			name: string;
			description: string;
			quantity: number;
			unitPrice: number;
			weight?: number;
		}[];
	}) {
		const { userId, storeId, items } = params;

		// Calculate pricing
		const pricing = this.calculatePricing(items);

		// Generate order number
		const orderNumber = await this.generateOrderNumber(storeId);

		// Prepare items with totals
		const itemsWithTotals = items.map((item) => ({
			productId: item.productId,
			name: item.name,
			description: item.description,
			quantity: item.quantity,
			unitPrice: item.unitPrice,
			totalPrice: item.quantity * item.unitPrice,
		}));

		const order = await prisma.order.create({
			data: {
				orderNumber,
				userId,
				storeId,
				items: itemsWithTotals, // Stored as JSON
				subtotal: pricing.subtotal,
				tax: pricing.tax,
				shipping: pricing.shipping,
				discount: pricing.discount,
				total: pricing.total,
				status: OrderStatus.PENDING_PAYMENT,
			},
		});

		this.logger.info("Order created", { orderId: order.id, userId });
		return order;
	}

	// Calculate order pricing
	private calculatePricing(items: any[]) {
		const subtotal = items.reduce(
			(sum, item) => sum + item.quantity * item.unitPrice,
			0,
		);

		const taxRate = 0.075; // 7.5%
		const tax = Math.round(subtotal * taxRate);

		const shipping = this.calculateShipping(items);
		const discount = 0;

		const total = subtotal + tax + shipping - discount;

		return {
			subtotal,
			tax,
			shipping,
			discount,
			total,
		};
	}

	private calculateShipping(items: any[]): number {
		const totalWeight = items.reduce(
			(sum, item) => sum + (item.weight ?? 0) * item.quantity,
			0,
		);
		return totalWeight > 0 ? Math.max(500, totalWeight * 10) : 0;
	}

	private async generateOrderNumber(storeId: string): Promise<string> {
		const year = new Date().getFullYear();

		const count = await prisma.order.count({
			where: {
				storeId,
				createdAt: {
					gte: new Date(`${year}-01-01`),
					lt: new Date(`${year + 1}-01-01`),
				},
			},
		});

		return `ORD-${year}-${String(count + 1).padStart(6, "0")}`;
	}
}
