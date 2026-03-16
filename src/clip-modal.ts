import {
	App,
	Component,
	MarkdownRenderer,
	Modal,
	Setting,
	Notice,
	TFolder,
	ToggleComponent,
	normalizePath,
	DropdownComponent,
	TextComponent,
	TextAreaComponent,
	ButtonComponent,
} from 'obsidian';
import { ClipTemplate, ClippedPage, WebClipperSettings } from './types';
import { applyTemplate, generateNoteContent, findMatchingTemplate } from './template';

export class ClipModal extends Modal {
	private page: ClippedPage;
	private settings: WebClipperSettings;
	private selectedTemplate: ClipTemplate;
	private folder: string;
	private filename: string;
	private frontmatter: Record<string, string>;
	private bodyContent: string;
	private onSave: (settings: WebClipperSettings) => void;

	// UI components for live updates
	private folderInput: TextComponent | null = null;
	private filenameInput: TextComponent | null = null;
	private propertiesContainer: HTMLElement | null = null;
	private bodyArea: TextAreaComponent | null = null;

	constructor(
		app: App,
		page: ClippedPage,
		settings: WebClipperSettings,
		onSave: (settings: WebClipperSettings) => void
	) {
		super(app);
		this.page = page;
		this.settings = settings;
		this.onSave = onSave;

		this.selectedTemplate = findMatchingTemplate(
			page.url,
			settings.templates,
			settings.defaultTemplateId
		);

		const applied = applyTemplate(this.selectedTemplate, page);
		this.filename = applied.filename;
		this.frontmatter = applied.frontmatter;
		this.bodyContent = applied.body;
		this.folder = this.selectedTemplate.folder || settings.defaultFolder;
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		contentEl.empty();
		contentEl.addClass('web-clipper-modal');

		titleEl.setText('Web Clipper');

		// Header with URL
		this.renderHeader(contentEl);

		// Template selector
		this.renderTemplateSelector(contentEl);

		// Folder + filename
		this.renderFileSettings(contentEl);

		// Properties
		this.renderProperties(contentEl);

		// Body content
		this.renderBody(contentEl);

		// Actions: Review & Save / Cancel
		this.renderActions(contentEl);
	}

	private renderHeader(container: HTMLElement) {
		const header = container.createDiv({ cls: 'web-clipper-header' });
		header.createEl('div', {
			text: this.page.title || 'Untitled',
			cls: 'web-clipper-page-title',
		});
		const urlEl = header.createEl('a', {
			text: this.page.url,
			cls: 'web-clipper-url',
			href: this.page.url,
		});
		urlEl.addEventListener('click', (e) => e.preventDefault());
	}

	private renderTemplateSelector(container: HTMLElement) {
		new Setting(container)
			.setName('Template')
			.setDesc('Select a template to apply')
			.addDropdown((dropdown: DropdownComponent) => {
				for (const t of this.settings.templates) {
					dropdown.addOption(t.id, t.name);
				}
				dropdown.setValue(this.selectedTemplate.id);
				dropdown.onChange((value: string) => {
					const template = this.settings.templates.find(t => t.id === value);
					if (template) {
						this.selectedTemplate = template;
						const applied = applyTemplate(template, this.page);
						this.filename = applied.filename;
						this.frontmatter = applied.frontmatter;
						this.bodyContent = applied.body;
						this.folder = template.folder || this.settings.defaultFolder;
						this.refreshFields();
					}
				});
			});
	}

	private renderFileSettings(container: HTMLElement) {
		new Setting(container)
			.setName('Folder')
			.setDesc('Folder to save the note in')
			.addText((text: TextComponent) => {
				this.folderInput = text;
				text.setPlaceholder('Clippings');
				text.setValue(this.folder);
				text.onChange((value: string) => {
					this.folder = value;
				});

				// Add folder suggest via datalist
				const folders = this.getFolderSuggestions();
				if (folders.length > 0) {
					text.inputEl.setAttribute('list', 'web-clipper-folders');
					const datalist = container.createEl('datalist', {
						attr: { id: 'web-clipper-folders' },
					});
					for (const f of folders) {
						datalist.createEl('option', { attr: { value: f } });
					}
				}
			});

		new Setting(container)
			.setName('Filename')
			.addText((text: TextComponent) => {
				this.filenameInput = text;
				text.setValue(this.filename);
				text.onChange((value: string) => {
					this.filename = value;
				});
			});
	}

	private renderProperties(container: HTMLElement) {
		const section = container.createDiv();
		new Setting(section).setName('Properties').setHeading();
		this.propertiesContainer = section.createDiv();
		this.renderPropertyFields();
	}

