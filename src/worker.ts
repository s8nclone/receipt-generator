import dotenv from "dotenv";
dotenv.config();

import { startAllWorkers, stopAllWorkers } from "./queues/workers/index.js";

/**
 * Worker process entry point
 * Run separately from API server: node dist/worker.js
 */

async function main() {
	console.log("Receipt System Worker Process");
	console.log(`Environment: ${process.env.NODE_ENV ?? "development"}`);

	// Start all workers
	startAllWorkers();

	// Graceful shutdown
	process.on("SIGTERM", async () => {
		console.log("SIGTERM received, shutting down workers...");
		await stopAllWorkers();
		process.exit(0);
	});

	process.on("SIGINT", async () => {
		console.log("SIGINT received, shutting down workers...");
		await stopAllWorkers();
		process.exit(0);
	});
}

main().catch((error) => {
	console.error("Fatal error in worker process:", error);
	process.exit(1);
});
