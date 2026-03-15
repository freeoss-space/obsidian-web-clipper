import {
	App,
	Modal,
	Setting,
	Notice,
	TFolder,
	normalizePath,
	DropdownComponent,
	TextComponent,
	TextAreaComponent,
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
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('web-clipper-modal');

		// Header with page info
		this.renderHeader(contentEl);

		// Template selector
		this.renderTemplateSelector(contentEl);

		// Folder + filename
		this.renderFileSettings(contentEl);

		// OG image preview
		this.renderOgPreview(contentEl);

		// Properties
		this.renderProperties(contentEl);

		// Body content
		this.renderBody(contentEl);

		// Save button
		this.renderActions(contentEl);
	}

	private renderHeader(container: HTMLElement) {
		const header = container.createDiv({ cls: 'web-clipper-header' });
		header.createEl('h2', { text: 'Web Clipper' });
		header.createEl('p', {
			text: this.page.url,
			cls: 'web-clipper-url',
		});
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

				// Add folder suggest
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
				text.inputEl.style.width = '100%';
			});
	}

	private renderOgPreview(container: HTMLElement) {
		if (!this.page.ogImage) return;

		const preview = container.createDiv({ cls: 'web-clipper-og-preview' });
		const img = preview.createEl('img', {
			attr: {
				src: this.page.ogImage,
				alt: this.page.title || 'Preview',
			},
		});
		img.style.maxWidth = '100%';
		img.style.maxHeight = '200px';
		img.style.borderRadius = '8px';
		img.style.marginBottom = '12px';

		if (this.page.title) {
			preview.createEl('h4', { text: this.page.title });
		}
		if (this.page.description) {
			preview.createEl('p', {
				text: this.page.description,
				cls: 'web-clipper-description',
			});
		}
	}

	private renderProperties(container: HTMLElement) {
		const section = container.createDiv({ cls: 'web-clipper-properties' });
		section.createEl('h4', { text: 'Properties' });
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
					text.inputEl.style.width = '100%';
				});
		}
	}

	private renderBody(container: HTMLElement) {
		const section = container.createDiv({ cls: 'web-clipper-body' });
		section.createEl('h4', { text: 'Content' });

		new Setting(section)
			.addTextArea((textarea: TextAreaComponent) => {
				this.bodyArea = textarea;
				textarea.setValue(this.bodyContent);
				textarea.onChange((value: string) => {
					this.bodyContent = value;
				});
				textarea.inputEl.style.width = '100%';
				textarea.inputEl.style.minHeight = '300px';
				textarea.inputEl.style.fontFamily = 'monospace';
				textarea.inputEl.style.fontSize = '12px';
			});
	}

	private renderActions(container: HTMLElement) {
		const actions = container.createDiv({ cls: 'web-clipper-actions' });

		const saveBtn = actions.createEl('button', {
			text: 'Save Note',
			cls: 'mod-cta',
		});
		saveBtn.addEventListener('click', () => this.saveNote());

		const cancelBtn = actions.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
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

			// Open the new note
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);

			this.close();
		} catch (err) {
			new Notice(`Error saving clip: ${(err as Error).message}`);
			console.error('Web Clipper save error:', err);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
