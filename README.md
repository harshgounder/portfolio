# portfolio

Personal site for Harsh Gounder. Woodcut comic look, built from the santioni-look-kit:
same panel compositor, hatch material, story scroll and paper grain, restaged with
abstract marks instead of the character.

## sections

- title, about, skills, projects, lab notes, contact on one scroll
- `work/<slug>.html`, one case study per project, generated from `src/data/content.json`

## run

```
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/
npm run shot -- --scene portfolio --page --t 2 --gpu sw --out home
node tools/pages.mjs   # regenerate the case pages after editing content.json
```

## content

Everything factual lives in `src/data/content.json`: copy, projects, links, lab notes.
No fact is written into a template. Case pages are rendered from that file by
`tools/pages.mjs`.

## credits

Visual system from `harshgounder/santioni-look-kit`: three.js, the hatch shader, the
panel compositor, the story engine, the blue-noise grain. Fonts: Gloock and M PLUS
Rounded 1c, both OFL. See `THIRD-PARTY-NOTICES.md`.

## licence

Code MIT. Text and project copy are Harsh Gounder's.

live: https://harshgounder.github.io/portfolio/
