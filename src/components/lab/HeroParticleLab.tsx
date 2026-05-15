"use client"

/**
 * Hero Particle Lab — two tiers of WebGL particle assembly (NOT shipped).
 *
 * Both render the same idea — a candle chart that resolves out of a
 * swarm of glowing dust moving through a curl-noise flow field — at
 * two very different fidelity tiers, so the cost/wow trade-off is
 * visible side by side:
 *
 *   TIER A — "Ceiling": a true GPU-simulated system. Position +
 *     velocity live in float textures (GPUComputationRenderer,
 *     ping-pong FBOs); every particle has momentum, is pulled toward
 *     its candle target, and is pushed around by curl-noise
 *     turbulence. ~176k particles here; scales to 1M+ on real GPUs.
 *
 *   TIER B — "Standard": ~90k particles with no simulation state —
 *     each frame's position is computed analytically in the vertex
 *     shader (scatter → home lerp + curl-noise displacement). Lighter,
 *     simpler, rock-solid on every browser.
 *
 * True WebGPU compute is one notch beyond Tier A, but the visual gain
 * at hero scale is marginal and it can't be verified without a GPU
 * adapter — Tier A is the realistic shippable ceiling.
 *
 * Delete src/components/lab + src/app/lab once a direction is chosen.
 */

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js"

const { Timer } = THREE

/* ---------- shared candle data + layout ----------------------------- */

interface OHLC {
  o: number
  h: number
  l: number
  c: number
}

const CANDLES: OHLC[] = [
  { o: 100.0, h: 100.4, l: 99.2, c: 99.4 },
  { o: 99.4, h: 99.6, l: 98.4, c: 98.6 },
  { o: 98.6, h: 98.8, l: 97.7, c: 97.9 },
  { o: 97.9, h: 98.1, l: 97.4, c: 97.6 },
  { o: 97.6, h: 98.5, l: 97.5, c: 98.4 },
  { o: 98.4, h: 99.3, l: 98.3, c: 99.1 },
  { o: 99.1, h: 100.2, l: 99.0, c: 100.0 },
  { o: 100.0, h: 100.7, l: 99.7, c: 100.5 },
  { o: 100.5, h: 101.3, l: 100.3, c: 101.1 },
  { o: 101.1, h: 101.4, l: 100.6, c: 100.9 },
  { o: 100.9, h: 101.8, l: 100.8, c: 101.7 },
  { o: 101.7, h: 102.4, l: 101.5, c: 102.3 },
]

const CHART_W = 8.4
const PRICE_H = 3.8

interface CandleGeom {
  i: number
  x: number
  up: boolean
  colW: number
  body: { cy: number; h: number }
  wick: { cy: number; h: number }
}

function layout(): CandleGeom[] {
  const n = CANDLES.length
  const lo = Math.min(...CANDLES.map((c) => c.l))
  const hi = Math.max(...CANDLES.map((c) => c.h))
  const mid = (lo + hi) / 2
  const span = hi - lo
  const sx = CHART_W / (n - 1)
  const y = (p: number) => ((p - mid) / span) * PRICE_H
  return CANDLES.map((c, i) => {
    const bt = y(Math.max(c.o, c.c))
    const bb = y(Math.min(c.o, c.c))
    const wt = y(c.h)
    const wb = y(c.l)
    return {
      i,
      x: (i - (n - 1) / 2) * sx,
      up: c.c >= c.o,
      colW: sx,
      body: { cy: (bt + bb) / 2, h: Math.max(bt - bb, 0.07) },
      wick: { cy: (wt + wb) / 2, h: Math.max(wt - wb, 0.07) },
    }
  })
}

/** A random point inside a candle's body (84%) or wick (16%). */
function sampleCandlePoint(g: CandleGeom): [number, number, number] {
  if (Math.random() < 0.84) {
    return [
      g.x + (Math.random() - 0.5) * g.colW * 0.66,
      g.body.cy + (Math.random() - 0.5) * g.body.h,
      (Math.random() - 0.5) * 0.5,
    ]
  }
  return [
    g.x + (Math.random() - 0.5) * 0.1,
    g.wick.cy + (Math.random() - 0.5) * g.wick.h,
    (Math.random() - 0.5) * 0.1,
  ]
}

