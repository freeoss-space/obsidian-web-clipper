import { ClipTemplate, ClippedPage, TemplateProperty } from './types';

export function findMatchingTemplate(
	url: string,
	templates: ClipTemplate[],
	defaultTemplateId: string
): ClipTemplate {
	// Check URL patterns first
	for (const template of templates) {
		if (template.urlPatterns.length === 0) continue;
		for (const pattern of template.urlPatterns) {
			if (!pattern.trim()) continue;
			try {
				const regex = new RegExp(pattern);
				if (regex.test(url)) {
					return template;
				}
			} catch {
				// If not valid regex, try simple glob-like matching
				const escaped = pattern
					.replace(/[.+^${}()|[\]\\]/g, '\\$&')
					.replace(/\*/g, '.*');
				if (new RegExp(escaped).test(url)) {
					return template;
				}
			}
		}
	}

	// Fall back to default template
	return templates.find(t => t.id === defaultTemplateId) || templates[0];
}

export function applyTemplate(
	template: ClipTemplate,
	page: ClippedPage
): { filename: string; frontmatter: Record<string, string>; body: string } {
	const vars = buildVariables(page);

	const filename = sanitizeFilename(replaceVariables(template.filenameTemplate, vars));
	const frontmatter: Record<string, string> = {};

	for (const prop of template.properties) {
		const value = replaceVariables(prop.value, vars);
		if (value.trim()) {
			frontmatter[prop.name] = value;
		}
	}

	const body = replaceVariables(template.bodyTemplate, vars);

	return { filename, frontmatter, body };
}

function buildVariables(page: ClippedPage): Record<string, string> {
	const now = new Date();
	return {
		title: page.title,
		url: page.url,
		author: page.author,
		description: page.description,
		ogImage: page.ogImage,
		siteName: page.siteName,
		publishedDate: page.publishedDate,
		content: page.content,
		date: now.toISOString().split('T')[0],
		time: now.toISOString().split('T')[1].split('.')[0],
	};
}

function replaceVariables(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		return vars[key] ?? match;
	});
}

function sanitizeFilename(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 200);
}

export function generateNoteContent(
	frontmatter: Record<string, string>,
	body: string
): string {
	const lines: string[] = ['---'];

	for (const [key, value] of Object.entries(frontmatter)) {
		// Quote values that contain special YAML characters
		if (value.includes(':') || value.includes('#') || value.includes('"') || value.includes("'")) {
			lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
		} else {
			lines.push(`${key}: ${value}`);
		}
	}

	lines.push('---');
	lines.push('');
	lines.push(body);

	return lines.join('\n');
}

export function generateTemplateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
