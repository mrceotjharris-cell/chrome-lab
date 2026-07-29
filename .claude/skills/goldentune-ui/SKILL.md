---
name: goldentune-ui
description: The Goldentune visual system — brand tokens, the gold-is-identity rule, the semantic status ramp, and the traps that recolour has already sprung once. Load before styling, restyling, or adding any UI to index.html or dashboard.html, and before picking any colour, typeface, or effect in this repo.
---

# Goldentune UI

The system is defined in `:root` in both `index.html` and `dashboard.html`. Read the
live values there before changing anything — this file explains the *reasoning*, which
the CSS cannot.

## Naming

Goldentune.ai is the company. **Iyelle** is the model — the bot that optimizes traffic
engines. The gold mesh on the hero *is* Iyelle; treat it as the subject of the page,
not as background texture.

Users have **traffic engines**. They do not have workflows. `workflow` is n8n's noun and
survives only in the API contract — `grab('workflows')`, `workflowId`, the
`/api/v1/workflows` path — because renaming it breaks the proxy. If a person can read
it, it says traffic engine (or just "engine" on repeat mentions, to avoid clunk).

Iyelle takes the brand gold in copy, exactly like the `.ai` in the logotype — it is a
name, and names are identity.

Iyelle has no stated pronouns. Write around it or use they/them; do not invent a gender.

## The one rule

**Gold is identity. Gold is never status.**

Gold carries the wordmark, focus rings, section markers, the `.ai` in the logotype, and
the next-action text in Blocks. The moment gold also means "healthy", two things break:
it stops reading as Goldentune, and it collides with the warning state, which is the
nearest hue on the wheel.

This is why the palette could not simply be swapped in. The old design had lime doing
double duty as both wordmark and "active"; decoupling those was the load-bearing change,
not the repaint.

## Tokens

| role | value |
|---|---|
| `--gold` / `--gold-hi` / `--gold-dp` | `#f5c542` / `#ffdd77` / `#c8901e` |
| `--ink` | `#000` — true black, not blue-black |
| `--glass` | `rgba(20,16,10,.58)` — warm, never blue |
| `--edge` | `rgba(245,197,66,.14)` |
| text ramp | `#f4efe4` → `#cbc2b1` → `#9a9080` → `#6e6555` → `#4c463b` |

Status has its own ramp, deliberately out of gold's reach:

| state | token | value |
|---|---|---|
| live / active / passing | `--ok` | `#5fd9a0` |
| running / in flight | `--run` | `#63c9f0` |
| needs setup | `--warn` | `#ff9147` |
| failed | `--bad` | `#ff6b6b` |

Greys are warm. If a grey has blue in it, it is wrong — the previous design was full of
`#4d5c72`-family blue-greys and they fight the gold.

## Naming

Modifier classes are named for **meaning**, not colour: `ok` / `run` / `warn` / `bad` /
`idle`. Never reintroduce `.lime`, `.cyan`, `.amber`. A class named after a colour
guarantees the next repaint has to touch JavaScript.

## Effects

Three, all from the brand artwork, all drawn in CSS — no image assets:

- **Gold bloom** — radial gradients as the page background, echoing the glow behind the
  logo mark.
- **Wireframe sphere** — `repeating-radial-gradient` with a radial mask. Hairline gold
  concentric rings.
- **Circuit trace** — the line-and-node motif, inline SVG in a `data:` URI. Dashboard
  header only.

## Type

System stacks only. **Do not add a webfont.** The script logotype is not reproduced,
only its treatment; pulling it in would put a third-party request on every page load,
which this repo has never had.

- `--ui` for prose, labels, headings
- `--mono` with `font-variant-numeric: tabular-nums` for all data — numbers refresh on a
  timer and jitter without it

## Traps this system has already sprung

Every one of these was caught on screen, not by reading the CSS. They will recur.

1. **`mix-blend-mode: difference` on type over the blob.** Differenced against gold it
   inverts the text to blue. Removed from `h1`; do not reintroduce.
2. **Gold text on the gold mesh.** The hero strapline vanished completely. Copy that can
   sit over the blob is neutral warm white with a dark halo — and once there was more
   than one line, per-line `text-shadow` was not enough and `#hero` needed a radial
   scrim at `z-index:-1`.
3. **`inline-flex` + `gap` inside a wordmark.** `goldentune` and `.ai` as separate flex
   children put a 9px hole in the middle of the domain. Wrap the logotype in a single
   element.
4. **Mobile media queries resetting a padding the decoration depends on.** The header's
   circuit trace lives in a bottom padding strip; the `max-width:680px` rule reset that
   padding and put the trace back under the controls. It is `display:none` there now.
5. **Neutral highlights in the environment map.** Two of the six bars are white on
   purpose. Gold needs a neutral specular highlight or the metal reads as flat brass.

## Working method

Do not commit a visual change you have not looked at. Serve the repo locally and
screenshot it. `dashboard.html` calls `/api/n8n`, so stub that endpoint with fixtures
covering every state at once — passing, failing, running, credential-blocked, never-run,
empty-shell, archived — or the status colours go unverified. Check the console too.

Copy follows the same discipline as colour: name things by what the user controls, say
what happened and how to fix it, and let each element do exactly one job.
