import { Request, Response, NextFunction } from "express";

// Log incoming requests
export const requestLogger = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const start = Date.now();

	// Log when response finishes
	res.on("finish", () => {
		const duration = Date.now() - start;
		console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
	});

	next();
};
