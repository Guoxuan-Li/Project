# Blog Template

A minimalist personal blog template built with [Jekyll](https://jekyllrb.com).
Soft anime-inspired palette, modular architecture, and ready to deploy.

**Sections:** About, Experience, Travels (map + rankings), Bookshelf, Recipes,
Writing (personal works + collaborative story tree), Journal, Guestbook, Friends.

Each section has its own accent color -- sakura pink, sora blue, matcha green,
yuzu gold, sumire purple -- so the site feels cohesive yet varied.

---

## Table of contents

- [Quick start](#quick-start)
- [Directory structure](#directory-structure)
- [Adding and editing content](#adding-and-editing-content)
- [The listing page pattern](#the-listing-page-pattern)
- [Reusable modules](#reusable-modules)
- [Optional feature modules](#optional-feature-modules)
- [Private content injection](#private-content-injection)
- [Customization](#customization)
- [Deployment](#deployment)
- [License](#license)

---

## Quick start

### Prerequisites

- Ruby 3.0+ ([RubyInstaller](https://rubyinstaller.org) on Windows)
- Bundler (`gem install bundler`)

### Run locally

```bash
# 1. Clone your fork
git clone https://github.com/your-name/your-repo.git
cd your-repo

# 2. Install dependencies
bundle install

# 3. Start the dev server
bundle exec jekyll serve
# Open http://127.0.0.1:4000
```

The default `backend.mode: auto` detects the data source at build time. When
`sample_data/` exists, all collections and interactive modules use the bundled
sample. When it is absent, collections use `content/` and interactive modules
use the Cloudflare API. Clear this site's browser storage to reset demo changes.

### Deploy without Ruby

Push to GitHub and let [GitHub Pages](https://pages.github.com) or
[Cloudflare Pages](https://pages.cloudflare.com) build for you.
See [Deployment](#deployment).

---

## Directory structure

```
.
|-- _config.yml              Site config: title, nav, collections, theme
|-- Gemfile                  Ruby dependencies
|
|-- pages/                   Page files (one folder per page)
|   |-- home/index.html      Landing page (permalink: /)
|   |-- about/index.md       About page
|   |-- experience/index.md  Timeline of work/study
|   |-- travels/index.html   Travel map + city cards
|   |-- bookshelf/index.html Book listing (row-expand cards)
|   |-- recipes/index.html   Recipe listing (row-expand cards)
|   |-- writing/index.html   Short works with tabs
|   |-- posts/index.html     Journal search and pinned posts
|   |-- message/index.html   Guestbook (optional, needs backend)
|   `-- friends/index.html   Friend-link bubble network
|
|-- content/                 All collections live here (collections_dir)
|   |-- _posts/              Blog posts (YYYY-MM-DD-title.md)
|   |-- _about/              About page content
|   |-- _experience/         Experience timeline content
|   |-- _travels/            Travel notebook + summary
|   |-- _books/              Bookshelf notebook
|   |-- _writing/            Writing notebook
|   |-- _recipes/            Recipe notebook
|   `-- _friends/            Friend links (optional)
|
|-- _layouts/                Jekyll layouts
|   |-- default.html         Base HTML shell (head + nav + footer)
|   |-- home.html            Landing page
|   |-- listing.html         Reusable listing template
|   |-- page.html            Generic page
|   |-- post.html            Blog post
|   |-- about.html           About page
|   `-- experience.html      Experience timeline
|
|-- _includes/               Reusable HTML partials
|   |-- head.html            <head> with meta, fonts, CSS
|   |-- nav.html             Site navigation
|   |-- footer.html          Site footer
|   |-- search-bar.html      Reusable search toolbar
|   `-- loading.html         Full-page loading overlay
|
|-- _sass/                   SCSS partials
|   |-- _variables.scss      Design tokens (colors, fonts, spacing)
|   |-- _base.scss           Reset, typography, prose
|   |-- _layout.scss         Header, footer, containers
|   |-- _components.scss     Hero, cards, timeline, about, writing
|   |-- _search.scss         Search bar, chips, scope dropdown
|   |-- _cards.scss          Card grid, row expansion, modal
|   |-- _bubble.scss         Friend bubble network
|   |-- _travel_summary.scss Travel summary modal
|   |-- _message.scss        Guestbook form + list
|   `-- _friends.scss        Friends page layout
|
|-- assets/
|   |-- css/main.scss        SCSS entry point + palette definitions
|   |-- js/
|   |   |-- search.js        SearchEngine module
|   |   |-- cards.js         CardGrid module (row + modal modes)
|   |   |-- listing.js       Listing page controller
|   |   |-- travels.js       Travel page controller
|   |   |-- travels-map.js   World map (D3 + GeoJSON)
|   |   |-- travels-summary.js
|   |   |-- writing.js       Writing tab + accordion
|   |   |-- friends.js       Bubble network physics
|   |   |-- message.js       Guestbook form + API
|   |   `-- main.js          Nav toggle, global UI
|   |-- data/world.geojson   World map geometry
|   `-- favicon.svg
|
|-- _plugins/
|   |-- content_sources.rb   Loads content into site.data without disk writes
|   `-- post_frontmatter_validator.rb
|
|-- migrations/              Cloudflare D1 schema and seed migration
|-- sample_data/             Complete offline sample: content, stats, messages, stories
|-- _scripts/                Private-content synchronization
`-- functions/               Cloudflare Pages Functions
```

---

## Adding and editing content

All content lives under `content/` as plain markdown. You rarely need
to touch HTML or JavaScript.

### Blog posts

Create a file in `content/_posts/` named `YYYY-MM-DD-title.md`:

```markdown
---
title: My First Post
date: 2026-01-15
tags: [essay, life]
description: A short summary for SEO and social cards.
---

Write your post here in **markdown**.
```

### About page

Edit `content/_about/about.md`. The layout auto-parses two sections:

- `# Contact` -- rendered as a contact block
- `# Q&A` -- rendered as a question-answer list

Everything before `# Contact` is shown as the intro.

### Experience timeline

Edit `content/_experience/experience.md`. Each `# H1` heading becomes
a timeline entry:

```markdown
# Company Name [2023 - Present] Your Role

Description of what you did here.
```

### Travels

Edit `content/_travels/notebook.md`. Use `# H1` for countries and
`## H2` for cities. Add a duration in parentheses:

```markdown
# France

## Paris (5d)

The first morning was disorienting. The light was different...
```

The travel summary modal reads `content/_travels/summary.md` -- a
compact record of trips by continent and year.

### Bookshelf

Edit `content/_books/notebook.md`. Each `# H1` is a book:

```markdown
# Book Title

Author: Author Name [Country]
Summary: One or two sentences about the book.
```

### Recipes

Edit `content/_recipes/notebook.md`. Each `# H1` is a recipe:

```markdown
# Recipe Name

[From Source]

Ingredients and steps in markdown...
```

### Writing

Edit `content/_writing/notebook.md`. Uses `<details>` accordions grouped
into tabbed `<section>` blocks. See the sample file for the pattern.

### Friends

Create markdown files in `content/_friends/`. Each `# H1` heading becomes
a friend link, or use one friend per file:

```markdown
# Friend Name

https://their-blog.example.com
```

---

## The listing page pattern

Bookshelf and recipes share the same architecture -- a **listing page**.
The pattern has three parts:

1. A **notebook** (markdown in `content/`) holding all items in one file
2. A **page** (`pages/bookshelf/index.html`) with front-matter config
3. The **listing layout** (`_layouts/listing.html`) + **listing.js** that
   parses the notebook and builds cards

To create a new listing page (e.g. a movie log):

1. Add a collection in `_config.yml`:

```yaml
collections:
  movies:
    output: false
```

2. Create `content/_movies/notebook.md` with items:

```markdown
# Movie Title

Director: Name [Year]
Summary: What you thought of it.
```

3. Create `pages/movies/index.html`:

```yaml
---
layout: listing
title: Movies
permalink: /movies/
card_prefix: movie
card_mode: row
collapsed_lines: 5
collection_key: movies
search_scopes: "title director summary"
search_labels: "Title|Director|Summary"
search_placeholder: "Search by director, title..."
search_unit: "films"
---
```

That's it -- the search bar, card grid, filtering, and expansion all
work automatically.

---

## Reusable modules

### SearchEngine (`assets/js/search.js`)

A self-contained search engine with:

- **Live filtering** as you type
- **Chip locking** -- press Enter to pin a search term as a chip
- **AND / OR operators** -- click the toggle between chips
- **Per-field scopes** -- search title only? body only? toggle in the dropdown
- **Match preview** -- shows a snippet of where the term was found

```javascript
var engine = SearchEngine.create({
  toolbar: document.querySelector("[data-search-toolbar]"),
  prefix: "book",
  scopes: ["title", "author", "summary"],
  onFilter: function (terms) { /* re-filter your cards */ }
});
engine.init();
```

### CardGrid (`assets/js/cards.js`)

Two expansion modes:

- **Row mode** (`"row"`) -- clicking a card expands it vertically; all cards
  in the same grid row grow to match. Used by bookshelf and recipes.
- **Modal mode** (`"modal"`) -- opens a full-screen overlay with the card's
  full content. Used by travels.

```javascript
var grid = CardGrid.create({
  grid: document.querySelector("[data-card-grid]"),
  prefix: "book",
  mode: "row",          // or "modal"
  collapsedLines: 6,
  buildCardHtml: function (card) { return "..."; }
});
grid.renderCards(parsedCards);
```

### Travel map (`assets/js/travels-map.js`)

Renders a world map using D3.js and the bundled `world.geojson`. Countries
you have visited are highlighted in the accent color. The map connects to
`travels.js` via the `window.TravelsNS` namespace.

### Guestbook (`functions/api/comments.js`)

The message page is an **optional extension** -- it needs a backend.
The included serverless function provides a simple comment API. Deploy it
on Cloudflare Pages, Vercel, or Netlify Functions, and point `message.js`
at the API URL.

To disable the guestbook, delete `pages/message/` and remove the
`message` entry from the `nav` list in `_config.yml`.

---

## Optional feature modules

All newer features are controlled from `_config.yml`:

```yaml
features:
  posts: true
  home_stats: true
  guestbook: true
  guestbook_likes: true
  story_tree: true
  travel_rankings: true

backend:
  mode: auto          # auto, demo, or cloudflare
  api_base: /api
```

`auto` resolves to `demo` when `sample_data/` exists and `cloudflare` when it
does not. `demo` is suitable for screenshots, theme development, and static
hosts. `cloudflare` uses the included Pages Functions and D1 database. Set the
`BLOG_BACKEND_MODE` environment variable to override detection for one build.

The two source trees have distinct roles:

```text
sample_data/content/   Bundled fictional content used by the sample site
content/               Your real content, or the target for private-repo injection
```

The sample tree includes About, Experience, Journal posts, Bookshelf, Recipes,
Travels, Travel Rankings, Writing, and Friends. `stats.json`, `comments.json`,
and `stories.json` cover modules that normally depend on API data. Jekyll reads
these files during a demo build but does not publish the raw `sample_data/`
directory.

### Journal

`pages/posts/index.html`, `_includes/post-card.html`, and `assets/js/posts.js`
form an independent journal module. Posts can use readable filenames because
the build plugin validates the explicit date instead:

```markdown
---
title: A readable title
date: 2026-08-12
tags: [essay, notes]
pinned: false
description: Card and social preview text.
---
```

### Site engagement

`_includes/site-engagement.html` can be included from any layout. In demo mode
it starts with sample counts. In Cloudflare mode it uses `GET/POST /api/stats`.

### Story garden

The Writing page exposes a branching collaborative-story module. Readers can
select any node, read its path from the root, continue that branch, create a
new story, and like a story. Demo data lives in `sample_data/stories.json`.
Cloudflare mode stores stories in `stories` and `story_nodes`; lightweight
hourly action limits use `story_action_limits`.

### Travel rankings

Edit `content/_travels/rankings.md`. Every H1 creates a ranking tab, every H2
creates a tier, and `=` marks tied items:

```markdown
# Favorite cities
## S
Kyoto = Lisbon
## A
Paris = Bologna
```

### Guestbook likes

The existing guestbook now supports likes on both messages and replies. Demo
mode persists them locally. Cloudflare mode calls `/api/like` and stores the
counter in the `comments.likes` column.

---

## Private content injection

The template can keep travel, writing, and recipe source material in separate
private GitHub repositories. `_scripts/sync_private_content.rb` normalizes
UTF-8/UTF-16 files and injects them before Jekyll builds.

Each private repository may use this simple contract:

```text
travel-private/
  notebook.md        # or travels.md; otherwise all Markdown is combined
  summary.md         # optional
  rankings.md        # optional

writing-private/
  notebook.md        # or writing.md
  stories.json       # optional demo-story replacement

recipes-private/
  notebook.md        # or recipe.md / recipes.md
```

Test injection locally from the Template directory:

```powershell
$env:TRAVEL_DATA_DIR="D:\content\travel"
$env:WRITING_DATA_DIR="D:\content\writing"
$env:RECIPES_DATA_DIR="D:\content\recipes"
$env:BLOG_BACKEND_MODE="cloudflare"
ruby _scripts/sync_private_content.rb
bundle exec jekyll build
```

Unset variables are deliberately skipped, so the bundled sample remains
usable. `BLOG_BACKEND_MODE=cloudflare` makes this local build use the injected
`content/` tree even while `sample_data/` remains checked in. Generated notebook
files are normal Jekyll content; inspect the build diff before committing if
the private material should never enter Git history.

---

## Customization

### Colors

The template ships with six built-in **palettes**. Set one in `_config.yml`:

```yaml
palette: paper   # paper | mist | sand | sage | ink | dusk
```

| Palette | Mood | Background | Ink |
|---------|------|------------|-----|
| `paper` | Warm cream (default) | `#FAF6F0` | `#2E2A28` |
| `mist` | Cool light gray | `#F2F3F5` | `#2A2D34` |
| `sand` | Warm beige, aged paper | `#F5EFE3` | `#3D3527` |
| `sage` | Muted green-tinted | `#F0F2EC` | `#2C3326` |
| `ink` | Dark charcoal | `#1B1A1F` | `#E8E5E1` |
| `dusk` | Dark blue-gray | `#1A1D24` | `#DDE2EA` |

Structural colors (background, surface, ink, lines, shadows) are CSS
custom properties defined in `:root` and overridden per-palette in
`assets/css/main.scss`. Accent colors (see below) are shared across all
palettes.

#### Accent colors

Five accent colors give each section its own identity. Each has three
shades: base, soft (backgrounds), and ink (text on light), defined in
`_sass/_variables.scss`:

```scss
$sakura:      #E89CAB;  // base
$sakura-soft: #FBE4E9;  // light background
$sakura-ink:  #B65C6E;  // readable text color
```

To change an accent shade, edit `_sass/_variables.scss`. To reassign which
section gets which accent, edit the `body.page--*` rules in
`assets/css/main.scss`.

#### Adding a custom palette

Add a new block in `assets/css/main.scss`:

```scss
[data-palette="ocean"] {
  --bg:        #0D1B2A;
  --surface:   #1B2A3E;
  --surface-2: #243650;
  --line:      #2E4361;
  --line-soft: #233A55;
  --ink:       #E0E7EF;
  --ink-soft:  #9BAFC4;
  --muted:     #6B7F94;
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.20);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.28), 0 1px 2px rgba(0, 0, 0, 0.20);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.36);
  --shadow-lg: 0 10px 28px rgba(0, 0, 0, 0.46);
}
```

Then set `palette: ocean` in `_config.yml`.

### Fonts

The template loads Noto Serif SC (headings) and Noto Sans SC (body) from
Google Fonts. To use different fonts:

1. Update the `<link>` in `_includes/head.html`
2. Update `$font-serif` and `$font-sans` in `_sass/_variables.scss`

### Navigation

Edit the `nav` list in `_config.yml`:

```yaml
nav:
  - { key: "about", label: "About", path: "/about/", accent: "sakura" }
  - { key: "blog",  label: "Blog",  path: "/blog/",  accent: "sumire" }
```

Add or remove entries; the header and footer update automatically.

### Site metadata

Edit `_config.yml`:

```yaml
title: Your Blog
tagline: Your tagline
description: Your site description
author:
  name: Your Name
  email: you@example.com
  github: your-handle
```

---

## Deployment

### GitHub Pages

1. Push your repo to GitHub
2. Go to **Settings > Pages**
3. Set **Source** to your branch, **Build** to GitHub Actions or Jekyll
4. Your site goes live at `https://your-name.github.io/your-repo/`

Set `baseurl` in `_config.yml` to `"/your-repo"` for project pages,
or `""` for user/org pages.

### Cloudflare Pages

The complete Cloudflare route supports Pages Functions, D1, site statistics,
guestbook likes, and collaborative stories.

#### 1. Install and authenticate Wrangler

```bash
npm install --save-dev wrangler
npx wrangler login
```

#### 2. Create the D1 database

```bash
npx wrangler d1 create blog-template-db
```

Copy the returned `database_id` into `wrangler.toml`. Keep the binding name
`BLOG_DB`; every included Function reads that binding.

Apply the schema and sample story:

```bash
npx wrangler d1 migrations apply blog-template-db --local
npx wrangler d1 migrations apply blog-template-db --remote
```

Set a long random `IP_HASH_SALT` secret in the Cloudflare Pages project. It is
used only to hash guestbook request addresses for abuse investigation.

#### 3. Switch the site to the real backend

```yaml
# _config.yml
backend:
  mode: cloudflare
  api_base: /api
```

Build and test Functions locally:

```bash
bundle exec jekyll build
npx wrangler pages dev _site --d1 BLOG_DB=YOUR_DATABASE_ID
```

#### 4. Create and deploy the Pages project

```bash
npx wrangler pages project create blog-template
npx wrangler pages deploy _site --project-name=blog-template
```

Set `url` in `_config.yml` to the generated Pages URL or custom domain.

#### 5. Enable GitHub Actions and private repositories

The included `.github/workflows/deploy-cloudflare.yml` checks out optional
private content, runs the sync script, builds Jekyll, applies D1 migrations,
and deploys Pages including `functions/`.

Create these GitHub repository **Secrets**:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Pages deploy and D1 edit token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier |
| `PRIVATE_CONTENT_TOKEN` | Fine-grained GitHub token with read-only access to the private content repos |

Create these GitHub repository **Variables**:

| Variable | Example |
|---|---|
| `CLOUDFLARE_PAGES_PROJECT` | `blog-template` |
| `PRIVATE_TRAVEL_REPO` | `your-name/private-travel` |
| `PRIVATE_WRITING_REPO` | `your-name/private-writing` |
| `PRIVATE_RECIPES_REPO` | `your-name/private-recipes` |

Private repository variables may be left blank. The matching checkout and
injection are then skipped. Use a fine-grained token scoped only to those
repositories; do not use a broad classic token when read-only access is enough.

The scheduled workflow refreshes injected content once per day. Remove the
`schedule` block if deployments should happen only on pushes or manual runs.

### Any static host

Run `bundle exec jekyll build` and upload the `_site/` folder to any
static hosting provider (Netlify, Vercel, S3, nginx, etc.).

---

## License

MIT. See [LICENSE](LICENSE).

Feel free to use this template for personal or commercial projects.
A credit or link back is appreciated but not required.
