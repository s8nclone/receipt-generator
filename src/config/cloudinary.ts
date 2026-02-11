import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

// Cloudinary configuration
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
	secure: true,
});

// Verify Cloudinary configuration
export const verifyCloudinaryConfig = (): boolean => {
	const { cloud_name, api_key, api_secret } = cloudinary.config();

	if (!cloud_name || !api_key || !api_secret) {
		console.error("Cloudinary configuration missing");
		console.error(
			"Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
		);
		return false;
	}

	console.log("Cloudinary configured:", cloud_name);
	return true;
};

// Test Cloudinary connection
export const testCloudinaryConnection = async (): Promise<boolean> => {
	try {
		// Ping Cloudinary API
		await cloudinary.api.ping();
		console.log("Cloudinary connection successful");
		return true;
	} catch (error: any) {
		console.error("Cloudinary connection failed:", error.message);
		return false;
	}
};

// Get Cloudinary upload stats
export const getCloudinaryStats = async () => {
	try {
		const usage = await cloudinary.api.usage();
		return {
			credits: usage.credits,
			usedPercent: usage.used_percent,
			mediaCount: usage.resources,
			bandwidth: usage.bandwidth,
			storage: usage.storage,
		};
	} catch (error: any) {
		console.error("Failed to get Cloudinary stats:", error.message);
		return null;
	}
};

// Generate signed upload URL
export const generateUploadSignature = (folder = "receipts") => {
	const timestamp = Math.round(Date.now() / 1000);

	const signature = cloudinary.utils.api_sign_request(
		{
			timestamp,
			folder,
			resource_type: "raw",
		},
		process.env.CLOUDINARY_API_SECRET ?? "",
	);

	return {
		signature,
		timestamp,
		apiKey: process.env.CLOUDINARY_API_KEY,
		cloudName: process.env.CLOUDINARY_CLOUD_NAME,
		folder,
	};
};

// Delete file from Cloudinary
export const deleteFromCloudinary = async (
	publicId: string,
): Promise<boolean> => {
	try {
		const result = await cloudinary.uploader.destroy(publicId, {
			resource_type: "raw",
			invalidate: true,
		});

		return result.result === "ok";
	} catch (error: any) {
		console.error("Failed to delete from Cloudinary:", error.message);
		return false;
	}
};

// Get file info from Cloudinary
export const getCloudinaryFileInfo = async (publicId: string) => {
	try {
		const result = await cloudinary.api.resource(publicId, {
			resource_type: "raw",
		});

		return {
			publicId: result.public_id,
			format: result.format,
			bytes: result.bytes,
			url: result.url,
			secureUrl: result.secure_url,
			createdAt: result.created_at,
		};
	} catch (error: any) {
		console.error("Failed to get file info:", error.message);
		return null;
	}
};

// Verify config on startup
verifyCloudinaryConfig();

// Export configured instance
export { cloudinary };
