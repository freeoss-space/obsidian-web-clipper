# Web Clipper Mobile — Obsidian Plugin

Clip web pages from mobile share intents (and desktop) into Obsidian notes with customizable templates, metadata extraction, and Markdown conversion.

## Features

- **Share Intent Support** — Receive URLs from your mobile browser's share sheet via `obsidian://web-clipper?url=...` or `obsidian://clip?url=...`
- **Rich Metadata Extraction** — Automatically extracts title, author, description, Open Graph images, site name, and published date
- **HTML to Markdown** — Converts page content to clean Markdown, stripping navigation, ads, and other noise
- **Customizable Templates** — Create multiple templates with different frontmatter properties, body layouts, and target folders
- **URL Pattern Matching** — Auto-select templates based on URL patterns (regex). E.g., use a specific template for GitHub repos, another for blog posts
- **Interactive Modal** — Preview and edit all metadata, properties, and content before saving
- **Folder Selection** — Choose the target folder per template or per clip, with folder suggestions from your vault

## How It Works

### Mobile Share Intent

1. On your phone, share a URL from your browser
2. Choose Obsidian from the share sheet
3. The plugin fetches the page, extracts metadata, and opens a modal
4. Review/edit the content, select a template, and save

### Protocol URLs

Share intents are received via Obsidian's URI scheme:

```
obsidian://web-clipper?url=https://example.com/article
obsidian://clip?url=https://example.com/article
```

### Desktop

- **Ribbon icon** — Click the scissors icon to clip a URL from your clipboard
- **Command palette** — "Clip URL from clipboard" or "Clip URL..." (manual entry)

## Templates

Templates control how clipped pages are formatted. Each template has:

| Field | Description |
|-------|-------------|
| **Name** | Display name for the template |
| **Folder** | Target folder (falls back to default) |
| **Filename template** | Note filename using `{{variables}}` |
| **URL patterns** | Regex patterns for auto-matching (one per line) |
| **Properties** | Frontmatter key-value pairs with `{{variables}}` |
| **Body template** | Note body content with `{{variables}}` |

### Available Variables

| Variable | Description |
|----------|-------------|
| `{{title}}` | Page title (from OG or `<title>`) |
| `{{url}}` | Source URL |
| `{{author}}` | Author name (from meta tags) |
| `{{description}}` | Page description |
| `{{ogImage}}` | Open Graph image URL |
| `{{siteName}}` | Site name |
| `{{publishedDate}}` | Article published date |
| `{{content}}` | Full page content as Markdown |
| `{{date}}` | Current date (YYYY-MM-DD) |
| `{{time}}` | Current time (HH:MM:SS) |

### Example Template for GitHub

- **URL pattern:** `https://github\.com/.*`
- **Filename:** `{{title}}`
- **Properties:**
  - `source`: `{{url}}`
  - `type`: `github-repo`
- **Body:** `# {{title}}\n\n{{content}}`

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css`
2. Create a folder `web-clipper-mobile` in your vault's `.obsidian/plugins/` directory
3. Copy the files into that folder
4. Enable the plugin in Obsidian Settings → Community Plugins

### Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## Setting Up Mobile Share Intent

On Android/iOS, you can use apps like **Tasker**, **Shortcuts**, or URL scheme handlers to send `obsidian://web-clipper?url=<shared-url>` when sharing from the browser. Obsidian mobile natively handles `obsidian://` URLs.

## License

GPL-3.0-or-later
