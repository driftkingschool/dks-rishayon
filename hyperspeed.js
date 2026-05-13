/* =====================================================
   Hyperspeed — vanilla ES module port of the React component
   Source: React Bits (open-source). Adapted to non-React DOM here.
   Loads three + postprocessing from esm.sh CDN.
   Guarded by IntersectionObserver + prefers-reduced-motion + mobile cutoff.
   ===================================================== */

import * as THREE from 'https://esm.sh/three@0.166.0';
import {
  BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset
} from 'https://esm.sh/postprocessing@6.36.0?deps=three@0.166.0';

const DKS_PRESET = {
  onSpeedUp: () => {},
  onSlowDown: () => {},
  distortion: 'turbulentDistortion',
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 3,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5],
  lightStickHeight: [1.3, 1.7],
  movingAwaySpeed: [60, 80],
  movingCloserSpeed: [-120, -160],
  carLightsLength: [400 * 0.03, 400 * 0.2],
  carLightsRadius: [0.05, 0.14],
  carWidthPercentage: [0.3, 0.5],
  carShiftX: [-0.8, 0.8],
  carFloorSeparation: [0, 5],
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x000000,
    shoulderLines: 0x131318,
    brokenLines: 0x131318,
    // DKS palette: orange/amber (left) + DKS blue (right) + amber sticks
    leftCars: [0xd97757, 0xc25a3c, 0xe8835e],
    rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
    sticks: 0xd97757
  }
};

function nsin(val) { return Math.sin(val) * 0.5 + 0.5; }
function random(base) {
  if (Array.isArray(base)) return Math.random() * (base[1] - base[0]) + base[0];
  return Math.random() * base;
}
function pickRandom(arr) {
  if (Array.isArray(arr)) return arr[Math.floor(Math.random() * arr.length)];
  return arr;
}
function lerp(current, target, speed = 0.1, limit = 0.001) {
  let change = (target - current) * speed;
  if (Math.abs(change) < limit) change = target - current;
  return change;
}
function resizeRendererToDisplaySize(renderer, setSize) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width <= 0 || height <= 0) return false;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) setSize(width, height, false);
  return needResize;
}

