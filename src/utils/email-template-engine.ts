import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email template engine
export class EmailTemplateEngine {
	private templates = new Map<string, string>();

	// Load template from file
	loadTemplate(name: string, filePath: string): void {
		const fullPath = path.join(__dirname, "..", filePath);
		const content = readFileSync(fullPath, "utf-8");
		this.templates.set(name, content);
	}

	// Render template with data
	render(templateName: string, data: Record<string, any>): string {
		const template = this.templates.get(templateName);

		if (!template) {
			throw new Error(`Template ${templateName} not found`);
		}

		return this.replaceVariables(template, data);
	}

	// Replace variables with actual values
	private replaceVariables(
		template: string,
		data: Record<string, any>,
	): string {
		return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
			return data[key] !== undefined ? String(data[key]) : match;
		});
	}
}

export const emailTemplates = new EmailTemplateEngine();

// Load templates on startup
emailTemplates.loadTemplate("receipt-html", "templates/email/receipt.html");
emailTemplates.loadTemplate("receipt-text", "templates/email/receipt.txt");
