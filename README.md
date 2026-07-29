# CHROME LAB

Procedural 3D hero — a morphing wireframe blob rendered live in the browser.
No image assets, no 3D model files, no API calls, no build step. One HTML file.

## What's in here

```
index.html    the entire site (489 KB, Three.js bundled inline)
```

That's it. Drop it on any static host and it works.

## Changing the look

Open `index.html`, search for `const SPEC`. It's near the top of the script block:

```js
const SPEC = {
  density : 26,        // mesh subdivision (mobile auto-drops this)
  amount  : 0.225,     // morph displacement
  speed   : 2.06,      // morph speed
  chaos   : 6,         // noise frequency
  spin    : 0.17,      // rotation speed
  glow    : 0.14,      // bloom strength (<=0.02 bypasses the pass entirely)
  opacity : 1,         // wireframe opacity
  color   : '#c8ff2e'  // acid lime
};
```

Change a number, save, refresh. Nothing to rebuild.

To change the headline, search for `CHROME LAB` in the `<h1>`.

## How it works

The blob is an icosahedron subdivided 26 times (14,580 triangles). Every frame each
vertex is pushed along its radius by three layered sine waves — that's the morph.

That math runs in the **vertex shader**, not JavaScript. At this density the JS version
was doing ~7.9 million `sin()` calls per second plus a full normal recalculation every
frame, which capped the framerate. Moving it to the GPU made mesh density essentially free.

Surface normals are recomputed analytically in-shader via finite differences, so lighting
stays correct on the displaced surface.

The chrome look comes from a procedurally drawn equirectangular environment map — blurred
neon bars on a dark gradient, generated on a `<canvas>` at runtime and passed through
`PMREMGenerator`. The reflections are what sell the metal; the mesh itself is trivial.

## Performance

| | |
|---|---|
| Page weight | 489 KB total, single request |
| Triangles | 14,580 desktop / 4,500 mobile |
| Network calls after load | none |
| API cost | $0.00 |

Built-in guards:

- **Mobile** starts at density 14 and caps pixel ratio at 1.5
- **Background tabs** stop rendering entirely (`visibilitychange`)
- **Scrolled out of view** stops rendering (`IntersectionObserver`)
- **Adaptive quality** — if it can't hold 45fps for 3 seconds straight, mesh density steps
  down automatically until it can
- **`prefers-reduced-motion`** freezes the morph and rotation

## Deploying

Static site, no build command, no environment variables. On Vercel: import the repo,
leave every setting at its default, deploy.

## Built with

[Three.js](https://threejs.org) r160, bundled inline with esbuild.
