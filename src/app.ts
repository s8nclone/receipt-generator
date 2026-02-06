import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from "./routes/auth.route.js";
import orderRoutes from "./routes/order.route.js";
import receiptRoutes from "./routes/receipt.route.js";
import webhookRoutes from "./routes/webhook.route.js";
import adminRoutes from "./routes/admin.route.js";

// Import middleware
import { requestLogger } from "./middleware/request-logger.middleware.js";
import {
	errorHandler,
	notFoundHandler,
} from "./middleware/error-handler.middleware.js";

const app = express();

// Security middleware
app.use(helmet());
app.use(
	cors({
		origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
		credentials: true,
	}),
);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check
app.get("/health", (req, res) => {
	res.json({
		success: true,
		message: "Server is healthy",
		timestamp: new Date().toISOString(),
	});
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/receipts", receiptRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
app.use("/api/v1/admin", adminRoutes);

/**
 * Error handling
 */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
