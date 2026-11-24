// Die geometry and face values for the 3D dice tray (VTTER-79).
// Pure math, no rendering. The tray draws these solids and reads the result back from them.

export type Vec3 = [number, number, number]
export type Vec2 = [number, number]

/** The dice a player can add to the pool. A d100 is a tens d10 plus a units d10. */
export type DieKind = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'
/** The physical solids. The d100's two dice are both `d10` solids. */
export type SolidKind = Exclude<DieKind, 'd100'>

export const DIE_KINDS: readonly DieKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

export interface Face {
  /** Vertex indices, counter-clockwise when seen from outside. */
  indices: number[]
  /** Outward unit normal. */
  normal: Vec3
  /** Mean of the face's vertices. */
  center: Vec3
  /**
   * Number on this face. For every die but the d4 it is the number you read when the face is up.
   * For the d4 it is the number at the vertex opposite this face, which is the top vertex when
   * this face is down.
   */
  value: number
}

export interface Solid {
  kind: SolidKind
  vertices: Vec3[]
  faces: Face[]
  /** d4 only: the number printed at each vertex. */
  vertexValues?: number[]
  /** Distance from the center to the farthest vertex. */
  radius: number
}

/** Circumradius of each solid in tray units. Chosen so the dice look in proportion to each other. */
const RADIUS: Record<SolidKind, number> = { d4: 1.5, d6: 1.3, d8: 1.35, d10: 1.45, d12: 1.45, d20: 1.55 }

const PHI = (1 + Math.sqrt(5)) / 2
const EPS = 1e-6

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a))

function signCombos(): Vec3[] {
  const out: Vec3[] = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push([x, y, z])
  return out
}

/** Pentagonal trapezohedron (the d10): two apexes and a zigzag ring of ten vertices. */
function trapezohedron(): Vec3[] {
  const ringZ = 0.1
  const c = Math.cos(Math.PI / 5)
  // Makes each kite face exactly flat: H = z * (1 + cos 36°) / (1 - cos 36°).
  const apex = ringZ * (1 + c) / (1 - c)
  const vs: Vec3[] = [[0, 0, apex], [0, 0, -apex]]
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5
    vs.push([Math.cos(a), Math.sin(a), k % 2 === 0 ? ringZ : -ringZ])
  }
  return vs
}

function baseVertices(kind: SolidKind): Vec3[] {
  switch (kind) {
    case 'd4': return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]
    case 'd6': return signCombos()
    case 'd8': return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
    case 'd10': return trapezohedron()
    case 'd12': {
      const a = 1 / PHI
      const vs = signCombos()
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        vs.push([0, s * a, t * PHI], [s * a, t * PHI, 0], [t * PHI, 0, s * a])
      }
      return vs
    }
    case 'd20': {
      const vs: Vec3[] = []
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        vs.push([0, s, t * PHI], [s, t * PHI, 0], [t * PHI, 0, s])
      }
      return vs
    }
  }
}

interface RawFace { indices: number[]; normal: Vec3 }

/** Convex hull faces of a small point set: every plane with all points on one side. */
function hullFaces(vs: Vec3[]): RawFace[] {
  const found = new Map<string, RawFace>()
  const n = vs.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const c = cross(sub(vs[j], vs[i]), sub(vs[k], vs[i]))
        const len = length(c)
        if (len < EPS) continue
        const normal = scale(c, 1 / len)
        const d = dot(normal, vs[i])
        let pos = 0
        let neg = 0
        const on: number[] = []
        for (let m = 0; m < n; m++) {
          const side = dot(normal, vs[m]) - d
          if (Math.abs(side) < EPS) on.push(m)
          else if (side > 0) pos++
          else neg++
        }
        if (pos > 0 && neg > 0) continue
        const key = on.join(',')
        if (found.has(key)) continue
        found.set(key, { indices: on, normal: pos > 0 ? scale(normal, -1) : normal })
      }
    }
  }
  return [...found.values()]
}

/** Order a face's vertices counter-clockwise around its outward normal. */
function orderFace(vs: Vec3[], raw: RawFace): number[] {
  const center = faceCenter(vs, raw.indices)
  const a = normalize(sub(vs[raw.indices[0]], center))
  const b = cross(raw.normal, a)
  const angle = (i: number) => {
    const p = sub(vs[i], center)
    return Math.atan2(dot(p, b), dot(p, a))
  }
  return [...raw.indices].sort((p, q) => angle(p) - angle(q))
}

function faceCenter(vs: Vec3[], indices: number[]): Vec3 {
  const sum = indices.reduce<Vec3>((acc, i) => [acc[0] + vs[i][0], acc[1] + vs[i][1], acc[2] + vs[i][2]], [0, 0, 0])
  return scale(sum, 1 / indices.length)
}

