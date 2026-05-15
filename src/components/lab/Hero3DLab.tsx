"use client"

/**
 * Hero 3D Lab — WebGL prototype gallery (NOT shipped).
 *
 * Three real Three.js scenes, each a candidate centerpiece for the
 * home-page hero:
 *
 *   A. Candle sculpture   — the chart as glowing 3D geometry, orbited.
 *   B. Particle assembly  — candles resolve out of a swarm of points.
 *   C. Price terrain      — price action as a rolling wireframe world.
 *
 * Each scene is a self-contained factory: it owns its renderer, its
 * RAF loop, and its teardown. Delete src/components/lab + src/app/lab
 * once a direction is chosen.
 */

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"

const { Timer } = THREE

/* ---------- shared data + helpers ----------------------------------- */

interface OHLC {
  o: number
  h: number
  l: number
  c: number
}

// 12-bar TFO story: drift to a low (pivot), three bull bars, fire,
// continuation. Same shape as the CSS lab so the two are comparable.
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

const CHART_W = 7.4
const PRICE_H = 3.6

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

interface CandleGeom {
  i: number
  x: number
  up: boolean
  close: number
  colW: number
  body: { cy: number; h: number }
  wick: { cy: number; h: number }
}

function layout(candles: OHLC[]): CandleGeom[] {
  const n = candles.length
  const lo = Math.min(...candles.map((c) => c.l))
  const hi = Math.max(...candles.map((c) => c.h))
  const mid = (lo + hi) / 2
  const span = hi - lo
  const sx = CHART_W / (n - 1)
  const y = (p: number) => ((p - mid) / span) * PRICE_H
  return candles.map((c, i) => {
    const bodyTop = y(Math.max(c.o, c.c))
    const bodyBot = y(Math.min(c.o, c.c))
    const wickTop = y(c.h)
    const wickBot = y(c.l)
    return {
      i,
      x: (i - (n - 1) / 2) * sx,
      up: c.c >= c.o,
      close: y(c.c),
      colW: sx,
      body: { cy: (bodyTop + bodyBot) / 2, h: Math.max(bodyTop - bodyBot, 0.06) },
      wick: { cy: (wickTop + wickBot) / 2, h: Math.max(wickTop - wickBot, 0.06) },
    }
  })
}

interface SceneHandle {
  dispose: () => void
}
type SceneFactory = (el: HTMLElement, reducedMotion: boolean) => SceneHandle

/** Boilerplate every scene shares: renderer, bloom composer, resize. */
function makeStage(el: HTMLElement, bloomStrength: number) {
  const w = el.clientWidth || 800
  const h = el.clientHeight || 450
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0b0b)
  scene.fog = new THREE.Fog(0x0b0b0b, 10, 30)
  const camera = new THREE.PerspectiveCamera(44, w / h, 0.1, 120)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  el.appendChild(renderer.domElement)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  // Higher threshold so only genuine highlights bloom — keeps the
  // geometry crisp instead of smearing the whole object into light.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    bloomStrength,
    0.4,
    0.2,
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

/* ===================================================================
 * SCENE A — CANDLE SCULPTURE
 * The chart as glowing extruded geometry, slow camera orbit, EMA tube.
 * ================================================================= */

