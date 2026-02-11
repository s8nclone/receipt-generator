import { prisma } from "@/lib/prisma.js";
import { StorageStatus } from "@/generated/enums.js";
// import { promises as fs } from "fs";

export class StorageService {
	constructor(
		private cloudinary: any,
		private logger: any,
	) {}

	// Upload PDF to Cloudinary
	async uploadReceipt(receiptId: string) {
		const receipt = await prisma.receipt.findUnique({
			where: { id: receiptId },
			select: {
				id: true,
				cloudinaryUploaded: true,
				cloudinarySecureUrl: true,
				pdfGenerated: true,
				pdfLocalPath: true,
				pdfSizeBytes: true,
				storeId: true,
				userId: true,
				orderId: true,
			},
		});

		if (!receipt) {
			throw new Error(`Receipt ${receiptId} not found`);
		}

		// Idempotency check
		if (receipt.cloudinaryUploaded) {
			this.logger.info("Receipt already uploaded", { receiptId });
			return {
				alreadyUploaded: true,
				url: receipt.cloudinarySecureUrl,
			};
		}

		if (!receipt.pdfGenerated || !receipt.pdfLocalPath) {
			throw new Error(`PDF not generated for receipt ${receiptId}`);
		}

		try {
			// Upload to Cloudinary
			const uploadResult = await this.cloudinary.uploader.upload(
				receipt.pdfLocalPath,
				{
					folder: `receipts/${receipt.storeId}/${new Date().getFullYear()}`,
					public_id: `receipt_${receiptId}`,
					resource_type: "raw",
					type: "authenticated",
					tags: [
						"receipt",
						`user_${receipt.userId}`,
						`order_${receipt.orderId}`,
					],
				},
			);

			// Update receipt with upload info
			await prisma.receipt.update({
				where: { id: receiptId },
				data: {
					cloudinaryUploaded: true,
					cloudinaryUploadedAt: new Date(),
					cloudinaryPublicId: uploadResult.public_id,
					cloudinaryUrl: uploadResult.url,
					cloudinarySecureUrl: uploadResult.secure_url,
					cloudinaryUploadAttempts: {
						increment: 1,
					},
				},
			});

			// Log successful upload
			await prisma.cloudStorageLog.create({
				data: {
					receiptId,
					provider: "cloudinary",
					operation: "upload",
					publicId: uploadResult.public_id,
					url: uploadResult.url,
					secureUrl: uploadResult.secure_url,
					status: StorageStatus.SUCCESS,
					fileSize: receipt.pdfSizeBytes,
					format: "pdf",
					uploadedAt: new Date(),
					expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
				},
			});

			this.logger.info("Receipt uploaded to Cloudinary", {
				receiptId,
				publicId: uploadResult.public_id,
			});

			return {
				success: true,
				publicId: uploadResult.public_id,
				secureUrl: uploadResult.secure_url,
			};
		} catch (error: any) {
			// Increment attempt counter
			await prisma.receipt.update({
				where: { id: receiptId },
				data: {
					cloudinaryUploadAttempts: {
						increment: 1,
					},
				},
			});

			// Log failed upload
			await prisma.cloudStorageLog.create({
				data: {
					receiptId,
					provider: "cloudinary",
					operation: "upload",
					status: StorageStatus.FAILED,
					attempts:
						(
							await prisma.receipt.findUnique({
								where: { id: receiptId },
								select: { cloudinaryUploadAttempts: true },
							})
						)?.cloudinaryUploadAttempts ?? 1,
					error: {
						code: error.http_code,
						message: error.message,
						httpStatus: error.http_code,
					},
					expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
				},
			});

			this.logger.error("Cloudinary upload failed", { receiptId, error });
			throw error;
		}
	}

	// Regenerate signed URL for receipt
	async regenerateSignedURL(receiptId: string): Promise<string> {
		const receipt = await prisma.receipt.findUnique({
			where: { id: receiptId },
			select: {
				cloudinaryUploaded: true,
				cloudinaryPublicId: true,
			},
		});

		if (!receipt?.cloudinaryUploaded || !receipt.cloudinaryPublicId) {
			throw new Error("Receipt not found or not uploaded to cloud");
		}

		const signedUrl = this.cloudinary.url(receipt.cloudinaryPublicId, {
			sign_url: true,
			type: "authenticated",
			expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
		});

		await prisma.receipt.update({
			where: { id: receiptId },
			data: {
				cloudinarySignedUrl: signedUrl,
				cloudinarySignedUrlExpiresAt: new Date(
					Date.now() + 24 * 60 * 60 * 1000,
				),
			},
		});

		return signedUrl;
	}
}