/** Number each face. Opposite faces add up to the usual total (7 on a d6, 21 on a d20, 9 on a d10 marked 0-9). */
function assignValues(kind: SolidKind, faces: Face[]) {
  if (kind === 'd4') return
  const low = kind === 'd10' ? 0 : 1
  const pairSum = 2 * low + faces.length - 1
  const given = new Set<number>()
  let next = low
  faces.forEach((face, i) => {
    if (given.has(i)) return
    const opposite = faces.findIndex((f, j) => j !== i && !given.has(j) && dot(f.normal, face.normal) < -0.99)
    face.value = next
    given.add(i)
    if (opposite >= 0) {
      faces[opposite].value = pairSum - next
      given.add(opposite)
    }
    next++
  })
}

const cache = new Map<SolidKind, Solid>()

/** Build (once) the solid for a die: vertices scaled to its radius, faces numbered. */
export function solidFor(kind: SolidKind): Solid {
  const hit = cache.get(kind)
  if (hit) return hit
  const raw = baseVertices(kind)
  const k = RADIUS[kind] / Math.max(...raw.map(length))
  const vertices = raw.map(v => scale(v, k))
  const faces: Face[] = hullFaces(vertices).map(f => {
    const indices = orderFace(vertices, f)
    return { indices, normal: f.normal, center: faceCenter(vertices, indices), value: 0 }
  })
  const solid: Solid = { kind, vertices, faces, radius: RADIUS[kind] }
  if (kind === 'd4') {
    solid.vertexValues = [1, 2, 3, 4]
    for (const f of faces) {
      const opposite = vertices.findIndex((_, i) => !f.indices.includes(i))
      f.value = solid.vertexValues[opposite]
    }
  } else {
    assignValues(kind, faces)
  }
  cache.set(kind, solid)
  return solid
}

/** Which solid a die kind is drawn with. */
export function solidKindOf(kind: DieKind): SolidKind {
  return kind === 'd100' ? 'd10' : kind
}

// ---------------------------------------------------------------- texture layout

export interface FaceFrame {
  /** Face-plane axes: `up` points toward the face's apex, `right` completes a right-handed set with the normal. */
  right: Vec3
  up: Vec3
  /** The face's vertices in (right, up) coordinates around its center. */
  points: Vec2[]
  /** Distance from the center to the nearest edge. */
  inradius: number
  /** Distance from the center to the farthest vertex. */
  circumradius: number
}

/** The vertex a number's top should point at: the sharp apex of a d10 kite, otherwise the first vertex. */
function apexIndex(solid: Solid, face: Face): number {
  if (solid.kind !== 'd10') return face.indices[0]
  return face.indices.reduce((best, i) => (Math.abs(solid.vertices[i][2]) > Math.abs(solid.vertices[best][2]) ? i : best))
}

export function faceFrame(solid: Solid, faceIndex: number): FaceFrame {
  const face = solid.faces[faceIndex]
  const toApex = sub(solid.vertices[apexIndex(solid, face)], face.center)
  const up = normalize(sub(toApex, scale(face.normal, dot(toApex, face.normal))))
  const right = cross(up, face.normal)
  const points = face.indices.map((i): Vec2 => {
    const p = sub(solid.vertices[i], face.center)
    return [dot(p, right), dot(p, up)]
  })
  let inradius = Infinity
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]
    const ex = q[0] - p[0]
    const ey = q[1] - p[1]
    inradius = Math.min(inradius, Math.abs(ex * p[1] - ey * p[0]) / Math.hypot(ex, ey))
  })
  return { right, up, points, inradius, circumradius: Math.max(...points.map(p => Math.hypot(p[0], p[1]))) }
}

export interface AtlasLayout {
  cols: number
  rows: number
  /** Face-plane units covered by one square atlas cell. */
  unitsPerCell: number
  frames: FaceFrame[]
}

/** One square atlas cell per face, every face drawn at the same scale. */
export function atlasLayout(solid: Solid): AtlasLayout {
  const frames = solid.faces.map((_, i) => faceFrame(solid, i))
  const cols = Math.ceil(Math.sqrt(solid.faces.length))
  const rows = Math.ceil(solid.faces.length / cols)
  const unitsPerCell = (2 * Math.max(...frames.map(f => f.circumradius))) / 0.94
  return { cols, rows, unitsPerCell, frames }
}

/** Texture coordinate (0-1, v up) for a face-plane point of a face. */
export function faceUV(layout: AtlasLayout, faceIndex: number, p: Vec2): Vec2 {
  const col = faceIndex % layout.cols
  const row = Math.floor(faceIndex / layout.cols)
  const u = (col + 0.5) / layout.cols + p[0] / (layout.unitsPerCell * layout.cols)
  const yDown = (row + 0.5) / layout.rows - p[1] / (layout.unitsPerCell * layout.rows)
  return [u, 1 - yDown]
}
