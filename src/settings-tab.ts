import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	TextComponent,
	TextAreaComponent,
	ButtonComponent,
	DropdownComponent,
	setIcon,
} from 'obsidian';
import { ClipTemplate, TemplateProperty, WebClipperSettings, DEFAULT_TEMPLATE } from './types';
import { generateTemplateId } from './template';
import { importOwcTemplates } from './template-import';
import type WebClipperPlugin from './main';

export class WebClipperSettingTab extends PluginSettingTab {
	plugin: WebClipperPlugin;

	constructor(app: App, plugin: WebClipperPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Web Clipper Settings' });

		// Default folder
		new Setting(containerEl)
			.setName('Default folder')
			.setDesc('Default folder for clipped notes when no template folder is set')
			.addText((text: TextComponent) => {
				text.setPlaceholder('Clippings');
				text.setValue(this.plugin.settings.defaultFolder);
				text.onChange(async (value: string) => {
					this.plugin.settings.defaultFolder = value;
					await this.plugin.saveSettings();
				});
			});

		// Default template
		new Setting(containerEl)
			.setName('Default template')
			.setDesc('Template used when no URL pattern matches')
			.addDropdown((dropdown) => {
				for (const t of this.plugin.settings.templates) {
					dropdown.addOption(t.id, t.name);
				}
				dropdown.setValue(this.plugin.settings.defaultTemplateId);
				dropdown.onChange(async (value: string) => {
					this.plugin.settings.defaultTemplateId = value;
					await this.plugin.saveSettings();
				});
			});

		// Extend share menu (mobile)
		new Setting(containerEl)
			.setName('Extend share menu')
			.setDesc('Add a "Clip to new note" button to the mobile share sheet. Requires restart.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.extendShareMenu);
				toggle.onChange(async (value: boolean) => {
					this.plugin.settings.extendShareMenu = value;
					await this.plugin.saveSettings();
				});
			});

