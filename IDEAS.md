# Improvement Ideas for obsidian-web-clipper

## Part 1 — Raw Brainstorm (30 ideas)

1. Custom date/time format tokens in template variables (e.g. `{{date:YYYY-MM-DD}}`)
2. Export templates to JSON (counterpart to the existing import feature)
3. One-click template duplication in settings
4. Proper YAML value escaping (multi-line strings, single quotes, backslashes, leading dashes)
5. Per-template configurable CSS selector for content extraction
6. Duplicate URL detection — warn or update existing note when the same URL is clipped again
7. Array-type frontmatter properties so tags can render as proper YAML lists
8. `{{wordCount}}` and `{{readingTime}}` template variables
9. `{{tags}}` variable auto-populated from HTML `<meta name="keywords">` tags
10. Template reordering via up/down controls in settings
11. Retry mechanism with exponential back-off for failed network fetches
12. Clipboard history panel showing recently clipped URLs
13. Selection-based clipping (clip only highlighted text)
14. Image downloading — embed images into the vault alongside the note
15. Readability.js-style content scoring for smarter main-content detection
16. Archive.org fallback when a page fails to load
17. Wayback Machine "save this page" integration while clipping
18. Batch clipping — queue multiple URLs to process in sequence
19. Custom User-Agent header in `requestUrl` calls to unblock some paywalled sites
20. Multiple-vault routing — send clips to a different vault based on URL patterns
21. Raw HTML view toggle inside the preview modal
22. Footnotes/endnotes preservation in Markdown output
23. QuickAdd plugin integration for template variable prompting
24. `{{hostname}}` variable returning just the domain (e.g. `github.com`)
25. Progress indicator / spinner notice during long fetches
26. Per-clip tag picker UI inside the clip modal
27. Canonical URL resolution (follow `<link rel="canonical">` before clipping)
28. Relative URL resolution for links inside clipped content
29. Template variable autocomplete in the template-edit modal textarea
30. Note update mode — re-clip a URL to append or overwrite an existing note

---

## Part 2 — Critical Evaluation

Each idea is evaluated on: **user impact**, **implementation feasibility within this codebase**, and **whether it is excellent (not just nice-to-have)**.

| # | Idea | Verdict | Reason for rejection (if rejected) |
|---|------|---------|--------------------------------------|
| 1 | Custom date/time format | ✅ KEEP | High impact, bounded scope, many users care about date formats |
| 2 | Export templates | ✅ KEEP | Obvious missing counterpart to existing import; trivial to add |
| 3 | Template duplication | ✅ KEEP | Standard UX pattern for power users; simple to implement |
| 4 | Proper YAML escaping | ✅ KEEP | Current escaping is incomplete and can produce invalid YAML |
| 5 | Per-template CSS selector | ✅ KEEP | Dramatically improves content quality for non-standard sites |
| 6 | Duplicate URL detection | ✅ KEEP | Real pain point; avoids cluttering the vault with identical notes |
| 7 | Array-type properties | ✅ KEEP | Enables proper `tags: [tag1, tag2]` frontmatter syntax |
| 8 | wordCount / readingTime | ✅ KEEP | Simple, zero-dependency additions that users find genuinely useful |
| 9 | `{{tags}}` from keywords | ✅ KEEP | Better metadata; pairs naturally with array properties |
| 10 | Template reordering | ✅ KEEP | UX polish; pattern priority depends on list order |
| 11 | Retry with back-off | ❌ REJECT | Low value; `requestUrl` timeouts are controlled by Obsidian/system |
| 12 | Clipboard history | ❌ REJECT | Peripheral to clipping; adds state management complexity for little gain |
| 13 | Selection-based clipping | ❌ REJECT | Requires browser extension architecture; not viable in a plugin-only model |
| 14 | Image downloading | ❌ REJECT | Binary I/O, potential for huge vault bloat, security surface; out of scope |
| 15 | Readability.js scoring | ❌ REJECT | The existing selector-priority list already does most of the work; adding a full Readability.js bundle would significantly increase bundle size |
| 16 | Archive.org fallback | ❌ REJECT | Niche; complicates the fetch pipeline with unclear benefit for most users |
| 17 | Wayback Machine save | ❌ REJECT | Niche; would require a write API call to a third party on every clip |
| 18 | Batch clipping | ❌ REJECT | Niche use case; added modal/queue complexity for rare workflow |
| 19 | Custom User-Agent | ❌ REJECT | `requestUrl` does not allow setting User-Agent in Obsidian's sandbox; also raises ethical questions about paywall bypass |
| 20 | Multiple-vault routing | ❌ REJECT | Vault selection is controlled by the OS/Obsidian, not the plugin |
| 21 | Raw HTML toggle in preview | ❌ REJECT | Moderate value; the existing rendered preview already covers the important use case |
| 22 | Footnote preservation | ❌ REJECT | Niche quality improvement; `<a>` links are already preserved |
| 23 | QuickAdd integration | ❌ REJECT | Creates a hard dependency on a third-party plugin; out of scope |
| 24 | `{{hostname}}` variable | ✅ KEEP | Simple addition; useful for filenames and folder routing |
| 25 | Progress indicator | ❌ REJECT | A "Fetching page…" Notice already exists; a spinner overlay adds complexity |
| 26 | Per-clip tag picker | ❌ REJECT | Over-engineering; the modal's property fields already allow tag editing |
| 27 | Canonical URL resolution | ✅ KEEP | Clean improvement: ensures the stored URL is the page's true identity |
| 28 | Relative URL resolution for links | ✅ KEEP | Existing `<a href="/path">` links inside clipped content are currently broken |
| 29 | Variable autocomplete in textarea | ❌ REJECT | Complex editor UX; acceptable to document variables in settings instead |
| 30 | Note update mode | ❌ REJECT | Overlaps heavily with idea #6; update-in-place adds non-trivial conflict resolution |

