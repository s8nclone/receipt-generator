import { PrismaClient as BasePrismaClient } from "../generated/client.js";

/**
 * Workaround for Prisma >=7 generic defaults regression.
 * We intentionally erase constructor generics here.
 */
export const PrismaClient = BasePrismaClient as unknown as new () => BasePrismaClient;

const prisma = new PrismaClient();
// Export the single instance for use throughout your application
export default prisma;
