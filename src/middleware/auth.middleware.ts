import { Request, Response, NextFunction } from "express";
import { extractTokenFromHeader, verifyToken, JWTPayload } from "../utils/auth.js";
import { UserRole } from "../generated/enums.js";

// Extend Express Request to include user
declare global {
	namespace Express {
		interface Request {
			user?: JWTPayload;
		}
	}
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
	try {
		const token = extractTokenFromHeader(req.headers.authorization);

		if (!token) {
			return res.status(401).json({
				success: false,
				error: "Authentication required",
			});
		}

		const payload = verifyToken(token);
		req.user = payload;

		next();
	} catch (error: any) {
		return res.status(401).json({
			success: false,
			error: error.message ?? "Invalid token",
		});
	}
}

// Authorization middleware - check user role
export const authorize = (...allowedRoles: UserRole[]) => {
	return (req: Request, res: Response, next: NextFunction) => {
		if (!req.user) {
			return res.status(401).json({
				success: false,
				error: "Authentication required",
			});
		}

		if (!allowedRoles.includes(req.user.role)) {
			return res.status(403).json({
				success: false,
				error: "Insufficient permissions",
			});
		}

		next();
	};
}

/**
 * Optional authentication
 * Attaches user if token exists, but doesn't require it
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
	try {
		const token = extractTokenFromHeader(req.headers.authorization);

		if (token) {
			const payload = verifyToken(token);
			req.user = payload;
		}
	} catch (error) {
		// Ignore token errors for optional auth
        console.error("Operation failed: ", error);
	}

	next();
}