**Ideas that passed: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 24, 27, 28**

---

## Part 3 — Detailed Plans for Passing Ideas

---

### Idea 1 — Custom Date/Time Format Tokens

**What it is**

Extend the template variable syntax to accept an optional format argument:

```
{{date}}          →  2025-04-09   (unchanged default)
{{date:DD/MM/YYYY}} →  09/04/2025
{{date:MMMM D, YYYY}} →  April 9, 2025
{{date:x}}        →  Unix timestamp in ms
{{time:HH:mm}}    →  02:30
```

The format string follows [Day.js token syntax](https://day.js.org/docs/en/display/format) (a zero-dependency 2 kB library already used by many Obsidian plugins). Alternatively, the plugin can implement the most common tokens natively with a small (~30-line) formatter to avoid adding any dependency.

**Implementation**

1. Change the `replaceVariables` regex from `/\{\{(\w+)\}\}/g` to `/\{\{(\w+)(?::([^}]*))?\}\}/g` so it captures an optional format argument.
2. In `buildVariables`, instead of producing a static `date` and `time` string, pass the `Date` object through the formatter.
3. Add a `formatDate(date: Date, format: string): string` helper that handles tokens `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`, `x` (Unix ms), `X` (Unix seconds), and falls back to `toLocaleString` for unknown tokens.
4. Update `TEMPLATE_VARIABLES` in `types.ts` to note the format-argument syntax.
5. Update the settings description string that lists available variables.

```typescript
// In template.ts — updated replaceVariables
function replaceVariables(template: string, vars: Record<string, string>, date: Date): string {
  return template.replace(/\{\{(\w+)(?::([^}]*))?\}\}/g, (match, key, fmt) => {
    if ((key === 'date' || key === 'time') && fmt) {
      return formatDate(date, fmt);
    }
    return vars[key] ?? match;
  });
}

function formatDate(d: Date, fmt: string): string {
  return fmt
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM',   String(d.getMonth() + 1).padStart(2, '0'))
    .replace('DD',   String(d.getDate()).padStart(2, '0'))
    .replace('HH',   String(d.getHours()).padStart(2, '0'))
    .replace('mm',   String(d.getMinutes()).padStart(2, '0'))
    .replace('ss',   String(d.getSeconds()).padStart(2, '0'))
    .replace('x',    String(d.getTime()))
    .replace('X',    String(Math.floor(d.getTime() / 1000)));
}
```

**Why it's a good improvement**

Date format preferences are intensely personal and regional. Many Obsidian users organise daily notes by locale-specific or ISO-8601 dates and need the clipped note to match. This is one of the most-requested features in web-clipper-style tools.

**Possible downsides**

- The format string is opaque to new users; misspelled tokens silently produce literal text.
- Regex capture for `:format` breaks if users have a colon inside a property value template accidentally. (Mitigated by only applying format to `date`/`time` keys.)

**Confidence this improves the project: 92%**

---

### Idea 2 — Export Templates to JSON

**What it is**

Add an "Export Templates" button to the settings page. Clicking it serialises the current templates array to JSON and copies it to the clipboard (or triggers a file download). The exported JSON is compatible with the existing import flow, so users can round-trip their templates across vaults.

**Implementation**

In `settings-tab.ts`, alongside the existing "Add Template" and "Import from Web Clipper" buttons, add:

```typescript
.addButton((btn: ButtonComponent) => {
  btn.setButtonText('Export Templates');
  btn.onClick(async () => {
    const json = JSON.stringify(this.plugin.settings.templates, null, 2);
    await navigator.clipboard.writeText(json);
    new Notice('Templates copied to clipboard as JSON');
  });
});
```

For a richer experience, also offer a "Download as file" path using the Blob API where clipboard is unavailable:

```typescript
const blob = new Blob([json], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'web-clipper-templates.json';
a.click();
```

The exported format is already the native `ClipTemplate[]` shape, so the existing `importOwcTemplates` function reads it back without changes (it just needs a small addition to recognise the plain `ClipTemplate[]` array shape in addition to the OWC shape).

**Why it's a good improvement**

Import exists but export does not. Users cannot back up or share their templates without manually copying the `data.json` file from the vault. This is an obvious feature gap.

**Possible downsides**

- Clipboard write can fail silently on mobile if the user hasn't granted clipboard permission; the file-download fallback path requires testing on mobile Obsidian.

**Confidence this improves the project: 97%**

---

### Idea 3 — One-Click Template Duplication

**What it is**

Add a "Duplicate" button to each template card (or inside `TemplateEditModal`). Clicking it creates an identical copy of the template with a new ID and a name suffix like " (copy)", then opens the edit modal for the duplicate.

**Implementation**

In `renderTemplateCard` inside `settings-tab.ts`, add a small icon button alongside the card click handler:

```typescript
const dupBtn = card.createEl('button', { cls: 'web-clipper-card-icon-btn', attr: { 'aria-label': 'Duplicate template' } });
setIcon(dupBtn, 'copy');
dupBtn.addEventListener('click', async (e) => {
  e.stopPropagation(); // prevent opening the edit modal
  const dup: ClipTemplate = {
    ...structuredClone(template),
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
```

**Why it's a good improvement**

Creating a new template from scratch is laborious if it differs from an existing one by only one or two fields (e.g. a "GitHub Issues" template vs a "GitHub Repos" template). Duplication is a universal UX pattern in template editors. It reduces repetitive data entry significantly.

**Possible downsides**

- The `structuredClone` call requires Node 17+ / modern browsers, but Obsidian's Electron version supports it. A shallow copy with spread syntax and a mapped `properties` array is a safe fallback.

**Confidence this improves the project: 93%**

---

### Idea 4 — Proper YAML Frontmatter Value Escaping

**What it is**

The current `generateNoteContent` in `template.ts` only quotes values that contain `:`, `#`, `"`, or `'`. This misses several cases that produce invalid or misread YAML:

- Values containing a newline (`\n`) — should use block scalar style (`|`)
- Values starting with `-`, `[`, `{`, `>`, `|`, `!`, `&`, `*`, `?` — must be quoted
- Values that are exactly `true`, `false`, `null`, `~`, or a bare number — must be quoted to stay as strings
- Values containing a backslash followed by certain characters

**Implementation**

Replace the ad-hoc quoting in `generateNoteContent` with a proper helper:

```typescript
function yamlValue(value: string): string {
  if (!value) return '""';

  // Multi-line: use literal block scalar
  if (value.includes('\n')) {
    const indented = value.split('\n').map(l => `  ${l}`).join('\n');
    return `|\n${indented}`;
  }

  const bare = value.trim();

  // Values that YAML would misinterpret as non-strings
  const needsQuoting =
    /^[-[{>|!&*?@`#"']/.test(bare) ||        // leading special chars
    /:\s/.test(bare) ||                        // colon-space sequence
    /^(true|false|null|~|yes|no|on|off)$/i.test(bare) || // YAML booleans/nulls
    /^[0-9]/.test(bare) ||                     // starts with digit (might be parsed as number)
    bare.includes(' #');                       // inline comment marker

  if (needsQuoting) {
    return `"${bare.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  return value;
}
```

Then use `yamlValue(value)` instead of the current conditional in the loop.

**Why it's a good improvement**

Invalid YAML in a note's frontmatter silently breaks Obsidian's property parser, causing metadata to disappear or display incorrectly. Description fields from news articles frequently contain newlines. URLs are already quoted but bare numbers (like a year in `publishedDate`) would be parsed as integers. This is a correctness bug.

**Possible downsides**

- The literal block scalar (`|`) style changes whitespace handling slightly. Obsidian's property parser handles it correctly, but users who manually copy-paste frontmatter may notice the different style.

**Confidence this improves the project: 95%**

---

### Idea 5 — Per-Template Custom CSS Content Selector

**What it is**

Add an optional "Content selector" field to each template. When set, the parser uses that CSS selector instead of the built-in priority list to locate the main content element.

Example: for a template matching `https://lobste\.rs/.*`, the content selector could be `div.story_content`. For Substack articles it might be `div.body.markup`.

**Implementation**

1. Add `contentSelector?: string` to the `ClipTemplate` interface in `types.ts`.

2. In `fetchAndParsePage` (and the exported `parseHtml`), accept an optional selector override:

```typescript
export async function fetchAndParsePage(url: string, contentSelector?: string): Promise<ClippedPage> {
  const response = await requestUrl({ url });
  return parseHtml(response.text, url, contentSelector);
}

export function parseHtml(html: string, url: string, contentSelector?: string): ClippedPage {
  // ...
  const contentElement = contentSelector
    ? (doc.querySelector(contentSelector) ?? extractMainContent(doc))
    : extractMainContent(doc);
  // ...
}
```

3. In `main.ts`, pass `template.contentSelector` through the clip pipeline before the page is fetched, or (simpler) re-parse the already-fetched `rawHtml` with the template selector in `quickSave` / the clip modal's save path.

4. In `TemplateEditModal`, add a text input for "Content selector" with placeholder `.article-body, main article`.

**Why it's a good improvement**

The built-in selector list (`article`, `[role="main"]`, `main`, `.post-content`, …) works well for common CMS outputs but fails silently on many sites with unconventional markup. Letting the user specify a selector per site (via URL-pattern-matched templates) gives expert users precise control and dramatically improves clip quality for their most-used sources.

**Possible downsides**

- Requires the user to know CSS selectors — not friendly for beginners. However, the field is optional so it degrades gracefully.
- A mis-typed selector falls back to the built-in extraction (if implemented defensively), so the failure mode is benign.

**Confidence this improves the project: 89%**

---

### Idea 6 — Duplicate URL Detection

**What it is**

Before creating a new note, search the vault for existing notes whose `source` frontmatter property (or whichever property holds `{{url}}`) matches the URL being clipped. If a match is found, present the user with options:

- **Open existing** — navigate to the existing note
- **Create new** — proceed as normal (current behaviour)
- **Update existing** — overwrite the body of the existing note while preserving any manual additions to the frontmatter

**Implementation**

Add a helper that searches the vault for notes by source URL:

```typescript
async function findNoteByUrl(app: App, url: string): Promise<TFile | null> {
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (frontmatter && (frontmatter.source === url || frontmatter.url === url)) {
      return file;
    }
  }
  return null;
}
```

Call this inside `clipUrl` (and in `quickSave`) before creating the note. If a match is found, show a `Modal` or extend the `ClipModal` with a banner:

```
⚠️  This URL was already clipped: "Article Title"
[Open existing]  [Update existing]  [Create new]
```

The "Update existing" path reads the existing file, regenerates the body from the current page content, and calls `vault.modify(file, newContent)`.

**Why it's a good improvement**

Web clipping the same article twice (e.g. you forgot you already clipped it) creates duplicate notes that clutter the vault and confuse searches. Detection is cheap — the metadata cache is already in memory. This is one of the most common pain points in any web-clipping workflow.

**Possible downsides**

- The search iterates all markdown files; for very large vaults (10 000+ files) this could be slow. Mitigation: cache the URL index or limit the search to the target folder.
- The property name that holds the URL varies per template. The simplest fix is to hard-check `source`, `url`, and `link` as common defaults.

**Confidence this improves the project: 88%**

---

### Idea 7 — Array-Type Frontmatter Properties

**What it is**

Add a `type` field to `TemplateProperty` that can be `"text"` (default, current behaviour) or `"list"`. When `type` is `"list"`, the value is treated as a comma-separated string that the YAML renderer writes as a proper YAML sequence:

```yaml
tags:
  - obsidian
  - research
  - web-clipping
```

The template value for a list property could be `{{tags}}` (populated from meta keywords) or a static `research, web-clipping, inbox`.

**Implementation**

1. Add `type?: 'text' | 'list'` to `TemplateProperty` in `types.ts`.

2. In `generateNoteContent`, handle the list type:

```typescript
for (const [key, value] of Object.entries(frontmatter)) {
  const propDef = template?.properties.find(p => p.name === key);
  if (propDef?.type === 'list') {
    const items = value.split(',').map(s => s.trim()).filter(Boolean);
    if (items.length > 0) {
      lines.push(`${key}:`);
      for (const item of items) lines.push(`  - ${item}`);
    }
  } else {
    lines.push(`${key}: ${yamlValue(value)}`);
  }
}
```

3. In `TemplateEditModal`, add a toggle or dropdown next to the property name/value inputs to select the type.

4. In `ClipModal`'s `renderPropertyFields`, render list-type properties as textarea (comma-separated) rather than a single-line text input.

**Why it's a good improvement**

Obsidian's native Tags property expects a YAML list. With the current implementation, `tags: research, web-clipping` is a plain string that Obsidian does not recognise as tags. Array support makes clipping integrate cleanly with Obsidian's first-class property types (Tags, Aliases, Multi-select).

**Possible downsides**

- Requires a small schema migration: old `TemplateProperty` objects without a `type` field need to default to `"text"`. This is handled automatically with `prop.type ?? 'text'`.
- The comma-based split is fragile for tag values that contain commas. Could mitigate with newline-separated input.

**Confidence this improves the project: 91%**

---

### Idea 8 — `{{wordCount}}` and `{{readingTime}}` Template Variables

**What it is**

Two new template variables:

- `{{wordCount}}` — number of words in the extracted Markdown content
- `{{readingTime}}` — estimated reading time in minutes, calculated as `Math.ceil(wordCount / 200)` (a common average reading speed)

These can be used in frontmatter properties:

```
reading_time: {{readingTime}} min
word_count: {{wordCount}}
```

**Implementation**

In `buildVariables` in `template.ts`, add two lines:

```typescript
const words = page.content.trim().split(/\s+/).filter(Boolean);
const wordCount = words.length;
const readingTime = Math.max(1, Math.ceil(wordCount / 200));

return {
  // ...existing variables...
  wordCount: String(wordCount),
  readingTime: String(readingTime),
};
```

Add `'wordCount'` and `'readingTime'` to `TEMPLATE_VARIABLES` in `types.ts`. Update the settings description string.

**Why it's a good improvement**

Reading time is a first-class display feature in many modern note-taking workflows (and is shown by most read-later apps like Pocket and Instapaper). Users building reading lists in Obsidian want to know at a glance how long an article takes to read. The implementation is two lines and has no dependencies.

**Possible downsides**

- Word count based on `content.split(/\s+/)` counts Markdown syntax tokens (e.g. `##`, `**`, `---`) as words, slightly inflating the count. Stripping Markdown tokens first would be more accurate but adds complexity.
- Reading speed (200 wpm) is not configurable. Adding a setting for it adds minor settings bloat.

**Confidence this improves the project: 87%**

---

### Idea 9 — `{{tags}}` Variable from HTML Meta Keywords

**What it is**

Extract the `<meta name="keywords">` tag from the HTML and expose it as a `{{tags}}` template variable. Combined with Idea 7 (array-type properties), this allows a template to set:

```
Property: tags (type: list) = {{tags}}
```

…and have Obsidian-native tags auto-populated from the page's declared keywords.

**Implementation**

In `parser.ts`, inside `parseHtml`:

```typescript
const rawKeywords = getMetaContent(doc, 'keywords') || getMetaContent(doc, 'article:tag') || '';
const tags = rawKeywords
  .split(',')
  .map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
  .filter(Boolean)
  .join(', ');
```

Add `tags` to the returned `ClippedPage` object and to `ClippedPage` interface in `types.ts`:

```typescript
export interface ClippedPage {
  // ...
  tags: string; // comma-separated, normalised
}
```

Add `'tags'` to `TEMPLATE_VARIABLES` and `buildVariables`.

**Why it's a good improvement**

Many publishers already declare machine-readable keywords or article tags in their HTML. Automatically surfacing these into Obsidian tags gives users a head start on categorisation without manual effort. Normalising to lowercase kebab-case makes them immediately usable as Obsidian tags.

**Possible downsides**

- Keyword meta tags are often spammy, outdated, or absent (many sites removed them for SEO reasons post-2009). Users should treat `{{tags}}` as a suggestion rather than ground truth.
- Storing `tags` as a comma-separated string in `ClippedPage` is slightly inconsistent with the rest of the scalar fields; a `string[]` would be cleaner but would require changes to `buildVariables`.

**Confidence this improves the project: 82%**

---

### Idea 10 — Template Reordering via Up/Down Controls

**What it is**

Add up (↑) and down (↓) icon buttons to each template card in the settings grid. Clicking them moves the template one position up or down in `settings.templates`. Template order matters because `findMatchingTemplate` returns the *first* template whose URL pattern matches, so priority is determined by list order.

**Implementation**

In `renderTemplateCard`, add two small icon buttons in the card header:

```typescript
const reorderBtns = cardHeader.createDiv({ cls: 'web-clipper-card-reorder' });

if (index > 0) {
  const upBtn = reorderBtns.createEl('button', { attr: { 'aria-label': 'Move up' } });
  setIcon(upBtn, 'chevron-up');
  upBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const arr = this.plugin.settings.templates;
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    await this.plugin.saveSettings();
    this.display();
  });
}

if (index < this.plugin.settings.templates.length - 1) {
  const downBtn = reorderBtns.createEl('button', { attr: { 'aria-label': 'Move down' } });
  setIcon(downBtn, 'chevron-down');
  downBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const arr = this.plugin.settings.templates;
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    await this.plugin.saveSettings();
    this.display();
  });
}
```

**Why it's a good improvement**

A user who wants GitHub URLs to match a GitHub template before a generic "tech articles" template must ensure the GitHub template appears earlier in the list. Currently there is no way to change order without deleting and recreating templates. This is a UX gap that becomes frustrating the moment a user has three or more templates.

**Possible downsides**

- Up/down buttons are a dated reordering pattern; drag-and-drop would be more modern. However, implementing DnD in Obsidian modal HTML without a library is fragile, and the simple button approach works reliably on mobile too.

**Confidence this improves the project: 90%**

---

### Idea 24 — `{{hostname}}` Template Variable

**What it is**

Add a `{{hostname}}` variable that returns only the registered domain of the source URL (e.g. `github.com`, `medium.com`), distinct from `{{siteName}}` which returns the OG site_name string (e.g. "GitHub · Where the world builds software").

`{{hostname}}` is useful for:
- Filenames: `{{date}} - {{hostname}} - {{title}}`
- Folder routing without a template per site: `Clippings/{{hostname}}/{{title}}`
- Frontmatter: `source_domain: {{hostname}}`

**Implementation**

In `buildVariables` in `template.ts`:

```typescript
let hostname = '';
try {
  hostname = new URL(page.url).hostname.replace(/^www\./, '');
} catch { /* leave empty */ }

return {
  // ...existing...
  hostname,
};
```

Add `'hostname'` to `TEMPLATE_VARIABLES` and the settings description.

**Why it's a good improvement**

`{{siteName}}` is unreliable (many sites don't set `og:site_name`, or set it to a long marketing string). `{{hostname}}` is always derivable from the URL and is clean and short, making it ideal for filenames and folder names. Zero dependencies, five lines of code.

**Possible downsides**

- `new URL().hostname` returns the full subdomain (e.g. `blog.example.com`); stripping `www.` is done, but other subdomains are kept. Users may expect only the apex domain. Could add a `{{domain}}` alias that also strips known subdomains, but that requires a public-suffix list.

**Confidence this improves the project: 88%**

---

### Idea 27 — Canonical URL Resolution

**What it is**

Before storing the URL in the note's frontmatter (and before searching for duplicates), resolve the page's `<link rel="canonical">` tag. Many URLs that users clip are tracking-parameter-laden or AMP variants:

```
https://www.example.com/article?utm_source=twitter&utm_campaign=foo
```

The canonical URL is the clean, indexable version:

```
https://www.example.com/article
```

**Implementation**

In `parseHtml` in `parser.ts`, add a canonical resolution step after parsing the document:

```typescript
const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
const resolvedUrl = canonical ? resolveUrl(canonical, url) : url;
```

Then use `resolvedUrl` instead of `url` in the returned `ClippedPage`. The original `url` (as typed or shared by the user) can be kept as a separate `originalUrl` field if needed for debugging.

**Why it's a good improvement**

Canonical resolution ensures:
1. The stored `source` URL in frontmatter is clean and shareable.
2. Duplicate detection (Idea 6) works correctly — two different tracking URLs that resolve to the same canonical are correctly identified as duplicates.
3. AMP pages (e.g. `https://www.google.com/amp/s/example.com/article/amp`) are stored with their proper URLs.

**Possible downsides**

- Some sites set `rel="canonical"` to a different domain (e.g., syndicated content pointing to the original publisher). In such cases the "source" URL in the note might surprise the user. Mitigation: only resolve same-origin canonical URLs, or note the original URL alongside it.

**Confidence this improves the project: 86%**

---

### Idea 28 — Relative URL Resolution in Clipped Content

**What it is**

When the HTML-to-Markdown converter encounters `<a href="/path/to/page">` or `<img src="/images/photo.jpg">`, it currently emits the relative path as-is:

```markdown
[Link text](/path/to/page)
![alt](/images/photo.jpg)
```

These links are broken inside Obsidian because there is no base URL context. The fix resolves all relative URLs to absolute ones using the source URL as the base, so the output is:

```markdown
[Link text](https://example.com/path/to/page)
![alt](https://example.com/images/photo.jpg)
```

**Implementation**

Pass the `url` (base URL) parameter into `htmlToMarkdown` and then into `convertNode`, and resolve relative URLs at the `<a>` and `<img>` cases:

```typescript
function htmlToMarkdown(element: Element, baseUrl: string): string {
  const clone = element.cloneNode(true) as Element;
  // ...remove unwanted elements...
  return convertNode(clone, baseUrl).trim();
}

// In convertNode's 'a' case:
case 'a': {
  const rawHref = el.getAttribute('href');
  const href = rawHref ? resolveUrl(rawHref, baseUrl) : null;
  if (href && children.trim()) return `[${children.trim()}](${href})`;
  return children;
}

// In convertNode's 'img' case:
case 'img': {
  const rawSrc = el.getAttribute('src');
  const src = rawSrc ? resolveUrl(rawSrc, baseUrl) : null;
  const alt = el.getAttribute('alt') || '';
  if (src) return `![${alt}](${src})`;
  return '';
}
```

The `resolveUrl` helper is already in `parser.ts` — it just needs to be called from within `convertNode`.

**Why it's a good improvement**

This is a correctness bug, not a feature request. Relative links in clipped content are functionally useless inside Obsidian notes. Users who click any in-article link or try to view embedded images get broken results. Since the base URL is already available at parse time, the fix is straightforward and backward-compatible.

**Possible downsides**

- Resolving all `<a>` links to absolute URLs means internal anchor links (e.g. `href="#section-2"`) become `https://example.com/article#section-2` instead of `#section-2`. This is actually *better* for cross-context use.
- Fragment-only anchors like `href="#top"` become full URLs, which is fine.

**Confidence this improves the project: 96%**
