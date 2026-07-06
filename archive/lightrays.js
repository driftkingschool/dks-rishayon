/* =====================================================
   LightRays — vanilla ES module port of the React Bits component
   Loads ogl from esm.sh CDN. Viewport-gated + reduced-motion guard.
   ===================================================== */

import { Renderer, Program, Triangle, Mesh } from 'https://esm.sh/ogl@1.0.11';

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
}

function getAnchorAndDir(origin, w, h) {
  const outside = 0.2;
  switch (origin) {
    case 'top-left':      return { anchor: [0, -outside * h], dir: [0, 1] };
    case 'top-right':     return { anchor: [w, -outside * h], dir: [0, 1] };
    case 'left':          return { anchor: [-outside * w, 0.5 * h], dir: [1, 0] };
    case 'right':         return { anchor: [(1 + outside) * w, 0.5 * h], dir: [-1, 0] };
    case 'bottom-left':   return { anchor: [0, (1 + outside) * h], dir: [0, -1] };
    case 'bottom-center': return { anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] };
    case 'bottom-right':  return { anchor: [w, (1 + outside) * h], dir: [0, -1] };
    default:              return { anchor: [0.5 * w, -outside * h], dir: [0, 1] };
  }
}

const VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAG = `precision highp float;
uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;
varying vec2 vUv;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}
float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);
  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));
  float distance = length(sourceToCoord);
  float maxDistance = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
  float fadeFalloff = clamp((iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance), 0.5, 1.0);
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;
  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)),
    0.0, 1.0
  );
  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
  vec2 finalRayDir = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 mouseScreenPos = mousePos * iResolution.xy;
    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
  }
  vec4 rays1 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
  vec4 rays2 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed);
  fragColor = rays1 * 0.5 + rays2 * 0.4;
  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.1);
    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
  }
  float brightness = 1.0 - (coord.y / iResolution.y);
  fragColor.x *= 0.1 + brightness * 0.8;
  fragColor.y *= 0.3 + brightness * 0.6;
  fragColor.z *= 0.5 + brightness * 0.5;
  if (saturation != 1.0) {
    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
  }
  fragColor.rgb *= raysColor;
}
void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`;

