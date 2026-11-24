// The 3D dice tray (VTTER-79): three.js drawing, cannon-es physics, mouse gather and release.
// This module is loaded lazily, so three.js and cannon-es stay out of the Test roller's first load.
// Everything that decides a result lives in ../engine and is unit tested; this file only moves and draws dice.
import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { readDie, type Quat } from '../engine/diceReading'
import { trayScale, type DieResult, type PoolDie } from '../engine/dicePool'
import type { DiceStyle } from '../engine/diceStyle'
import { freeSpot, mouseVelocity, throwFromSamples, THROW, type MouseSample } from '../engine/diceThrow'
import { atlasLayout, faceUV, solidFor, type Solid } from '../engine/polyhedra'
import { drawAtlas } from './diceTexture'
import { DiceSound } from './sound'

/** idle: dice on the table. held: gathered under the cursor. rolling: in flight. settled: result read. */
export type Phase = 'idle' | 'held' | 'rolling' | 'settled'

export interface SceneCallbacks {
  /** The dice were released (or the Roll button pressed): archive the previous result. */
  onRelease(): void
  /** Dice came to rest. `full` is false when only re-thrown dice are reported. */
  onSettled(results: Map<string, DieResult>, full: boolean): void
  onPhase(phase: Phase): void
}

export interface DiceScene {
  setDice(dice: PoolDie[]): void
  setStyles(resolve: (kind: PoolDie['kind']) => DiceStyle): void
  /** Throw the whole pool without the mouse. */
  rollAll(): void
  /** Throw one die again (for example a cocked one). Returns false if it is no longer in the tray. */
  rethrow(id: string): boolean
  reset(): void
  setMuted(muted: boolean): void
  /** Call from a click or key press so the browser lets sound play. */
  unlockSound(): void
  dispose(): void
}

// Base tray half-sizes in world units (the tray grows with the pool, see trayScale), and physics tuning.
// Dice are 2.6-3.1 units across.
const BASE_HX = 11
const BASE_HZ = 6.8
const CEILING = 16
const GRAVITY = -55
const GATHER_MARGIN = 2.4
const COOLDOWN_MS = 700
const MAX_ROLL_MS = 10000
const MAX_RENDER_PIXELS = 1_500_000
const MIN_QUALITY = 0.6

type Wall = 'floor' | 'wall'

interface Die {
  spec: PoolDie
  solid: Solid
  body: CANNON.Body
  mesh: THREE.Mesh
  offset: THREE.Vector3
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const randomQuat = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)))

function feltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(256, 230, 20, 256, 256, 380)
  grad.addColorStop(0, '#34724f')
  grad.addColorStop(1, '#16382a')
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 512)
  // Fine speckle so the cloth does not look like flat plastic.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createScene(canvas: HTMLCanvasElement, cb: SceneCallbacks, muted: boolean): DiceScene {
  // Throws when WebGL is unavailable: the caller then shows the plain roller.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x2b1d13) // the table the tray sits on
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envMap
  scene.environmentIntensity = 0.75
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(-7, 22, 9)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.02
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 120)

  // Current half-sizes of the table. They change when the pool grows or shrinks.
  let HX = BASE_HX
  let HZ = BASE_HZ
  let tableScale = 1

  // Physics world and materials.
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) })
  world.allowSleep = true
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.defaultContactMaterial.friction = 0.35
  const dieMat = new CANNON.Material('die')
  const floorMat = new CANNON.Material('floor')
  const wallMat = new CANNON.Material('wall')
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, floorMat, { friction: 0.42, restitution: 0.32 }))
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, wallMat, { friction: 0.12, restitution: 0.55 }))
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.3, restitution: 0.4 }))
  const fixed = new Map<CANNON.Body, Wall>()
  let wallBodies: CANNON.Body[] = []
  const addPlane = (kind: Wall, material: CANNON.Material, at: [number, number, number], euler: [number, number, number]) => {
    const b = new CANNON.Body({ mass: 0, material, shape: new CANNON.Plane() })
    b.position.set(...at)
    b.quaternion.setFromEuler(...euler)
    world.addBody(b)
    fixed.set(b, kind)
    return b
  }
  addPlane('floor', floorMat, [0, 0, 0], [-Math.PI / 2, 0, 0])
  addPlane('wall', wallMat, [0, CEILING, 0], [Math.PI / 2, 0, 0])

  // Table: felt floor and a wooden frame around it, rebuilt whenever the tray changes size.
  const felt = feltTexture()
  const feltMat = new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95, metalness: 0 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a24, roughness: 0.6 })
  const tableGroup = new THREE.Group()
  scene.add(tableGroup)

  function applyTableScale(next: number) {
    if (next === tableScale && tableGroup.children.length > 0) return
    tableScale = next
    HX = BASE_HX * next
    HZ = BASE_HZ * next

    for (const child of [...tableGroup.children]) {
      tableGroup.remove(child)
      ;(child as THREE.Mesh).geometry.dispose()
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 4, HZ * 2 + 4), feltMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    tableGroup.add(floor)
    const rails: [number, number, number, number][] = [
      [0, HZ + 0.55, HX * 2 + 2.2, 1.1], [0, -HZ - 0.55, HX * 2 + 2.2, 1.1],
      [-HX - 0.55, 0, 1.1, HZ * 2], [HX + 0.55, 0, 1.1, HZ * 2],
    ]
    for (const [x, z, w, d] of rails) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), wood)
      m.position.set(x, 0.45, z)
      m.castShadow = m.receiveShadow = true
      tableGroup.add(m)
    }

    Object.assign(sun.shadow.camera, { left: -HX - 3, right: HX + 3, top: HZ + 3, bottom: -HZ - 3, near: 2, far: 70 })
    sun.shadow.camera.updateProjectionMatrix()

    for (const b of wallBodies) { world.removeBody(b); fixed.delete(b) }
    wallBodies = [
      addPlane('wall', wallMat, [-HX, 0, 0], [0, Math.PI / 2, 0]),
      addPlane('wall', wallMat, [HX, 0, 0], [0, -Math.PI / 2, 0]),
      addPlane('wall', wallMat, [0, 0, -HZ], [0, 0, 0]),
      addPlane('wall', wallMat, [0, 0, HZ], [0, Math.PI, 0]),
    ]
    resize()
  }

  const sound = new DiceSound(muted)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Shared drawing resources.
  const geometries = new Map<string, THREE.BufferGeometry>()
  const textures = new Map<string, THREE.CanvasTexture>()
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  let resolveStyle: (kind: PoolDie['kind']) => DiceStyle = () => ({ body: '#7a4fb5', number: '#ffffff', finish: 'opaque' })

  function geometryFor(solid: Solid): THREE.BufferGeometry {
    const hit = geometries.get(solid.kind)
    if (hit) return hit
    const layout = atlasLayout(solid)
    const pos: number[] = []
    const nor: number[] = []
    const uv: number[] = []
    solid.faces.forEach((face, fi) => {
      const pts = layout.frames[fi].points
      for (let k = 1; k < face.indices.length - 1; k++) {
        for (const idx of [0, k, k + 1]) {
          pos.push(...solid.vertices[face.indices[idx]])
          nor.push(...face.normal)
          uv.push(...faceUV(layout, fi, pts[idx]))
        }
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geometries.set(solid.kind, g)
    return g
  }

  function materialFor(die: PoolDie): THREE.MeshStandardMaterial {
    const style = resolveStyle(die.kind)
    const mode = die.role === 'tens' ? 'tens' : 'plain'
    const texKey = `${die.solid}|${mode}|${style.body}|${style.number}`
    let tex = textures.get(texKey)
    if (!tex) {
      tex = new THREE.CanvasTexture(drawAtlas(solidFor(die.solid), style, mode).canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      textures.set(texKey, tex)
    }
    const matKey = `${texKey}|${style.finish}`
    let mat = materials.get(matKey)
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.05 })
      if (style.finish === 'translucent') Object.assign(mat, { transparent: true, opacity: 0.8, roughness: 0.15 })
      if (style.finish === 'metallic') Object.assign(mat, { metalness: 0.8, roughness: 0.28 })
      materials.set(matKey, mat)
    }
    return mat
  }

  function clearStyleCache() {
    textures.forEach(t => t.dispose())
    materials.forEach(m => m.dispose())
    textures.clear()
    materials.clear()
  }

  // The dice.
  let dice: Die[] = []
  let phase: Phase = 'idle'
  let rolling: Set<string> | null = null
  let rollTime = 0
  let rollStartedAt = 0
  let stillTime = 0
  let settledAt = -Infinity
  const cursor = new THREE.Vector3()
  let samples: MouseSample[] = []
  let cursorSpeed = 0
  let pointerType: string | null = null

  function setPhase(next: Phase) {
    if (phase === next) return
    phase = next
    cb.onPhase(next)
  }

  function createDie(spec: PoolDie): Die {
    const solid = solidFor(spec.solid)
    const shape = new CANNON.ConvexPolyhedron({
      vertices: solid.vertices.map(v => new CANNON.Vec3(...v)),
      faces: solid.faces.map(f => [...f.indices]),
    })
    const body = new CANNON.Body({
      mass: solid.radius ** 3 * 0.5,
      material: dieMat,
      shape,
      allowSleep: true,
      sleepSpeedLimit: 0.8,
      sleepTimeLimit: 0.4,
      linearDamping: 0.2,
      angularDamping: 0.4,
    })
    body.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      const other = fixed.get(e.body)
      if (!other && body.id > e.body.id) return // count a pair of dice once
      sound.impact(other ?? 'dice', Math.abs(e.contact.getImpactVelocityAlongNormal()))
    })
    const mesh = new THREE.Mesh(geometryFor(solid), materialFor(spec))
    mesh.castShadow = true
    scene.add(mesh)
    world.addBody(body)
    return { spec, solid, body, mesh, offset: new THREE.Vector3() }
  }

  function removeDice() {
    for (const d of dice) {
      world.removeBody(d.body)
      scene.remove(d.mesh)
    }
    dice = []
  }

  function dropPile() {
    dice.forEach((d, i) => {
      const x = ((i % 6) - 2.5) * 3.1 + rand(-0.3, 0.3)
      const z = (Math.floor(i / 6) - 1.2) * 3.1 + rand(-0.3, 0.3)
      d.body.position.set(x, 2.5 + (i % 2) * 1.5, z)
      d.body.quaternion.copy(randomQuat() as unknown as CANNON.Quaternion)
      d.body.velocity.setZero()
      d.body.angularVelocity.set(rand(-4, 4), rand(-4, 4), rand(-4, 4))
      d.body.wakeUp()
    })
    rolling = null
    setPhase('idle')
  }

  function gather() {
    dice.forEach((d, i) => {
      const r = 1.25 * Math.sqrt(i + 0.6)
      const a = i * 2.399
      d.offset.set(Math.cos(a) * r, 3 + (i % 3) * 1.25, Math.sin(a) * r * 0.85)
      d.body.wakeUp()
    })
    rolling = null
    setPhase('held')
  }

  function drop() {
    if (phase === 'held') setPhase('idle')
  }

  function beginRoll(ids: Set<string> | null) {
    rolling = ids
    rollTime = 0
    rollStartedAt = performance.now()
    stillTime = 0
    setPhase('rolling')
  }

  function release(at: number) {
    if (phase !== 'held' || dice.length === 0) return
    const t = throwFromSamples(samples, at)
    const base = Math.atan2(t.vz, t.vx)
    for (const d of dice) {
      const angle = base + rand(-0.14, 0.14)
      const speed = t.speed * rand(0.85, 1.15)
      d.body.velocity.set(Math.cos(angle) * speed, rand(4, 7) + t.speed * 0.08, Math.sin(angle) * speed)
      const spin = 8 + t.speed * 0.55
      d.body.angularVelocity.set(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin))
      d.body.wakeUp()
    }
    cb.onRelease()
    beginRoll(null)
  }

  function rollAll() {
    if (dice.length === 0) return
    dice.forEach((d, i) => {
      d.body.position.set(-HX + 2.4 + rand(0, 1.2), 2.5 + (i % 4) * 1.3, rand(-HZ + 2.5, HZ - 2.5))
      d.body.quaternion.copy(randomQuat() as unknown as CANNON.Quaternion)
      d.body.velocity.set(rand(22, 32), rand(3, 6), rand(-9, 9))
      d.body.angularVelocity.set(rand(-16, 16), rand(-16, 16), rand(-16, 16))
      d.body.wakeUp()
    })
    cb.onRelease()
    beginRoll(null)
  }

  function rethrow(id: string): boolean {
    const d = dice.find(x => x.spec.id === id)
    if (!d) return false
    // Drop the die where nothing covers it: the spot with the most room around it, away from the other dice.
    const others = dice.filter(x => x !== d).map(x => ({ x: x.body.position.x, z: x.body.position.z, r: x.solid.radius }))
    const spot = freeSpot(others, HX, HZ, d.solid.radius + 0.6)
    d.body.position.set(spot.x, 4.5, spot.z)
    d.body.quaternion.copy(randomQuat() as unknown as CANNON.Quaternion)
    d.body.velocity.set(rand(-2.5, 2.5), rand(0, 2), rand(-2.5, 2.5)) // a short tumble, so it stays in its clear spot
    d.body.angularVelocity.set(rand(-12, 12), rand(-12, 12), rand(-12, 12))
    d.body.wakeUp()
    if (phase === 'rolling' && rolling) {
      // Several dice re-thrown together: keep watching all of them.
      rolling.add(id)
      stillTime = 0
    } else {
      beginRoll(new Set([id]))
    }
    return true
  }

  function readSettled(): Map<string, DieResult> {
    const out = new Map<string, DieResult>()
    for (const d of dice) {
      if (rolling && !rolling.has(d.spec.id)) continue
      const q = d.body.quaternion
      const r = readDie(d.solid, [q.x, q.y, q.z, q.w] as Quat)
      out.set(d.spec.id, { value: r.value, cocked: r.cocked })
    }
    return out
  }

  function checkSettled(dt: number) {
    rollTime += dt
    const active = dice.filter(d => !rolling || rolling.has(d.spec.id))
    const still = active.every(d => d.body.sleepState === CANNON.Body.SLEEPING
      || (d.body.velocity.length() < 0.35 && d.body.angularVelocity.length() < 0.5))
    stillTime = still ? stillTime + dt : 0
    // Wall-clock cap: on a slow machine the simulation runs slower than real time, and the roll must still end.
    if ((rollTime > 0.4 && stillTime > 0.4) || performance.now() - rollStartedAt > MAX_ROLL_MS) {
      for (const d of active) {
        d.body.velocity.setZero()
        d.body.angularVelocity.setZero()
        d.body.sleep()
      }
      const full = rolling === null
      cb.onSettled(readSettled(), full)
      rolling = null
      settledAt = performance.now()
      setPhase('settled')
    }
  }

  // Aim arrow: direction and strength of the throw while the dice are held.
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 3, 0xffffff, 1, 0.7)
  arrow.visible = false
  scene.add(arrow)

  // Pointer handling.
  const raycaster = new THREE.Raycaster()
  const table = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const ndc = new THREE.Vector2()
  const hit = new THREE.Vector3()

  function track(e: PointerEvent) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    if (!raycaster.ray.intersectPlane(table, hit)) return
    cursor.set(
      Math.max(-HX + GATHER_MARGIN, Math.min(HX - GATHER_MARGIN, hit.x)),
      0,
      Math.max(-HZ + GATHER_MARGIN, Math.min(HZ - GATHER_MARGIN, hit.z)),
    )
    const now = e.timeStamp // when the mouse moved, not when a slow frame got around to handling it
    samples.push({ x: hit.x, z: hit.z, t: now })
    samples = samples.filter(s => now - s.t < 250)
    const v = mouseVelocity(samples, now)
    cursorSpeed = Math.hypot(v.vx, v.vz)
  }

  const canGather = (cooldown: number) => (phase === 'idle' || phase === 'settled') && dice.length > 0
    && performance.now() - settledAt > cooldown

  function onMove(e: PointerEvent) {
    pointerType = e.pointerType
    track(e)
    if (e.pointerType === 'mouse' && canGather(COOLDOWN_MS)) gather()
  }
  function onDown(e: PointerEvent) {
    pointerType = e.pointerType
    sound.unlock()
    track(e)
    if (e.pointerType === 'mouse') {
      if (phase === 'held') release(e.timeStamp)
      else if (canGather(COOLDOWN_MS)) { gather(); release(e.timeStamp) }
    } else {
      canvas.setPointerCapture(e.pointerId)
      if (canGather(300)) gather()
    }
  }
  function onUp(e: PointerEvent) {
    if (e.pointerType === 'mouse') return
    track(e)
    if (phase === 'held') release(e.timeStamp)
  }
  function onLeave(e: PointerEvent) {
    if (e.pointerType === 'mouse') { drop(); arrow.visible = false }
  }
  function onCancel() { drop(); arrow.visible = false }
  canvas.style.touchAction = 'none'
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('pointercancel', onCancel)

  // Sizing: fit the whole tray, frame included, in the view at any aspect ratio.
  // Rendering scale. The expanded tray covers the whole window, so cap the pixels drawn, and step the scale down
  // if the frame rate stays low. It never goes back up, so it can't flicker between two sizes.
  let quality = Math.min(window.devicePixelRatio || 1, 2)
  function applyQuality(w: number, h: number) {
    renderer.setPixelRatio(Math.min(quality, Math.sqrt(MAX_RENDER_PIXELS / (w * h))))
    renderer.setSize(w, h, false)
  }
  function resize() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    applyQuality(w, h)
    camera.aspect = w / h
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => new THREE.Vector3(sx * (HX + 1.2), 0, sz * (HZ + 1.2)))
    let dist = 30
    for (let i = 0; i < 8; i++) {
      camera.position.set(0, dist, dist * 0.24)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      const worst = Math.max(...corners.map(c => { const p = c.clone().project(camera); return Math.max(Math.abs(p.x), Math.abs(p.y)) }))
      dist *= worst / 0.97
    }
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  // The loop.
  const target = new THREE.Vector3()
  function update(dt: number) {
    if (phase === 'held') {
      const k = reduceMotion ? 24 : 10
      const jiggle = Math.min(1, cursorSpeed / 18) * 9
      for (const d of dice) {
        target.copy(cursor).add(d.offset)
        const p = d.body.position
        const v = new THREE.Vector3(target.x - p.x, target.y - p.y, target.z - p.z).multiplyScalar(k)
        if (v.length() > 55) v.setLength(55)
        d.body.velocity.set(v.x, v.y, v.z)
        d.body.angularVelocity.scale(0.92, d.body.angularVelocity)
        if (jiggle > 0) d.body.angularVelocity.vadd(new CANNON.Vec3(rand(-jiggle, jiggle), rand(-jiggle, jiggle), rand(-jiggle, jiggle)), d.body.angularVelocity)
        d.body.wakeUp()
      }
    }
    if (phase === 'rolling') {
      // Rolling friction: felt stops a die that has slowed down on the table (a round d20 would roll for far too long).
      // A fast die is left alone, so a hard throw carries across the tray before it starts to settle.
      for (const d of dice) {
        if (d.body.position.y > d.solid.radius * 1.05) continue
        const v = Math.hypot(d.body.velocity.x, d.body.velocity.z)
        const w = Math.min(1, Math.max(0, (9 - v) / 4)) // none above 9 units/s, full below 5
        if (w === 0) continue
        d.body.angularVelocity.scale(Math.pow(0.02, dt * w), d.body.angularVelocity)
        const slide = Math.pow(0.12, dt * w)
        d.body.velocity.x *= slide
        d.body.velocity.z *= slide
      }
    }
    // At most 3 steps a frame: when the frame rate drops the dice slow down a little instead of the page stalling.
    world.step(1 / 75, dt, 3)

    for (const d of dice) {
      const p = d.body.position
      if (Math.abs(p.x) > HX + 1 || Math.abs(p.z) > HZ + 1 || p.y < -3 || p.y > CEILING + 2) {
        // Never let a die leave the tray.
        d.body.position.set(0, 4, 0)
        d.body.velocity.setZero()
      }
      d.mesh.position.set(p.x, p.y, p.z)
      d.mesh.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w)
    }
    if (phase === 'rolling') checkSettled(dt)

    const showArrow = phase === 'held' && cursorSpeed > THROW.stillSpeed && pointerType !== null
    arrow.visible = showArrow
    if (showArrow) {
      const v = mouseVelocity(samples, performance.now())
      const len = Math.hypot(v.vx, v.vz)
      if (len > 0) {
        arrow.position.set(cursor.x, 0.15, cursor.z)
        arrow.setDirection(new THREE.Vector3(v.vx / len, 0, v.vz / len))
        arrow.setLength(Math.min(THROW.maxSpeed, Math.max(THROW.minSpeed, len)) * 0.22, 1, 0.7)
      }
    }
  }

  let raf = 0
  let last = performance.now()
  let frameTime = 1 / 60
  let qualityCheck = last + 2000 // let the first frames and shader compiles pass
  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const raw = (now - last) / 1000
    const dt = Math.min(0.05, raw)
    last = now
    // Smoothed frame time; after a second of frames slower than ~35 fps, draw fewer pixels.
    frameTime = frameTime * 0.95 + Math.min(raw, 0.2) * 0.05
    if (now - qualityCheck > 1000) {
      qualityCheck = now
      if (frameTime > 1 / 35 && quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality * 0.8)
        resize()
      }
    }
    update(dt)
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(frame)

  return {
    setDice(specs) {
      removeDice()
      applyTableScale(trayScale(specs.length))
      dice = specs.map(createDie)
      dropPile()
      settledAt = performance.now() - COOLDOWN_MS
    },
    setStyles(resolve) {
      resolveStyle = resolve
      clearStyleCache()
      for (const d of dice) d.mesh.material = materialFor(d.spec)
    },
    rollAll,
    rethrow,
    reset() {
      const specs = dice.map(d => d.spec)
      removeDice()
      dice = specs.map(createDie)
      dropPile()
    },
    setMuted(m) { sound.muted = m },
    unlockSound() { sound.unlock() },
    dispose() {
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointercancel', onCancel)
      removeDice()
      geometries.forEach(g => g.dispose())
      clearStyleCache()
      felt.dispose()
      feltMat.dispose()
      wood.dispose()
      envMap.dispose()
      pmrem.dispose()
      sound.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
