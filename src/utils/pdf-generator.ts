import PDFDocument from "pdfkit";
import { receiptTemplate } from "@/config/receipt-template.js";

interface ReceiptData {
	receiptNumber: string;
	orderSnapshot: {
		orderNumber: string;
		items: {
			name: string;
			description?: string;
			quantity: number;
			unitPrice: number;
			totalPrice: number;
		}[];
		pricing: {
			subtotal: number;
			tax: number;
			shipping: number;
			discount: number;
			total: number;
		};
		shippingAddress?: {
			line1: string;
			line2?: string;
			city: string;
			state: string;
			postalCode: string;
			country: string;
		};
	};
	paymentDetails: {
		method?: string;
		last4?: string;
		paidAt: Date;
		amount: number;
		currency: string;
	};
	createdAt: Date;
	storeName?: string;
}

export class PDFGenerator {
	private doc: PDFKit.PDFDocument;
	private currentY = 0;
	private template = receiptTemplate;

	constructor() {
		this.doc = new PDFDocument({
			size: this.template.page.size,
			margins: this.template.page.margins,
		});

		this.currentY = this.template.page.margins.top;
	}

	/**
	 * Generate receipt PDF
	 * Returns a Buffer that can be saved to file or uploaded
	 */
	async generate(data: ReceiptData): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];

			// Collect PDF chunks
			this.doc.on("data", (chunk) => chunks.push(chunk));

			// Resolve with complete buffer
			this.doc.on("end", () => resolve(Buffer.concat(chunks)));

			// Handle errors
			this.doc.on("error", reject);

			try {
				// Build PDF content
				this.addHeader(data);
				this.addReceiptInfo(data);
				this.addDivider();
				this.addLineItems(data.orderSnapshot.items);
				this.addPricingSummary(data.orderSnapshot.pricing);
				this.addDivider();
				this.addPaymentInfo(data.paymentDetails);

				this.addFooter();

				// Finalize PDF
				this.doc.end();
			} catch (error) {
				reject(error);
			}
		});
	}

	// Add header with company info and logo
	private addHeader(data: ReceiptData) {
		const { colors, fonts, fontSize } = this.template;
		const storeName = data.storeName ?? this.template.company.name;

		// Company name
		this.doc
			.fontSize(fontSize.title)
			.font(fonts.bold)
			.fillColor(colors.primary)
			.text(storeName, { align: "center" });

		this.currentY += fontSize.title + 5;

		// Company details
		this.doc
			.fontSize(fontSize.small)
			.font(fonts.regular)
			.fillColor(colors.textLight)
			.text(this.template.company.address, { align: "center" });

		this.currentY += fontSize.small + 2;

		this.doc.text(
			`${this.template.company.city} | ${this.template.company.email}`,
			{ align: "center" },
		);

		this.currentY += this.template.spacing.section;

		// "RECEIPT" title
		this.doc
			.fontSize(fontSize.heading)
			.font(fonts.bold)
			.fillColor(colors.text)
			.text("RECEIPT", { align: "center" });

		this.currentY += this.template.spacing.section;
	}

	// Add receipt metadata
	private addReceiptInfo(data: ReceiptData) {
		const { colors, fonts, fontSize, page } = this.template;
		const leftX = page.margins.left;
		const rightX = 550 - page.margins.right;

		// Receipt number
		this.doc
			.fontSize(fontSize.body)
			.font(fonts.bold)
			.fillColor(colors.text)
			.text("Receipt Number:", leftX, this.currentY);

		this.doc
			.font(fonts.regular)
			.text(data.receiptNumber, rightX, this.currentY, { align: "right" });

		this.currentY += this.template.spacing.line;

		// Order number
		this.doc.font(fonts.bold).text("Order Number:", leftX, this.currentY);

		this.doc
			.font(fonts.regular)
			.text(data.orderSnapshot.orderNumber, rightX, this.currentY, {
				align: "right",
			});

		this.currentY += this.template.spacing.line;

		// Date
		this.doc.font(fonts.bold).text("Date:", leftX, this.currentY);

		const formattedDate = new Intl.DateTimeFormat("en-NG", {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}).format(data.paymentDetails.paidAt);

		this.doc
			.font(fonts.regular)
			.text(formattedDate, rightX, this.currentY, { align: "right" });

		this.currentY += this.template.spacing.section;
	}

	// Add horizontal divider line
	private addDivider() {
		const { colors, page } = this.template;

		this.doc
			.strokeColor(colors.border)
			.lineWidth(1)
			.moveTo(page.margins.left, this.currentY)
			.lineTo(550 - page.margins.right, this.currentY)
			.stroke();

		this.currentY += this.template.spacing.section;
	}

	// Add line items table
	private addLineItems(items: ReceiptData["orderSnapshot"]["items"]) {
		const { colors, fonts, fontSize, page } = this.template;
		const leftX = page.margins.left;
		const rightX = 550 - page.margins.right;

		// Table header
		this.doc
			.fontSize(fontSize.subheading)
			.font(fonts.bold)
			.fillColor(colors.text)
			.text("Item", leftX, this.currentY);

		this.doc.text("Qty", 300, this.currentY);
		this.doc.text("Price", 370, this.currentY);
		this.doc.text("Total", rightX - 60, this.currentY);

		this.currentY += this.template.spacing.line;

		// Draw header underline
		this.doc
			.strokeColor(colors.border)
			.lineWidth(0.5)
			.moveTo(leftX, this.currentY)
			.lineTo(rightX, this.currentY)
			.stroke();

		this.currentY += this.template.spacing.item;

		// Line items
		this.doc.fontSize(fontSize.body).font(fonts.regular);

		items.forEach((item, index) => {
			// Item name
			this.doc
				.fillColor(colors.text)
				.text(item.name, leftX, this.currentY, { width: 250 });

			// Description (if exists)
			if (item.description) {
				this.doc
					.fontSize(fontSize.small)
					.fillColor(colors.textLight)
					.text(item.description, leftX, this.currentY + fontSize.body + 2, {
						width: 250,
					});
			}

			// Quantity
			this.doc
				.fontSize(fontSize.body)
				.fillColor(colors.text)
				.text(item.quantity.toString(), 300, this.currentY);

			// Unit price
			this.doc.text(this.formatCurrency(item.unitPrice), 370, this.currentY);

			// Total price
			this.doc
				.font(fonts.bold)
				.text(
					this.formatCurrency(item.totalPrice),
					rightX - 60,
					this.currentY,
					{ align: "right" },
				);

			this.currentY += this.template.spacing.line;

			if (item.description) {
				this.currentY += fontSize.small + 5;
			}

			// Add spacing between items
			if (index < items.length - 1) {
				this.currentY += 5;
			}
		});

		this.currentY += this.template.spacing.item;
	}

	// Add pricing summary
	private addPricingSummary(pricing: ReceiptData["orderSnapshot"]["pricing"]) {
		const { colors, fonts, fontSize, page } = this.template;
		const labelX = 350;
		const valueX = 550 - page.margins.right;

		this.doc.fontSize(fontSize.body).font(fonts.regular);

		// Subtotal
		this.doc
			.fillColor(colors.textLight)
			.text("Subtotal:", labelX, this.currentY);

		this.doc
			.fillColor(colors.text)
			.text(this.formatCurrency(pricing.subtotal), valueX, this.currentY, {
				align: "right",
			});

		this.currentY += this.template.spacing.line;

		// Tax
		this.doc.fillColor(colors.textLight).text("Tax:", labelX, this.currentY);

		this.doc
			.fillColor(colors.text)
			.text(this.formatCurrency(pricing.tax), valueX, this.currentY, {
				align: "right",
			});

		this.currentY += this.template.spacing.line;

		// Shipping
		if (pricing.shipping > 0) {
			this.doc
				.fillColor(colors.textLight)
				.text("Shipping:", labelX, this.currentY);

			this.doc
				.fillColor(colors.text)
				.text(this.formatCurrency(pricing.shipping), valueX, this.currentY, {
					align: "right",
				});

			this.currentY += this.template.spacing.line;
		}

		// Discount
		if (pricing.discount > 0) {
			this.doc
				.fillColor(colors.success)
				.text("Discount:", labelX, this.currentY);

			this.doc.text(
				`-${this.formatCurrency(pricing.discount)}`,
				valueX,
				this.currentY,
				{ align: "right" },
			);

			this.currentY += this.template.spacing.line;
		}

		// Draw line above total
		this.doc
			.strokeColor(colors.border)
			.lineWidth(1)
			.moveTo(labelX, this.currentY)
			.lineTo(valueX, this.currentY)
			.stroke();

		this.currentY += this.template.spacing.item;

		// Total
		this.doc
			.fontSize(fontSize.heading)
			.font(fonts.bold)
			.fillColor(colors.text)
			.text("Total:", labelX, this.currentY);

		this.doc
			.fillColor(colors.primary)
			.text(this.formatCurrency(pricing.total), valueX, this.currentY, {
				align: "right",
			});

		this.currentY += this.template.spacing.section;
	}

	// Add payment information
	private addPaymentInfo(paymentDetails: ReceiptData["paymentDetails"]) {
		const { colors, fonts, fontSize, page } = this.template;
		const leftX = page.margins.left;

		this.doc
			.fontSize(fontSize.subheading)
			.font(fonts.bold)
			.fillColor(colors.text)
			.text("Payment Information", leftX, this.currentY);

		this.currentY += this.template.spacing.line;

		this.doc
			.fontSize(fontSize.body)
			.font(fonts.regular)
			.fillColor(colors.textLight);

		// Payment method
		const paymentMethod = paymentDetails.method ?? "Card";
		const paymentDisplay = paymentDetails.last4
			? `${paymentMethod} ending in ${paymentDetails.last4}`
			: paymentMethod;

		this.doc.text(`Payment Method: ${paymentDisplay}`, leftX, this.currentY);

		this.currentY += this.template.spacing.line;

		// Payment status
		this.doc
			.fillColor(colors.success)
			.text("Status: PAID", leftX, this.currentY);

		this.currentY += this.template.spacing.section;
	}

	// Add footer with thank you message
	private addFooter() {
		const { colors, fonts, fontSize } = this.template;

		// Move to bottom of page
		this.currentY = 750; // A4 height - margin

		this.doc
			.fontSize(fontSize.body)
			.font(fonts.italic)
			.fillColor(colors.textLight)
			.text("Thank you for your business!", { align: "center" });

		this.doc
			.fontSize(fontSize.small)
			.text(
				"For questions about this receipt, contact us at " +
					this.template.company.email,
				{ align: "center" },
			);
	}

    // Format currency (kobo to Naira)
	private formatCurrency(amountInCents: number): string {
		const amount = amountInCents / 100;
		return new Intl.NumberFormat("en-NG", {
			style: "currency",
			currency: "NGN",
		}).format(amount);
	}
}

/**
 * Factory function for easy usage
 */
export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
	const generator = new PDFGenerator();
	return await generator.generate(data);
}
