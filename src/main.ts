import { App, Menu, MenuItem, Modal, Notice, Plugin, Setting, normalizePath } from 'obsidian';
import { DEFAULT_SETTINGS, WebClipperSettings } from './types';
import { fetchAndParsePage } from './parser';
import { ClipModal } from './clip-modal';
import { WebClipperSettingTab } from './settings-tab';
import { applyTemplate, findMatchingTemplate, generateNoteContent } from './template';

export default class WebClipperPlugin extends Plugin {
	settings: WebClipperSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// === Mobile Share Sheet Integration ===
		// Hook into Obsidian's internal 'receive-text-menu' event.
		// This fires when the user shares text/URL to Obsidian from another app
		// on mobile (iOS/Android share sheet). Obsidian presents a menu, and we
		// add a "Web Clipper" button to it.
		// Note: This is an undocumented internal event (hence @ts-ignore).
		if (this.settings.extendShareMenu) {
			this.registerEvent(
				// @ts-ignore — internal Obsidian mobile event
				this.app.workspace.on('receive-text-menu', (menu: Menu, shareText: string) => {
					menu.addItem((item: MenuItem) => {
						item.setTitle('Clip to new note');
						item.setIcon('scissors');
						item.onClick(async () => {
							const url = extractUrl(shareText);
							if (url) {
								await this.clipUrl(url);
							} else {
								new Notice('Web Clipper: No URL found in shared content');
							}
						});
					});
				}),
			);
		}

		// Hook into Obsidian's 'url-menu' event for URL context menus
		// (right-click/long-press on a URL anywhere in Obsidian)
		this.registerEvent(
			// @ts-ignore — internal Obsidian event
			this.app.workspace.on('url-menu', (menu: Menu, url: string) => {
				if (url && /^https?:\/\//i.test(url)) {
					menu.addItem((item: MenuItem) => {
						item.setTitle('Clip this URL');
						item.setIcon('scissors');
						item.onClick(async () => {
							await this.clipUrl(url);
						});
					});
				}
			}),
		);

		// === Protocol Handlers (alternative entry points) ===
		// obsidian://web-clipper?url=...
		this.registerObsidianProtocolHandler('web-clipper', async (params) => {
			const url = params.url;
			if (!url) {
				new Notice('Web Clipper: No URL provided');
				return;
			}
			await this.clipUrl(url);
		});

		// obsidian://clip?url=... (or ?text=...)
		this.registerObsidianProtocolHandler('clip', async (params) => {
			const url = params.url || params.text || params.title || '';
			const extracted = extractUrl(url);
			if (!extracted) {
				new Notice('Web Clipper: Could not find a URL in shared content');
				return;
			}
			await this.clipUrl(extracted);
		});

		// === Commands ===
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

			if (this.settings.previewBeforeSave) {
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
			} else {
				await this.quickSave(page);
			}
		} catch (err) {
			console.error('Web Clipper error:', err);
			new Notice(`Web Clipper: Failed to fetch page — ${(err as Error).message}`);
		}
	}

	private async quickSave(page: import('./types').ClippedPage) {
		const template = findMatchingTemplate(
			page.url,
			this.settings.templates,
			this.settings.defaultTemplateId
		);
		const applied = applyTemplate(template, page);
		const folder = template.folder || this.settings.defaultFolder;
		const content = generateNoteContent(applied.frontmatter, applied.body);

		const folderPath = normalizePath(folder);
		const filePath = normalizePath(`${folderPath}/${applied.filename}.md`);

		// Ensure folder exists
		if (!this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}

		// Check for existing file and make unique name
		let finalPath = filePath;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(finalPath)) {
			finalPath = normalizePath(`${folderPath}/${applied.filename} ${counter}.md`);
			counter++;
		}

		const file = await this.app.vault.create(finalPath, content);

		if (this.settings.showNotification) {
			new Notice(`Clipped: ${file.basename}`);
		}

		if (this.settings.openNoteAfterSave) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
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
	private urlValue = '';

	constructor(app: App, onSubmit: (url: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		titleEl.setText('Clip URL');

		new Setting(contentEl)
			.setName('URL')
			.setDesc('Enter a URL to clip')
			.addText((text) => {
				text.setPlaceholder('https://example.com/article');
				text.onChange((value: string) => {
					this.urlValue = value;
				});
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.submit();
					}
				});
				// Focus the input after the modal renders
				setTimeout(() => text.inputEl.focus(), 10);
			});

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText('Clip');
				btn.setCta();
				btn.onClick(() => this.submit());
			});
	}

	private submit() {
		const url = this.urlValue.trim();
		if (url) {
			this.onSubmit(url);
			this.close();
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