const sceneCandleSculpture: SceneFactory = (el, rm) => {
  const { scene, camera, renderer, composer, ro } = makeStage(el, 0.42)

  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const key = new THREE.PointLight(0xffffff, 90, 70)
  key.position.set(5, 9, 8)
  scene.add(key)
  const rim = new THREE.PointLight(0x6affd6, 45, 60)
  rim.position.set(-8, 4, -6)
  scene.add(rim)

  const L = layout(CANDLES)
  const group = new THREE.Group()
  scene.add(group)

  const upMat = new THREE.MeshStandardMaterial({
    color: 0x0c8f6e,
    emissive: 0x00c896,
    emissiveIntensity: 0.32,
    metalness: 0.6,
    roughness: 0.28,
  })
  const downMat = new THREE.MeshStandardMaterial({
    color: 0x8f3030,
    emissive: 0xe05555,
    emissiveIntensity: 0.32,
    metalness: 0.6,
    roughness: 0.28,
  })
  const wickGeo = new THREE.BoxGeometry(0.055, 1, 0.055)
  const bodyGeos: THREE.BoxGeometry[] = []
  const candles: {
    body: THREE.Mesh
    wick: THREE.Mesh
    g: CandleGeom
  }[] = []

  for (const g of L) {
    const mat = g.up ? upMat : downMat
    const bodyGeo = new THREE.BoxGeometry(g.colW * 0.62, 1, 0.46)
    bodyGeos.push(bodyGeo)
    const body = new THREE.Mesh(bodyGeo, mat)
    body.position.set(g.x, g.body.cy, 0)
    body.scale.y = g.body.h
    const wick = new THREE.Mesh(wickGeo, mat)
    wick.position.set(g.x, g.wick.cy, 0)
    wick.scale.y = g.wick.h
    group.add(body, wick)
    candles.push({ body, wick, g })
  }

  // EMA-style tube through the closes.
  const tubeGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(
      L.map((g) => new THREE.Vector3(g.x, g.close + 0.05, 0.36)),
    ),
    90,
    0.04,
    8,
    false,
  )
  const tubeMat = new THREE.MeshBasicMaterial({
    color: 0x9bffe6,
    transparent: true,
    opacity: 0,
  })
  group.add(new THREE.Mesh(tubeGeo, tubeMat))

  // Westworld blueprint floor.
  const grid = new THREE.GridHelper(40, 80, 0x00c896, 0x0e2a22)
  grid.position.y =
    Math.min(...L.map((g) => g.wick.cy - g.wick.h / 2)) - 0.75
  const gm = grid.material as THREE.Material
  gm.transparent = true
  gm.opacity = 0.34
  scene.add(grid)

  const timer = new Timer()
  const pointer = { x: 0, y: 0 }
  const onPointer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2
    pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2
  }
  el.addEventListener("pointermove", onPointer)

  const CYCLE = 8.5
  let raf = 0
  const render = (still: boolean) => {
    const t = still ? 6 : timer.getElapsed()
    const ct = t % CYCLE
    for (const { body, wick, g } of candles) {
      const p = easeOutCubic(clamp((ct - g.i * 0.17) / 0.66, 0, 1))
      body.scale.y = Math.max(g.body.h * p, 1e-4)
      wick.scale.y = Math.max(g.wick.h * p, 1e-4)
    }
    tubeMat.opacity = easeOutCubic(clamp((ct - 2.6) / 1.7, 0, 1)) * 0.9
    const ang = still ? 0.7 : t * 0.14
    camera.position.set(
      Math.sin(ang) * 9.3 + pointer.x * 0.7,
      2.9 - pointer.y * 0.6,
      Math.cos(ang) * 9.3,
    )
    camera.lookAt(0, 0.25, 0)
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
      bodyGeos.forEach((g) => g.dispose())
      wickGeo.dispose()
      tubeGeo.dispose()
      tubeMat.dispose()
      upMat.dispose()
      downMat.dispose()
      grid.geometry.dispose()
      gm.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

/* ===================================================================
 * SCENE B — PARTICLE ASSEMBLY
 * Thousands of points swarm in from a sphere and resolve into the
 * candles, hold, then disperse. Westworld title-sequence vocabulary.
 * ================================================================= */

const sceneParticleAssembly: SceneFactory = (el, rm) => {
  const { scene, camera, renderer, composer, ro } = makeStage(el, 0.62)

  const L = layout(CANDLES)
  const N = 6500
  const home = new Float32Array(N * 3)
  const scatter = new Float32Array(N * 3)
  const color = new Float32Array(N * 3)
  const delay = new Float32Array(N)
  const cUp = new THREE.Color(0x00d6a0)
  const cDown = new THREE.Color(0xe0608a)

  for (let k = 0; k < N; k++) {
    const g = L[Math.floor(Math.random() * L.length)]
    let hx: number, hy: number, hz: number
    if (Math.random() < 0.84) {
      hx = g.x + (Math.random() - 0.5) * g.colW * 0.62
      hy = g.body.cy + (Math.random() - 0.5) * g.body.h
      hz = (Math.random() - 0.5) * 0.46
    } else {
      hx = g.x + (Math.random() - 0.5) * 0.08
      hy = g.wick.cy + (Math.random() - 0.5) * g.wick.h
      hz = (Math.random() - 0.5) * 0.08
    }
    home[k * 3] = hx
    home[k * 3 + 1] = hy
    home[k * 3 + 2] = hz

    const u = Math.random() * 2 - 1
    const th = Math.random() * Math.PI * 2
    const r = 9 + Math.random() * 9
    const s = Math.sqrt(1 - u * u)
    scatter[k * 3] = Math.cos(th) * s * r
    scatter[k * 3 + 1] = u * r * 0.6
    scatter[k * 3 + 2] = Math.sin(th) * s * r

    const col = g.up ? cUp : cDown
    color[k * 3] = col.r
    color[k * 3 + 1] = col.g
    color[k * 3 + 2] = col.b
    delay[k] = (g.i / L.length) * 1.5 + Math.random() * 0.45
  }

  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(scatter)
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geo.setAttribute("color", new THREE.BufferAttribute(color, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.06,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geo, mat)
  scene.add(points)

  const timer = new Timer()
  const pointer = { x: 0, y: 0 }
  const onPointer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2
    pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2
  }
  el.addEventListener("pointermove", onPointer)

  const CYCLE = 7.4
  let raf = 0
  const render = (still: boolean) => {
    const t = still ? 4 : timer.getElapsed()
    const ct = t % CYCLE
    for (let k = 0; k < N; k++) {
      let a: number
      if (ct < 3.4) {
        a = easeOutCubic(clamp((ct - delay[k]) / 1.6, 0, 1))
      } else if (ct < 5.1) {
        a = 1
      } else {
        a = 1 - easeInOutCubic(clamp((ct - 5.1) / 1.9, 0, 1))
      }
      const j = k * 3
      pos[j] = scatter[j] + (home[j] - scatter[j]) * a
      pos[j + 1] = scatter[j + 1] + (home[j + 1] - scatter[j + 1]) * a
      pos[j + 2] = scatter[j + 2] + (home[j + 2] - scatter[j + 2]) * a
    }
    geo.attributes.position.needsUpdate = true
    points.rotation.y = still ? 0.2 : t * 0.05
    camera.position.set(
      Math.sin(t * 0.12) * 1.6 + pointer.x * 0.8,
      1.5 - pointer.y * 0.6,
      11.6,
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

/* ===================================================================
 * SCENE C — PRICE TERRAIN
 * Price action becomes a rolling wireframe landscape — a Westworld
 * blueprint world the data lives inside.
 * ================================================================= */

const scenePriceTerrain: SceneFactory = (el, rm) => {
  const { scene, camera, renderer, composer, ro } = makeStage(el, 0.5)
  scene.fog = new THREE.Fog(0x0b0b0b, 8, 22)

  const TW = 20
  const TD = 13
  const SX = 116
  const SZ = 74
  const geo = new THREE.PlaneGeometry(TW, TD, SX, SZ)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00c896,
    wireframe: true,
    transparent: true,
    opacity: 0.52,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.x = -Math.PI / 2
  scene.add(mesh)

  const posAttr = geo.attributes.position as THREE.BufferAttribute
  const base = Float32Array.from(posAttr.array)
  const closes = CANDLES.map((c) => c.c)
  const cLo = Math.min(...closes)
  const cHi = Math.max(...closes)

  // Price ridge sampled across the terrain's X axis.
  const ridge = (gx: number) => {
    const f = clamp((gx + TW / 2) / TW, 0, 1)
    const idx = f * (closes.length - 1)
    const i0 = Math.floor(idx)
    const i1 = Math.min(i0 + 1, closes.length - 1)
    const v = closes[i0] + (closes[i1] - closes[i0]) * (idx - i0)
    return ((v - cLo) / (cHi - cLo)) * 2 - 1 // -1..1
  }

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
    const t = still ? 3 : timer.getElapsed()
    const arr = posAttr.array as Float32Array
    for (let j = 0; j < arr.length; j += 3) {
      const gx = base[j]
      const gy = base[j + 1]
      arr[j + 2] =
        ridge(gx) * 1.7 +
        0.24 * Math.sin(gx * 0.7 + t * 0.7) +
        0.17 * Math.sin(gy * 0.95 - t * 0.5) +
        0.1 * Math.sin((gx + gy) * 1.35 + t * 0.95)
    }
    posAttr.needsUpdate = true
    camera.position.set(
      Math.sin(t * 0.09) * 3 + pointer.x * 1.2,
      4.4 - pointer.y * 0.9,
      9.2,
    )
    camera.lookAt(0, 0.3, -1)
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
      console.error("[hero-3d-lab] scene failed", err)
    }
    return () => handle?.dispose()
  }, [factory])
  return <div ref={ref} className="absolute inset-0" />
}

const PANELS: {
  letter: string
  title: string
  desc: string
  factory: SceneFactory
}[] = [
  {
    letter: "A",
    title: "Candle sculpture",
    desc: "The chart as real 3D geometry — glowing extruded candles with an EMA ribbon, on a blueprint floor, under a slow cinematic orbit. The literal “cool 3D chart.”",
    factory: sceneCandleSculpture,
  },
  {
    letter: "B",
    title: "Particle assembly",
    desc: "6,500 points swarm in from the dark and resolve into the candles, hold, then disperse. The chart builds itself out of light — Westworld title vocabulary.",
    factory: sceneParticleAssembly,
  },
  {
    letter: "C",
    title: "Price terrain",
    desc: "Price action becomes a rolling wireframe landscape the data lives inside — atmospheric, abstract, a blueprint world rather than a literal chart.",
    factory: scenePriceTerrain,
  },
]

export function Hero3DLab() {
  return (
    <div className="min-h-[100dvh] bg-bg px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-teal">
          internal · not shipped · webgl
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-text sm:text-[32px]">
          Hero 3D Lab
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-sub">
          Three real Three.js prototypes for the hero centerpiece. Each
          loops on its own and reacts to your cursor. Pick the direction
          that grabs you and I&apos;ll build it out full-size on the
          actual chart hero.
        </p>

        <div className="mt-8 flex flex-col gap-7">
          {PANELS.map((p) => (
            <div
              key={p.letter}
              className="overflow-hidden rounded-xl border border-border bg-surface"
            >
              <div className="relative h-[300px] w-full bg-[#0b0b0b] sm:h-[440px]">
                <ThreeTile factory={p.factory} />
                <div className="pointer-events-none absolute left-4 top-3 font-mono text-[11px] uppercase tracking-[0.16em] text-teal/80">
                  {p.letter}
                </div>
              </div>
              <div className="border-t border-border p-4 sm:p-5">
                <h2 className="text-[15px] font-semibold text-text">
                  {p.letter}. {p.title}
                </h2>
                <p className="mt-1.5 max-w-[680px] text-[13px] leading-relaxed text-sub">
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
