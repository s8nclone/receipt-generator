import app from "./app.js";
import { disconnectPrisma } from "./lib/prisma.js";
import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT ?? 3000;

const server = app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
	console.log(`Environment: ${process.env.NODE_ENV ?? "development"}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
	console.log("SIGTERM received, shutting down gracefully...");

	server.close(async () => {
		await disconnectPrisma();
		console.log("Server closed");
		process.exit(0);
	});
});

process.on("SIGINT", async () => {
	console.log("SIGINT received, shutting down gracefully...");

	server.close(async () => {
		await disconnectPrisma();
		console.log("Server closed");
		process.exit(0);
	});
});
