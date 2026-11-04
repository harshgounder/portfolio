// renders work/<slug>.html from src/data/content.json. no runtime JS on these pages.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const c = JSON.parse(readFileSync(resolve(root, 'src/data/content.json'), 'utf8'))
const esc = (s) => String(s).replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]))
mkdirSync(resolve(root, 'work'), { recursive: true })

const items = c.projects.items
items.forEach((p, i) => {
  const prev = items[(i + items.length - 1) % items.length]
  const next = items[(i + 1) % items.length]
  const plate = String(i + 1).padStart(2, '0')
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.name)} · ${esc(c.name)}</title>
<meta name="description" content="${esc(p.line)}">
<link rel="stylesheet" href="../src/look/case.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar">
  <a class="back" href="../index.html">${esc(c.name)}</a>
  <span class="kind">case study</span>
</header>
<main id="main">
  <p class="eyebrow">${esc(p.context)} · ${esc(p.year)}</p>
  <h1>${esc(p.name)}</h1>
  <p class="line">${esc(p.line)}</p>
  <div class="plate" aria-hidden="true"><span>${plate}</span></div>
  <dl class="meta">
    <div><dt>stack</dt><dd>${esc(p.stack)}</dd></div>
    <div><dt>proof</dt><dd>${esc(p.proof)}</dd></div>
    <div><dt>code</dt><dd>${p.repoPrivate ? 'private repository' : `<a href="${esc(p.repo)}">${esc(p.repo.replace('https://github.com/', ''))}</a>`}</dd></div>
    ${p.live ? `<div><dt>live</dt><dd><a href="${esc(p.live)}">${esc(p.live.replace('https://', ''))}</a></dd></div>` : ''}
  </dl>
  <section><h2>The problem</h2><p>${esc(p.problem)}</p></section>
  <section><h2>What I built</h2><p>${esc(p.built)}</p></section>
  <section><h2>What proves it</h2><p>${esc(p.proofLong)}</p></section>
</main>
<nav class="pager" aria-label="projects">
  <a href="${esc(prev.slug)}.html"><span>previous</span>${esc(prev.name)}</a>
  <a class="right" href="${esc(next.slug)}.html"><span>next</span>${esc(next.name)}</a>
</nav>
</body>
</html>
`
  writeFileSync(resolve(root, 'work', `${p.slug}.html`), html)
})
console.log(`wrote ${items.length} case pages`)