	private renderPropertyFields() {
		if (!this.propertiesContainer) return;
		this.propertiesContainer.empty();

		const entries = Object.entries(this.frontmatter);
		for (const [key, value] of entries) {
			new Setting(this.propertiesContainer)
				.setName(key)
				.addText((text: TextComponent) => {
					text.setValue(value);
					text.onChange((newValue: string) => {
						this.frontmatter[key] = newValue;
					});
				});
		}
	}

	private renderBody(container: HTMLElement) {
		const section = container.createDiv({ cls: 'web-clipper-body' });
		new Setting(section).setName('Content').setHeading();

		const bodySetting = new Setting(section)
			.addTextArea((textarea: TextAreaComponent) => {
				this.bodyArea = textarea;
				textarea.setValue(this.bodyContent);
				textarea.onChange((value: string) => {
					this.bodyContent = value;
				});
				textarea.inputEl.rows = 15;
			});
		bodySetting.settingEl.addClass('web-clipper-textarea-setting');
	}

	private renderActions(container: HTMLElement) {
		const btnContainer = container.createDiv({ cls: 'modal-button-container' });

		new Setting(btnContainer)
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Cancel');
				btn.onClick(() => this.close());
			})
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Review & Save');
				btn.setCta();
				btn.onClick(() => {
					// Open preview/confirmation modal
					new ClipPreviewModal(
						this.app,
						this.frontmatter,
						this.bodyContent,
						this.folder,
						this.filename,
						this.settings,
						this.onSave
					).open();
					this.close();
				});
			});
	}

	private refreshFields() {
		if (this.folderInput) this.folderInput.setValue(this.folder);
		if (this.filenameInput) this.filenameInput.setValue(this.filename);
		if (this.bodyArea) this.bodyArea.setValue(this.bodyContent);
		this.renderPropertyFields();
	}

	private getFolderSuggestions(): string[] {
		const folders: string[] = [];
		const rootFolder = this.app.vault.getRoot();

		const recurse = (folder: TFolder) => {
			folders.push(folder.path);
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					recurse(child);
				}
			}
		};

		recurse(rootFolder);
		return folders.filter(f => f !== '/');
	}

	onClose() {
		this.contentEl.empty();
	}
}

class ClipPreviewModal extends Modal {
	private frontmatter: Record<string, string>;
	private bodyContent: string;
	private folder: string;
	private filename: string;
	private settings: WebClipperSettings;
	private onSave: (settings: WebClipperSettings) => void;
	private renderComponent: Component;

	constructor(
		app: App,
		frontmatter: Record<string, string>,
		bodyContent: string,
		folder: string,
		filename: string,
		settings: WebClipperSettings,
		onSave: (settings: WebClipperSettings) => void
	) {
		super(app);
		this.frontmatter = frontmatter;
		this.bodyContent = bodyContent;
		this.folder = folder;
		this.filename = filename;
		this.settings = settings;
		this.onSave = onSave;
		this.renderComponent = new Component();
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		contentEl.addClass('web-clipper-preview-modal');

		titleEl.setText('Preview Clipping');

		// File info summary
		const info = contentEl.createDiv({ cls: 'web-clipper-preview-info' });
		info.createEl('div', {
			text: `${this.folder}/${this.filename}.md`,
			cls: 'web-clipper-preview-filepath',
		});

		// Rendered preview
		const previewContainer = contentEl.createDiv({ cls: 'web-clipper-preview' });
		const content = generateNoteContent(this.frontmatter, this.bodyContent);
		this.renderComponent.load();
		MarkdownRenderer.render(
			this.app,
			content,
			previewContainer,
			'',
			this.renderComponent,
		);

		// Actions
		const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		new Setting(btnContainer)
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Back');
				btn.onClick(() => this.close());
			})
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Save Note');
				btn.setCta();
				btn.onClick(() => this.saveNote());
			});
	}

	private async saveNote() {
		try {
			const content = generateNoteContent(this.frontmatter, this.bodyContent);
			const folderPath = normalizePath(this.folder);
			const filePath = normalizePath(`${folderPath}/${this.filename}.md`);

			// Ensure folder exists
			if (!this.app.vault.getAbstractFileByPath(folderPath)) {
				await this.app.vault.createFolder(folderPath);
			}

			// Check for existing file and make unique name
			let finalPath = filePath;
			let counter = 1;
			while (this.app.vault.getAbstractFileByPath(finalPath)) {
				finalPath = normalizePath(
					`${folderPath}/${this.filename} ${counter}.md`
				);
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

			this.close();
		} catch (err) {
			new Notice(`Error saving clip: ${(err as Error).message}`);
			console.error('Web Clipper save error:', err);
		}
	}

	onClose() {
		this.renderComponent.unload();
		this.contentEl.empty();
	}
}