function initHyperspeed(container, userOptions = {}) {
  const turbulentUniforms = {
    uFreq: { value: new THREE.Vector4(4, 8, 8, 1) },
    uAmp:  { value: new THREE.Vector4(25, 5, 10, 10) }
  };

  const distortions = {
    turbulentDistortion: {
      uniforms: turbulentUniforms,
      getDistortion: `
        uniform vec4 uFreq;
        uniform vec4 uAmp;
        float nsin(float val){ return sin(val) * 0.5 + 0.5; }
        #define PI 3.14159265358979
        float getDistortionX(float progress){
          return (
            cos(PI * progress * uFreq.r + uTime) * uAmp.r +
            pow(cos(PI * progress * uFreq.g + uTime * (uFreq.g / uFreq.r)), 2. ) * uAmp.g
          );
        }
        float getDistortionY(float progress){
          return (
            -nsin(PI * progress * uFreq.b + uTime) * uAmp.b +
            -pow(nsin(PI * progress * uFreq.a + uTime / (uFreq.b / uFreq.a)), 5.) * uAmp.a
          );
        }
        vec3 getDistortion(float progress){
          return vec3(
            getDistortionX(progress) - getDistortionX(0.0125),
            getDistortionY(progress) - getDistortionY(0.0125),
            0.
          );
        }
      `,
      getJS: (progress, time) => {
        const uFreq = turbulentUniforms.uFreq.value;
        const uAmp = turbulentUniforms.uAmp.value;
        const getX = p =>
          Math.cos(Math.PI * p * uFreq.x + time) * uAmp.x +
          Math.pow(Math.cos(Math.PI * p * uFreq.y + time * (uFreq.y / uFreq.x)), 2) * uAmp.y;
        const getY = p =>
          -nsin(Math.PI * p * uFreq.z + time) * uAmp.z -
          Math.pow(nsin(Math.PI * p * uFreq.w + time / (uFreq.z / uFreq.w)), 5) * uAmp.w;
        const distortion = new THREE.Vector3(
          getX(progress) - getX(progress + 0.007),
          getY(progress) - getY(progress + 0.007),
          0
        );
        const lookAtAmp = new THREE.Vector3(-2, -5, 0);
        const lookAtOffset = new THREE.Vector3(0, 0, -10);
        return distortion.multiply(lookAtAmp).add(lookAtOffset);
      }
    }
  };

  const options = {
    ...DKS_PRESET,
    ...userOptions,
    colors: { ...DKS_PRESET.colors, ...(userOptions.colors || {}) }
  };
  options.distortion = distortions[options.distortion] || distortions.turbulentDistortion;

  // --- Shaders ---------------------------------------------------------
  const carLightsFragment = `
    #define USE_FOG;
    ${THREE.ShaderChunk['fog_pars_fragment']}
    varying vec3 vColor;
    varying vec2 vUv;
    uniform vec2 uFade;
    void main() {
      vec3 color = vec3(vColor);
      float alpha = smoothstep(uFade.x, uFade.y, vUv.x);
      gl_FragColor = vec4(color, alpha);
      if (gl_FragColor.a < 0.0001) discard;
      ${THREE.ShaderChunk['fog_fragment']}
    }
  `;
  const carLightsVertex = `
    #define USE_FOG;
    ${THREE.ShaderChunk['fog_pars_vertex']}
    attribute vec3 aOffset;
    attribute vec3 aMetrics;
    attribute vec3 aColor;
    uniform float uTravelLength;
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vColor;
    #include <getDistortion_vertex>
    void main() {
      vec3 transformed = position.xyz;
      float radius = aMetrics.r;
      float myLength = aMetrics.g;
      float speed = aMetrics.b;
      transformed.xy *= radius;
      transformed.z *= myLength;
      transformed.z += myLength - mod(uTime * speed + aOffset.z, uTravelLength);
      transformed.xy += aOffset.xy;
      float progress = abs(transformed.z / uTravelLength);
      transformed.xyz += getDistortion(progress);
      vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
      gl_Position = projectionMatrix * mvPosition;
      vUv = uv;
      vColor = aColor;
      ${THREE.ShaderChunk['fog_vertex']}
    }
  `;
  const sideSticksVertex = `
    #define USE_FOG;
    ${THREE.ShaderChunk['fog_pars_vertex']}
    attribute float aOffset;
    attribute vec3 aColor;
    attribute vec2 aMetrics;
    uniform float uTravelLength;
    uniform float uTime;
    varying vec3 vColor;
    mat4 rotationY( in float angle ) {
      return mat4(cos(angle),0,sin(angle),0, 0,1.0,0,0, -sin(angle),0,cos(angle),0, 0,0,0,1);
    }
    #include <getDistortion_vertex>
    void main(){
      vec3 transformed = position.xyz;
      float width = aMetrics.x;
      float height = aMetrics.y;
      transformed.xy *= vec2(width, height);
      float time = mod(uTime * 60. * 2. + aOffset, uTravelLength);
      transformed = (rotationY(3.14/2.) * vec4(transformed,1.)).xyz;
      transformed.z += - uTravelLength + time;
      float progress = abs(transformed.z / uTravelLength);
      transformed.xyz += getDistortion(progress);
      transformed.y += height / 2.;
      transformed.x += -width / 2.;
      vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
      gl_Position = projectionMatrix * mvPosition;
      vColor = aColor;
      ${THREE.ShaderChunk['fog_vertex']}
    }
  `;
  const sideSticksFragment = `
    #define USE_FOG;
    ${THREE.ShaderChunk['fog_pars_fragment']}
    varying vec3 vColor;
    void main(){
      vec3 color = vec3(vColor);
      gl_FragColor = vec4(color,1.);
      ${THREE.ShaderChunk['fog_fragment']}
    }
  `;
  const roadBaseFragment = `
    #define USE_FOG;
    varying vec2 vUv;
    uniform vec3 uColor;
    uniform float uTime;
    #include <roadMarkings_vars>
    ${THREE.ShaderChunk['fog_pars_fragment']}
    void main() {
      vec2 uv = vUv;
      vec3 color = vec3(uColor);
      #include <roadMarkings_fragment>
      gl_FragColor = vec4(color, 1.);
      ${THREE.ShaderChunk['fog_fragment']}
    }
  `;
  const roadMarkings_vars = `
    uniform float uLanes;
    uniform vec3 uBrokenLinesColor;
    uniform vec3 uShoulderLinesColor;
    uniform float uShoulderLinesWidthPercentage;
    uniform float uBrokenLinesWidthPercentage;
    uniform float uBrokenLinesLengthPercentage;
  `;
  const roadMarkings_fragment = `
    uv.y = mod(uv.y + uTime * 0.05, 1.);
    float laneWidth = 1.0 / uLanes;
    float brokenLineWidth = laneWidth * uBrokenLinesWidthPercentage;
    float laneEmptySpace = 1. - uBrokenLinesLengthPercentage;
    float brokenLines = step(1.0 - brokenLineWidth, fract(uv.x * 2.0)) * step(laneEmptySpace, fract(uv.y * 10.0));
    float sideLines = step(1.0 - brokenLineWidth, fract((uv.x - laneWidth * (uLanes - 1.0)) * 2.0)) + step(brokenLineWidth, uv.x);
    brokenLines = mix(brokenLines, sideLines, uv.x);
  `;
  const islandFragment = roadBaseFragment
    .replace('#include <roadMarkings_fragment>', '')
    .replace('#include <roadMarkings_vars>', '');
  const roadFragment = roadBaseFragment
    .replace('#include <roadMarkings_fragment>', roadMarkings_fragment)
    .replace('#include <roadMarkings_vars>', roadMarkings_vars);
  const roadVertex = `
    #define USE_FOG;
    uniform float uTime;
    ${THREE.ShaderChunk['fog_pars_vertex']}
    uniform float uTravelLength;
    varying vec2 vUv;
    #include <getDistortion_vertex>
    void main() {
      vec3 transformed = position.xyz;
      vec3 distortion = getDistortion((transformed.y + uTravelLength / 2.) / uTravelLength);
      transformed.x += distortion.x;
      transformed.z += distortion.y;
      transformed.y += -1. * distortion.z;
      vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
      gl_Position = projectionMatrix * mvPosition;
      vUv = uv;
      ${THREE.ShaderChunk['fog_vertex']}
    }
  `;

  // --- Classes ---------------------------------------------------------
  class CarLights {
    constructor(webgl, opts, colors, speed, fade) {
      this.webgl = webgl; this.options = opts; this.colors = colors; this.speed = speed; this.fade = fade;
    }
    init() {
      const opts = this.options;
      const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
      const geometry = new THREE.TubeGeometry(curve, 40, 1, 8, false);
      const instanced = new THREE.InstancedBufferGeometry().copy(geometry);
      instanced.instanceCount = opts.lightPairsPerRoadWay * 2;
      const laneWidth = opts.roadWidth / opts.lanesPerRoad;
      const aOffset = [], aMetrics = [], aColor = [];
      let colors = this.colors;
      colors = Array.isArray(colors) ? colors.map(c => new THREE.Color(c)) : new THREE.Color(colors);
      for (let i = 0; i < opts.lightPairsPerRoadWay; i++) {
        const radius = random(opts.carLightsRadius);
        const length = random(opts.carLightsLength);
        const speed = random(this.speed);
        const carLane = i % opts.lanesPerRoad;
        let laneX = carLane * laneWidth - opts.roadWidth / 2 + laneWidth / 2;
        const carWidth = random(opts.carWidthPercentage) * laneWidth;
        const carShiftX = random(opts.carShiftX) * laneWidth;
        laneX += carShiftX;
        const offsetY = random(opts.carFloorSeparation) + radius * 1.3;
        const offsetZ = -random(opts.length);
        aOffset.push(laneX - carWidth / 2, offsetY, offsetZ);
        aOffset.push(laneX + carWidth / 2, offsetY, offsetZ);
        aMetrics.push(radius, length, speed, radius, length, speed);
        const color = pickRandom(colors);
        aColor.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
      instanced.setAttribute('aOffset',  new THREE.InstancedBufferAttribute(new Float32Array(aOffset), 3, false));
      instanced.setAttribute('aMetrics', new THREE.InstancedBufferAttribute(new Float32Array(aMetrics), 3, false));
      instanced.setAttribute('aColor',   new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3, false));
      const material = new THREE.ShaderMaterial({
        fragmentShader: carLightsFragment,
        vertexShader: carLightsVertex,
        transparent: true,
        uniforms: Object.assign(
          { uTime: { value: 0 }, uTravelLength: { value: opts.length }, uFade: { value: this.fade } },
          this.webgl.fogUniforms,
          opts.distortion.uniforms
        )
      });
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <getDistortion_vertex>', opts.distortion.getDistortion);
      };
      const mesh = new THREE.Mesh(instanced, material);
      mesh.frustumCulled = false;
      this.webgl.scene.add(mesh);
      this.mesh = mesh;
    }
    update(time) { this.mesh.material.uniforms.uTime.value = time; }
  }

  class LightsSticks {
    constructor(webgl, opts) { this.webgl = webgl; this.options = opts; }
    init() {
      const opts = this.options;
      const geometry = new THREE.PlaneGeometry(1, 1);
      const instanced = new THREE.InstancedBufferGeometry().copy(geometry);
      const totalSticks = opts.totalSideLightSticks;
      instanced.instanceCount = totalSticks;
      const stickoffset = opts.length / (totalSticks - 1);
      const aOffset = [], aColor = [], aMetrics = [];
      let colors = opts.colors.sticks;
      colors = Array.isArray(colors) ? colors.map(c => new THREE.Color(c)) : new THREE.Color(colors);
      for (let i = 0; i < totalSticks; i++) {
        const width = random(opts.lightStickWidth);
        const height = random(opts.lightStickHeight);
        aOffset.push((i - 1) * stickoffset * 2 + stickoffset * Math.random());
        const color = pickRandom(colors);
        aColor.push(color.r, color.g, color.b);
        aMetrics.push(width, height);
      }
      instanced.setAttribute('aOffset',  new THREE.InstancedBufferAttribute(new Float32Array(aOffset), 1, false));
      instanced.setAttribute('aColor',   new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3, false));
      instanced.setAttribute('aMetrics', new THREE.InstancedBufferAttribute(new Float32Array(aMetrics), 2, false));
      const material = new THREE.ShaderMaterial({
        fragmentShader: sideSticksFragment,
        vertexShader: sideSticksVertex,
        side: THREE.DoubleSide,
        uniforms: Object.assign(
          { uTravelLength: { value: opts.length }, uTime: { value: 0 } },
          this.webgl.fogUniforms,
          opts.distortion.uniforms
        )
      });
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <getDistortion_vertex>', opts.distortion.getDistortion);
      };
      const mesh = new THREE.Mesh(instanced, material);
      mesh.frustumCulled = false;
      this.webgl.scene.add(mesh);
      this.mesh = mesh;
    }
    update(time) { this.mesh.material.uniforms.uTime.value = time; }
  }

  class Road {
    constructor(webgl, opts) { this.webgl = webgl; this.options = opts; this.uTime = { value: 0 }; }
    createPlane(side, _width, isRoad) {
      const opts = this.options;
      const geometry = new THREE.PlaneGeometry(isRoad ? opts.roadWidth : opts.islandWidth, opts.length, 20, 100);
      let uniforms = {
        uTravelLength: { value: opts.length },
        uColor: { value: new THREE.Color(isRoad ? opts.colors.roadColor : opts.colors.islandColor) },
        uTime: this.uTime
      };
      if (isRoad) {
        uniforms = Object.assign(uniforms, {
          uLanes: { value: opts.lanesPerRoad },
          uBrokenLinesColor: { value: new THREE.Color(opts.colors.brokenLines) },
          uShoulderLinesColor: { value: new THREE.Color(opts.colors.shoulderLines) },
          uShoulderLinesWidthPercentage: { value: opts.shoulderLinesWidthPercentage },
          uBrokenLinesLengthPercentage: { value: opts.brokenLinesLengthPercentage },
          uBrokenLinesWidthPercentage: { value: opts.brokenLinesWidthPercentage }
        });
      }
      const material = new THREE.ShaderMaterial({
        fragmentShader: isRoad ? roadFragment : islandFragment,
        vertexShader: roadVertex,
        side: THREE.DoubleSide,
        uniforms: Object.assign(uniforms, this.webgl.fogUniforms, opts.distortion.uniforms)
      });
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <getDistortion_vertex>', opts.distortion.getDistortion);
      };
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.z = -opts.length / 2;
      mesh.position.x += (opts.islandWidth / 2 + opts.roadWidth / 2) * side;
      this.webgl.scene.add(mesh);
      return mesh;
    }
    init() {
      this.leftRoadWay  = this.createPlane(-1, this.options.roadWidth, true);
      this.rightRoadWay = this.createPlane(1,  this.options.roadWidth, true);
      this.island       = this.createPlane(0,  this.options.islandWidth, false);
    }
    update(time) { this.uTime.value = time; }
  }

  class App {
    constructor(container, opts) {
      this.options = opts;
      this.container = container;
      this.hasValidSize = false;
      this.disposed = false;
      const initW = Math.max(1, container.offsetWidth);
      const initH = Math.max(1, container.offsetHeight);
      this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      this.renderer.setSize(initW, initH, false);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.composer = new EffectComposer(this.renderer);
      container.append(this.renderer.domElement);
      this.camera = new THREE.PerspectiveCamera(opts.fov, initW / initH, 0.1, 10000);
      this.camera.position.set(0, 8, -5);
      this.scene = new THREE.Scene();
      this.scene.background = null;
      const fog = new THREE.Fog(opts.colors.background, opts.length * 0.2, opts.length * 500);
      this.scene.fog = fog;
      this.fogUniforms = {
        fogColor: { value: fog.color },
        fogNear: { value: fog.near },
        fogFar: { value: fog.far }
      };
      this.clock = new THREE.Clock();
      this.road = new Road(this, opts);
      this.leftCarLights = new CarLights(this, opts, opts.colors.leftCars, opts.movingAwaySpeed, new THREE.Vector2(0, 1 - opts.carLightsFade));
      this.rightCarLights = new CarLights(this, opts, opts.colors.rightCars, opts.movingCloserSpeed, new THREE.Vector2(1, 0 + opts.carLightsFade));
      this.leftSticks = new LightsSticks(this, opts);
      this.fovTarget = opts.fov;
      this.speedUpTarget = 0;
      this.speedUp = 0;
      this.timeOffset = 0;
      this.tick = this.tick.bind(this);
      this.setSize = this.setSize.bind(this);
      this.onMouseDown = this.onMouseDown.bind(this);
      this.onMouseUp = this.onMouseUp.bind(this);
      this.onTouchStart = this.onTouchStart.bind(this);
      this.onTouchEnd = this.onTouchEnd.bind(this);
      this.onContextMenu = e => e.preventDefault();
      this.onWindowResize = this.onWindowResize.bind(this);
      window.addEventListener('resize', this.onWindowResize);
      if (initW > 0 && initH > 0) this.hasValidSize = true;
    }
    onWindowResize() {
      const w = this.container.offsetWidth, h = this.container.offsetHeight;
      if (w <= 0 || h <= 0) { this.hasValidSize = false; return; }
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.composer.setSize(w, h);
      this.hasValidSize = true;
    }
    initPasses() {
      this.renderPass = new RenderPass(this.scene, this.camera);
      this.bloomPass = new EffectPass(this.camera, new BloomEffect({ luminanceThreshold: 0.2, luminanceSmoothing: 0, resolutionScale: 1 }));
      const smaaPass = new EffectPass(this.camera, new SMAAEffect({
        preset: SMAAPreset.MEDIUM,
        searchImage: SMAAEffect.searchImageDataURL,
        areaImage: SMAAEffect.areaImageDataURL
      }));
      this.renderPass.renderToScreen = false;
      this.bloomPass.renderToScreen = false;
      smaaPass.renderToScreen = true;
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(smaaPass);
    }
    loadAssets() {
      return new Promise(resolve => {
        const manager = new THREE.LoadingManager(resolve);
        const s = new Image(), a = new Image();
        s.addEventListener('load', () => manager.itemEnd('s'));
        a.addEventListener('load', () => manager.itemEnd('a'));
        manager.itemStart('s'); manager.itemStart('a');
        s.src = SMAAEffect.searchImageDataURL;
        a.src = SMAAEffect.areaImageDataURL;
      });
    }
    init() {
      this.initPasses();
      const opts = this.options;
      this.road.init();
      this.leftCarLights.init();
      this.leftCarLights.mesh.position.setX(-opts.roadWidth / 2 - opts.islandWidth / 2);
      this.rightCarLights.init();
      this.rightCarLights.mesh.position.setX(opts.roadWidth / 2 + opts.islandWidth / 2);
      this.leftSticks.init();
      this.leftSticks.mesh.position.setX(-(opts.roadWidth + opts.islandWidth / 2));
      this.container.addEventListener('mousedown', this.onMouseDown);
      this.container.addEventListener('mouseup', this.onMouseUp);
      this.container.addEventListener('mouseout', this.onMouseUp);
      this.container.addEventListener('touchstart', this.onTouchStart, { passive: true });
      this.container.addEventListener('touchend', this.onTouchEnd, { passive: true });
      this.container.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
      this.container.addEventListener('contextmenu', this.onContextMenu);
      this.tick();
    }
    onMouseDown(ev) { this.options.onSpeedUp?.(ev); this.fovTarget = this.options.fovSpeedUp; this.speedUpTarget = this.options.speedUp; }
    onMouseUp(ev)   { this.options.onSlowDown?.(ev); this.fovTarget = this.options.fov; this.speedUpTarget = 0; }
    onTouchStart(ev){ this.options.onSpeedUp?.(ev); this.fovTarget = this.options.fovSpeedUp; this.speedUpTarget = this.options.speedUp; }
    onTouchEnd(ev)  { this.options.onSlowDown?.(ev); this.fovTarget = this.options.fov; this.speedUpTarget = 0; }
    update(delta) {
      const lerpPct = Math.exp(-(-60 * Math.log2(1 - 0.1)) * delta);
      this.speedUp += lerp(this.speedUp, this.speedUpTarget, lerpPct, 0.00001);
      this.timeOffset += this.speedUp * delta;
      const time = this.clock.elapsedTime + this.timeOffset;
      this.rightCarLights.update(time);
      this.leftCarLights.update(time);
      this.leftSticks.update(time);
      this.road.update(time);
      let updateCamera = false;
      const fovChange = lerp(this.camera.fov, this.fovTarget, lerpPct);
      if (fovChange !== 0) { this.camera.fov += fovChange * delta * 6; updateCamera = true; }
      if (this.options.distortion.getJS) {
        const d = this.options.distortion.getJS(0.025, time);
        this.camera.lookAt(new THREE.Vector3(
          this.camera.position.x + d.x,
          this.camera.position.y + d.y,
          this.camera.position.z + d.z
        ));
        updateCamera = true;
      }
      if (updateCamera) this.camera.updateProjectionMatrix();
    }
    render(delta) { this.composer.render(delta); }
    setSize(width, height, updateStyles) {
      if (width <= 0 || height <= 0) { this.hasValidSize = false; return; }
      this.composer.setSize(width, height, updateStyles);
      this.hasValidSize = true;
    }
    tick() {
      if (this.disposed) return;
      if (!this.hasValidSize) {
        const w = this.container.offsetWidth, h = this.container.offsetHeight;
        if (w > 0 && h > 0) {
          this.renderer.setSize(w, h, false);
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
          this.composer.setSize(w, h);
          this.hasValidSize = true;
        } else {
          requestAnimationFrame(this.tick);
          return;
        }
      }
      if (resizeRendererToDisplaySize(this.renderer, this.setSize)) {
        const canvas = this.renderer.domElement;
        if (this.hasValidSize) {
          this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
          this.camera.updateProjectionMatrix();
        }
      }
      if (this.hasValidSize) {
        const delta = this.clock.getDelta();
        this.render(delta);
        this.update(delta);
      }
      requestAnimationFrame(this.tick);
    }
    dispose() {
      this.disposed = true;
      this.scene?.traverse(obj => {
        if (!obj.isMesh) return;
        obj.geometry?.dispose();
        if (obj.material) {
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
        }
      });
      this.scene?.clear();
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement?.parentNode?.removeChild(this.renderer.domElement);
      }
      this.composer?.dispose();
      window.removeEventListener('resize', this.onWindowResize);
      if (this.container) {
        this.container.removeEventListener('mousedown', this.onMouseDown);
        this.container.removeEventListener('mouseup', this.onMouseUp);
        this.container.removeEventListener('mouseout', this.onMouseUp);
        this.container.removeEventListener('touchstart', this.onTouchStart);
        this.container.removeEventListener('touchend', this.onTouchEnd);
        this.container.removeEventListener('touchcancel', this.onTouchEnd);
        this.container.removeEventListener('contextmenu', this.onContextMenu);
      }
    }
  }

  const app = new App(container, options);
  app.loadAssets().then(() => app.init());
  return app;
}

// ----- Wiring: viewport-gated init + reduced-motion + mobile guard -----
// Supports multiple containers: #hyperspeed OR any element with [data-hyperspeed]

const containers = new Set([
  ...document.querySelectorAll('#hyperspeed'),
  ...document.querySelectorAll('[data-hyperspeed]')
]);

if (containers.size) {
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && !isMobile) {
    const apps = new WeakMap();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !apps.has(e.target)) {
          apps.set(e.target, initHyperspeed(e.target));
        } else if (!e.isIntersecting && apps.has(e.target)) {
          apps.get(e.target).dispose();
          apps.delete(e.target);
        }
      });
    }, { rootMargin: '200px 0px' });
    containers.forEach(c => io.observe(c));
    window.addEventListener('beforeunload', () => {
      containers.forEach(c => { apps.get(c)?.dispose(); apps.delete(c); });
    });
  }
}
