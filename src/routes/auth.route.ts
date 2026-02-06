import { Router } from "express";
import { authController } from "@/controllers/auth.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { validate } from "@/middleware/validate.middleware.js";
import {
	registerSchema,
	loginSchema,
	changePasswordSchema,
} from "@/validators/auth.validator.js";

const router = Router();

/**
 * Public routes
 */
router.post(
	"/register",
	validate(registerSchema),
	authController.register.bind(authController),
);
router.post(
	"/login",
	validate(loginSchema),
	authController.login.bind(authController),
);

/**
 * Protected routes
 */
router.get("/me", authenticate, authController.getProfile.bind(authController));
router.patch(
	"/profile",
	authenticate,
	authController.updateProfile.bind(authController),
);
router.post(
	"/change-password",
	authenticate,
	validate(changePasswordSchema),
	authController.changePassword.bind(authController),
);

export default router;
