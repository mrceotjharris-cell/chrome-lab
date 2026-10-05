# GOLDENTUNE.AI

Goldentune.ai is the company. **Iyelle** is the model — a bot that optimizes your
traffic engines and names the one that's stuck.

The hero renders Iyelle: a morphing wireframe blob, procedural, live in the browser.
It is not decoration, it is the subject. Behind it sits a private ops dashboard for
the n8n instance the engines actually run on.

No 3D model files, no build step, no webfont. One image asset: the wordmark.

## Naming

| in the UI | in the code |
|---|---|
| traffic engine | `workflow` — n8n's own noun |
| Iyelle | the Ask panel, and the mesh on the hero |

**"Workflow" is upstream vocabulary, not ours.** It stays in the API contract —
`grab('workflows')`, `workflowId`, the `/api/v1/workflows` path — because that is
what n8n calls the resource and renaming it would break the proxy. Everywhere a
person reads it, it is a traffic engine. Don't let the two leak into each other.

## What's in here

```
index.html                      the hero (495 KB, Three.js bundled inline)
dashboard.html                  the n8n ops view (37 KB, no dependencies)
api/n8n.js                      Vercel serverless proxy for the n8n Public API
api/ask.js                      Iyelle's answers — live n8n data + the question, sent to Claude
api/login.js                    trades the password for a session cookie (DELETE logs out)
api/_auth.js, api/_n8n.js       shared helpers; "_" files are not routes on Vercel
assets/goldentune-wordmark.png  the logo lettering (19 KB, transparent)
```

The hero is fully static. The dashboard is static too, but its data comes from
`/api/*`, the only server-side code in the repo. Every API route answers only a
logged-in session, so the page is public but shows nothing until you log in.

## Brand

One token set, defined in `:root` in both HTML files.

| | |
|---|---|
| gold | `#f5c542`, highlight `#ffdd77`, deep `#c8901e` |
| ground | true black `#000`, warm glass `rgba(20,16,10,.58)` |
| text | `#f4efe4` → `#cbc2b1` → `#9a9080` → `#6e6555` → `#4c463b` |

**Gold is identity, never status.** It carries the wordmark, focus rings,
section markers and the next-action text in Blocks. The moment gold also means
"healthy" it stops meaning Goldentune, and it collides with the warning state.
Status has its own ramp:

| state | |
|---|---|
| live / active | mint `#5fd9a0` |
| running | sky `#63c9f0` |
| needs setup | orange `#ff9147` |
| failed | red `#ff6b6b` |

Two effects come from the brand artwork: the radial gold bloom behind the logo
mark, used as the page background on both pages, and the hairline wireframe
sphere, drawn with a `repeating-radial-gradient` rather than an image. The
dashboard header also carries the line-and-node circuit motif as an inline SVG.

**The wordmark is artwork, not type.** `assets/goldentune-wordmark.png` is the real
logo's lettering, lifted off the source PNG: alpha keyed on `min(r,g,b)` with a floor
of 80, which drops the black ground and the gold glow (whose min channel is 66) while
keeping the script's anti-aliased edges. Cropped to the letterforms and flattened to
white, it went from 452 KB to 19 KB and can be recoloured in CSS. Regenerate it the
same way if the logo changes — do not re-crop the original by hand.

No webfont is loaded, and there is still no script *typeface* here. Setting arbitrary
text in that style is not possible; only the word "Goldentune" exists as artwork.
Prose and labels use the system UI stack; data keeps a monospace stack with tabular
figures so numbers don't jitter as they refresh.

## Changing the look

Open `index.html`, search for `density:26`. It's in the bundled script block:

```js
{
  density : 26,        // mesh subdivision (mobile auto-drops this)
  amount  : 0.225,     // morph displacement
  speed   : 2.06,      // morph speed
  chaos   : 6,         // noise frequency
  spin    : 0.17,      // rotation speed
  glow    : 0.14,      // bloom strength (<=0.02 bypasses the pass entirely)
  opacity : 1,         // wireframe opacity
  color   : '#f5c542'  // brand gold
}
```

Change a number, save, refresh. Nothing to rebuild.

To change the headline, search for `goldentune` in the `<h1>`.

## How it works

Iyelle is an icosahedron subdivided 26 times (14,580 triangles). Every frame each
vertex is pushed along its radius by three layered sine waves — that's the morph.

