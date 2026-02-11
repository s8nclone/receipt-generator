import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UserRole } from "@/generated/enums.js";
import dotenv from "dotenv";
dotenv.config();

// JWT Payload interface
export interface JWTPayload {
	userId: string;
	email: string;
	role: UserRole;
}

const SALT_ROUNDS = 12;
const JWT_SECRET =
	process.env.JWT_SECRET ?? "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";

// Hash password using bcrypt
export const hashPassword = async (password: string): Promise<string> => {
	return await bcrypt.hash(password, SALT_ROUNDS);
};

// Compare password with hash
export const comparePassword = async (
	password: string,
	hash: string,
): Promise<boolean> => {
	return await bcrypt.compare(password, hash);
};

// Generate JWT token
export const generateToken = (payload: JWTPayload): string => {
	return jwt.sign(payload, JWT_SECRET, {
		expiresIn: JWT_EXPIRES_IN,
	});
};

// Verify and decode JWT token
export const verifyToken = (token: string): JWTPayload => {
	try {
		return jwt.verify(token, JWT_SECRET) as JWTPayload;
	} catch (error) {
        console.error("Invalid token: ", error);
		throw new Error("Invalid or expired token");
	}
};

// Extract token from Authorization header. Format: "Bearer <token>"
export const extractTokenFromHeader = (
	authHeader: string | undefined,
): string | null => {
	if (!authHeader?.startsWith("Bearer ")) {
		return null;
	}

	return authHeader.substring(7); // Remove "Bearer " prefix
};