function initLightRays(container, userOpts = {}) {
  const opts = Object.assign({
    raysOrigin: 'top-center',
    raysColor: '#ffffff',
    raysSpeed: 1,
    lightSpread: 0.8,
    rayLength: 1.5,
    pulsating: false,
    fadeDistance: 1.0,
    saturation: 1.0,
    followMouse: false,
    mouseInfluence: 0.0,
    noiseAmount: 0.05,
    distortion: 0.03
  }, userOpts);

  const renderer = new Renderer({
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    alpha: true
  });
  const gl = renderer.gl;
  gl.canvas.style.width = '100%';
  gl.canvas.style.height = '100%';
  gl.canvas.style.display = 'block';

  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(gl.canvas);

  const uniforms = {
    iTime: { value: 0 },
    iResolution: { value: [1, 1] },
    rayPos: { value: [0, 0] },
    rayDir: { value: [0, 1] },
    raysColor: { value: hexToRgb(opts.raysColor) },
    raysSpeed: { value: opts.raysSpeed },
    lightSpread: { value: opts.lightSpread },
    rayLength: { value: opts.rayLength },
    pulsating: { value: opts.pulsating ? 1.0 : 0.0 },
    fadeDistance: { value: opts.fadeDistance },
    saturation: { value: opts.saturation },
    mousePos: { value: [0.5, 0.5] },
    mouseInfluence: { value: opts.mouseInfluence },
    noiseAmount: { value: opts.noiseAmount },
    distortion: { value: opts.distortion }
  };

  const geometry = new Triangle(gl);
  const program = new Program(gl, { vertex: VERT, fragment: FRAG, uniforms });
  const mesh = new Mesh(gl, { geometry, program });

  const mouseRef = { x: 0.5, y: 0.5 };
  const smoothMouse = { x: 0.5, y: 0.5 };
  let rafId = null;
  let disposed = false;

  function updatePlacement() {
    if (disposed) return;
    renderer.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wCSS = container.clientWidth;
    const hCSS = container.clientHeight;
    if (wCSS <= 0 || hCSS <= 0) return;
    renderer.setSize(wCSS, hCSS);
    const dpr = renderer.dpr;
    const w = wCSS * dpr, h = hCSS * dpr;
    uniforms.iResolution.value = [w, h];
    const { anchor, dir } = getAnchorAndDir(opts.raysOrigin, w, h);
    uniforms.rayPos.value = anchor;
    uniforms.rayDir.value = dir;
  }

  function loop(t) {
    if (disposed) return;
    uniforms.iTime.value = t * 0.001;
    if (opts.followMouse && opts.mouseInfluence > 0.0) {
      const s = 0.92;
      smoothMouse.x = smoothMouse.x * s + mouseRef.x * (1 - s);
      smoothMouse.y = smoothMouse.y * s + mouseRef.y * (1 - s);
      uniforms.mousePos.value = [smoothMouse.x, smoothMouse.y];
    }
    try {
      renderer.render({ scene: mesh });
    } catch (err) {
      console.warn('LightRays render error:', err);
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function onMouseMove(e) {
    const rect = container.getBoundingClientRect();
    mouseRef.x = (e.clientX - rect.left) / rect.width;
    mouseRef.y = (e.clientY - rect.top) / rect.height;
  }

  window.addEventListener('resize', updatePlacement);
  if (opts.followMouse) window.addEventListener('mousemove', onMouseMove);
  updatePlacement();
  rafId = requestAnimationFrame(loop);

  return {
    dispose() {
      disposed = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener('resize', updatePlacement);
      if (opts.followMouse) window.removeEventListener('mousemove', onMouseMove);
      try {
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        if (gl.canvas?.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
      } catch (err) {
        console.warn('LightRays cleanup error:', err);
      }
    }
  };
}

// ----- Wiring: pick up [data-lightrays] containers, viewport-gated -----

function parseOpts(el) {
  const ds = el.dataset;
  const opts = {};
  if (ds.raysOrigin)     opts.raysOrigin = ds.raysOrigin;
  if (ds.raysColor)      opts.raysColor = ds.raysColor;
  if (ds.raysSpeed)      opts.raysSpeed = parseFloat(ds.raysSpeed);
  if (ds.lightSpread)    opts.lightSpread = parseFloat(ds.lightSpread);
  if (ds.rayLength)      opts.rayLength = parseFloat(ds.rayLength);
  if (ds.noiseAmount)    opts.noiseAmount = parseFloat(ds.noiseAmount);
  if (ds.distortion)     opts.distortion = parseFloat(ds.distortion);
  if (ds.followMouse)    opts.followMouse = ds.followMouse === 'true';
  if (ds.mouseInfluence) opts.mouseInfluence = parseFloat(ds.mouseInfluence);
  if (ds.pulsating)      opts.pulsating = ds.pulsating === 'true';
  if (ds.fadeDistance)   opts.fadeDistance = parseFloat(ds.fadeDistance);
  if (ds.saturation)     opts.saturation = parseFloat(ds.saturation);
  return opts;
}

const containers = document.querySelectorAll('[data-lightrays]');
if (containers.length) {
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && !isMobile) {
    const apps = new WeakMap();

    function spawn(el) {
      if (apps.has(el)) return;
      apps.set(el, initLightRays(el, parseOpts(el)));
    }
    function kill(el) {
      if (!apps.has(el)) return;
      apps.get(el).dispose();
      apps.delete(el);
    }

    // Fallback timer: if IO doesn't deliver any entries within 800ms,
    // assume it's a non-supporting environment and just init everything.
    let ioDelivered = false;
    setTimeout(() => {
      if (!ioDelivered) containers.forEach(spawn);
    }, 800);

    const io = new IntersectionObserver(entries => {
      ioDelivered = true;
      entries.forEach(e => {
        if (e.isIntersecting) spawn(e.target);
        else kill(e.target);
      });
    }, { rootMargin: '200px 0px' });
    containers.forEach(c => io.observe(c));

    window.addEventListener('beforeunload', () => {
      containers.forEach(kill);
    });
  }
}
