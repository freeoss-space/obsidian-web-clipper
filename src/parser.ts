import { requestUrl } from 'obsidian';
import { ClippedPage } from './types';

export async function fetchAndParsePage(url: string, contentSelector?: string): Promise<ClippedPage> {
	const response = await requestUrl({ url });
	const html = response.text;
	return parseHtml(html, url, contentSelector);
}

export function parseHtml(html: string, url: string, contentSelector?: string): ClippedPage {
	const doc = new DOMParser().parseFromString(html, 'text/html');

	// Idea 27: resolve canonical URL before using it as the page URL
	const canonicalHref = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
	const resolvedUrl = canonicalHref ? resolveUrl(canonicalHref, url) : url;

	const title = getMetaContent(doc, 'og:title')
		|| doc.querySelector('title')?.textContent?.trim()
		|| '';

	const author = getMetaContent(doc, 'author')
		|| getMetaContent(doc, 'article:author')
		|| getMetaContent(doc, 'og:article:author')
		|| doc.querySelector('[rel="author"]')?.textContent?.trim()
		|| '';

	const description = getMetaContent(doc, 'og:description')
		|| getMetaContent(doc, 'description')
		|| '';

	const ogImage = getMetaContent(doc, 'og:image') || '';

	const siteName = getMetaContent(doc, 'og:site_name')
		|| new URL(resolvedUrl).hostname
		|| '';

	const publishedDate = getMetaContent(doc, 'article:published_time')
		|| getMetaContent(doc, 'date')
		|| '';

	// Idea 9: extract tags from <meta name="keywords">
	const rawKeywords = getMetaContent(doc, 'keywords') || getMetaContent(doc, 'article:tag') || '';
	const tags = rawKeywords
		.split(',')
		.map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
		.filter(Boolean)
		.join(', ');

	// Idea 5 + 28: use content selector override if provided; pass resolvedUrl for relative URL resolution
	const contentElement = contentSelector
		? (doc.querySelector(contentSelector) ?? extractMainContent(doc))
		: extractMainContent(doc);

	const content = htmlToMarkdown(contentElement, resolvedUrl);

	return {		url: resolvedUrl,
		title,
		author,
		description,
		ogImage: resolveUrl(ogImage, resolvedUrl),
		siteName,
		publishedDate,
		tags,
		content,
		rawHtml: html,
	};
}

/**
 * Re-extract content from raw HTML using a specific CSS selector.
 * Falls back to default extraction if the selector matches nothing.
 */
export function extractContentWithSelector(html: string, url: string, selector: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const el = selector ? doc.querySelector(selector) : null;
	const contentEl = (el && el.textContent && el.textContent.trim().length > 0)
		? el
		: extractMainContent(doc);
	return htmlToMarkdown(contentEl, url);
}

function getMetaContent(doc: Document, name: string): string {
	const selectors = [
		`meta[property="${name}"]`,
		`meta[name="${name}"]`,
		`meta[itemprop="${name}"]`,
	];

	for (const selector of selectors) {
		const el = doc.querySelector(selector);
		if (el) {
			const content = el.getAttribute('content')?.trim();
			if (content) return content;
		}
	}
	return '';
}

function resolveUrl(href: string, baseUrl: string): string {
	if (!href) return '';
	try {
		return new URL(href, baseUrl).href;
	} catch {
		return href;
	}
}

function extractMainContent(doc: Document): Element {
	// Try common content selectors in priority order
	const selectors = [
		'article',
		'[role="main"]',
		'main',
		'.post-content',
		'.article-content',
		'.entry-content',
		'.content',
		'#content',
		'.post',
		'.article',
	];

	for (const selector of selectors) {
		const el = doc.querySelector(selector);
		if (el && el.textContent && el.textContent.trim().length > 100) {
			return el;
		}
	}

	return doc.body || doc.documentElement;
}

