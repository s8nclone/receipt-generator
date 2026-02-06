import Redis from "ioredis";

// Redis connection configuration
export const redisConfig = {
	host: process.env.REDIS_HOST ?? "localhost",
	port: parseInt(process.env.REDIS_PORT ?? "6379"),
	password: process.env.REDIS_PASSWORD,
	maxRetriesPerRequest: null,
	enableReadyCheck: false,

	// Retry strategy
	retryStrategy: (times: number) => {
		const delay = Math.min(times * 50, 2000);
		return delay;
	},
};

// Create Redis client
export function createRedisClient(): Redis {
	const client = new Redis(redisConfig);

	client.on("connect", () => {
		console.log("Redis connected");
	});

	client.on("error", (error) => {
		console.error("Redis error:", error);
	});

	client.on("reconnecting", () => {
		console.log("Redis reconnecting...");
	});

	return client;
}