		// Show notification
		new Setting(containerEl)
			.setName('Show notification')
			.setDesc('Show a notification after saving a clip')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showNotification);
				toggle.onChange(async (value: boolean) => {
					this.plugin.settings.showNotification = value;
					await this.plugin.saveSettings();
				});
			});

		// Preview before save
		new Setting(containerEl)
			.setName('Preview before saving')
			.setDesc('Show a preview modal to review and edit clippings before saving. When off, clippings are saved immediately.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.previewBeforeSave);
				toggle.onChange(async (value: boolean) => {
					this.plugin.settings.previewBeforeSave = value;
					await this.plugin.saveSettings();
				});
			});

		// Show preview
		new Setting(containerEl)
			.setName('Show preview')
			.setDesc('Show a rendered preview of the note before saving')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showPreview);
				toggle.onChange(async (value: boolean) => {
					this.plugin.settings.showPreview = value;
					await this.plugin.saveSettings();
				});
			});

		// Open note after save
		new Setting(containerEl)
			.setName('Open note after saving')
			.setDesc('Automatically open the clipped note after saving. When off, the current note stays open.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.openNoteAfterSave);
				toggle.onChange(async (value: boolean) => {
					this.plugin.settings.openNoteAfterSave = value;
					await this.plugin.saveSettings();
				});
			});

		// Templates section
		containerEl.createEl('h3', { text: 'Templates' });

		const templateDesc = containerEl.createEl('p', {
			cls: 'setting-item-description',
		});
		templateDesc.innerHTML = `
			Templates define how clipped pages are formatted. Use <code>{{variable}}</code> placeholders.<br>
			Available variables: <code>{{title}}</code>, <code>{{url}}</code>, <code>{{hostname}}</code>,
			<code>{{author}}</code>, <code>{{description}}</code>, <code>{{ogImage}}</code>,
			<code>{{siteName}}</code>, <code>{{publishedDate}}</code>, <code>{{tags}}</code>,
			<code>{{content}}</code>, <code>{{wordCount}}</code>, <code>{{readingTime}}</code>,
			<code>{{date}}</code>, <code>{{time}}</code><br>
			Date/time support custom formats: <code>{{date:DD/MM/YYYY}}</code>, <code>{{time:HH:mm}}</code>
		`;

		// Add template / Import / Export buttons
		const templateActions = new Setting(containerEl);
		templateActions.settingEl.addClass('web-clipper-template-actions');
		templateActions
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Add Template');
				btn.setCta();
				btn.onClick(() => {
					const newTemplate: ClipTemplate = {
						...DEFAULT_TEMPLATE,
						id: generateTemplateId(),
						name: 'New Template',
						properties: DEFAULT_TEMPLATE.properties.map(p => ({ ...p })),
					};
					this.plugin.settings.templates.push(newTemplate);
					this.plugin.saveSettings();
					this.display();
				});
			})
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Import from Web Clipper');
				btn.onClick(() => {
					new ImportTemplateModal(this.app, async (templates) => {
						this.plugin.settings.templates.push(...templates);
						await this.plugin.saveSettings();
						const count = templates.length;
						const names = templates.map(t => t.name).join(', ');
						new Notice(
							count === 1
								? `Template "${names}" imported successfully`
								: `${count} templates imported: ${names}`
						);
						this.display();
					}).open();
				});
			})
			// Idea 2: Export templates to clipboard as JSON
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Export Templates');
				btn.onClick(async () => {
					const json = JSON.stringify(this.plugin.settings.templates, null, 2);
					try {
						await navigator.clipboard.writeText(json);
						new Notice('Templates copied to clipboard as JSON');
					} catch {
						new Notice('Could not copy to clipboard');
					}
				});
			});

		// Render template card grid
		const grid = containerEl.createDiv({ cls: 'web-clipper-template-grid' });
		for (let i = 0; i < this.plugin.settings.templates.length; i++) {
			this.renderTemplateCard(grid, i);
		}
	}

	private renderTemplateCard(container: HTMLElement, index: number) {
		const template = this.plugin.settings.templates[index];
		const isDefault = template.id === this.plugin.settings.defaultTemplateId;
		const total = this.plugin.settings.templates.length;

		const card = container.createDiv({ cls: 'web-clipper-template-card' });

		// Card header with name, default badge, and action buttons
		const cardHeader = card.createDiv({ cls: 'web-clipper-card-header' });
		cardHeader.createEl('span', {
			text: template.name,
			cls: 'web-clipper-card-name',
		});
		if (isDefault) {
			cardHeader.createEl('span', {
				text: 'Default',
				cls: 'web-clipper-card-badge',
			});
		}

		// Idea 10: Up / Down reorder buttons
		const reorderBtns = cardHeader.createDiv({ cls: 'web-clipper-card-reorder' });

		if (index > 0) {
			const upBtn = reorderBtns.createEl('button', {
				cls: 'web-clipper-card-icon-btn',
				attr: { 'aria-label': 'Move template up' },
			});
			setIcon(upBtn, 'chevron-up');
			upBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const arr = this.plugin.settings.templates;
				[arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
				await this.plugin.saveSettings();
				this.display();
			});
		}

		if (index < total - 1) {
			const downBtn = reorderBtns.createEl('button', {
				cls: 'web-clipper-card-icon-btn',
				attr: { 'aria-label': 'Move template down' },
			});
			setIcon(downBtn, 'chevron-down');
			downBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const arr = this.plugin.settings.templates;
				[arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
				await this.plugin.saveSettings();
				this.display();
			});
		}

		// Idea 3: Duplicate button
		const dupBtn = reorderBtns.createEl('button', {
			cls: 'web-clipper-card-icon-btn',
			attr: { 'aria-label': 'Duplicate template' },
		});
		setIcon(dupBtn, 'copy');
		dupBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			const dup: ClipTemplate = {
				...JSON.parse(JSON.stringify(template)), // deep clone
				id: generateTemplateId(),
				name: `${template.name} (copy)`,
			};
			this.plugin.settings.templates.push(dup);
			await this.plugin.saveSettings();
			this.display();
			// Open edit modal for the duplicate immediately
			new TemplateEditModal(
				this.app,
				this.plugin,
				this.plugin.settings.templates.length - 1,
				() => this.display()
			).open();
		});

		// Card body is clickable to open edit modal
		const cardBody = card.createDiv({ cls: 'web-clipper-card-body' });
		cardBody.addEventListener('click', () => {
			new TemplateEditModal(
				this.app,
				this.plugin,
				index,
				() => this.display()
			).open();
		});

		// Card details
		const details = cardBody.createDiv({ cls: 'web-clipper-card-details' });

		// Folder
		const folder = template.folder || this.plugin.settings.defaultFolder;
		const folderRow = details.createDiv({ cls: 'web-clipper-card-row' });
		folderRow.createEl('span', { text: 'Folder:', cls: 'web-clipper-card-label' });
		folderRow.createEl('span', { text: folder, cls: 'web-clipper-card-value' });

		// Filename template
		const fnRow = details.createDiv({ cls: 'web-clipper-card-row' });
		fnRow.createEl('span', { text: 'Filename:', cls: 'web-clipper-card-label' });
		fnRow.createEl('span', {
			text: template.filenameTemplate || '{{title}}',
			cls: 'web-clipper-card-value web-clipper-card-mono',
		});

		// URL patterns count
		const patternCount = template.urlPatterns.filter(p => p.trim()).length;
		if (patternCount > 0) {
			const patRow = details.createDiv({ cls: 'web-clipper-card-row' });
			patRow.createEl('span', { text: 'URL patterns:', cls: 'web-clipper-card-label' });
			patRow.createEl('span', {
				text: `${patternCount}`,
				cls: 'web-clipper-card-value',
			});
		}

		// Properties count
		const propCount = template.properties.length;
		const propRow = details.createDiv({ cls: 'web-clipper-card-row' });
		propRow.createEl('span', { text: 'Properties:', cls: 'web-clipper-card-label' });
		propRow.createEl('span', {
			text: `${propCount}`,
			cls: 'web-clipper-card-value',
		});
	}
}

