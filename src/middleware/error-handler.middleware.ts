import { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/client.js"


// Global error handler
export const errorHandler = (
	error: any,
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	console.error("Error:", error);

	// Prisma errors
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		// Unique constraint violation
		if (error.code === "P2002") {
			return res.status(409).json({
				success: false,
				error: "Resource already exists",
				details: error.meta,
			});
		}

		// Foreign key constraint violation
		if (error.code === "P2003") {
			return res.status(400).json({
				success: false,
				error: "Invalid reference",
				details: error.meta,
			});
		}

		// Record not found
		if (error.code === "P2025") {
			return res.status(404).json({
				success: false,
				error: "Resource not found",
			});
		}
	}

	// Validation errors (from zod or other validators)
	if (error.name === "ValidationError") {
		return res.status(400).json({
			success: false,
			error: "Validation failed",
			details: error.details,
		});
	}

	// JWT errors
	if (error.name === "JsonWebTokenError") {
		return res.status(401).json({
			success: false,
			error: "Invalid token",
		});
	}

	if (error.name === "TokenExpiredError") {
		return res.status(401).json({
			success: false,
			error: "Token expired",
		});
	}

	// Default 500 error
	return res.status(500).json({
		success: false,
		error:
			process.env.NODE_ENV === "production"
				? "Internal server error"
				: error.message,
	});
}

// 404 handler
export const notFoundHandler = (req: Request, res: Response) => {
	return res.status(404).json({
		success: false,
		error: "Route not found",
	});
}