function scatterPoint(): [number, number, number] {
  const u = Math.random() * 2 - 1
  const th = Math.random() * Math.PI * 2
  const r = 9 + Math.random() * 11
  const s = Math.sqrt(1 - u * u)
  return [Math.cos(th) * s * r, u * r * 0.6, Math.sin(th) * s * r]
}

/* ---------- shared GLSL: 3D simplex + curl noise -------------------- */

// Canonical Ashima webgl-noise simplex, plus curl derived from finite
// differences of a 3-vector noise potential. GLSL ES 1.00 so it drops
// straight into both the GPGPU pass and the analytic vertex shader.
const GLSL_NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
        i.z+vec4(0.0,i1.z,i2.z,1.0))
      + i.y+vec4(0.0,i1.y,i2.y,1.0))
      + i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 snoiseVec3(vec3 p){
  return vec3(
    snoise(p),
    snoise(p+vec3(123.4,567.8,90.1)),
    snoise(p+vec3(-12.3,45.6,-78.9)));
}
vec3 curlNoise(vec3 p){
  const float e=0.1;
  vec3 dx=vec3(e,0.0,0.0),dy=vec3(0.0,e,0.0),dz=vec3(0.0,0.0,e);
  vec3 px0=snoiseVec3(p-dx),px1=snoiseVec3(p+dx);
  vec3 py0=snoiseVec3(p-dy),py1=snoiseVec3(p+dy);
  vec3 pz0=snoiseVec3(p-dz),pz1=snoiseVec3(p+dz);
  float x=(py1.z-py0.z)-(pz1.y-pz0.y);
  float y=(pz1.x-pz0.x)-(px1.z-px0.z);
  float z=(px1.y-px0.y)-(py1.x-py0.x);
  return vec3(x,y,z)/(2.0*e);
}
`

// Soft round glowing sprite — shared fragment shader for the points.
const POINT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vGlow;
void main(){
  vec2 c=gl_PointCoord-0.5;
  float d=length(c);
  if(d>0.5) discard;
  float a=smoothstep(0.5,0.0,d);
  // Each sprite is deliberately faint — density does the work. Dense
  // candle cores sum bright; sparse dust stays dim. Additive blend.
  gl_FragColor=vec4(vColor*(0.8+0.2*vGlow),a*a*0.22);
}
`

interface SceneHandle {
  dispose: () => void
}
type SceneFactory = (el: HTMLElement, reducedMotion: boolean) => SceneHandle

function makeStage(el: HTMLElement, bloomStrength: number) {
  const w = el.clientWidth || 800
  const h = el.clientHeight || 450
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x090909)
  const camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 120)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  el.appendChild(renderer.domElement)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  // Restrained bloom: only dense particle cores (where many additive
  // sprites overlap above the threshold) bloom — sparse dust stays
  // crisp, so the candle shapes read instead of smearing to white.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    bloomStrength,
    0.5,
    0.32,
  )
  composer.addPass(bloom)

  const ro = new ResizeObserver(() => {
    const nw = el.clientWidth
    const nh = el.clientHeight
    if (!nw || !nh) return
    camera.aspect = nw / nh
    camera.updateProjectionMatrix()
    renderer.setSize(nw, nh)
    composer.setSize(nw, nh)
  })
  ro.observe(el)

  return { scene, camera, renderer, composer, ro }
}

