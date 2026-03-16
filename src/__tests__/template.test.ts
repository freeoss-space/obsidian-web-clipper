import { describe, it, expect } from 'vitest';
import {
	findMatchingTemplate,
	applyTemplate,
	generateNoteContent,
	generateTemplateId,
} from '../template';
import { ClipTemplate, ClippedPage } from '../types';

function makeTemplate(overrides: Partial<ClipTemplate> = {}): ClipTemplate {
	return {
		id: 'test',
		name: 'Test',
		folder: '',
		filenameTemplate: '{{title}}',
		urlPatterns: [],
		properties: [{ name: 'source', value: '{{url}}' }],
		bodyTemplate: '{{content}}',
		...overrides,
	};
}

function makePage(overrides: Partial<ClippedPage> = {}): ClippedPage {
	return {
		url: 'https://example.com/article',
		title: 'Test Article',
		author: 'John Doe',
		description: 'A test article',
		ogImage: 'https://example.com/image.jpg',
		siteName: 'Example',
		publishedDate: '2024-01-15',
		content: 'Article body content',
		rawHtml: '<html></html>',
		...overrides,
	};
}

describe('findMatchingTemplate', () => {
	it('returns default template when no patterns match', () => {
		const templates = [
			makeTemplate({ id: 'default', urlPatterns: [] }),
			makeTemplate({ id: 'github', urlPatterns: ['https://github\\.com/.*'] }),
		];
		const result = findMatchingTemplate('https://example.com', templates, 'default');
		expect(result.id).toBe('default');
	});

	it('matches a URL against regex patterns', () => {
		const templates = [
			makeTemplate({ id: 'default', urlPatterns: [] }),
			makeTemplate({ id: 'github', urlPatterns: ['https://github\\.com/.*'] }),
		];
		const result = findMatchingTemplate('https://github.com/user/repo', templates, 'default');
		expect(result.id).toBe('github');
	});

	it('falls back to glob-like matching for invalid regex', () => {
		const templates = [
			makeTemplate({ id: 'default', urlPatterns: [] }),
			makeTemplate({ id: 'wild', urlPatterns: ['https://example.com/*'] }),
		];
		const result = findMatchingTemplate('https://example.com/page', templates, 'default');
		expect(result.id).toBe('wild');
	});

	it('returns first template if default ID not found', () => {
		const templates = [
			makeTemplate({ id: 'first', urlPatterns: [] }),
			makeTemplate({ id: 'second', urlPatterns: [] }),
		];
		const result = findMatchingTemplate('https://example.com', templates, 'nonexistent');
		expect(result.id).toBe('first');
	});

	it('skips empty patterns', () => {
		const templates = [
			makeTemplate({ id: 'default', urlPatterns: ['', '  '] }),
		];
		const result = findMatchingTemplate('https://example.com', templates, 'default');
		expect(result.id).toBe('default');
	});
});

describe('applyTemplate', () => {
	it('replaces variables in filename, properties, and body', () => {
		const template = makeTemplate({
			filenameTemplate: '{{title}}',
			properties: [
				{ name: 'source', value: '{{url}}' },
				{ name: 'author', value: '{{author}}' },
			],
			bodyTemplate: '# {{title}}\n\n{{content}}',
		});
		const page = makePage();
		const result = applyTemplate(template, page);

		expect(result.filename).toBe('Test Article');
		expect(result.frontmatter.source).toBe('https://example.com/article');
		expect(result.frontmatter.author).toBe('John Doe');
		expect(result.body).toContain('# Test Article');
		expect(result.body).toContain('Article body content');
	});

	it('sanitizes filenames with invalid characters', () => {
		const template = makeTemplate({ filenameTemplate: '{{title}}' });
		const page = makePage({ title: 'Test: A "Special" <Article>' });
		const result = applyTemplate(template, page);
		expect(result.filename).not.toMatch(/[\\/:*?"<>|]/);
	});

	it('truncates filenames longer than 200 characters', () => {
		const template = makeTemplate({ filenameTemplate: '{{title}}' });
		const page = makePage({ title: 'A'.repeat(300) });
		const result = applyTemplate(template, page);
		expect(result.filename.length).toBeLessThanOrEqual(200);
	});

	it('omits properties with empty values', () => {
		const template = makeTemplate({
			properties: [
				{ name: 'source', value: '{{url}}' },
				{ name: 'author', value: '{{author}}' },
			],
		});
		const page = makePage({ author: '' });
		const result = applyTemplate(template, page);
		expect(result.frontmatter.source).toBeDefined();
		expect(result.frontmatter.author).toBeUndefined();
	});

	it('includes date and time variables', () => {
		const template = makeTemplate({
			properties: [{ name: 'clipped', value: '{{date}}' }],
			bodyTemplate: 'Clipped at {{time}}',
		});
		const page = makePage();
		const result = applyTemplate(template, page);
		expect(result.frontmatter.clipped).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(result.body).toMatch(/Clipped at \d{2}:\d{2}:\d{2}/);
	});

	it('preserves unknown variables as-is', () => {
		const template = makeTemplate({ bodyTemplate: '{{unknown_var}}' });
		const page = makePage();
		const result = applyTemplate(template, page);
		expect(result.body).toBe('{{unknown_var}}');
	});
});

describe('generateNoteContent', () => {
	it('generates YAML frontmatter and body', () => {
		const frontmatter = { source: 'https://example.com', author: 'Jane' };
		const body = 'Hello world';
		const result = generateNoteContent(frontmatter, body);

		expect(result).toContain('---');
		expect(result).toContain('source: "https://example.com"');
		expect(result).toContain('author: Jane');
		expect(result).toContain('Hello world');
	});

	it('quotes values containing colons', () => {
		const result = generateNoteContent({ url: 'https://example.com' }, '');
		expect(result).toContain('url: "https://example.com"');
	});

	it('quotes values containing hash symbols', () => {
		const result = generateNoteContent({ tag: '#test' }, '');
		expect(result).toContain('tag: "#test"');
	});

	it('escapes double quotes in values', () => {
		const result = generateNoteContent({ title: 'A "quoted" title' }, '');
		expect(result).toContain('title: "A \\"quoted\\" title"');
	});

	it('produces valid structure with empty frontmatter', () => {
		const result = generateNoteContent({}, 'body text');
		expect(result).toBe('---\n---\n\nbody text');
	});
});

describe('generateTemplateId', () => {
	it('returns a non-empty string', () => {
		const id = generateTemplateId();
		expect(id).toBeTruthy();
		expect(typeof id).toBe('string');
	});

	it('generates unique IDs', () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateTemplateId()));
		expect(ids.size).toBe(100);
	});
});
