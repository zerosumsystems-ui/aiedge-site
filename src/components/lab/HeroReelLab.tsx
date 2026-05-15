"use client"

/**
 * Hero Reel Lab — particle assembly driven by the bar-by-bar reveal
 * cadence (NOT shipped).
 *
 * The standalone particle lab assembled every candle at once. This one
 * mirrors how the real HeroSetupTape plays: candles resolve out of the
 * dust ONE AT A TIME, left to right, with a beat between bars and a
 * pause on the fire bar — then the whole setup holds and disperses.
 *
 *   Tier A — GPU-simulated (GPUComputationRenderer): per-particle
 *     reveal time baked into the home texture; the velocity shader
 *     only starts pulling a particle toward its candle once that
 *     bar's beat arrives. CPU-substepped, framerate-independent.
 *
 *   Tier B — analytic: per-particle reveal time as an attribute; the
 *     vertex shader ramps each particle in after its beat.
 *
 * Delete src/components/lab + src/app/lab once a direction is chosen.
 */

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js"

const { Timer } = THREE

/* ---------- candle data + reveal schedule --------------------------- */

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
const PIVOT_IDX = 3
const FIRE_IDX = 6

const CHART_W = 8.4
const PRICE_H = 3.8

// Cycle timing (seconds). Bars reveal on a beat, hold, then dissolve.
const BEAT = 0.52
const DISSOLVE_START = 10.2
const DISSOLVE_END = 13.0
const CYCLE = 13.6

/** When candle i begins resolving — extra pause after the fire bar. */
function revealTime(i: number): number {
  return 0.5 + i * BEAT + (i > FIRE_IDX ? 0.6 : 0)
}

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

const cTeal = new THREE.Color(0x00d6a0)
const cRed = new THREE.Color(0xe0608a)
const cGold = new THREE.Color(0xf5c842)
const cCyan = new THREE.Color(0x43c5e8)
function candleColor(g: CandleGeom): THREE.Color {
  if (g.i === FIRE_IDX) return cGold
  if (g.i === PIVOT_IDX) return cCyan
  return g.up ? cTeal : cRed
}

/* ---------- shared GLSL --------------------------------------------- */

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

