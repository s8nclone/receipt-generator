import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, comparePassword, generateToken } from "../utils/auth.js";

export class AuthController {
	/**
	 * Register new user
	 * POST /api/v1/auth/register
	 */
	async register(req: Request, res: Response) {
		try {
			const { email, password, firstName, lastName, phone } = req.body;

			// Check if user already exists
			const existingUser = await prisma.user.findUnique({
				where: { email },
			});

			if (existingUser) {
				return res.status(409).json({
					success: false,
					error: "User with this email already exists",
				});
			}

			// Hash password
			const passwordHash = await hashPassword(password);

			// Create user
			const user = await prisma.user.create({
				data: {
					email,
					passwordHash,
					firstName,
					lastName,
					phone,
					role: "USER",
				},
				select: {
					id: true,
					email: true,
					firstName: true,
					lastName: true,
					role: true,
					createdAt: true,
				},
			});

			// Generate token
			const token = generateToken({
				userId: user.id,
				email: user.email,
				role: user.role,
			});

			return res.status(201).json({
				success: true,
				data: {
					user,
					token,
				},
			});
		} catch (error: any) {
			console.error("Registration error:", error);
			return res.status(500).json({
				success: false,
				error: "Registration failed",
			});
		}
	}

	/**
	 * Login user
	 * POST /api/v1/auth/login
	 */
	async login(req: Request, res: Response) {
		try {
			const { email, password } = req.body;

			// Find user
			const user = await prisma.user.findUnique({
				where: { email },
			});

			if (!user) {
				return res.status(401).json({
					success: false,
					error: "Invalid email or password",
				});
			}

			// Verify password
			const isValidPassword = await comparePassword(
				password,
				user.passwordHash,
			);

			if (!isValidPassword) {
				return res.status(401).json({
					success: false,
					error: "Invalid email or password",
				});
			}

			// Generate token
			const token = generateToken({
				userId: user.id,
				email: user.email,
				role: user.role,
			});

			return res.json({
				success: true,
				data: {
					user: {
						id: user.id,
						email: user.email,
						firstName: user.firstName,
						lastName: user.lastName,
						role: user.role,
					},
					token,
				},
			});
		} catch (error: any) {
			console.error("Login error:", error);
			return res.status(500).json({
				success: false,
				error: "Login failed",
			});
		}
	}

	/**
	 * Get current user profile
	 * GET /api/v1/auth/me
	 */
	async getProfile(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Not authenticated",
				});
			}

			const user = await prisma.user.findUnique({
				where: { id: req.user.userId },
				select: {
					id: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					role: true,
					emailVerified: true,
					createdAt: true,
				},
			});

			if (!user) {
				return res.status(404).json({
					success: false,
					error: "User not found",
				});
			}

			return res.json({
				success: true,
				data: user,
			});
		} catch (error: any) {
			console.error("Get profile error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to fetch profile",
			});
		}
	}

	/**
	 * Update user profile
	 * PATCH /api/v1/auth/profile
	 */
	async updateProfile(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Not authenticated",
				});
			}

			const { firstName, lastName, phone } = req.body;

			const user = await prisma.user.update({
				where: { id: req.user.userId },
				data: {
					firstName,
					lastName,
					phone,
				},
				select: {
					id: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					role: true,
				},
			});

			return res.json({
				success: true,
				data: user,
			});
		} catch (error: any) {
			console.error("Update profile error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to update profile",
			});
		}
	}

	/**
	 * Change password
	 * POST /api/v1/auth/change-password
	 */
	async changePassword(req: Request, res: Response) {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					error: "Not authenticated",
				});
			}

			const { currentPassword, newPassword } = req.body;

			// Get current user with password
			const user = await prisma.user.findUnique({
				where: { id: req.user.userId },
			});

			if (!user) {
				return res.status(404).json({
					success: false,
					error: "User not found",
				});
			}

			// Verify current password
			const isValidPassword = await comparePassword(
				currentPassword,
				user.passwordHash,
			);

			if (!isValidPassword) {
				return res.status(401).json({
					success: false,
					error: "Current password is incorrect",
				});
			}

			// Hash new password
			const newPasswordHash = await hashPassword(newPassword);

			// Update password
			await prisma.user.update({
				where: { id: req.user.userId },
				data: {
					passwordHash: newPasswordHash,
				},
			});

			return res.json({
				success: true,
				message: "Password changed successfully",
			});
		} catch (error: any) {
			console.error("Change password error:", error);
			return res.status(500).json({
				success: false,
				error: "Failed to change password",
			});
		}
	}
}

export const authController = new AuthController();
