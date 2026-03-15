import { App, Modal, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, WebClipperSettings } from './types';
import { fetchAndParsePage } from './parser';
import { ClipModal } from './clip-modal';
import { WebClipperSettingTab } from './settings-tab';

export default class WebClipperPlugin extends Plugin {
	settings: WebClipperSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Register the obsidian:// protocol handler for share intents
		// This handles URLs shared via: obsidian://web-clipper?url=...
		this.registerObsidianProtocolHandler('web-clipper', async (params) => {
			const url = params.url;
			if (!url) {
				new Notice('Web Clipper: No URL provided');
				return;
			}
			await this.clipUrl(url);
		});

		// Also handle the share-target action for Android/iOS share sheets
		// When Obsidian is registered as a share target, it receives URLs
		// via the obsidian://clip protocol
		this.registerObsidianProtocolHandler('clip', async (params) => {
			// Support multiple parameter names that share intents may use
			const url = params.url || params.text || params.title || '';
			const extracted = extractUrl(url);
			if (!extracted) {
				new Notice('Web Clipper: Could not find a URL in shared content');
				return;
			}
			await this.clipUrl(extracted);
		});

		// Add command for clipping current clipboard URL
		this.addCommand({
			id: 'clip-url-from-clipboard',
			name: 'Clip URL from clipboard',
			callback: async () => {
				try {
					const text = await navigator.clipboard.readText();
					const url = extractUrl(text);
					if (url) {
						await this.clipUrl(url);
					} else {
						new Notice('No URL found in clipboard');
					}
				} catch {
					new Notice('Could not read clipboard');
				}
			},
		});

		// Add command to manually enter a URL
		this.addCommand({
			id: 'clip-url-manual',
			name: 'Clip URL...',
			callback: () => {
				const modal = new ManualUrlModal(this.app, async (url: string) => {
					if (url) await this.clipUrl(url);
				});
				modal.open();
			},
		});

		// Add ribbon icon
		this.addRibbonIcon('scissors', 'Web Clipper', async () => {
			try {
				const text = await navigator.clipboard.readText();
				const url = extractUrl(text);
				if (url) {
					await this.clipUrl(url);
				} else {
					new Notice('No URL found in clipboard. Copy a URL first.');
				}
			} catch {
				// Clipboard not available — open manual input
				const modal = new ManualUrlModal(this.app, async (url: string) => {
					if (url) await this.clipUrl(url);
				});
				modal.open();
			}
		});

		// Add settings tab
		this.addSettingTab(new WebClipperSettingTab(this.app, this));
	}

	async clipUrl(url: string) {
		try {
			new Notice('Web Clipper: Fetching page...');
			const page = await fetchAndParsePage(url);

			const modal = new ClipModal(
				this.app,
				page,
				this.settings,
				async (settings: WebClipperSettings) => {
					this.settings = settings;
					await this.saveSettings();
				}
			);
			modal.open();
		} catch (err) {
			console.error('Web Clipper error:', err);
			new Notice(`Web Clipper: Failed to fetch page — ${(err as Error).message}`);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Ensure templates array exists
		if (!this.settings.templates || this.settings.templates.length === 0) {
			this.settings.templates = DEFAULT_SETTINGS.templates;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function extractUrl(text: string): string | null {
	if (!text) return null;
	const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/i;
	const match = text.match(urlRegex);
	return match ? match[0] : null;
}

class ManualUrlModal extends Modal {
	private onSubmit: (url: string) => void;

	constructor(app: App, onSubmit: (url: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: 'Enter URL to clip' });

		const input = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'https://example.com/article',
		});
		input.style.width = '100%';
		input.style.padding = '8px';
		input.style.marginBottom = '12px';

		const btnContainer = contentEl.createDiv({ cls: 'web-clipper-actions' });
		const submitBtn = btnContainer.createEl('button', {
			text: 'Clip',
			cls: 'mod-cta',
		});

		submitBtn.addEventListener('click', () => {
			const url = input.value.trim();
			if (url) {
				this.onSubmit(url);
				this.close();
			}
		});

		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				const url = input.value.trim();
				if (url) {
					this.onSubmit(url);
					this.close();
				}
			}
		});

		input.focus();
	}

	onClose() {
		this.contentEl.empty();
	}
}
