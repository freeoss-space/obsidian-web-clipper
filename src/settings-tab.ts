import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	TextComponent,
	TextAreaComponent,
	ButtonComponent,
} from 'obsidian';
import { ClipTemplate, TemplateProperty, WebClipperSettings, DEFAULT_TEMPLATE } from './types';
import { generateTemplateId } from './template';
import { importOwcTemplates } from './template-import';
import type WebClipperPlugin from './main';

export class WebClipperSettingTab extends PluginSettingTab {
	plugin: WebClipperPlugin;
	private expandedTemplateIndex: number | null = null;

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
			Available variables: <code>{{title}}</code>, <code>{{url}}</code>, <code>{{author}}</code>,
			<code>{{description}}</code>, <code>{{ogImage}}</code>, <code>{{siteName}}</code>,
			<code>{{publishedDate}}</code>, <code>{{content}}</code>, <code>{{date}}</code>, <code>{{time}}</code>
		`;

		// Add template / Import buttons
		new Setting(containerEl)
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
			});

		// Render template list
		for (let i = 0; i < this.plugin.settings.templates.length; i++) {
			this.renderTemplateListItem(containerEl, i);
		}

		// Render expanded template settings if one is selected
		if (this.expandedTemplateIndex !== null && this.expandedTemplateIndex < this.plugin.settings.templates.length) {
			this.renderTemplateSettings(containerEl, this.expandedTemplateIndex);
		}
	}

	private renderTemplateListItem(container: HTMLElement, index: number) {
		const template = this.plugin.settings.templates[index];
		const isExpanded = this.expandedTemplateIndex === index;

		new Setting(container)
			.setName(template.name)
			.setClass(isExpanded ? 'web-clipper-template-item-active' : 'web-clipper-template-item')
			.then((setting: Setting) => {
				setting.settingEl.style.cursor = 'pointer';
				setting.settingEl.addEventListener('click', (e: MouseEvent) => {
					// Don't toggle if clicking on a button inside the setting
					if ((e.target as HTMLElement).closest('button')) return;
					this.expandedTemplateIndex = isExpanded ? null : index;
					this.display();
				});
			});
	}

	private renderTemplateSettings(container: HTMLElement, index: number) {
		const template = this.plugin.settings.templates[index];
		const wrapper = container.createDiv({ cls: 'web-clipper-template-settings' });

		// Template header with name and delete
		const headerSetting = new Setting(wrapper)
			.setName(`Template: ${template.name}`)
			.setHeading();

		if (this.plugin.settings.templates.length > 1) {
			headerSetting.addButton((btn: ButtonComponent) => {
				btn.setButtonText('Delete');
				btn.setWarning();
				btn.onClick(async () => {
					this.plugin.settings.templates.splice(index, 1);
					if (this.plugin.settings.defaultTemplateId === template.id) {
						this.plugin.settings.defaultTemplateId =
							this.plugin.settings.templates[0]?.id || 'default';
					}
					this.expandedTemplateIndex = null;
					await this.plugin.saveSettings();
					this.display();
				});
			});
		}

		// Name
		new Setting(wrapper)
			.setName('Name')
			.addText((text: TextComponent) => {
				text.setValue(template.name);
				text.onChange(async (value: string) => {
					template.name = value;
					await this.plugin.saveSettings();
				});
			});

		// Folder
		new Setting(wrapper)
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
		new Setting(wrapper)
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
		const urlPatternSetting = new Setting(wrapper)
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

		// Properties
		const propsHeading = new Setting(wrapper)
			.setName('Properties (frontmatter)')
			.setHeading();
		propsHeading.addButton((btn: ButtonComponent) => {
			btn.setButtonText('+ Add Property');
			btn.onClick(async () => {
				template.properties.push({ name: 'new_property', value: '' });
				await this.plugin.saveSettings();
				this.display();
			});
		});

		for (let j = 0; j < template.properties.length; j++) {
			this.renderProperty(wrapper, template, j);
		}

		// Body template
		const bodyTemplateSetting = new Setting(wrapper)
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
	}

	private renderProperty(
		container: HTMLElement,
		template: ClipTemplate,
		propIndex: number
	) {
		const prop = template.properties[propIndex];
		const setting = new Setting(container);

		setting.addText((text: TextComponent) => {
			text.setPlaceholder('property name');
			text.setValue(prop.name);
			text.onChange(async (value: string) => {
				prop.name = value;
				await this.plugin.saveSettings();
			});
		});

		setting.addText((text: TextComponent) => {
			text.setPlaceholder('{{variable}} or text');
			text.setValue(prop.value);
			text.onChange(async (value: string) => {
				prop.value = value;
				await this.plugin.saveSettings();
			});
		});

		setting.addButton((btn: ButtonComponent) => {
			btn.setIcon('trash');
			btn.setTooltip('Remove property');
			btn.onClick(async () => {
				template.properties.splice(propIndex, 1);
				await this.plugin.saveSettings();
				this.display();
			});
		});
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
