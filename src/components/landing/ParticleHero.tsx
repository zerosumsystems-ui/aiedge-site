"use client"

/**
 * ParticleHero — the home-page hero: a GPU-simulated particle reel that
 * plays the top model-scored setups of the week.
 *
 * Each setup's candles resolve out of a swarm of ~130k glowing
 * particles, bar by bar, left to right — then the setup holds and
 * disperses and the next one forms. The particle motion is a true GPU
 * simulation: position + velocity live in float textures
 * (GPUComputationRenderer), every particle is pulled toward its candle
 * target and pushed by a curl-noise flow field, and the fire bar fires
 * a radial shockwave through the swarm.
 *
 * Graceful degradation: without WebGL2 or with prefers-reduced-motion,
 * or before live data arrives, it renders the existing HeroSetupTape.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js"
import {
  HeroSetupTape,
  type FeaturedSetup,
  type RawBar,
} from "@/components/landing/HeroSetupTape"
import { SignalBadge } from "@/components/scanner/SignalBadge"

const { Timer } = THREE

/* ---------- cycle timing -------------------------------------------- */

const REVEAL_LEAD = 0.5
const REVEAL_SPAN = 6.0
const FIRE_PAUSE = 0.7
const DISSOLVE_START = 11.8
const DISSOLVE_END = 14.6
const CYCLE = 15.0

const CHART_W = 8.6
const PRICE_H = 3.8
const TEX = 360 // 129,600 simulated particles

/* ---------- candle geometry from real OHLC -------------------------- */

interface CandleGeom {
  i: number
  x: number
  colW: number
  body: { cy: number; h: number }
  wick: { cy: number; h: number }
}

function layoutBars(bars: RawBar[]): CandleGeom[] {
  const n = bars.length
  let lo = Infinity
  let hi = -Infinity
  for (const b of bars) {
    if (b.l < lo) lo = b.l
    if (b.h > hi) hi = b.h
  }
  const mid = (lo + hi) / 2
  const span = Math.max(hi - lo, 1e-4)
  const sx = CHART_W / Math.max(n - 1, 1)
  const y = (p: number) => ((p - mid) / span) * PRICE_H
  return bars.map((b, i) => {
    const bt = y(Math.max(b.o, b.c))
    const bb = y(Math.min(b.o, b.c))
    const wt = y(b.h)
    const wb = y(b.l)
    return {
      i,
      x: (i - (n - 1) / 2) * sx,
      colW: sx,
      body: { cy: (bt + bb) / 2, h: Math.max(bt - bb, 0.05) },
      wick: { cy: (wt + wb) / 2, h: Math.max(wt - wb, 0.05) },
    }
  })
}

function sampleCandlePoint(g: CandleGeom): [number, number, number] {
  if (Math.random() < 0.84) {
    return [
      g.x + (Math.random() - 0.5) * g.colW * 0.7,
      g.body.cy + (Math.random() - 0.5) * g.body.h,
      (Math.random() - 0.5) * 0.46,
    ]
  }
  return [
    g.x + (Math.random() - 0.5) * Math.min(g.colW * 0.12, 0.08),
    g.wick.cy + (Math.random() - 0.5) * g.wick.h,
    (Math.random() - 0.5) * 0.08,
  ]
}

function scatterPoint(): [number, number, number] {
  const u = Math.random() * 2 - 1
  const th = Math.random() * Math.PI * 2
  const r = 9 + Math.random() * 11
  const s = Math.sqrt(1 - u * u)
  return [Math.cos(th) * s * r, u * r * 0.6, Math.sin(th) * s * r]
}

/** When candle i begins resolving — bars after the fire bar wait a beat. */
function revealTimeFor(i: number, n: number, fireIdx: number): number {
  const t = REVEAL_LEAD + (i / Math.max(n - 1, 1)) * REVEAL_SPAN
  return i > fireIdx ? t + FIRE_PAUSE : t
}

const C_TEAL = new THREE.Color(0x00d6a0)
const C_RED = new THREE.Color(0xe0608a)
const C_GOLD = new THREE.Color(0xf5c842)
const C_CYAN = new THREE.Color(0x43c5e8)
const C_PURPLE = new THREE.Color(0xa98bf5)

/* ---------- shared GLSL: 3D simplex + curl noise -------------------- */

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

