import { ClipTemplate, TemplateProperty } from './types';
import { generateTemplateId } from './template';

/**
 * Obsidian Web Clipper (official browser extension) template JSON schema.
 * Reference: https://help.obsidian.md/web-clipper/templates
 */
interface OwcTemplate {
	schemaVersion?: string;
	name?: string;
	behavior?: string;
	noteNameFormat?: string;
	path?: string;
	context?: string;
	properties?: OwcProperty[];
	triggers?: string[];
	noteContentFormat?: string;
}

interface OwcProperty {
	name: string;
	value: string;
	type?: string;
}

/**
 * Parse and convert an Obsidian Web Clipper template JSON into our ClipTemplate format.
 * Strips OWC-specific filter syntax (e.g. `{{title|safe_name}}` → `{{title}}`).
 */
export function importOwcTemplate(json: string): ClipTemplate {
	return convertOwcTemplate(JSON.parse(json) as OwcTemplate);
}

/**
 * Import one or more OWC templates from a JSON string.
 * Accepts either a single template object or an array of templates.
 */
export function importOwcTemplates(json: string): ClipTemplate[] {
	const data = JSON.parse(json);

	if (Array.isArray(data)) {
		if (data.length === 0) {
			throw new Error('Invalid template: empty array');
		}
		return data.map((item: OwcTemplate) => convertOwcTemplate(item));
	}

	return [convertOwcTemplate(data as OwcTemplate)];
}

function convertOwcTemplate(data: OwcTemplate): ClipTemplate {
	if (!data.name && !data.noteContentFormat && !data.properties) {
		throw new Error('Invalid template: missing required fields (name, properties, or noteContentFormat)');
	}

	const properties: TemplateProperty[] = (data.properties || []).map(p => ({
		name: p.name.toLowerCase().replace(/\s+/g, '_'),
		value: convertOwcVariable(p.value),
	}));

	const triggers = (data.triggers || [])
		.filter(t => t.startsWith('http'))
		.map(t => escapeRegexSpecials(t));

	return {
		id: generateTemplateId(),
		name: data.name || 'Imported Template',
		folder: data.path || '',
		filenameTemplate: convertOwcVariable(data.noteNameFormat || '{{title}}'),
		urlPatterns: triggers,
		properties,
		bodyTemplate: convertOwcVariable(data.noteContentFormat || '{{content}}'),
	};
}

/**
 * Convert OWC variable syntax to our simpler {{variable}} format.
 * OWC uses filters like {{title|safe_name|lower}} and selectors like {{selectorHtml:article|markdown}}.
 * We strip filters and map selector variables to our equivalents.
 */
function convertOwcVariable(text: string): string {
	return text.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
		const parts = expr.split('|');
		const varName = parts[0].trim();

		// Map OWC-specific variables to our equivalents
		const mapped = mapOwcVariable(varName);
		return `{{${mapped}}}`;
	});
}

const OWC_VARIABLE_MAP: Record<string, string> = {
	'title': 'title',
	'url': 'url',
	'author': 'author',
	'description': 'description',
	'image': 'ogImage',
	'site': 'siteName',
	'siteName': 'siteName',
	'published': 'publishedDate',
	'date': 'date',
	'time': 'time',
	'content': 'content',
	'fullHtml': 'content',
};

function mapOwcVariable(varName: string): string {
	// Handle selector-based variables (e.g. "selectorHtml:article")
	if (varName.startsWith('selector')) {
		return 'content';
	}
	return OWC_VARIABLE_MAP[varName] || varName;
}

function escapeRegexSpecials(url: string): string {
	return url.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
}

/**
 * Validate that a string looks like an OWC template JSON.
 */
export function isOwcTemplateJson(text: string): boolean {
	try {
		const data = JSON.parse(text);
		if (Array.isArray(data)) {
			return data.length > 0 && isOwcObject(data[0]);
		}
		return isOwcObject(data);
	} catch {
		return false;
	}
}

function isOwcObject(data: unknown): boolean {
	return (
		typeof data === 'object' &&
		data !== null &&
		(typeof (data as OwcTemplate).name === 'string' ||
		 typeof (data as OwcTemplate).noteContentFormat === 'string' ||
		 Array.isArray((data as OwcTemplate).properties))
	);
}
