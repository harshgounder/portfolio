# third-party notices

everything the kit ships or bundles that we did not write, with its licence. provenance details for the character
are in `art/character/SOURCES.md`; tools that only produce files (Blender, MPFB, audio-as-code, Kokoro, Codex) are
listed there and in `art/SOUND-BIBLE.md`, they are not shipped.

| what | where it is used | licence | notice |
|---|---|---|---|
| three.js r186 (incl. the GLTFLoader addon) | bundled into every build | MIT | `Copyright © 2010-2026 three.js authors`, full text in `lab/node_modules/three/LICENSE` |
| meshoptimizer decoder (shipped inside three's addons) | decodes `*.min.glb` | MIT | `Copyright (C) 2016-2026, by Arseny Kapoulkine`, header of `three/examples/jsm/libs/meshopt_decoder.module.js` |
| three-pinata 2.0.1 (Daniel Greenheck) | Voronoi fracture for the crumble (`lab/src/look/crumble.js`), bundled | MIT | full text in `lab/node_modules/@dgreenheck/three-pinata/LICENSE` |
| "Hash without Sine" `hash12` (Dave Hoskins, https://www.shadertoy.com/view/4djSRW) | `lab/src/look/hatch.js`, `hatch-tsl.js`, `panel.js` | MIT | below |
| Gloock (display face) | `lab/public/fonts/Gloock-Regular.latin.woff2` | SIL OFL 1.1 | `lab/public/fonts/OFL-Gloock.txt` |
| M PLUS Rounded 1c (UI face) | `lab/public/fonts/MPLUSRounded1c-*.woff2` | SIL OFL 1.1 | `lab/public/fonts/OFL.txt` (Copyright 2016 The Rounded M+ Project Authors) |
| MPFB 2 generated body | `lab/public/chars/mapmaker*.glb` | CC0 | none required |
| MakeHuman community "Monk's robe" + "Monk's robe hood" (Donitz) | fitted into `lab/public/chars/mapmaker*.glb` | CC0 | none required (`art/character/SOURCES.md`) |
| Quaternius Universal Animation Library `Walk_Loop` (retargeted, baked) | `lab/public/chars/mapmaker-walk*.glb` | CC0 1.0 | none required (`art/character/SOURCES.md`) |

our own (no third-party code): the blue-noise texture (`tools/bluenoise.py`, void-and-cluster), every shader other
than the hash above, the sound files (audio-as-code stems + numpy synthesis, Kokoro voice) and all art.

## MIT licence text for "Hash without Sine"

```
MIT License
Copyright (c) 2014 David Hoskins.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
