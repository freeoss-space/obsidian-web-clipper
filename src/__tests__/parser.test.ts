// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
// The 'obsidian' module is aliased to a stub in vitest.config.ts; no manual mock needed.
import { parseHtml, extractContentWithSelector } from '../parser';

const BASE_URL = 'https://example.com/article';

function html(body: string, head = ''): string {
	return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
}

describe('parseHtml — canonical URL resolution (Idea 27)', () => {
	it('resolves canonical URL when present', () => {
		const page = parseHtml(
			html(
				'<p>Content</p>',
				'<link rel="canonical" href="https://example.com/clean-url">'
			),
			'https://example.com/article?utm_source=twitter'
		);
		expect(page.url).toBe('https://example.com/clean-url');
	});

	it('keeps the original URL when no canonical is present', () => {
		const page = parseHtml(html('<p>Content</p>'), BASE_URL);
		expect(page.url).toBe(BASE_URL);
	});

	it('resolves relative canonical href against the base URL', () => {
		const page = parseHtml(
			html('<p>Content</p>', '<link rel="canonical" href="/clean-url">'),
			BASE_URL
		);
		expect(page.url).toBe('https://example.com/clean-url');
	});
});

describe('parseHtml — tags from meta keywords (Idea 9)', () => {
	it('extracts keywords into the tags field', () => {
		const page = parseHtml(
			html('<p>x</p>', '<meta name="keywords" content="Obsidian, Note-Taking, PKM">'),
			BASE_URL
		);
		expect(page.tags).toBe('obsidian, note-taking, pkm');
	});

	it('produces an empty tags string when no keywords meta is present', () => {
		const page = parseHtml(html('<p>x</p>'), BASE_URL);
		expect(page.tags).toBe('');
	});

	it('normalises spaces to hyphens within each keyword', () => {
		const page = parseHtml(
			html('<p>x</p>', '<meta name="keywords" content="web clipping, getting things done">'),
			BASE_URL
		);
		expect(page.tags).toBe('web-clipping, getting-things-done');
	});
});

describe('parseHtml — relative URL resolution in content (Idea 28)', () => {
	it('resolves relative href in anchor tags', () => {
		const page = parseHtml(
			html('<article><a href="/about">About</a></article>'),
			BASE_URL
		);
		expect(page.content).toContain('[About](https://example.com/about)');
	});

	it('resolves relative src in img tags', () => {
		const page = parseHtml(
			html('<article><img src="/images/photo.jpg" alt="photo"></article>'),
			BASE_URL
		);
		expect(page.content).toContain('![photo](https://example.com/images/photo.jpg)');
	});

	it('keeps absolute URLs unchanged', () => {
		const page = parseHtml(
			html('<article><a href="https://other.com/page">Link</a></article>'),
			BASE_URL
		);
		expect(page.content).toContain('[Link](https://other.com/page)');
	});

	it('resolves fragment anchors to full absolute URLs', () => {
		const page = parseHtml(
			html('<article><a href="#section-1">Jump</a></article>'),
			BASE_URL
		);
		expect(page.content).toContain('[Jump](https://example.com/article#section-1)');
	});
});

describe('parseHtml — custom content selector (Idea 5)', () => {
	it('extracts content from the specified CSS selector', () => {
		const page = parseHtml(
			html('<nav>Nav junk</nav><div class="story">Story content</div>'),
			BASE_URL,
			'.story'
		);
		expect(page.content).toContain('Story content');
		expect(page.content).not.toContain('Nav junk');
	});

	it('falls back to default extraction when selector matches nothing', () => {
		const page = parseHtml(
			html('<article>Article text</article>'),
			BASE_URL,
			'.does-not-exist'
		);
		expect(page.content).toContain('Article text');
	});
});

describe('extractContentWithSelector', () => {
	it('extracts content using the given selector', () => {
		const rawHtml = html('<main><p>Main content</p></main><aside>Sidebar</aside>');
		const content = extractContentWithSelector(rawHtml, BASE_URL, 'main');
		expect(content).toContain('Main content');
		expect(content).not.toContain('Sidebar');
	});

	it('falls back to default extraction when selector returns empty', () => {
		const rawHtml = html('<article><p>Article body</p></article>');
		const content = extractContentWithSelector(rawHtml, BASE_URL, '.nonexistent');
		expect(content).toContain('Article body');
	});
});