// Idea 28: thread baseUrl through so relative hrefs/srcs can be resolved to absolute URLs
function htmlToMarkdown(element: Element, baseUrl: string): string {
	// Remove unwanted elements
	const clone = element.cloneNode(true) as Element;
	const removeSelectors = [
		'script', 'style', 'nav', 'header', 'footer',
		'.sidebar', '.nav', '.menu', '.advertisement', '.ad',
		'.comments', '.comment', '#comments', '.social-share',
		'.related-posts', '.newsletter', 'iframe', 'noscript',
	];
	for (const selector of removeSelectors) {
		clone.querySelectorAll(selector).forEach(el => el.remove());
	}

	return convertNode(clone, baseUrl).trim();
}

function convertNode(node: Node, baseUrl: string): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent?.replace(/\s+/g, ' ') || '';
	}

	if (node.nodeType !== Node.ELEMENT_NODE) {
		return '';
	}

	const el = node as Element;
	const tag = el.tagName.toLowerCase();
	const children = Array.from(el.childNodes).map(n => convertNode(n, baseUrl)).join('');

	switch (tag) {
		case 'h1': return `\n\n# ${children.trim()}\n\n`;
		case 'h2': return `\n\n## ${children.trim()}\n\n`;
		case 'h3': return `\n\n### ${children.trim()}\n\n`;
		case 'h4': return `\n\n#### ${children.trim()}\n\n`;
		case 'h5': return `\n\n##### ${children.trim()}\n\n`;
		case 'h6': return `\n\n###### ${children.trim()}\n\n`;
		case 'p': return `\n\n${children.trim()}\n\n`;
		case 'br': return '\n';
		case 'hr': return '\n\n---\n\n';
		case 'strong':
		case 'b': return `**${children.trim()}**`;
		case 'em':
		case 'i': return `*${children.trim()}*`;
		case 'code': return `\`${children.trim()}\``;
		case 'pre': {
			const codeEl = el.querySelector('code');
			const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || '';
			const text = codeEl?.textContent || el.textContent || '';
			return `\n\n\`\`\`${lang}\n${text.trim()}\n\`\`\`\n\n`;
		}
		case 'blockquote': return `\n\n> ${children.trim().replace(/\n/g, '\n> ')}\n\n`;
		case 'a': {
			const rawHref = el.getAttribute('href');
			// Idea 28: resolve relative href to absolute URL
			const href = rawHref ? resolveUrl(rawHref, baseUrl) : null;
			if (href && children.trim()) {
				return `[${children.trim()}](${href})`;
			}
			return children;
		}
		case 'img': {
			const rawSrc = el.getAttribute('src');
			// Idea 28: resolve relative src to absolute URL
			const src = rawSrc ? resolveUrl(rawSrc, baseUrl) : null;
			const alt = el.getAttribute('alt') || '';
			if (src) return `![${alt}](${src})`;
			return '';
		}
		case 'ul':
		case 'ol': return `\n\n${children}\n\n`;
		case 'li': {
			const parent = el.parentElement;
			if (parent?.tagName.toLowerCase() === 'ol') {
				const index = Array.from(parent.children).indexOf(el) + 1;
				return `${index}. ${children.trim()}\n`;
			}
			return `- ${children.trim()}\n`;
		}
		case 'table': return convertTable(el);
		case 'figure': return children;
		case 'figcaption': return `\n*${children.trim()}*\n`;
		case 'div':
		case 'section':
		case 'span':
		case 'article':
		case 'main':
			return children;
		default:
			return children;
	}
}

function convertTable(table: Element): string {
	const rows = table.querySelectorAll('tr');
	if (rows.length === 0) return '';

	const result: string[] = [];

	rows.forEach((row, rowIndex) => {
		const cells = row.querySelectorAll('th, td');
		const cellTexts = Array.from(cells).map(cell =>
			cell.textContent?.trim().replace(/\|/g, '\\|') || ''
		);
		result.push(`| ${cellTexts.join(' | ')} |`);

		if (rowIndex === 0) {
			result.push(`| ${cellTexts.map(() => '---').join(' | ')} |`);
		}
	});

	return `\n\n${result.join('\n')}\n\n`;
}