/* ---------- the GPU particle reel engine ---------------------------- */

interface ReelUpdate {
  setupIndex: number
  caption: string
}

interface ReelHandle {
  dispose: () => void
}

function createParticleReel(
  el: HTMLElement,
  setups: FeaturedSetup[],
  onUpdate: (u: ReelUpdate) => void,
): ReelHandle {
  const w = el.clientWidth || 1000
  const h = el.clientHeight || 480
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x080808)
  const camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 120)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(w, h)
  el.appendChild(renderer.domElement)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.5, 0.32)
  composer.addPass(bloom)

  const COUNT = TEX * TEX
  const gpu = new GPUComputationRenderer(TEX, TEX, renderer)
  const posTex = gpu.createTexture()
  const velTex = gpu.createTexture()
  const homeTex = gpu.createTexture()
  const posArr = posTex.image.data as Float32Array
  // velTex is left zero-initialised by createTexture — particles start
  // at rest, which is what we want.
  const homeArr = homeTex.image.data as Float32Array
  const colors = new Float32Array(COUNT * 3)
  const refs = new Float32Array(COUNT * 2)

  for (let k = 0; k < COUNT; k++) {
    const [sx, sy, sz] = scatterPoint()
    const j = k * 4
    posArr[j] = sx
    posArr[j + 1] = sy
    posArr[j + 2] = sz
    posArr[j + 3] = 1
    refs[k * 2] = ((k % TEX) + 0.5) / TEX
    refs[k * 2 + 1] = (((k / TEX) | 0) + 0.5) / TEX
  }

  const velShader = /* glsl */ `
    uniform float uCycleTime;
    uniform float uTime;
    uniform float uShock;
    uniform vec3 uFirePos;
    uniform sampler2D textureHome;
    ${GLSL_NOISE}
    void main(){
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec3 pos = texture2D(texturePosition, uv).xyz;
      vec3 vel = texture2D(textureVelocity, uv).xyz;
      vec4 hd = texture2D(textureHome, uv);
      vec3 home = hd.xyz;
      float reveal = hd.w;
      float rp = smoothstep(0.0, 1.2, uCycleTime - reveal);
      float dp = smoothstep(${DISSOLVE_START.toFixed(2)}, ${DISSOLVE_END.toFixed(2)}, uCycleTime);
      float k = rp * (1.0 - dp);
      vec3 force = (home - pos) * (9.0 * k);
      float turb = 1.35 * (1.0 - 0.88 * k);
      force += curlNoise(pos * 0.32 + vec3(0.0, 0.0, uTime * 0.06)) * turb;
      // fire-bar shockwave — a radial impulse through the swarm
      vec3 ff = pos - uFirePos;
      float fd = length(ff) + 0.001;
      force += (ff / fd) * uShock * exp(-fd * 0.4);
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
  velVar.material.uniforms.uCycleTime = { value: 0 }
  velVar.material.uniforms.uTime = { value: 0 }
  velVar.material.uniforms.uShock = { value: 0 }
  velVar.material.uniforms.uFirePos = { value: new THREE.Vector3() }
  velVar.material.uniforms.textureHome = { value: homeTex }
  const initErr = gpu.init()
  if (initErr) console.error("[ParticleHero] gpu init:", initErr)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3),
  )
  geo.setAttribute("aRef", new THREE.BufferAttribute(refs, 2))
  const colorAttr = new THREE.BufferAttribute(colors, 3)
  geo.setAttribute("aColor", colorAttr)
  const mat = new THREE.ShaderMaterial({
    uniforms: { texturePosition: { value: null }, uSize: { value: 14 } },
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
        vGlow = clamp(1.0 + mv.z * 0.05, 0.1, 0.85);
        gl_PointSize = uSize * (1.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vGlow;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * (0.8 + 0.4 * vGlow), a * a * 0.22);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)

  // Per-setup state, filled by loadSetup.
  let fireRevealT = 3
  const firePos = velVar.material.uniforms.uFirePos.value as THREE.Vector3
  let curBarCount = 0
  let curFireIdx = 0

  function loadSetup(idx: number) {
    const setup = setups[idx]
    const bars = setup.bars
    const n = bars.length
    const L = layoutBars(bars)
    const fireIdx = Math.min(Math.max(setup.signalBarIndex, 0), n - 1)
    const pivotIdx = setup.pivotBarIndex
    const strong = new Set(setup.strongBarIndices ?? [])
    curBarCount = n
    curFireIdx = fireIdx
    fireRevealT = revealTimeFor(fireIdx, n, fireIdx)

    const col = new THREE.Color()
    for (let k = 0; k < COUNT; k++) {
      const bi = (Math.random() * n) | 0
      const g = L[bi]
      const [hx, hy, hz] = sampleCandlePoint(g)
      const j = k * 4
      homeArr[j] = hx
      homeArr[j + 1] = hy
      homeArr[j + 2] = hz
      homeArr[j + 3] = revealTimeFor(bi, n, fireIdx)
      // colour precedence: fire gold → pivot cyan → strong purple → dir
      if (bi === fireIdx) col.copy(C_GOLD)
      else if (pivotIdx != null && bi === pivotIdx) col.copy(C_CYAN)
      else if (strong.has(bi)) col.copy(C_PURPLE)
      else col.copy(bars[bi].c >= bars[bi].o ? C_TEAL : C_RED)
      colors[k * 3] = col.r
      colors[k * 3 + 1] = col.g
      colors[k * 3 + 2] = col.b
    }
    homeTex.needsUpdate = true
    colorAttr.needsUpdate = true
    const fg = L[fireIdx]
    firePos.set(fg.x, fg.body.cy, 0)
  }

  function captionFor(ct: number, setup: FeaturedSetup): string {
    if (ct < REVEAL_LEAD) return "scanning the tape…"
    if (ct >= DISSOLVE_START) return "next setup loading…"
    let revealed = 0
    for (let i = 0; i < curBarCount; i++) {
      if (revealTimeFor(i, curBarCount, curFireIdx) < ct) revealed++
    }
    if (revealed >= curBarCount) return "setup complete — read the tape"
    if (revealed === curFireIdx + 1) {
      return setup.direction === "long" ? "FIRE — long" : "FIRE — short"
    }
    if (revealed === 0) return "scanning the tape…"
    return `forming · ${revealed} bars`
  }

  let setupIdx = 0
  loadSetup(0)
  onUpdate({ setupIndex: 0, caption: "scanning the tape…" })

  const timer = new Timer()
  let cycleStart = 0
  let lastCaption = ""
  const pointer = { x: 0, y: 0 }
  const onPointer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2
    pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2
  }
  el.addEventListener("pointermove", onPointer)

  // Pause the loop while the hero is scrolled out of view.
  let visible = true
  const io = new ResizeObserver(() => {
    const nw = el.clientWidth
    const nh = el.clientHeight
    if (!nw || !nh) return
    camera.aspect = nw / nh
    camera.updateProjectionMatrix()
    renderer.setSize(nw, nh)
    composer.setSize(nw, nh)
  })
  io.observe(el)
  const vis = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true
    },
    { threshold: 0.01 },
  )
  vis.observe(el)

  const FIXED_DT = 0.022
  let acc = 0
  let raf = 0

  const loop = () => {
    raf = requestAnimationFrame(loop)
    timer.update()
    if (!visible) {
      acc = 0
      return
    }
    const t = timer.getElapsed()
    let ct = t - cycleStart
    if (ct >= CYCLE) {
      setupIdx = (setupIdx + 1) % setups.length
      loadSetup(setupIdx)
      cycleStart = t
      ct = 0
    }

    const setup = setups[setupIdx]
    const shock =
      10.0 * Math.exp(-Math.pow((ct - fireRevealT) / 0.32, 2))

    velVar.material.uniforms.uCycleTime.value = ct
    velVar.material.uniforms.uTime.value = t
    velVar.material.uniforms.uShock.value = shock

    // Substep the sim so convergence is framerate-independent.
    acc += Math.min(timer.getDelta(), 0.12)
    let n = 0
    while (acc >= FIXED_DT && n < 16) {
      gpu.compute()
      acc -= FIXED_DT
      n++
    }
    if (n >= 16) acc = 0

    mat.uniforms.texturePosition.value =
      gpu.getCurrentRenderTarget(posVar).texture
    points.rotation.y = Math.sin(t * 0.14) * 0.3
    camera.position.set(
      Math.sin(t * 0.09) * 1.7 + pointer.x * 0.9,
      1.2 - pointer.y * 0.7,
      12.8,
    )
    camera.lookAt(0, 0.1, 0)
    composer.render()

    const caption = captionFor(ct, setup)
    if (caption !== lastCaption) {
      lastCaption = caption
      onUpdate({ setupIndex: setupIdx, caption })
    }
  }
  loop()

  return {
    dispose() {
      cancelAnimationFrame(raf)
      io.disconnect()
      vis.disconnect()
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

/* ---------- React component ----------------------------------------- */

function webgl2Supported(): boolean {
  if (typeof document === "undefined") return false
  try {
    return !!document.createElement("canvas").getContext("webgl2")
  } catch {
    return false
  }
}

export function ParticleHero({ setups }: { setups?: FeaturedSetup[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [update, setUpdate] = useState<ReelUpdate>({
    setupIndex: 0,
    caption: "scanning the tape…",
  })

  const liveSetups = setups && setups.length > 0 ? setups : null

  const enabled = useMemo(() => {
    if (typeof window === "undefined") return false
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    return !reduced && webgl2Supported()
  }, [])

  const useParticles = !!liveSetups && enabled

  useEffect(() => {
    if (!useParticles || !liveSetups) return
    const el = containerRef.current
    if (!el) return
    let handle: ReelHandle | null = null
    try {
      handle = createParticleReel(el, liveSetups, setUpdate)
    } catch (err) {
      console.error("[ParticleHero] engine failed", err)
    }
    return () => handle?.dispose()
  }, [useParticles, liveSetups])

  // Fallback: existing animated tape (handles its own reduced-motion).
  if (!useParticles) {
    return <HeroSetupTape setups={liveSetups ?? undefined} />
  }

  const setup = liveSetups![Math.min(update.setupIndex, liveSetups!.length - 1)]
  const scorePct = Math.round(setup.urgency * 10)
  const isFire = update.caption.startsWith("FIRE")

  return (
    <section
      aria-label="Featured Brooks Price Action setup"
      className="relative w-full border-b border-border overflow-hidden bg-[#080808]"
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        aria-hidden
      />
      {/* readable scrim so chrome text holds over the particles */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,8,8,0.72) 0%, rgba(8,8,8,0) 26%, rgba(8,8,8,0) 70%, rgba(8,8,8,0.78) 100%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto flex h-[380px] max-w-[1400px] flex-col justify-between px-4 py-5 sm:h-[470px] sm:px-6 sm:py-6 lg:h-[560px] lg:px-10 lg:py-8">
        {/* top strip */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-mono text-[12px] sm:text-[13px] tabular-nums tracking-tight flex items-baseline gap-2">
            <span className="font-semibold text-text">{setup.symbol}</span>
            <span className="text-sub">·</span>
            <span className="text-sub">{setup.timeframe}</span>
            <span className="text-sub">·</span>
            <span className="text-sub">{setup.sessionLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            {liveSetups!.length > 1 && (
              <div className="flex items-center gap-[5px]" aria-hidden>
                {liveSetups!.map((_, i) => (
                  <span
                    key={i}
                    className={[
                      "h-[5px] w-[5px] rounded-full transition-all duration-300",
                      i === update.setupIndex
                        ? "scale-[1.15] bg-teal"
                        : "scale-100 bg-border",
                    ].join(" ")}
                  />
                ))}
              </div>
            )}
            <SignalBadge signal={setup.signal} />
          </div>
        </div>

        {/* bottom strip */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div
            className={[
              "rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.13em] tabular-nums transition-colors duration-200",
              isFire
                ? "bg-yellow/20 text-yellow"
                : "bg-black/55 text-text",
            ].join(" ")}
            aria-live="polite"
          >
            {update.caption}
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="text-sub uppercase tracking-[0.13em]">
              model{" "}
              <span className="font-semibold text-teal">{scorePct}%</span>
            </span>
            <Link
              href={setup.deepDiveHref ?? `/symbol/${setup.symbol}`}
              className="rounded border border-border bg-black/55 px-2.5 py-1 text-text transition-colors hover:border-teal hover:text-teal"
            >
              deep dive on {setup.symbol} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
