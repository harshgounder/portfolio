# Build brief: Harsh Gounder portfolio, woodcut comic

This is the optimized prompt. It is the single source of truth for the build. Where
anything below conflicts with a later message, this file wins until it is edited.

## 1. Role

You are the lead front-end engineer and art director on a two-person team. The other
person is the owner of the site. You write the code, run it, screenshot it, and fix
what the screenshot shows. You do not describe what you would build.

## 2. Objective

Ship a personal portfolio for Harsh Gounder at a public GitHub Pages URL. The site
must use the visual system of `santioni-look-kit` (woodcut ink, comic panels, paper
and soft black), rebuilt with abstract marks only, and it must carry four sections at
minimum: About, Skills, Projects, Contact. Each featured project gets its own case
study page.

Success means a stranger can load the URL, understand who he is in under 60 seconds,
open one project, and find a way to contact him.

## 3. Hard requirements

1. Stack: Vite, three.js (the version already in `package.json`), plain ES modules.
   No React, no CSS framework, no new runtime dependency unless it replaces three.js.
2. Look: reuse `src/look/panel.js`, `src/look/hatch.js`, `src/story/story.js`,
   `src/look/mapsheet.js`, `src/look/colonnade` (via `scenes/crumble.js`) and
   `src/look/titlesheet.js`. Do not rewrite the shaders.
3. No character. Every beat renders abstract marks: procedural ground, fog, map
   roads, ink bottles, crumbling colonnade. `figure: false` everywhere.
4. Pages: `index.html` plus one `work/<slug>.html` per featured project.
5. Static output: `npm run build` must produce a `dist/` that works on GitHub Pages
   under a subpath. Every asset URL must respect `import.meta.env.BASE_URL`.
6. Accessibility: real headings, real links, `prefers-reduced-motion` turns off
   boiling, scroll smoothing and parallax, keyboard focus visible, contrast at or
   above 4.5:1 for body text, no text baked into the canvas.
7. Performance: first content under 200 KB of JS on the critical path if achievable,
   no more than 4 MB total transfer for the landing page, 60 fps target on the
   integrated GPU, graceful degrade to a tier-0 render.
8. Mobile: single column under 720 px. Art above, text below, no horizontal scroll.

## 4. Source material, in order of authority

1. `data/profile.json`: the only place facts about Harsh live. If a fact is missing,
   the site omits it. No invented numbers, employers, dates or metrics.
2. His GitHub account `harshgounder`: 138 public repos. A project may be featured
   only if the repo exists and the one-line description is true to the repo.
3. Local project folders and harness session logs, for stack and results. Anything
   taken from there must be checkable at a path or a repo.
4. `santioni-look-kit` docs: `DESIGN.md` section 2 for modules, `art/ART-BIBLE.md`
   section 3 for palette slots.

Never print a secret, a token, a phone number, a home address or a private key.
Never claim a metric that is not in `profile.json`.

## 5. Voice

Deadpan comic, first person, short declarative lines. No hype, no adjectives doing
the work of evidence. Captions read like panel captions in a war comic: present
tense, concrete noun, one idea per line. Project blurbs answer three questions in
order: what it does, what he built, what proves it.

Banned: em dashes, "passionate", "innovative", "cutting-edge", "leveraging",
"seamless", "journey", "dream", "crafting digital experiences", "I am a".

## 6. Visual system

- Palette roles, not fixed values: paper `#F3F3F3`, ink `#151515`, tan `#9C8761`,
  accent `#5ACDD` used once per view, ground red `#AB1D18` for one spread only.
- Type: Gloock for display, MPLUS Rounded 800 for captions and labels, a readable
  serif or grotesque at 16 to 18 px with 1.55 line height for body.
- Composition: each scroll beat is a comic spread. Text page on the left, art panel
  on the right, roughly 46/54. The GL pass draws the panel border, the rough boxes
  behind labels, the grain and the boil. HTML owns all text and layout.
- Motion: scroll slides beats, ink trail follows the pointer, lines boil at 8 fps.
  Nothing else moves. Under reduced motion the page becomes a set of static panels.
- The title beat paints the name in GL through `titlesheet.js`. The HTML `h1` stays
  real and transparent for screen readers.

## 7. Page structure

Landing, in order:

| # | beat | screens | content | art |
|---|------|---------|---------|-----|
| 1 | title | 1.25 | name, one-line positioning, scroll cue | charcoal sky, dry brush |
| 2 | about | 2.5 | 90-word bio, education, current focus | map roads drawing with scroll |
| 3 | skills | 2.5 | 3 clusters, each 5 to 8 named tools | 3 ink bottles, carousel picks a cluster |
| 4 | projects | 3 | 6 cards: name, one line, stack, link | colonnade crumbling as you scroll |
| 5 | contact | 1.5 | email, GitHub, X, one closing line | night plate, single red mark |

Case study page, one per project:

1. Title, one-line, year, stack, links to repo and live demo if any.
2. Three short sections: the problem, what he built, what proves it. 120 to 200
   words each, no filler.
3. One still from the project or an abstract woodcut panel, plus the constraint that
   shaped the build.
4. Previous and next project links.

## 8. Acceptance criteria

The build is done when every line below is true and shown with evidence:

1. `npm run build` exits 0 and `dist/index.html` exists.
2. `npm run shot -- --page` produces a non-blank screenshot of the landing page.
3. The DOM contains one `h1`, four `section` elements with ids `about`, `skills`,
   `projects`, `contact`, and at least six project links.
4. Every featured project URL returns 200.
5. Lighthouse or an equivalent check reports no missing alt text, no missing
   landmarks, and no contrast failures on body text.
6. The page loads with JavaScript disabled and still shows all text.
7. `prefers-reduced-motion: reduce` stops the boil and the scroll smoothing.
8. Under 720 px wide there is no horizontal overflow.
9. The repo is public, the Pages workflow is green, and the URL loads.

## 9. Non-goals

No CMS, no contact form backend, no analytics, no cookie banner, no dark mode
toggle, no blog, no character rig, no WebGPU path, no sound in this pass.

## 10. Definition of done

One commit series on `harshgounder/portfolio`, a green Pages deploy, and a screenshot
in the repo README. Report the URL, the commit, and which acceptance checks passed.

---

## Appendix: what changed from the raw ask, and why

The raw ask was five fragments across three turns: "my github repo on prompt
optimization", "the github aggregators", "optimize my prompt", "portfolio with
about skills projects contact", "use rea and the santioni spirits template".

| change | reason | source |
|---|---|---|
| One file, one authority order for facts | the ask pulled from four sources with no precedence, which invites invention | OpenAI prompt optimizer: remove contradictions, define format |
| Explicit output contract per page | "make a portfolio" has no shape, so any output passes | Anthropic ch. 5, format the output |
| Measurable acceptance list | without it "done" is a feeling | promptfoo eval discipline, GEPA: if you can measure it you can optimize it |
| Palette by role, not by hex | reskin checklist in the kit, keeps a new brand coherent | ART-BIBLE section 3 |
| Banned-word list | the house style already bans AI-smell; putting it in the prompt stops it at generation | AGENTS.md |
| Non-goals | scope drift is the top failure mode in long builds | GPT-5.2 guide, scope constraints |
| Source-of-truth JSON | stops the model inventing employers and metrics | uncertainty block, GPT-5.2 guide |
| Mobile and a11y as acceptance, not advice | they get skipped when they are prose | Anthropic ch. 9, complex prompts from scratch |