That math runs in the **vertex shader**, not JavaScript. At this density the JS version
was doing ~7.9 million `sin()` calls per second plus a full normal recalculation every
frame, which capped the framerate. Moving it to the GPU made mesh density essentially free.

Surface normals are recomputed analytically in-shader via finite differences, so lighting
stays correct on the displaced surface.

The metal look comes from a procedurally drawn equirectangular environment map —
blurred gold bars on a dark warm gradient, generated on a `<canvas>` at runtime and
passed through `PMREMGenerator`. The reflections are what sell the metal; the mesh
itself is trivial. Two of the six bars are deliberately left neutral white: the gold
needs a neutral specular highlight to read as metal rather than as flat brass.

### Iyelle's lighting

The material is `metalness:1, roughness:.085` — effectively a mirror — so originally
all of its light came from that fixed environment map, and the only thing in motion was
the mesh turning underneath it. Two `DirectionalLight`s now orbit the scene on different
periods (`gtKey` gold, `gtRim` near-neutral), dragging real specular sweeps across the
surface as it morphs. Bloom strength and emissive intensity breathe on separate slow
sines so the cycle never lands on the same beat twice.

The lights are parented to the scene rather than the mesh, so they stay fixed in world
space while the blob rotates beneath them — parent them to the mesh and the highlights
freeze, which defeats the point.

`PointLight` is **not available in this bundle** — esbuild tree-shook it out, since the
original scene used no lights at all. `DirectionalLight` and `AmbientLight` survived.
For a mirror, directional is the better choice anyway: a broad sweep rather than a
pinpoint hotspot.

All of it sits inside the existing `prefers-reduced-motion` guard, so the lights hold
their opening positions rather than orbiting when motion is reduced.

## The dashboard

`/dashboard.html` reads the n8n instance through the proxy and renders traffic engines,
execution history, and a Blocks panel that names what is stuck — failing engines, nodes
with no credential attached, engines built and left switched off, empty shells. Each
detected block carries one concrete next action. That panel is the product promise in
miniature, and the hero copy points straight at it: Iyelle names the one that isn't
running.

The Ask panel sends each question to `/api/ask`, which reads the live n8n data
itself and asks Claude (`claude-opus-5-5`, low effort; override with `IYELLE_MODEL`).
Without `ANTHROPIC_API_KEY` — or if the model can't be reached — it falls back to the
built-in rule-based answers, which also write the free opening summary. It is Iyelle's
voice either way, not a second system.

### Login

One password, `IYELLE_PASSWORD`. Logging in sets a signed, HttpOnly session cookie for
30 days. The signing key is derived from the password, so changing the password logs
every session out. With no password set, the API refuses everyone and the page shows a
setup alert. Responses are `cache-control: private` — a shared edge cache does not key
on the cookie and would hand one person's data to the next.

## Performance

| | |
|---|---|
| Hero page weight | 495 KB total, single request |
| Triangles | 14,580 desktop / 4,500 mobile |
| Network calls after load | none on the hero |
| API cost | $0.00 on the hero; Ask is billed per question by Anthropic |

Built-in guards:

- **Mobile** starts at density 14 and caps pixel ratio at 1.5
- **Background tabs** stop rendering entirely (`visibilitychange`)
- **Scrolled out of view** stops rendering (`IntersectionObserver`)
- **Adaptive quality** — if it can't hold 45fps for 3 seconds straight, mesh density steps
  down automatically until it can
- **`prefers-reduced-motion`** freezes the morph and rotation

## Deploying

Static site plus serverless functions. On Vercel: import the repo, leave every setting
at its default, then add these under Settings → Environment Variables and redeploy:

| variable | what it does |
|---|---|
| `IYELLE_PASSWORD` | the dashboard login — required, or the dashboard stays locked |
| `N8N_API_KEY` | reads your traffic engines from n8n |
| `ANTHROPIC_API_KEY` | lets Iyelle answer with a model; without it, Ask uses built-in answers |
| `IYELLE_MODEL` | optional, overrides `claude-opus-5-5` |

The hero works without any of them. Set a monthly spend limit on the Anthropic account.

## Built with

[Three.js](https://threejs.org) r160, bundled inline with esbuild.
