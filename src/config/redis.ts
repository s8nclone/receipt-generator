import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

// Redis connection configuration
export const redisConfig = {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379"),
    password: process.env.REDIS_PASSWORD ?? undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
};

// Add logging to verify config
console.log("Redis Configuration:", {
    host: redisConfig.host,
    port: redisConfig.port,
    hasPassword: !!redisConfig.password,
});

// Create Redis client
export function createRedisClient(): Redis {
    const client = new Redis(redisConfig);
    
    client.on("connect", () => {
        console.log("Redis connected successfully");
    });
    
    client.on("ready", () => {
        console.log("Redis ready to accept commands");
    });
    
    client.on("error", (error) => {
        console.error("Redis error:", error.message);
    });
    
    client.on("reconnecting", () => {
        console.log("Redis reconnecting...");
    });
    
    client.on("close", () => {
        console.log("Redis connection closed");
    });
    
    return client;
}
