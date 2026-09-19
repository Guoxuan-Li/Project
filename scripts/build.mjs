// Portable build of this template's Liquid pages. The original Jekyll build remains available.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';
import { marked } from 'marked';
import * as sass from 'sass';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
const read = name => fs.readFile(path.join(root, name), 'utf8');
const exists = async name => !!(await fs.stat(path.join(root, name)).catch(() => null));
function front(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return { meta: match ? YAML.parse(match[1]) || {} : {}, body: match ? text.slice(match[0].length) : text };
}
async function walk(dir) {
  return (await Promise.all((await fs.readdir(path.join(root, dir), { withFileTypes: true })).map(e =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : `${dir}/${e.name}`))).flat();
}
function markdown(text = '') {
  // Preserve the source template's markdown="1" content blocks.
  text = String(text).replace(/(<div[^>]*markdown="1"[^>]*>)([\s\S]*?)(<\/div>)/g,
    (_, open, body, close) => `${open}\n${marked.parse(body)}${close}`);
  const counts = new Map();
  return marked.parse(text)
    .replace(/\b(src|href)="\/(?!\/)/g, (_, attr) => `${attr}="${site.baseurl.replace(/\/$/, '')}/`)
    .replace(/<h([1-6])>(.*?)<\/h\1>/g, (_, level, title) => {
    const key = title.replace(/<[^>]*>/g, '').toLowerCase().replace(/&amp;|&/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
    const n = counts.get(key) || 0; counts.set(key, n + 1);
    return `<h${level} id="${key}${n ? '-' + n : ''}">${title}</h${level}>`;
  });
}
const site = YAML.parse(await read('_config.yml'));
site.baseurl = process.env.BLOG_BASEURL ?? site.baseurl ?? '';
site.url = process.env.BLOG_URL ?? site.url ?? '';
site.time = new Date();
site.backend.mode = process.env.BLOG_BACKEND_MODE || site.backend.mode;
site.backend.gallery_api = process.env.BLOG_GALLERY_API || site.backend.gallery_api || '';
if (site.backend.mode === 'auto') site.backend.mode = await exists('sample_data') ? 'demo' : 'cloudflare';
site.data_source = site.backend.mode === 'demo' ? 'sample' : 'content';
const contentRoot = site.data_source === 'sample' ? 'sample_data/content' : site.collections_dir;
site.data = {};
for (const filename of await walk('_data')) {
  if (filename.endsWith('.json')) site.data[path.basename(filename, '.json')] = JSON.parse(await read(filename));
  if (/\.ya?ml$/.test(filename)) site.data[path.basename(filename).replace(/\.ya?ml$/, '')] = YAML.parse(await read(filename));
}
for (const key of [...Object.keys(site.collections), 'posts']) {
  site[key] = [];
  if (key === 'posts' && !site.features.posts) continue;
  if (!await exists(`${contentRoot}/_${key}`)) continue;
  for (const filename of await walk(`${contentRoot}/_${key}`)) {
    if (!filename.endsWith('.md')) continue;
    const {meta, body} = front(await read(filename));
    const slug = path.basename(filename, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '');
    const doc = {...meta, slug, content: body};
    if (key === 'posts') {
      if (!meta.title || !meta.date || Number.isNaN(Date.parse(meta.date))) throw new Error(`Post needs a title and valid date: ${filename}`);
      doc.date = new Date(meta.date);
      if (doc.date > site.time && !site.future) continue;
      doc.content = markdown(body);
      doc.url = `/posts/${slug}/`;
    }
    site[key].push(doc);
  }
}
site.posts.sort((a,b) => b.date - a.date);
site.data.experience_content = {content: site.experience[0]?.content || ''};
site.data.writing_notebook = {content: site.writing[0]?.content || ''};
site.data.friends = [];
if (await exists(`${contentRoot}/_friends`)) {
  for (const filename of await walk(`${contentRoot}/_friends`)) {
    const {body} = front(await read(filename));
    for (const match of body.matchAll(/^# (.+)\r?\n([\s\S]*?)(?=^# |$(?![\s\S]))/gm)) {
      site.data.friends.push({name:match[1].trim(),url:match[2].match(/https?:\/\/[^\s)]+/)?.[0] || null});
    }
  }
}
if (site.data_source === 'sample') {
  for (const [key, filename] of Object.entries({story_sample:'stories', engagement_sample:'stats', guestbook_sample:'comments'})) {
    site.data[key] = JSON.parse(await read(`sample_data/${filename}.json`));
  }
}
const liquid = new Liquid({root:path.join(root, '_includes'), jekyllInclude:true, strictFilters:true});
const relative = p => site.baseurl.replace(/\/$/, '') + '/' + String(p || '').replace(/^\//, '');
const absolute = p => site.url.replace(/\/$/, '') + relative(p);
const escapeXML = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
liquid.registerFilter('relative_url', relative);
liquid.registerFilter('absolute_url', absolute);
liquid.registerFilter('markdownify', markdown);
liquid.registerFilter('jsonify', value => JSON.stringify(value ?? null).replace(/</g, '\\u003c'));
liquid.registerFilter('date_to_xmlschema', value => new Date(value).toISOString());
liquid.registerTag('feed_meta', {render(){return `<link rel="alternate" type="application/atom+xml" title="${escapeXML(site.title)}" href="${escapeXML(relative('/feed.xml'))}">`;}});
async function write(filename, content) {
  const target = path.resolve(out, '.' + (filename.startsWith('/') ? filename : '/' + filename));
  if (!target.startsWith(out + path.sep)) throw new Error('Output path must stay inside _site');
  await fs.mkdir(path.dirname(target), {recursive:true}); await fs.writeFile(target, content);
}
async function renderPage(page, body, isMarkdown) {
  let content = await liquid.parseAndRender(body, {site,page});
  if (isMarkdown) content = markdown(content);
  let layout = page.layout || 'default';
  const seen = new Set();
  while (layout) {
    if (seen.has(layout)) throw new Error('Circular layout: ' + layout);
    seen.add(layout);
    const next = front(await read(`_layouts/${layout}.html`));
    content = await liquid.parseAndRender(next.body, {site,page,content});
    layout = next.meta.layout;
  }
  await write(page.url.endsWith('/') ? page.url + 'index.html' : page.url, content);
}
// A manifest removes only stale generated files; never recursively removes a user-selected directory.
const oldManifest = JSON.parse(await fs.readFile(path.join(out, '.build-manifest.json'), 'utf8').catch(() => '[]'));
for (const name of oldManifest) {
  const target = path.resolve(out, name);
  if (target.startsWith(out + path.sep)) await fs.unlink(target).catch(e => {if(e.code !== 'ENOENT') throw e;});
}
await fs.mkdir(out, {recursive:true});
await fs.cp(path.join(root, 'assets'), path.join(out, 'assets'), {recursive:true, filter:src => !src.endsWith('.scss')});
const style = front(await read('assets/css/main.scss')).body;
await write('assets/css/main.css', sass.compileString(style, {loadPaths:[path.join(root,'_sass')],style:'compressed',quietDeps:true,logger:sass.Logger.silent}).css);
const pages = [];
for (const filename of await walk('pages')) {
  if (!/\.(html|md)$/.test(filename)) continue;
  if ((site.exclude || []).some(excluded => filename.startsWith(excluded) || filename === excluded)) continue;
  const {meta,body} = front(await read(filename));
  if (!meta.permalink) continue;
  const page = {lang:site.lang,...meta,url:meta.permalink};
  await renderPage(page, body, filename.endsWith('.md'));
  pages.push(page.url.endsWith('/') ? page.url.slice(1) + 'index.html' : page.url.slice(1));
}
for (const post of site.posts) {
  await renderPage({lang:site.lang,layout:'post',section:'posts',...post}, post.content, false);
  pages.push(post.url.slice(1) + 'index.html');
}
const feed = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${escapeXML(site.title)}</title><id>${escapeXML(absolute('/'))}</id><updated>${site.time.toISOString()}</updated><link href="${escapeXML(absolute('/feed.xml'))}" rel="self"/><author><name>${escapeXML(site.author.name)}</name></author>${site.posts.map(p=>`<entry><title>${escapeXML(p.title)}</title><id>${escapeXML(absolute(p.url))}</id><link href="${escapeXML(absolute(p.url))}"/><updated>${p.date.toISOString()}</updated><content type="html">${escapeXML(p.content)}</content></entry>`).join('')}</feed>`;
await write('feed.xml', feed);
await write('.build-manifest.json', JSON.stringify([...pages,'feed.xml']));
console.log(`Built ${pages.length} pages → _site (backend: ${site.backend.mode}; baseurl: ${site.baseurl || '/'})`);
