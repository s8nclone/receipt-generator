import { PrismaClient } from "../generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();


/**
 * Prisma Client Singleton
 *
 * Why singleton?
 * - PrismaClient creates a connection pool
 * - Creating multiple instances wastes connections
 * - In development, hot reload would create many instances
 */

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const pool = new Pool({
	connectionString: String(connectionString),
});

const adapter = new PrismaPg(pool);

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		adapter,
		// log:
		// 	process.env.NODE_ENV === "development"
		// 		? ["query", "error", "warn"]
		// 		: ["error"],
	});

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

/**
 * Graceful shutdown
 */
export async function disconnectPrisma() {
	await prisma.$disconnect();
}
