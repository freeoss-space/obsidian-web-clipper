import { describe, it, expect } from 'vitest';
import { importOwcTemplate, importOwcTemplates, isOwcTemplateJson } from '../template-import';

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

describe('importOwcTemplates', () => {
	it('imports a single template object', () => {
		const json = JSON.stringify({ name: 'Single', noteContentFormat: '{{content}}' });
		const results = importOwcTemplates(json);
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe('Single');
	});

	it('imports an array of templates', () => {
		const json = JSON.stringify([
			{ name: 'First', noteContentFormat: '{{content}}' },
			{ name: 'Second', noteContentFormat: '# {{title}}' },
		]);
		const results = importOwcTemplates(json);
		expect(results).toHaveLength(2);
		expect(results[0].name).toBe('First');
		expect(results[1].name).toBe('Second');
		expect(results[0].id).not.toBe(results[1].id);
	});

	it('throws on empty array', () => {
		expect(() => importOwcTemplates('[]')).toThrow('empty array');
	});

	it('throws on invalid template in array', () => {
		const json = JSON.stringify([{}]);
		expect(() => importOwcTemplates(json)).toThrow('Invalid template');
	});

	it('imports templates from a full browser extension settings export', () => {
		const json = JSON.stringify({
			general_settings: { showMoreActionsButton: false },
			template_abc123: {
				id: 'abc123',
				name: 'Article',
				behavior: 'create',
				noteNameFormat: '{{title}}',
				path: 'Clips',
				noteContentFormat: '{{content}}',
				properties: [
					{ id: '1', name: 'source', value: '{{url}}', type: 'text' },
				],
				triggers: [],
				context: '',
			},
			template_def456: {
				id: 'def456',
				name: 'Bookmark',
				behavior: 'create',
				noteNameFormat: '{{title}}',
				path: 'Bookmarks',
				noteContentFormat: '',
				properties: [],
				triggers: [],
				context: '',
			},
			template_list: ['def456', 'abc123'],
			vaults: [],
		});
		const results = importOwcTemplates(json);
		expect(results).toHaveLength(2);
		// template_list ordering should be respected
		expect(results[0].name).toBe('Bookmark');
		expect(results[1].name).toBe('Article');
	});

	it('imports templates from export without template_list', () => {
		const json = JSON.stringify({
			general_settings: {},
			template_xyz: {
				name: 'Only Template',
				noteContentFormat: '{{content}}',
				properties: [],
			},
		});
		const results = importOwcTemplates(json);
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe('Only Template');
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

	it('returns true for an array of valid templates', () => {
		expect(isOwcTemplateJson('[{"name":"A"},{"name":"B"}]')).toBe(true);
	});

	it('returns false for an empty array', () => {
		expect(isOwcTemplateJson('[]')).toBe(false);
	});

	it('returns false for an array of non-template objects', () => {
		expect(isOwcTemplateJson('[{"foo":"bar"}]')).toBe(false);
	});

	it('returns true for a full browser extension settings export', () => {
		const json = JSON.stringify({
			general_settings: {},
			template_abc: { name: 'Test', noteContentFormat: '{{content}}' },
			template_list: ['abc'],
		});
		expect(isOwcTemplateJson(json)).toBe(true);
	});
});
