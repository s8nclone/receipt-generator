import { z } from "zod";

// Order item validation
const orderItemSchema = z.object({
	productId: z.string().min(1, "Product ID is required"),
	name: z.string().min(1, "Product name is required"),
	description: z.string().optional(),
	quantity: z.number().int().min(1, "Quantity must be at least 1"),
	unitPrice: z.number().int().min(0, "Unit price must be non-negative"),
	weight: z.number().min(0).optional(),
});

// Shipping address validation
const shippingAddressSchema = z.object({
	line1: z.string().min(1, "Address line 1 is required"),
	line2: z.string().optional(),
	city: z.string().min(1, "City is required"),
	state: z.string().min(2, "State is required"),
	postalCode: z.string().min(1, "Postal code is required"),
	country: z.string().min(2, "Country is required"),
});

// Create order validation
export const createOrderSchema = z.object({
	storeId: z.string().uuid("Invalid store ID"),
	items: z.array(orderItemSchema).min(1, "At least one item is required"),
	shippingAddress: shippingAddressSchema.optional(),
});