const POINT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vGlow;
void main(){
  vec2 c=gl_PointCoord-0.5;
  float d=length(c);
  if(d>0.5) discard;
  float a=smoothstep(0.5,0.0,d);
  gl_FragColor=vec4(vColor*(0.8+0.5*vGlow),a*a*0.22);
}
`

interface SceneHandle {
  dispose: () => void
}
type SceneFactory = (
  el: HTMLElement,
  reducedMotion: boolean,
  onPhase: (text: string) => void,
) => SceneHandle

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

/** Phase caption from cycle time — mirrors the tape's status line. */
function phaseText(ct: number): string {
  if (ct >= DISSOLVE_START) return "setup releasing —"
  let n = 0
  for (let i = 0; i < CANDLES.length; i++) {
    if (revealTime(i) < ct) n++
  }
  if (n >= CANDLES.length) return "setup complete · 12 / 12 bars"
  if (n === FIRE_IDX + 1) return "FIRE — long · bar 7 / 12"
  if (n === 0) return "scanning the tape…"
  return `forming · bar ${n} / 12`
}

function cameraPath(t: number, pointer: { x: number; y: number }) {
  return {
    x: Math.sin(t * 0.1) * 1.7 + pointer.x * 0.9,
    y: 1.3 - pointer.y * 0.7,
    z: 12.6,
  }
}

/* ===================================================================
 * TIER A — GPU-SIMULATED, bar-by-bar
 * ================================================================= */

const sceneReelGpu: SceneFactory = (el, rm, onPhase) => {
  const { scene, camera, renderer, composer, ro } = makeStage(el, 0.32)

  const TEX = 420
  const COUNT = TEX * TEX
  const L = layout()

  const gpu = new GPUComputationRenderer(TEX, TEX, renderer)
  const posTex = gpu.createTexture()
  const velTex = gpu.createTexture()
  const homeTex = gpu.createTexture()
  const posArr = posTex.image.data as Float32Array
  const velArr = velTex.image.data as Float32Array
  const homeArr = homeTex.image.data as Float32Array

  const refs = new Float32Array(COUNT * 2)
  const colors = new Float32Array(COUNT * 3)

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
    homeArr[j + 3] = revealTime(g.i) // per-particle beat
    refs[k * 2] = ((k % TEX) + 0.5) / TEX
    refs[k * 2 + 1] = (((k / TEX) | 0) + 0.5) / TEX
    const col = candleColor(g)
    colors[k * 3] = col.r
    colors[k * 3 + 1] = col.g
    colors[k * 3 + 2] = col.b
  }

  const velShader = /* glsl */ `
    uniform float uTime;
    uniform sampler2D textureHome;
    ${GLSL_NOISE}
    void main(){
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec3 pos = texture2D(texturePosition, uv).xyz;
      vec3 vel = texture2D(textureVelocity, uv).xyz;
      vec4 hd = texture2D(textureHome, uv);
      vec3 home = hd.xyz;
      float reveal = hd.w;
      float ct = mod(uTime, ${CYCLE.toFixed(2)});
      // this particle's bar resolves once its beat arrives
      float rp = smoothstep(0.0, 1.15, ct - reveal);
      float dp = smoothstep(${DISSOLVE_START.toFixed(2)}, ${DISSOLVE_END.toFixed(2)}, ct);
      float k = rp * (1.0 - dp);
      vec3 force = (home - pos) * (9.0 * k);
      float turb = 1.3 * (1.0 - 0.9 * k);
      force += curlNoise(pos * 0.32 + vec3(0.0, 0.0, uTime * 0.06)) * turb;
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
  velVar.material.uniforms.textureHome = { value: homeTex }
  const initErr = gpu.init()
  if (initErr) console.error("[hero-reel-lab] gpu init:", initErr)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3),
  )
  geo.setAttribute("aRef", new THREE.BufferAttribute(refs, 2))
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3))
  const mat = new THREE.ShaderMaterial({
    uniforms: { texturePosition: { value: null }, uSize: { value: 13 } },
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
        vGlow = clamp(1.0 + mv.z * 0.05, 0.1, 0.8);
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
  let lastPhase = ""
  const FIXED_DT = 0.022
  let acc = 0
  const step = (t: number) => {
    velVar.material.uniforms.uTime.value = t
    gpu.compute()
  }
  const draw = (t: number) => {
    mat.uniforms.texturePosition.value =
      gpu.getCurrentRenderTarget(posVar).texture
    points.rotation.y = Math.sin(t * 0.16) * 0.34
    const c = cameraPath(t, pointer)
    camera.position.set(c.x, c.y, c.z)
    camera.lookAt(0, 0.1, 0)
    composer.render()
    const ph = phaseText(t % CYCLE)
    if (ph !== lastPhase) {
      lastPhase = ph
      onPhase(ph)
    }
  }
  const loop = () => {
    raf = requestAnimationFrame(loop)
    timer.update()
    const t = timer.getElapsed()
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
    for (let i = 0; i < 360; i++) step(8.0)
    draw(8.0)
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
 * TIER B — ANALYTIC, bar-by-bar
 * ================================================================= */

const sceneReelAnalytic: SceneFactory = (el, rm, onPhase) => {
  const { scene, camera, renderer, composer, ro } = makeStage(el, 0.32)

  const COUNT = 90000
  const L = layout()
  const home = new Float32Array(COUNT * 3)
  const scatter = new Float32Array(COUNT * 3)
  const colors = new Float32Array(COUNT * 3)
  const reveal = new Float32Array(COUNT)
  const seed = new Float32Array(COUNT)

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
    const col = candleColor(g)
    colors[k * 3] = col.r
    colors[k * 3 + 1] = col.g
    colors[k * 3 + 2] = col.b
    reveal[k] = revealTime(g.i) + Math.random() * 0.35
    seed[k] = Math.random() * 100
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3),
  )
  geo.setAttribute("aHome", new THREE.BufferAttribute(home, 3))
  geo.setAttribute("aScatter", new THREE.BufferAttribute(scatter, 3))
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3))
  geo.setAttribute("aReveal", new THREE.BufferAttribute(reveal, 1))
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: 13 } },
    vertexShader: /* glsl */ `
      attribute vec3 aHome;
      attribute vec3 aScatter;
      attribute vec3 aColor;
      attribute float aReveal;
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      varying vec3 vColor;
      varying float vGlow;
      ${GLSL_NOISE}
      void main(){
        float ct = mod(uTime, ${CYCLE.toFixed(2)});
        float rp = smoothstep(0.0, 1.6, ct - aReveal);
        float dp = smoothstep(${DISSOLVE_START.toFixed(2)}, ${DISSOLVE_END.toFixed(2)}, ct);
        float a = rp * (1.0 - dp);
        vec3 base = mix(aScatter, aHome, a);
        vec3 curl = curlNoise(base * 0.3 + vec3(aSeed, aSeed, uTime * 0.05));
        vec3 pos = base + curl * (0.7 * (1.0 - a) + 0.07);
        vColor = aColor;
        // brief brightness pop as this bar resolves
        vGlow = clamp(a * 0.6 + exp(-pow((rp - 0.55) * 4.0, 2.0)) * 0.6, 0.1, 1.0);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
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
  let lastPhase = ""
  const render = (still: boolean) => {
    const t = still ? 8.0 : timer.getElapsed()
    mat.uniforms.uTime.value = t
    points.rotation.y = still ? 0.18 : Math.sin(t * 0.16) * 0.34
    const c = cameraPath(t, pointer)
    camera.position.set(c.x, c.y, c.z)
    camera.lookAt(0, 0.1, 0)
    composer.render()
    const ph = phaseText(t % CYCLE)
    if (ph !== lastPhase) {
      lastPhase = ph
      onPhase(ph)
    }
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

/* ---------- gallery ------------------------------------------------- */

function ReelPanel({
  tier,
  title,
  desc,
  factory,
}: {
  tier: string
  title: string
  desc: string
  factory: SceneFactory
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState("scanning the tape…")

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let handle: SceneHandle | null = null
    let frame = 0
    // throttle caption updates to the next animation frame
    const onPhase = (text: string) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setPhase(text))
    }
    try {
      handle = factory(el, rm, onPhase)
    } catch (err) {
      console.error("[hero-reel-lab] scene failed", err)
    }
    return () => {
      cancelAnimationFrame(frame)
      handle?.dispose()
    }
  }, [factory])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative h-[320px] w-full bg-[#090909] sm:h-[460px]">
        <div ref={ref} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-4 top-3 font-mono text-[11px] uppercase tracking-[0.16em] text-teal/80">
          {tier}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-4 rounded bg-black/55 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-text">
          {phase}
        </div>
      </div>
      <div className="border-t border-border p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        <p className="mt-1.5 max-w-[760px] text-[13px] leading-relaxed text-sub">
          {desc}
        </p>
      </div>
    </div>
  )
}

export function HeroReelLab() {
  return (
    <div className="min-h-[100dvh] bg-bg px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-teal">
          internal · not shipped · particle reel
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-text sm:text-[32px]">
          Hero Reel Lab
        </h1>
        <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-sub">
          The particle assembly wired to the real bar-by-bar reveal
          cadence — candles resolve out of the dust one at a time, left
          to right, with a beat between bars and a pause on the fire
          bar, then the setup holds and releases. Pivot bar is cyan, the
          fire bar gold, just like the deep-dive chart.
        </p>

        <div className="mt-8 flex flex-col gap-7">
          <ReelPanel
            tier="Tier A"
            title="GPU-simulated reel"
            desc="Each particle's beat is baked into the simulation — the velocity shader only starts pulling it toward its candle once that bar's moment arrives. Particles swarm in with real momentum and curl-noise turbulence, bar by bar."
            factory={sceneReelGpu}
          />
          <ReelPanel
            tier="Tier B"
            title="Analytic reel"
            desc="Same bar-by-bar cadence computed analytically in the vertex shader, with a brightness pop as each bar resolves. Lighter and crisper, no simulation state."
            factory={sceneReelAnalytic}
          />
        </div>
      </div>
    </div>
  )
}
