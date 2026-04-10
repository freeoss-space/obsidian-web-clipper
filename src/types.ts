export interface ClipTemplate {
	id: string;
	name: string;
	folder: string;
	filenameTemplate: string;
	urlPatterns: string[];
	properties: TemplateProperty[];
	bodyTemplate: string;
	/** Optional CSS selector used to override the default content extraction. */
	contentSelector?: string;
}

export interface TemplateProperty {
	name: string;
	value: string;
	/** When 'list', the value is treated as comma-separated items rendered as a YAML sequence. */
	type?: 'text' | 'list';
}

export interface ClippedPage {
	url: string;
	title: string;
	author: string;
	description: string;
	ogImage: string;
	siteName: string;
	publishedDate: string;
	/** Comma-separated keywords derived from <meta name="keywords">. */
	tags: string;
	content: string;
	rawHtml: string;
}

export interface WebClipperSettings {
	defaultFolder: string;
	templates: ClipTemplate[];
	defaultTemplateId: string;
	showNotification: boolean;
	extendShareMenu: boolean;
	showPreview: boolean;
	previewBeforeSave: boolean;
	openNoteAfterSave: boolean;
}

export const DEFAULT_TEMPLATE: ClipTemplate = {
	id: 'default',
	name: 'Default',
	folder: '',
	filenameTemplate: '{{title}}',
	urlPatterns: [],
	properties: [
		{ name: 'source', value: '{{url}}' },
		{ name: 'author', value: '{{author}}' },
		{ name: 'description', value: '{{description}}' },
		{ name: 'image', value: '{{ogImage}}' },
		{ name: 'site', value: '{{siteName}}' },
		{ name: 'date_clipped', value: '{{date}}' },
	],
	bodyTemplate: '{{content}}',
};

export const DEFAULT_SETTINGS: WebClipperSettings = {
	defaultFolder: 'Clippings',
	templates: [DEFAULT_TEMPLATE],
	defaultTemplateId: 'default',
	showNotification: true,
	extendShareMenu: true,
	showPreview: true,
	previewBeforeSave: true,
	openNoteAfterSave: true,
};

export const TEMPLATE_VARIABLES = [
	'title',
	'url',
	'hostname',
	'author',
	'description',
	'ogImage',
	'siteName',
	'publishedDate',
	'tags',
	'content',
	'wordCount',
	'readingTime',
	'date',
	'time',
] as const;
