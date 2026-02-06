// Receipt template configuration

export const receiptTemplate = {
	// Page settings
	page: {
		size: "A4" as const,
		margins: {
			top: 50,
			bottom: 50,
			left: 50,
			right: 50,
		},
	},

	// Colors
	colors: {
		primary: "#2563eb",
		secondary: "#64748b",
		text: "#1e293b",
		textLight: "#94a3b8",
		border: "#e2e8f0",
		success: "#10b981",
		background: "#f8fafc",
	},

	// Typography
	fonts: {
		regular: "Helvetica",
		bold: "Helvetica-Bold",
		italic: "Helvetica-Oblique",
	},

	fontSize: {
		title: 24,
		heading: 16,
		subheading: 14,
		body: 12,
		small: 10,
	},

	// Spacing
	spacing: {
		section: 30,
		line: 20,
		item: 15,
	},

	// Company info (from store settings in production)
	company: {
		name: "Your Store Name",
		address: "123 Business Street",
		city: "Lagos, Nigeria",
		email: "support@yourstore.com",
		phone: "+234 123 456 7890",
		website: "www.yourstore.com",
	},
};

export type ReceiptTemplate = typeof receiptTemplate;
