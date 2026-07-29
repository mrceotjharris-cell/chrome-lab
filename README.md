# GOLDENTUNE.AI

Procedural 3D hero — a morphing wireframe blob rendered live in the browser —
plus a private ops dashboard for the n8n instance behind it.

No image assets, no 3D model files, no build step.

## What's in here

```
index.html      the hero (495 KB, Three.js bundled inline)
dashboard.html  the n8n ops view (36 KB, no dependencies)
api/n8n.js      Vercel serverless proxy for the n8n Public API
```

The hero is fully static. The dashboard is static too, but calls `/api/n8n`,
which is the only server-side code in the repo.

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

No webfont is loaded. The script wordmark is not reproduced — only its
treatment — because pulling it in would put a third-party request on every page
load. Prose and labels use the system UI stack; data keeps a monospace stack
with tabular figures so numbers don't jitter as they refresh.

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

The blob is an icosahedron subdivided 26 times (14,580 triangles). Every frame each
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

## The dashboard

`/dashboard.html` reads the n8n instance through the proxy and renders workflows,
execution history, and a Blocks panel that names what is stuck — failing workflows,
nodes with no credential attached, workflows built and left switched off, empty shells.
Each detected block carries one concrete next action.

It needs `N8N_API_KEY` set in the Vercel project. Without it the page renders a setup
alert explaining exactly which two steps are missing, rather than an error.

## Performance

| | |
|---|---|
| Hero page weight | 495 KB total, single request |
| Triangles | 14,580 desktop / 4,500 mobile |
| Network calls after load | none on the hero |
| API cost | $0.00 |

Built-in guards:

- **Mobile** starts at density 14 and caps pixel ratio at 1.5
- **Background tabs** stop rendering entirely (`visibilitychange`)
- **Scrolled out of view** stops rendering (`IntersectionObserver`)
- **Adaptive quality** — if it can't hold 45fps for 3 seconds straight, mesh density steps
  down automatically until it can
- **`prefers-reduced-motion`** freezes the morph and rotation

## Deploying

Static site plus one serverless function. On Vercel: import the repo, leave every
setting at its default, then add `N8N_API_KEY` under Settings → Environment Variables
and redeploy. The hero works without it; only the dashboard needs it.

## Built with

[Three.js](https://threejs.org) r160, bundled inline with esbuild.