class TemplateEditModal extends Modal {
	private plugin: WebClipperPlugin;
	private index: number;
	private onClose_callback: () => void;

	constructor(app: App, plugin: WebClipperPlugin, index: number, onClose_callback: () => void) {
		super(app);
		this.plugin = plugin;
		this.index = index;
		this.onClose_callback = onClose_callback;
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		const template = this.plugin.settings.templates[this.index];
		if (!template) {
			this.close();
			return;
		}

		titleEl.setText(`Edit Template: ${template.name}`);
		contentEl.addClass('web-clipper-template-edit-modal');

		// Name
		new Setting(contentEl)
			.setName('Name')
			.addText((text: TextComponent) => {
				text.setValue(template.name);
				text.onChange(async (value: string) => {
					template.name = value;
					titleEl.setText(`Edit Template: ${value}`);
					await this.plugin.saveSettings();
				});
			});

		// Folder
		new Setting(contentEl)
			.setName('Folder')
			.setDesc('Leave empty to use the default folder')
			.addText((text: TextComponent) => {
				text.setPlaceholder(this.plugin.settings.defaultFolder);
				text.setValue(template.folder);
				text.onChange(async (value: string) => {
					template.folder = value;
					await this.plugin.saveSettings();
				});
			});

		// Filename template
		new Setting(contentEl)
			.setName('Filename template')
			.addText((text: TextComponent) => {
				text.setPlaceholder('{{title}}');
				text.setValue(template.filenameTemplate);
				text.onChange(async (value: string) => {
					template.filenameTemplate = value;
					await this.plugin.saveSettings();
				});
			});

		// URL patterns
		const urlPatternSetting = new Setting(contentEl)
			.setName('URL patterns')
			.setDesc('Regex patterns (one per line). If a URL matches, this template is auto-selected.')
			.addTextArea((textarea: TextAreaComponent) => {
				textarea.setPlaceholder('https://github\\.com/.*\nhttps://medium\\.com/.*');
				textarea.setValue(template.urlPatterns.join('\n'));
				textarea.onChange(async (value: string) => {
					template.urlPatterns = value.split('\n').filter(p => p.trim());
					await this.plugin.saveSettings();
				});
				textarea.inputEl.rows = 3;
			});
		urlPatternSetting.settingEl.addClass('web-clipper-textarea-setting');

		// Idea 5: Content selector
		new Setting(contentEl)
			.setName('Content selector')
			.setDesc('Optional CSS selector to override automatic content detection. E.g. article, .post-body')
			.addText((text: TextComponent) => {
				text.setPlaceholder('article, .post-body');
				text.setValue(template.contentSelector ?? '');
				text.onChange(async (value: string) => {
					template.contentSelector = value.trim() || undefined;
					await this.plugin.saveSettings();
				});
			});

		// Properties
		const propsSection = contentEl.createDiv();
		const propsHeading = new Setting(propsSection)
			.setName('Properties (frontmatter)')
			.setHeading();
		propsHeading.addButton((btn: ButtonComponent) => {
			btn.setButtonText('+ Add Property');
			btn.onClick(async () => {
				template.properties.push({ name: 'new_property', value: '', type: 'text' });
				await this.plugin.saveSettings();
				// Re-render modal
				contentEl.empty();
				this.onOpen();
			});
		});

		for (let j = 0; j < template.properties.length; j++) {
			this.renderProperty(propsSection, template, j);
		}

		// Body template
		const bodyTemplateSetting = new Setting(contentEl)
			.setName('Body template')
			.setDesc('Content below the frontmatter')
			.addTextArea((textarea: TextAreaComponent) => {
				textarea.setPlaceholder('{{content}}');
				textarea.setValue(template.bodyTemplate);
				textarea.onChange(async (value: string) => {
					template.bodyTemplate = value;
					await this.plugin.saveSettings();
				});
				textarea.inputEl.rows = 5;
			});
		bodyTemplateSetting.settingEl.addClass('web-clipper-textarea-setting');

		// Delete button (only if more than one template)
		if (this.plugin.settings.templates.length > 1) {
			new Setting(contentEl)
				.addButton((btn: ButtonComponent) => {
					btn.setButtonText('Delete Template');
					btn.setWarning();
					btn.onClick(async () => {
						this.plugin.settings.templates.splice(this.index, 1);
						if (this.plugin.settings.defaultTemplateId === template.id) {
							this.plugin.settings.defaultTemplateId =
								this.plugin.settings.templates[0]?.id || 'default';
						}
						await this.plugin.saveSettings();
						this.close();
					});
				});
		}
	}

