// src/services/index.ts

import { PaymentService } from "./payment.service.js";
import { OrderService } from "./order.service.js";
import { ReceiptService } from "./receipt.service.js";
import { WebhookService } from "./webhook.service.js";
import { StorageService } from "./storage.service.js";
import { EmailService } from "./email.service.js";
import { AdminService } from "./admin.service.js";

import { generateReceiptPDF } from "../utils/pdf-generator.js";
import { cloudinary } from "../config/cloudinary.js";
import { emailProvider } from "../config/email.js";
import { queueManager } from "../queues/queue-manager.js";
import { RecoveryService } from "./recovery.service.js";

// Simple console logger
const logger = {
	info: (message: string, meta?: any) =>
		console.log(`[INFO] ${message}`, meta ?? ""),
	warn: (message: string, meta?: any) =>
		console.warn(`[WARN] ${message}`, meta ?? ""),
	error: (message: string, meta?: any) =>
		console.error(`[ERROR] ${message}`, meta ?? ""),
};

/**
 * Service Factory
 * Single place to create and wire up all services
 */
class ServiceFactory {
	private static instance: ServiceFactory;

	// Service instances
	private _paymentService?: PaymentService;
	private _orderService?: OrderService;
	private _receiptService?: ReceiptService;
	private _storageService?: StorageService;
	private _emailService?: EmailService;
	private _webhookService?: WebhookService;
	private _adminService?: AdminService;
    private _recoveryService?: RecoveryService;

	// private constructor() {}

	static getInstance(): ServiceFactory {
		if (!ServiceFactory.instance) {
			ServiceFactory.instance = new ServiceFactory();
		}
		return ServiceFactory.instance;
	}

	get paymentService(): PaymentService {
		this._paymentService ??= new PaymentService(logger);
        return this._paymentService;
	}

	get orderService(): OrderService {
		this._orderService ??= new OrderService(logger);
		return this._orderService;
	}

	get receiptService(): ReceiptService {
        this._receiptService ??= new ReceiptService(
            { generate: generateReceiptPDF },
            logger,
        );
		return this._receiptService;
	}

	get storageService(): StorageService {
		this._storageService ??= new StorageService(cloudinary, logger);
		return this._storageService;
	}

	get emailService(): EmailService {
		this._emailService ??= new EmailService(emailProvider, logger);
		return this._emailService;
	}

	get webhookService(): WebhookService {
        this._webhookService ??= new WebhookService(
            this.paymentService,
            this.orderService,
            this.receiptService,
            queueManager,
            logger,
        );
		return this._webhookService;
	}

	get adminService(): AdminService {
		this._adminService ??= new AdminService(logger);
		return this._adminService;
	}

    get recoveryService(): RecoveryService {
        this._recoveryService ??= new RecoveryService(
            receiptService,
            storageService,
            emailService,
            queueManager,
            logger,
        )
        return this._recoveryService;
    }
}

// Export singleton instance
export const services = ServiceFactory.getInstance();

// Export individual services
export const paymentService = services.paymentService;
export const orderService = services.orderService;
export const receiptService = services.receiptService;
export const storageService = services.storageService;
export const emailService = services.emailService;
export const webhookService = services.webhookService;
export const adminService = services.adminService;
export const recoveryService = services.recoveryService;
