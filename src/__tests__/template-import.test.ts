import { describe, it, expect } from 'vitest';
import { importOwcTemplate, isOwcTemplateJson } from '../template-import';

describe('importOwcTemplate', () => {
	it('imports a basic OWC template', () => {
		const json = JSON.stringify({
			schemaVersion: '0.1.0',
			name: 'My Article',
			noteNameFormat: '{{title}}',
			path: 'Clips',
			properties: [
				{ name: 'Source', value: '{{url}}', type: 'text' },
				{ name: 'Author', value: '{{author}}', type: 'text' },
			],
			triggers: ['https://example.com'],
			noteContentFormat: '# {{title}}\n\n{{content}}',
		});

		const result = importOwcTemplate(json);
		expect(result.name).toBe('My Article');
		expect(result.folder).toBe('Clips');
		expect(result.filenameTemplate).toBe('{{title}}');
		expect(result.bodyTemplate).toBe('# {{title}}\n\n{{content}}');
		expect(result.properties).toHaveLength(2);
		expect(result.properties[0].name).toBe('source');
		expect(result.properties[0].value).toBe('{{url}}');
		expect(result.urlPatterns).toHaveLength(1);
		expect(result.id).toBeTruthy();
	});

	it('strips OWC filter syntax from variables', () => {
		const json = JSON.stringify({
			name: 'Filtered',
			noteNameFormat: '{{title|safe_name}}',
			noteContentFormat: '{{content|markdown|trim}}',
			properties: [
				{ name: 'Date', value: '{{published|date:"YYYY-MM-DD"}}', type: 'datetime' },
			],
		});

		const result = importOwcTemplate(json);
		expect(result.filenameTemplate).toBe('{{title}}');
		expect(result.bodyTemplate).toBe('{{content}}');
		expect(result.properties[0].value).toBe('{{publishedDate}}');
	});

	it('maps OWC-specific variable names to local equivalents', () => {
		const json = JSON.stringify({
			name: 'Mapped',
			noteContentFormat: '{{image}} {{site}} {{published}}',
			properties: [],
		});

		const result = importOwcTemplate(json);
		expect(result.bodyTemplate).toBe('{{ogImage}} {{siteName}} {{publishedDate}}');
	});

	it('maps selector-based variables to content', () => {
		const json = JSON.stringify({
			name: 'Selector',
			noteContentFormat: '{{selectorHtml:article|markdown}}',
			properties: [],
		});

		const result = importOwcTemplate(json);
		expect(result.bodyTemplate).toBe('{{content}}');
	});

	it('ignores non-HTTP triggers (schema types)', () => {
		const json = JSON.stringify({
			name: 'Schema',
			triggers: ['schema:@Article', 'https://example.com/blog/*'],
			noteContentFormat: '{{content}}',
		});

		const result = importOwcTemplate(json);
		expect(result.urlPatterns).toHaveLength(1);
		expect(result.urlPatterns[0]).toContain('example\\.com');
	});

	it('escapes regex special characters in triggers', () => {
		const json = JSON.stringify({
			name: 'Escaped',
			triggers: ['https://example.com/path?q=1'],
			noteContentFormat: '{{content}}',
		});

		const result = importOwcTemplate(json);
		expect(result.urlPatterns[0]).toContain('example\\.com');
		expect(result.urlPatterns[0]).toContain('\\?');
	});

	it('uses defaults for missing fields', () => {
		const json = JSON.stringify({
			name: 'Minimal',
		});

		const result = importOwcTemplate(json);
		expect(result.name).toBe('Minimal');
		expect(result.folder).toBe('');
		expect(result.filenameTemplate).toBe('{{title}}');
		expect(result.bodyTemplate).toBe('{{content}}');
		expect(result.properties).toHaveLength(0);
		expect(result.urlPatterns).toHaveLength(0);
	});

	it('throws on completely invalid JSON', () => {
		expect(() => importOwcTemplate('not json')).toThrow();
	});

	it('throws on missing required fields', () => {
		expect(() => importOwcTemplate('{}')).toThrow('Invalid template');
	});

	it('generates unique IDs for each import', () => {
		const json = JSON.stringify({ name: 'Test', noteContentFormat: '{{content}}' });
		const a = importOwcTemplate(json);
		const b = importOwcTemplate(json);
		expect(a.id).not.toBe(b.id);
	});
});

describe('isOwcTemplateJson', () => {
	it('returns true for valid OWC template JSON', () => {
		expect(isOwcTemplateJson('{"name":"Test"}')).toBe(true);
		expect(isOwcTemplateJson('{"noteContentFormat":"{{content}}"}')).toBe(true);
		expect(isOwcTemplateJson('{"properties":[]}')).toBe(true);
	});

	it('returns false for invalid JSON', () => {
		expect(isOwcTemplateJson('not json')).toBe(false);
		expect(isOwcTemplateJson('')).toBe(false);
	});

	it('returns false for JSON without template fields', () => {
		expect(isOwcTemplateJson('{"foo":"bar"}')).toBe(false);
		expect(isOwcTemplateJson('42')).toBe(false);
		expect(isOwcTemplateJson('null')).toBe(false);
	});
});