/** Phase 0..1: assemble → hold → dissolve over an 8.4s cycle. */
function assemblePhase(t: number): number {
  const ct = t % 8.4
  if (ct < 3.7) {
    const a = clamp01(ct / 3.7)
    return a * a * (3 - 2 * a)
  }
  if (ct < 5.6) return 1
  const d = clamp01((ct - 5.6) / 2.4)
  return 1 - d * d * (3 - 2 * d)
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/* ===================================================================
 * TIER A — GPU-SIMULATED PARTICLES (GPUComputationRenderer)
 * ================================================================= */

const sceneGpuSim: SceneFactory = (el, rm) => {
  const { scene, camera, renderer, composer, ro } = makeStage(el, 0.32)

  const TEX = 420 // 176,400 simulated particles
  const COUNT = TEX * TEX
  const L = layout()

  const gpu = new GPUComputationRenderer(TEX, TEX, renderer)
  const posTex = gpu.createTexture()
  const velTex = gpu.createTexture()
  const homeTex = gpu.createTexture()
  const posArr = posTex.image.data as Float32Array
  const velArr = velTex.image.data as Float32Array
  const homeArr = homeTex.image.data as Float32Array

  // Render-geometry attributes (one entry per particle).
  const refs = new Float32Array(COUNT * 2)
  const colors = new Float32Array(COUNT * 3)
  const cUp = new THREE.Color(0x00d6a0)
  const cDown = new THREE.Color(0xe0608a)

  for (let k = 0; k < COUNT; k++) {
    const g = L[(Math.random() * L.length) | 0]
    const [hx, hy, hz] = sampleCandlePoint(g)
    const [sx, sy, sz] = scatterPoint()
    const j = k * 4
    posArr[j] = sx
    posArr[j + 1] = sy
    posArr[j + 2] = sz
    posArr[j + 3] = 1
    velArr[j] = 0
    velArr[j + 1] = 0
    velArr[j + 2] = 0
    velArr[j + 3] = 1
    homeArr[j] = hx
    homeArr[j + 1] = hy
    homeArr[j + 2] = hz
    homeArr[j + 3] = 1
    refs[k * 2] = ((k % TEX) + 0.5) / TEX
    refs[k * 2 + 1] = ((k / TEX | 0) + 0.5) / TEX
    const col = g.up ? cUp : cDown
    colors[k * 3] = col.r
    colors[k * 3 + 1] = col.g
    colors[k * 3 + 2] = col.b
  }

  const velShader = /* glsl */ `
    uniform float uTime;
    uniform float uAssemble;
    uniform sampler2D textureHome;
    ${GLSL_NOISE}
    void main(){
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec3 pos = texture2D(texturePosition, uv).xyz;
      vec3 vel = texture2D(textureVelocity, uv).xyz;
      vec3 home = texture2D(textureHome, uv).xyz;
      // pull toward the candle target — strong once assembling
      vec3 toHome = home - pos;
      vec3 force = toHome * (9.0 * uAssemble);
      // curl-noise turbulence — dominant while dispersed, a gentle
      // shimmer once formed
      float turb = 1.3 * (1.0 - 0.9 * uAssemble);
      force += curlNoise(pos * 0.32 + vec3(0.0, 0.0, uTime * 0.06)) * turb;
      // Fixed timestep — the sim is CPU-substepped so convergence is
      // framerate-independent (DT must match FIXED_DT below).
      vel += force * 0.022;
      vel *= 0.84;
      gl_FragColor = vec4(vel, 1.0);
    }
  `
  const posShader = /* glsl */ `
    void main(){
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec3 pos = texture2D(texturePosition, uv).xyz;
      vec3 vel = texture2D(textureVelocity, uv).xyz;
      gl_FragColor = vec4(pos + vel * 0.022, 1.0);
    }
  `

  const velVar = gpu.addVariable("textureVelocity", velShader, velTex)
  const posVar = gpu.addVariable("texturePosition", posShader, posTex)
  gpu.setVariableDependencies(velVar, [posVar, velVar])
  gpu.setVariableDependencies(posVar, [posVar, velVar])
  velVar.material.uniforms.uTime = { value: 0 }
  velVar.material.uniforms.uAssemble = { value: 0 }
  velVar.material.uniforms.textureHome = { value: homeTex }
  const initErr = gpu.init()
  if (initErr) console.error("[hero-particle-lab] gpu init:", initErr)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
  geo.setAttribute("aRef", new THREE.BufferAttribute(refs, 2))
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3))
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      texturePosition: { value: null },
      uSize: { value: 13 },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aRef;
      attribute vec3 aColor;
      uniform sampler2D texturePosition;
      uniform float uSize;
      varying vec3 vColor;
      varying float vGlow;
      void main(){
        vec3 pos = texture2D(texturePosition, aRef).xyz;
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vGlow = clamp(1.0 + mv.z * 0.05, 0.15, 0.9);
        gl_PointSize = uSize * (1.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)

  const timer = new Timer()
  const pointer = { x: 0, y: 0 }
  const onPointer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2
    pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2
  }
  el.addEventListener("pointermove", onPointer)

  let raf = 0
  const FIXED_DT = 0.022 // must match the DT baked into the sim shaders
  let acc = 0

  // One simulation substep at sim-time `t`.
  const step = (t: number) => {
    velVar.material.uniforms.uTime.value = t
    velVar.material.uniforms.uAssemble.value = assemblePhase(t)
    gpu.compute()
  }
  const draw = (t: number) => {
    mat.uniforms.texturePosition.value =
      gpu.getCurrentRenderTarget(posVar).texture
    points.rotation.y = Math.sin(t * 0.16) * 0.38
    camera.position.set(
      Math.sin(t * 0.1) * 1.8 + pointer.x * 0.9,
      1.4 - pointer.y * 0.7,
      12.4,
    )
    camera.lookAt(0, 0.1, 0)
    composer.render()
  }
  const loop = () => {
    raf = requestAnimationFrame(loop)
    timer.update()
    const t = timer.getElapsed()
    // Substep so the sim advances by wall-clock time regardless of
    // framerate — converges identically at 60fps or 5fps. Capped to
    // avoid a spiral of death on a slow frame.
    acc += Math.min(timer.getDelta(), 0.12)
    let n = 0
    while (acc >= FIXED_DT && n < 16) {
      step(t)
      acc -= FIXED_DT
      n++
    }
    if (n >= 16) acc = 0
    draw(t)
  }
  if (rm) {
    for (let i = 0; i < 200; i++) step(4.3)
    draw(4.3)
  } else loop()

  return {
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener("pointermove", onPointer)
      geo.dispose()
      mat.dispose()
      gpu.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

/* ===================================================================
 * TIER B — ANALYTIC PARTICLES (no sim state, vertex-shader curl)
 * ================================================================= */

const sceneAnalytic: SceneFactory = (el, rm) => {
  const { scene, camera, renderer, composer, ro } = makeStage(el, 0.32)

  const COUNT = 90000
  const L = layout()
  const home = new Float32Array(COUNT * 3)
  const scatter = new Float32Array(COUNT * 3)
  const colors = new Float32Array(COUNT * 3)
  const delay = new Float32Array(COUNT)
  const seed = new Float32Array(COUNT)
  const cUp = new THREE.Color(0x00d6a0)
  const cDown = new THREE.Color(0xe0608a)

  for (let k = 0; k < COUNT; k++) {
    const g = L[(Math.random() * L.length) | 0]
    const [hx, hy, hz] = sampleCandlePoint(g)
    const [sx, sy, sz] = scatterPoint()
    home[k * 3] = hx
    home[k * 3 + 1] = hy
    home[k * 3 + 2] = hz
    scatter[k * 3] = sx
    scatter[k * 3 + 1] = sy
    scatter[k * 3 + 2] = sz
    const col = g.up ? cUp : cDown
    colors[k * 3] = col.r
    colors[k * 3 + 1] = col.g
    colors[k * 3 + 2] = col.b
    delay[k] = (g.i / L.length) * 1.6 + Math.random() * 0.5
    seed[k] = Math.random() * 100
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
  geo.setAttribute("aHome", new THREE.BufferAttribute(home, 3))
  geo.setAttribute("aScatter", new THREE.BufferAttribute(scatter, 3))
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3))
  geo.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1))
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: 13 } },
    vertexShader: /* glsl */ `
      attribute vec3 aHome;
      attribute vec3 aScatter;
      attribute vec3 aColor;
      attribute float aDelay;
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      varying vec3 vColor;
      varying float vGlow;
      ${GLSL_NOISE}
      void main(){
        float ct = mod(uTime, 8.4);
        float a;
        if (ct < 3.7) {
          float lp = clamp((ct - aDelay) / 1.9, 0.0, 1.0);
          a = lp * lp * (3.0 - 2.0 * lp);
        } else if (ct < 5.6) {
          a = 1.0;
        } else {
          float d = clamp((ct - 5.6) / 2.4, 0.0, 1.0);
          a = 1.0 - d * d * (3.0 - 2.0 * d);
        }
        vec3 base = mix(aScatter, aHome, a);
        vec3 curl = curlNoise(base * 0.3 + vec3(aSeed, aSeed, uTime * 0.05));
        vec3 pos = base + curl * (0.7 * (1.0 - a) + 0.07);
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vGlow = clamp(0.35 + a * 0.5, 0.15, 0.9);
        gl_PointSize = uSize * (1.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)

  const timer = new Timer()
  const pointer = { x: 0, y: 0 }
  const onPointer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2
    pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2
  }
  el.addEventListener("pointermove", onPointer)

  let raf = 0
  const render = (still: boolean) => {
    const t = still ? 4.3 : timer.getElapsed()
    mat.uniforms.uTime.value = t
    points.rotation.y = still ? 0.2 : Math.sin(t * 0.16) * 0.38
    camera.position.set(
      Math.sin(t * 0.1) * 1.8 + pointer.x * 0.9,
      1.4 - pointer.y * 0.7,
      12.4,
    )
    camera.lookAt(0, 0.1, 0)
    composer.render()
  }
  const loop = () => {
    raf = requestAnimationFrame(loop)
    timer.update()
    render(false)
  }
  if (rm) render(true)
  else loop()

  return {
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener("pointermove", onPointer)
      geo.dispose()
      mat.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

/* ---------- mount harness + gallery --------------------------------- */

function ThreeTile({ factory }: { factory: SceneFactory }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let handle: SceneHandle | null = null
    try {
      handle = factory(el, rm)
    } catch (err) {
      console.error("[hero-particle-lab] scene failed", err)
    }
    return () => handle?.dispose()
  }, [factory])
  return <div ref={ref} className="absolute inset-0" />
}

const PANELS: {
  tier: string
  title: string
  desc: string
  factory: SceneFactory
}[] = [
  {
    tier: "Tier A",
    title: "GPU-simulated — the ceiling",
    desc: "176k particles with real momentum: position + velocity live in float textures, every particle is pulled toward its candle target and shoved around by a curl-noise flow field. This is the technique behind award-winning particle sites — scales to 1M+ on a real GPU. True WebGPU compute is one notch beyond, with marginal visual gain at hero scale.",
    factory: sceneGpuSim,
  },
  {
    tier: "Tier B",
    title: "Analytic — the standard",
    desc: "90k particles, no simulation state — each frame's position is computed straight in the vertex shader (scatter→home blend plus curl-noise displacement). No momentum or flocking, but lighter, simpler, and rock-solid on every browser.",
    factory: sceneAnalytic,
  },
]

export function HeroParticleLab() {
  return (
    <div className="min-h-[100dvh] bg-bg px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-teal">
          internal · not shipped · webgl2 particles
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-text sm:text-[32px]">
          Hero Particle Lab
        </h1>
        <p className="mt-2 max-w-[660px] text-[14px] leading-relaxed text-sub">
          The particle-assembly direction at two fidelity tiers — a true
          GPU-simulated swarm vs. a lighter analytic one. Both move
          through a curl-noise flow field and react to your cursor. Pick
          the tier and I&apos;ll build it out full-size on the hero.
        </p>

        <div className="mt-8 flex flex-col gap-7">
          {PANELS.map((p) => (
            <div
              key={p.tier}
              className="overflow-hidden rounded-xl border border-border bg-surface"
            >
              <div className="relative h-[320px] w-full bg-[#090909] sm:h-[460px]">
                <ThreeTile factory={p.factory} />
                <div className="pointer-events-none absolute left-4 top-3 font-mono text-[11px] uppercase tracking-[0.16em] text-teal/80">
                  {p.tier}
                </div>
              </div>
              <div className="border-t border-border p-4 sm:p-5">
                <h2 className="text-[15px] font-semibold text-text">
                  {p.title}
                </h2>
                <p className="mt-1.5 max-w-[760px] text-[13px] leading-relaxed text-sub">
                  {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
