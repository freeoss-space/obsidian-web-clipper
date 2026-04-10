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
): { filename: string; frontmatter: Record<string, string>; body: string; listProperties: string[] } {
	// Use a single timestamp for all date/time replacements in this invocation
	const now = new Date();
	const vars = buildVariables(page, now);

	const filename = sanitizeFilename(replaceVariables(template.filenameTemplate, vars, now));
	const frontmatter: Record<string, string> = {};
	const listProperties: string[] = [];

	for (const prop of template.properties) {
		const value = replaceVariables(prop.value, vars, now);
		if (value.trim()) {
			frontmatter[prop.name] = value;
			if (prop.type === 'list') {
				listProperties.push(prop.name);
			}
		}
	}

	const body = replaceVariables(template.bodyTemplate, vars, now);

	return { filename, frontmatter, body, listProperties };
}

function buildVariables(page: ClippedPage, now: Date): Record<string, string> {
	// Idea 24: hostname — strip leading www.
	let hostname = '';
	try {
		hostname = new URL(page.url).hostname.replace(/^www\./, '');
	} catch {
		// leave empty if URL is unparseable
	}

	// Idea 8: word count and reading time (200 wpm average)
	const words = page.content.trim().split(/\s+/).filter(Boolean);
	const wordCount = words.length;
	const readingTime = Math.max(1, Math.ceil(wordCount / 200));

	return {
		title: page.title,
		url: page.url,
		hostname,
		author: page.author,
		description: page.description,
		ogImage: page.ogImage,
		siteName: page.siteName,
		publishedDate: page.publishedDate,
		tags: page.tags,
		content: page.content,
		wordCount: String(wordCount),
		readingTime: String(readingTime),
		// Default date/time formats (used when no format argument is provided)
		date: formatDate(now, 'YYYY-MM-DD'),
		time: formatDate(now, 'HH:mm:ss'),
	};
}

/**
 * Replace {{variable}} and {{variable:FORMAT}} tokens in a template string.
 * The :FORMAT argument is only processed for the 'date' and 'time' keys.
 */
function replaceVariables(template: string, vars: Record<string, string>, now: Date): string {
	// Matches {{key}} or {{key:format}} where format can contain any chars except '}'
	return template.replace(/\{\{(\w+)(?::([^}]*))?\}\}/g, (match, key, fmt) => {
		if (fmt !== undefined && (key === 'date' || key === 'time')) {
			return formatDate(now, fmt);
		}
		return vars[key] ?? match;
	});
}

/**
 * Idea 1: Format a Date using day.js-compatible format tokens.
 * Supported: YYYY MM DD HH mm ss x (unix ms) X (unix s)
 *
 * A single-pass regex replacement is used (longest tokens first) to prevent
 * partial matches, e.g. 'MM' inside a future 'MMMM' token.
 */
function formatDate(d: Date, fmt: string): string {
	const tokens: Record<string, string> = {
		'YYYY': String(d.getFullYear()),
		'MM':   String(d.getMonth() + 1).padStart(2, '0'),
		'DD':   String(d.getDate()).padStart(2, '0'),
		'HH':   String(d.getHours()).padStart(2, '0'),
		'mm':   String(d.getMinutes()).padStart(2, '0'),
		'ss':   String(d.getSeconds()).padStart(2, '0'),
		'x':    String(d.getTime()),
		'X':    String(Math.floor(d.getTime() / 1000)),
	};
	// Sort keys by descending length so that longer tokens take precedence
	const pattern = new RegExp(
		Object.keys(tokens).sort((a, b) => b.length - a.length).join('|'),
		'g'
	);
	return fmt.replace(pattern, (token) => tokens[token] ?? token);
}

function sanitizeFilename(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 200);
}

/**
 * Idea 4: Properly escape a scalar YAML value.
 * Uses literal block scalar for multi-line content; double-quotes for values
 * that would be misinterpreted by YAML parsers.
 */
function yamlValue(value: string): string {
	// Multi-line: use literal block scalar
	if (value.includes('\n')) {
		const indented = value.split('\n').map(l => `  ${l}`).join('\n');
		return `|\n${indented}`;
	}

	const bare = value.trim();

	const needsQuoting =
		// Leading characters with special YAML meaning
		/^[-[\]{}>|!&*?@`#"'%]/.test(bare) ||
		// Colon followed by whitespace (key separator)
		/:\s/.test(bare) ||
		// Inline comment marker
		/\s#/.test(bare) ||
		// YAML boolean/null keywords
		/^(true|false|null|~|yes|no|on|off)$/i.test(bare) ||
		// Bare number or decimal — would be parsed as numeric
		/^\d/.test(bare) ||
		// Double quotes in the value must be escaped, so quote the whole thing
		bare.includes('"') ||
		// Backslashes also require escaping inside double-quoted YAML scalars
		bare.includes('\\') ||
		// URLs contain "://" which some YAML parsers can misread
		bare.includes('://');

	if (needsQuoting) {
		const escaped = bare.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		return `"${escaped}"`;
	}

	return value;
}

/**
 * Serialise frontmatter and body into a complete Obsidian note string.
 *
 * @param frontmatter  Key/value pairs for YAML frontmatter.
 * @param body         Markdown body content.
 * @param listProperties  Property names whose values should be rendered as YAML sequences.
 */
export function generateNoteContent(
	frontmatter: Record<string, string>,
	body: string,
	listProperties?: string[]
): string {
	const listSet = new Set(listProperties ?? []);
	const lines: string[] = ['---'];

	for (const [key, value] of Object.entries(frontmatter)) {
		if (listSet.has(key)) {
			// Idea 7: render as a YAML sequence
			const items = value.split(',').map(s => s.trim()).filter(Boolean);
			if (items.length > 0) {
				lines.push(`${key}:`);
				for (const item of items) {
					lines.push(`  - ${item}`);
				}
			}
		} else {
			lines.push(`${key}: ${yamlValue(value)}`);
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