	private renderProperty(
		container: HTMLElement,
		template: ClipTemplate,
		propIndex: number
	) {
		const prop = template.properties[propIndex];
		const setting = new Setting(container);

		// Property name
		setting.addText((text: TextComponent) => {
			text.setPlaceholder('property name');
			text.setValue(prop.name);
			text.onChange(async (value: string) => {
				prop.name = value;
				await this.plugin.saveSettings();
			});
		});

		// Property value
		setting.addText((text: TextComponent) => {
			text.setPlaceholder('{{variable}} or text');
			text.setValue(prop.value);
			text.onChange(async (value: string) => {
				prop.value = value;
				await this.plugin.saveSettings();
			});
		});

		// Idea 7: Property type dropdown (text vs list)
		setting.addDropdown((dropdown: DropdownComponent) => {
			dropdown.addOption('text', 'Text');
			dropdown.addOption('list', 'List');
			dropdown.setValue(prop.type ?? 'text');
			dropdown.onChange(async (value: string) => {
				prop.type = value as 'text' | 'list';
				await this.plugin.saveSettings();
			});
			dropdown.selectEl.title = 'List renders as a YAML sequence (useful for tags)';
		});

		// Delete property
		setting.addButton((btn: ButtonComponent) => {
			btn.setIcon('trash');
			btn.setTooltip('Remove property');
			btn.onClick(async () => {
				template.properties.splice(propIndex, 1);
				await this.plugin.saveSettings();
				// Re-render modal
				this.contentEl.empty();
				this.onOpen();
			});
		});
	}

	onClose() {
		this.contentEl.empty();
		this.onClose_callback();
	}
}

class ImportTemplateModal extends Modal {
	private onImport: (templates: ClipTemplate[]) => void;
	private jsonValue = '';

	constructor(app: App, onImport: (templates: ClipTemplate[]) => void) {
		super(app);
		this.onImport = onImport;
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		titleEl.setText('Import from Obsidian Web Clipper');

		contentEl.createEl('p', {
			text: 'Paste template JSON exported from the official Obsidian Web Clipper browser extension. Supports single templates or an array of templates.',
			cls: 'setting-item-description',
		});

		const textareaSetting = new Setting(contentEl)
			.addTextArea((textarea: TextAreaComponent) => {
				textarea.setPlaceholder('Paste template JSON here...');
				textarea.onChange((value: string) => {
					this.jsonValue = value;
				});
				textarea.inputEl.rows = 10;
			});
		textareaSetting.settingEl.addClass('web-clipper-textarea-setting');

		new Setting(contentEl)
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Paste from clipboard');
				btn.onClick(async () => {
					try {
						const text = await navigator.clipboard.readText();
						this.jsonValue = text;
						const textarea = contentEl.querySelector('textarea');
						if (textarea) textarea.value = text;
					} catch {
						new Notice('Could not read clipboard');
					}
				});
			})
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Import');
				btn.setCta();
				btn.onClick(() => {
					try {
						const templates = importOwcTemplates(this.jsonValue);
						this.onImport(templates);
						this.close();
					} catch (err) {
						new Notice(`Import failed: ${(err as Error).message}`);
					}
				});
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}
