export interface ClipTemplate {
	id: string;
	name: string;
	folder: string;
	filenameTemplate: string;
	urlPatterns: string[];
	properties: TemplateProperty[];
	bodyTemplate: string;
}

export interface TemplateProperty {
	name: string;
	value: string;
}

export interface ClippedPage {
	url: string;
	title: string;
	author: string;
	description: string;
	ogImage: string;
	siteName: string;
	publishedDate: string;
	content: string;
	rawHtml: string;
}

export interface WebClipperSettings {
	defaultFolder: string;
	templates: ClipTemplate[];
	defaultTemplateId: string;
	showNotification: boolean;
	extendShareMenu: boolean;
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
};

export const TEMPLATE_VARIABLES = [
	'title',
	'url',
	'author',
	'description',
	'ogImage',
	'siteName',
	'publishedDate',
	'content',
	'date',
	'time',
] as const;
