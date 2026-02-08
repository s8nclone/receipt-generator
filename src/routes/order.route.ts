import { Router } from "express";
import { orderController } from "@/controllers/order.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { validate } from "@/middleware/validate.middleware.js";
import { createOrderSchema } from "@/validators/order.validator.js";

const router = Router();

// All order routes require authentication
router.use(authenticate);

router.post(
	"/",
	validate(createOrderSchema),
	orderController.createOrder.bind(orderController),
);
router.get("/", orderController.getUserOrders.bind(orderController));
router.get("/stores", orderController.getAllStores.bind(orderController));
router.get("/:id", orderController.getOrder.bind(orderController));
router.post("/:id/cancel", orderController.cancelOrder.bind(orderController));

export default router;
