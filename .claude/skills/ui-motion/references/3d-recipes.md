# 3D recipes

Reasons and budget numbers: `fe-web-3d`. Start with the lightest level that delivers the idea.

Contents:
1. CSS tilt on hover
2. CSS flip card
3. three.js scene loaded late, with poster and WebGL check
4. React Three Fiber setup
5. Checklist before shipping a scene

## 1. CSS tilt on hover

```css
.tilt { perspective: 800px; }
.tilt > .card { transform-style: preserve-3d; transition: transform var(--dur-base) var(--ease-out); }
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .tilt:hover > .card { transform: rotateX(4deg) rotateY(-6deg); }
}
```

Keep angles small (under about 10 degrees); text on a tilted card is harder to read. Pointer-following tilt needs JavaScript; update a CSS variable in `requestAnimationFrame`, never on every `pointermove` directly.

## 2. CSS flip card

```html
<div class="flip">
  <button type="button" class="flip-toggle" aria-expanded="false" aria-controls="card-back">Show details</button>
  <div class="flip-inner">
    <div class="face front">...</div>
    <div class="face back" id="card-back">...</div>
  </div>
</div>
```

```css
.flip { perspective: 1000px; }
.flip-inner { display: grid; transform-style: preserve-3d; transition: transform var(--dur-slow) var(--ease-in-out); }
.face { grid-area: 1 / 1; backface-visibility: hidden; }
.back { transform: rotateY(180deg); }
.flip.is-flipped .flip-inner { transform: rotateY(180deg); }
@media (prefers-reduced-motion: reduce) {
  .flip-inner { transition: none; }
}
```

The toggle button sets `is-flipped` and `aria-expanded`; the hidden face should get `inert` so keyboard focus does not land on it. Do not flip on hover alone: touch and keyboard users cannot trigger it.

## 3. three.js scene loaded late

Markup: the poster is the real content until the scene is ready.

```html
<div id="scene" class="scene">
  <img class="scene-poster" src="/img/product-poster.webp" width="1200" height="800" alt="Product, front view">
</div>
```

Loader in the main bundle (small):

```js
function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
}
const host = document.getElementById('scene');
if (host && hasWebGL()) {
  const io = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    const { mountScene } = await import('./scene.js'); // three.js lives only in this chunk
    mountScene(host, { autoRotate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
  }, { rootMargin: '200px' });
  io.observe(host);
}
```

`scene.js` (render on demand, capped pixel ratio, pause when hidden, dispose):

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function mountScene(host, { autoRotate }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // pixel cost grows with ratio squared
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0.5, 4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;         // wheel must keep scrolling the page
  controls.autoRotate = autoRotate;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

  const draco = new DRACOLoader().setDecoderPath('/draco/');
  new GLTFLoader().setDRACOLoader(draco).load('/models/product.glb', (gltf) => {
    scene.add(gltf.scene);
    host.replaceChildren(renderer.domElement);   // swap poster for canvas only when ready
    renderer.domElement.setAttribute('aria-hidden', 'true'); // the poster alt and page text carry the content
    resize(); render();
  });

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix(); render();
  }
  new ResizeObserver(resize).observe(host);

  // Loop only while auto-rotating, visible and the tab is shown.
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);
  renderer.setAnimationLoop(autoRotate ? () => { if (visible && !document.hidden) controls.update(); } : null);

  return function dispose() {
    renderer.setAnimationLoop(null);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) {
        for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); // material.dispose() does not free textures
        m.dispose();
      }
    });
    controls.dispose(); draco.dispose(); renderer.dispose();
  };
}
```

`controls.update()` fires `change` while auto-rotating, so the same `render` handler draws each frame. Copy the Draco decoder files to `/draco/` (from `three/examples/jsm/libs/draco/`). Compress models with gltf-transform (Draco or meshopt, KTX2 textures).

## 4. React Three Fiber

```jsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment } from "@react-three/drei";
import { lazy, Suspense } from "react";

function Product() {
  const { scene } = useGLTF("/models/product.glb"); // drei sets up Draco decoding
  return <primitive object={scene} />;
}

export default function ProductScene({ reduced }) {
  return (
    <Canvas
      frameloop={reduced ? "demand" : "always"}   /* static model: "demand" always */
      dpr={[1, 2]}
      camera={{ position: [0, 0.5, 4], fov: 40 }}
      fallback={<img src="/img/product-poster.webp" alt="Product, front view" />}>
      <Suspense fallback={null}>
        <Product />
        <Environment preset="studio" />
      </Suspense>
      <OrbitControls enableZoom={false} autoRotate={!reduced} />
    </Canvas>
  );
}
// Elsewhere: const ProductScene = lazy(() => import("./ProductScene"));
// render <img poster> until it is near view, then <Suspense fallback={<img poster/>}><ProductScene reduced={...}/></Suspense>
```

Read `reduced` from `matchMedia('(prefers-reduced-motion: reduce)')` (or Motion's `useReducedMotion`). With `frameloop="demand"` call `invalidate()` after changing anything outside React state. The `fallback` prop renders when WebGL is unavailable in recent R3F versions; check the installed version and keep your own `hasWebGL()` guard otherwise.

## 5. Checklist before shipping a scene

- [ ] Poster image with `width`, `height` and `alt` is in the HTML; scene code is a separate chunk.
- [ ] Not the LCP element; loads near view or after the main content.
- [ ] Pixel ratio capped at 2; render on demand or loop only while visible.
- [ ] Model compressed (Draco or meshopt), textures KTX2 or sized to need; total download stated.
- [ ] Reduced motion: no auto-rotate or camera drift.
- [ ] Auto-motion over five seconds has a pause control.
- [ ] Zoom and drag do not trap page scroll on touch devices.
- [ ] Everything the scene shows is also in page text.
- [ ] Unmount disposes geometries, materials, textures and the renderer.
