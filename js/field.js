// Field — same closure algebra as draw.js, showing finished shapes.
// Slider controls resolution for ALL shapes uniformly.
// Switching shapes morphs the cloud. Slider rebuilds in place.

(function () {
const canvas  = document.getElementById("field-canvas");
if (!canvas) return;
const ctx     = canvas.getContext("2d");
const titleEl = document.getElementById("shape-title");
const descEl  = document.getElementById("shape-desc");
const readout = document.getElementById("readout");

let W = 520, H = 520, CX = 260, CY = 260, R = 190;
let yaw = 0.78, pitch = 0.45;
let dragging = false, lastX = 0, lastY = 0;
let autoRotate = true;
let wPhase = 0;

// Resolution — same variables as draw.js, driven by the sliders
let edgeDivs = 20;
let faceRows = 16;
let faceCols = 24;

// draw.js shape constants
const CUBE_DEPTH    = 0.74;
const BODY_X_SCALE  = 1.46;
const BODY_Y_SCALE  = 0.46;
const BODY_Z_SCALE  = 0.88;
const BODY_Y_OFFSET = -0.08;
const WHEEL_RADIUS  = 0.145;
const WHEEL_WIDTH   = 0.055;
const WHEEL_SPOKES  = 5;

function cubeFaceRows() { return Math.max(4, Math.round(faceRows * 0.78)); }
function cubeFaceCols() { return Math.max(6, Math.round(faceCols * 0.62)); }
function carCabinRows() { return Math.max(5, Math.round(faceRows * 0.78)); }
function carCabinCols() { return Math.max(4, Math.round(faceRows * 0.44)); }

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  W = Math.round((rect.width  || 520) * dpr);
  H = Math.round((rect.height || 520) * dpr);
  canvas.width = W; canvas.height = H;
  CX = W / 2; CY = H / 2;
  R = Math.min(W, H) * 0.36;
}
resize();
addEventListener("resize", resize);

// ── Closure algebra — identical to draw.js ────────────────

function mul(a, b) {
  return [
    a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
    a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
    a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
    a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0],
  ];
}
function inv(q)  { return [q[0], -q[1], -q[2], -q[3]]; }
function norm(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0]/n, q[1]/n, q[2]/n, q[3]/n];
}
function axisAngle(axis, theta) {
  const n = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const h = theta / 2, s = Math.sin(h) / n;
  return [Math.cos(h), axis[0]*s, axis[1]*s, axis[2]*s];
}
function action(q, p) {
  const r = mul(mul(q, [0, p[0], p[1], p[2]]), inv(q));
  return [r[1], r[2], r[3], p[3] ?? 0.6];
}
function qPow(q, n) {
  let out = [1,0,0,0];
  for (let i = 0; i < n; i++) out = norm(mul(out, q));
  return out;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(x) { x = Math.max(0, Math.min(1, x)); return x*x*(3-2*x); }
function fmt(q) { return `[${q.map(x => x.toFixed(4)).join(", ")}]`; }
function fmtOps(ops) {
  return ops.map((op, i) => `${String(i + 1).padStart(2, "0")}. ${op}`).join("\n");
}

function phaseBar(value) {
  const n = 18;
  const phase = ((value % 1) + 1) % 1;
  const pos = Math.floor(phase * n);
  let out = "";
  for (let i = 0; i < n; i++) out += i === pos ? "●" : "·";
  return out;
}

function hash32(text, seed) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

function quatFromText(text) {
  const q = [0, 1, 2, 3].map(i => (hash32(text, 0x9e3779b9 * (i + 1)) / 0xffffffff) * 2 - 1);
  return norm(q);
}

function signalFromProgram(ops) {
  let q = [1, 0, 0, 0];
  for (const op of ops) q = norm(mul(q, quatFromText(op)));
  return q;
}

function line(a, b, n, color) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t), color]);
  }
  return pts;
}

function cloudMorph(from, to, u) {
  const pts = [];
  for (let i = 0; i < to.length; i++) {
    const a = from[i % from.length], b = to[i];
    pts.push([lerp(a[0],b[0],u), lerp(a[1],b[1],u), lerp(a[2],b[2],u), lerp(a[3]??0.6, b[3]??0.6, u)]);
  }
  return pts;
}

// ── Shape functions — copied exactly from draw.js ─────────

function squareVertices() {
  const P = [0.52, 0, 0, 0.66];
  const q = axisAngle([0,0,1], Math.PI / 2);
  const pts = [];
  for (let k = 0; k < 4; k++) pts.push(action(qPow(q, k), P));
  return { pts, q };
}

function squareEdges(vertices) {
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const a = vertices[i], b = vertices[(i+1)%4];
    pts.push(...line(a, b, edgeDivs, 0.66));
  }
  return pts;
}

function cubeFaces(front, back) {
  const pts = [];
  const n = cubeFaceRows();
  const faces = [
    [front[0], front[1], front[2], front[3], 0.52],
    [back[0],  back[1],  back[2],  back[3],  0.38],
    [front[0], front[1], back[1],  back[0],  0.45],
    [front[1], front[2], back[2],  back[1],  0.45],
    [front[2], front[3], back[3],  back[2],  0.45],
    [front[3], front[0], back[0],  back[3],  0.45],
  ];
  for (const [a,b,c,d,col] of faces) {
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const L  = [lerp(a[0],d[0],s), lerp(a[1],d[1],s), lerp(a[2],d[2],s), col];
      const Rv = [lerp(b[0],c[0],s), lerp(b[1],c[1],s), lerp(b[2],c[2],s), col];
      pts.push(...line(L, Rv, cubeFaceCols(), col));
    }
  }
  return pts;
}

function boxSurfaceGrid(center, half, color, nu, nv) {
  const pts = [];
  const faces = [
    [[ half[0],0,0],[0,half[1],0],[0,0,half[2]]],
    [[-half[0],0,0],[0,half[1],0],[0,0,half[2]]],
    [[0, half[1],0],[half[0],0,0],[0,0,half[2]]],
    [[0,-half[1],0],[half[0],0,0],[0,0,half[2]]],
    [[0,0, half[2]],[half[0],0,0],[0,half[1],0]],
    [[0,0,-half[2]],[half[0],0,0],[0,half[1],0]],
  ];
  for (const [origin, axA, axB] of faces) {
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const a=(i/nu)*2-1, b=(j/nv)*2-1;
        pts.push([center[0]+origin[0]+axA[0]*a+axB[0]*b,
                  center[1]+origin[1]+axA[1]*a+axB[1]*b,
                  center[2]+origin[2]+axA[2]*a+axB[2]*b, color]);
      }
    }
  }
  return pts;
}

function rotateAroundZ(p, phase) {
  const c = Math.cos(phase), s = Math.sin(phase);
  return [p[0]*c - p[1]*s, p[0]*s + p[1]*c, p[2], p[3]];
}

function wheelLocalPoint(i, color) {
  if (i < WHEEL_SPOKES * 5) {
    const spoke = Math.floor(i/5), t = (i%5+1)/5, a = spoke*Math.PI*2/WHEEL_SPOKES;
    return [Math.cos(a)*WHEEL_RADIUS*t, Math.sin(a)*WHEEL_RADIUS*t, (i%2===0)?-WHEEL_WIDTH:WHEEL_WIDTH, color];
  }
  const j = i-WHEEL_SPOKES*5, a = Math.PI*2*((j*0.61803398875)%1);
  return [Math.cos(a)*WHEEL_RADIUS, Math.sin(a)*WHEEL_RADIUS, (((j*0.41421356237)%1)*2-1)*WHEEL_WIDTH, color];
}

function cubeToBody(cubePts) {
  const root = Math.SQRT1_2;
  return cubePts.map(p => {
    const rx = (p[0]+p[1])*root, ry = (-p[0]+p[1])*root, rz = p[2]-0.37;
    return [rx*BODY_X_SCALE, ry*BODY_Y_SCALE+BODY_Y_OFFSET, rz*BODY_Z_SCALE, 0.66];
  });
}

function normalize3(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0]/n, v[1]/n, v[2]/n];
}

function cross3(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ];
}

function add3(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function sub3(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function scale3(v, s) { return [v[0]*s, v[1]*s, v[2]*s]; }

function boxBetween(a, b, halfY, halfZ, color, rows, cols) {
  const ex = normalize3(sub3(b, a));
  const length = Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]);
  const reference = Math.abs(ex[2]) < 0.9 ? [0,0,1] : [0,1,0];
  const ey = normalize3(cross3(reference, ex));
  const ez = normalize3(cross3(ex, ey));
  const center = scale3(add3(a, b), 0.5);
  const faces = [
    [ length/2, 0,      0,      ey, ez],
    [-length/2, 0,      0,      ey, ez],
    [ 0,        halfY,  0,      ex, ez],
    [ 0,       -halfY,  0,      ex, ez],
    [ 0,        0,      halfZ,  ex, ey],
    [ 0,        0,     -halfZ,  ex, ey],
  ];
  const pts = [];
  for (const [ox, oy, oz, axA, axB] of faces) {
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= cols; j++) {
        const u = (i / rows) * 2 - 1;
        const v = (j / cols) * 2 - 1;
        const p = add3(center,
          add3(
            add3(scale3(ex, ox), add3(scale3(ey, oy), scale3(ez, oz))),
            add3(scale3(axA, u * (axA === ex ? length/2 : halfY)),
                 scale3(axB, v * (axB === ez ? halfZ : halfY)))
          )
        );
        pts.push([p[0], p[1], p[2], color]);
      }
    }
  }
  return pts;
}

function ball(center, radius, color, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const u = (i * 0.61803398875) % 1;
    const v = (i * 0.41421356237) % 1;
    const phi = Math.acos(1 - 2*u);
    const theta = Math.PI * 2 * v;
    pts.push([
      center[0] + radius * Math.sin(phi) * Math.cos(theta),
      center[1] + radius * Math.cos(phi),
      center[2] + radius * Math.sin(phi) * Math.sin(theta),
      color,
    ]);
  }
  return pts;
}

// ── Shapes ────────────────────────────────────────────────

function makeSphere() {
  // Same principle as the square in draw.js: close a circle with qz,
  // then tilt the seed to each latitude. Resolution from sliders.
  const NLon = Math.max(8, edgeDivs * 2);
  const MLat = Math.max(6, faceRows);
  const qz = axisAngle([0,0,1], 2*Math.PI / NLon);
  const r = 0.52;
  const pts = [];
  for (let m = 0; m <= MLat; m++) {
    const theta = Math.PI * (m / MLat - 0.5);
    const seed  = [r * Math.cos(theta), 0, r * Math.sin(theta), 0.65];
    for (let n = 0; n < NLon; n++) pts.push(action(qPow(qz, n), seed));
  }
  const ops = [
    "primitive:sphere",
    "seed:[0.52,0,0]",
    "close longitude circle around z",
    "repeat longitude for every latitude",
    "surface:closed shell",
  ];
  return { pts, signal: signalFromProgram(ops), ops };
}

function makeTetra() {
  // Four vertices at equal geodesic distance. Face and edge resolution from sliders.
  const s = 0.52 / Math.sqrt(3);
  const verts = [[s,s,s],[s,-s,-s],[-s,s,-s],[-s,-s,s]];
  const faces  = [[0,1,2],[0,1,3],[0,2,3],[1,2,3]];
  const N = Math.max(6, faceRows);
  const pts = [];
  for (const [ai,bi,ci] of faces) {
    const A = verts[ai], B = verts[bi], C = verts[ci];
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N-i; j++) {
        const r1=i/N, r2=j/N, r3=1-r1-r2;
        if (r3 < 0) continue;
        pts.push([A[0]*r1+B[0]*r2+C[0]*r3, A[1]*r1+B[1]*r2+C[1]*r3,
                  A[2]*r1+B[2]*r2+C[2]*r3, 0.55]);
      }
    }
    for (const [P,Q] of [[A,B],[B,C],[C,A]]) pts.push(...line(P, Q, edgeDivs, 0.66));
  }
  const ops = [
    "primitive:tetrahedron",
    "vertices:four equal-distance diagonal points",
    "faces:four triangular surfaces",
    "edge sampler:between every vertex pair",
    "symmetry:120 degree diagonal rotation",
  ];
  return { pts, signal: signalFromProgram(ops), ops };
}

function makeCube() {
  // Exact draw.js construction: qz closes 4 corners, z-offset adds depth.
  const { pts: front, q: qz } = squareVertices();
  const qx   = axisAngle([1,0,0], Math.PI / 2);
  const back  = front.map(p => [p[0], p[1], p[2] + CUBE_DEPTH, 0.38]);
  const pts   = [...squareEdges(front), ...squareEdges(back).map(p=>[p[0],p[1],p[2],0.38])];
  for (let i = 0; i < 4; i++) pts.push(...line(front[i], back[i], edgeDivs, 0.45));
  pts.push(...cubeFaces(front, back));
  const ops = [
    "primitive:cube",
    "seed:[0.52,0,0]",
    "qz:four corners at pi/2",
    `depth:z+${CUBE_DEPTH}`,
    "faces:six bilinear surface grids",
  ];
  return { pts, signal: signalFromProgram(ops), ops };
}

function makeCar(wheelClock) {
  // Exact draw.js car at full construction.
  const { pts: front, q: qz } = squareVertices();
  const qx   = axisAngle([1,0,0], Math.PI / 2);
  const back  = front.map(p => [p[0], p[1], p[2] + CUBE_DEPTH, 0.38]);
  const cube  = [
    ...squareEdges(front),
    ...squareEdges(back).map(p => [p[0],p[1],p[2],0.38]),
    ...Array.from({length:4}, (_,i) => line(front[i], back[i], edgeDivs, 0.45)).flat(),
    ...cubeFaces(front, back),
  ];
  const body = cubeToBody(cube);

  const cabinBase   = boxSurfaceGrid([0.02,0.005,-0.03],[0.33,0.012,0.22], 0.50, carCabinRows(), carCabinCols());
  const cabinTarget = boxSurfaceGrid([0.02,0.16, -0.03],[0.33,0.16, 0.22], 0.50, carCabinRows(), carCabinCols());
  const cabin = cloudMorph(cabinBase, cabinTarget, 1);

  const centers = [[0.47,-0.265,0.285],[-0.47,-0.265,0.285],[0.47,-0.265,-0.285],[-0.47,-0.265,-0.285]];
  const phase   = wheelClock * 3.2;
  const wheels  = [];
  for (const c of centers) {
    for (let i = 0; i < 96; i++) {
      const lp = wheelLocalPoint(i, 0.24);
      const rp = rotateAroundZ(lp, phase);
      wheels.push([rp[0]+c[0], rp[1]+c[1], rp[2]+c[2], 0.24]);
    }
  }

  const qBody  = axisAngle([0,1,0], Math.PI/10);
  const qCabin = axisAngle([0,0,1], Math.PI/8);
  const qWheel = axisAngle([0,0,1], phase);
  const ops = [
    "object:car",
    "base:cube construction",
    `body-map:scale(${BODY_X_SCALE},${BODY_Y_SCALE},${BODY_Z_SCALE}) offset-y:${BODY_Y_OFFSET}`,
    "cabin:raised box sampler",
    "wheels:four local wheel orbits",
  ];
  const stateOps = [...ops, `W:${phase.toFixed(4)}`];
  return { pts: [...body, ...cabin, ...wheels], signal: signalFromProgram(stateOps), baseSignal: signalFromProgram(ops), ops };
}

function makeRobotArm(clock) {
  const phase = clock * 0.9;
  const shoulder = [0, -0.18, 0];
  const a1 = -0.35 + Math.sin(phase) * 0.42;
  const a2 = 0.55 + Math.sin(phase * 0.73 + 1.0) * 0.55;
  const l1 = 0.48, l2 = 0.38;
  const elbow = [shoulder[0] + Math.cos(a1) * l1, shoulder[1] + Math.sin(a1) * l1, 0];
  const wrist = [elbow[0] + Math.cos(a1 + a2) * l2, elbow[1] + Math.sin(a1 + a2) * l2, 0];
  const gripperDir = normalize3([Math.cos(a1 + a2), Math.sin(a1 + a2), 0]);
  const gripperSide = [-gripperDir[1], gripperDir[0], 0];
  const tip = add3(wrist, scale3(gripperDir, 0.16));

  const pts = [];
  const rows = Math.max(4, Math.round(faceRows * 0.45));
  const cols = Math.max(4, Math.round(faceRows * 0.32));

  pts.push(...boxSurfaceGrid([0, -0.50, 0], [0.18, 0.045, 0.18], 0.40, rows, cols));
  pts.push(...boxBetween([0, -0.50, 0], shoulder, 0.045, 0.045, 0.45, rows, cols));
  pts.push(...ball(shoulder, 0.075, 0.55, Math.max(80, faceRows * 8)));
  pts.push(...boxBetween(shoulder, elbow, 0.045, 0.040, 0.66, rows, cols));
  pts.push(...ball(elbow, 0.060, 0.50, Math.max(70, faceRows * 7)));
  pts.push(...boxBetween(elbow, wrist, 0.038, 0.034, 0.66, rows, cols));
  pts.push(...ball(wrist, 0.045, 0.50, Math.max(50, faceRows * 5)));
  pts.push(...boxBetween(add3(wrist, scale3(gripperSide, 0.040)), add3(tip, scale3(gripperSide, 0.075)), 0.012, 0.018, 0.38, rows, cols));
  pts.push(...boxBetween(add3(wrist, scale3(gripperSide,-0.040)), add3(tip, scale3(gripperSide,-0.075)), 0.012, 0.018, 0.38, rows, cols));

  const ops = [
    "machine:robot-arm",
    "base:fixed pedestal",
    "joint:shoulder angle",
    "link:upper arm",
    "joint:elbow angle",
    "link:forearm",
    "tool:two-finger gripper",
  ];
  const stateOps = [...ops, `time:${phase.toFixed(4)}`, `shoulder:${a1.toFixed(4)}`, `elbow:${a2.toFixed(4)}`];
  return { pts, signal: signalFromProgram(stateOps), baseSignal: signalFromProgram(ops), ops };
}

function rotorDisk(center, radius, phase, spinDir, color) {
  const pts = [];
  const edgeN = Math.max(20, edgeDivs);
  const bladeN = Math.max(8, Math.round(edgeDivs * 0.45));
  for (let i = 0; i < edgeN; i++) {
    const a = Math.PI * 2 * i / edgeN;
    pts.push([center[0] + Math.cos(a) * radius, center[1], center[2] + Math.sin(a) * radius, color]);
  }
  for (let blade = 0; blade < 2; blade++) {
    const a = phase * spinDir + blade * Math.PI;
    const dir = [Math.cos(a), 0, Math.sin(a)];
    const side = [-dir[2], 0, dir[0]];
    for (let i = 0; i <= bladeN; i++) {
      const t = i / bladeN;
      const width = 0.018 * (1 - t * 0.45);
      const p = add3(center, scale3(dir, radius * t));
      pts.push([p[0] + side[0]*width, p[1], p[2] + side[2]*width, color]);
      pts.push([p[0] - side[0]*width, p[1], p[2] - side[2]*width, color]);
    }
  }
  return pts;
}

function makeDrone(clock) {
  const phase = clock * 7.5;
  const pts = [];
  const rows = Math.max(4, Math.round(faceRows * 0.42));
  const cols = Math.max(4, Math.round(faceRows * 0.34));
  const centers = [
    [ 0.44, 0,  0.34],
    [-0.44, 0,  0.34],
    [ 0.44, 0, -0.34],
    [-0.44, 0, -0.34],
  ];

  pts.push(...boxSurfaceGrid([0,0,0], [0.22,0.055,0.14], 0.66, rows, cols));
  for (const c of centers) {
    pts.push(...boxBetween([0,0,0], c, 0.018, 0.018, 0.45, rows, cols));
  }
  centers.forEach((c, i) => {
    pts.push(...ball(c, 0.045, 0.50, Math.max(40, faceRows * 4)));
    pts.push(...rotorDisk([c[0], c[1] + 0.035, c[2]], 0.135, phase, i % 2 === 0 ? 1 : -1, 0.38));
  });

  const ops = [
    "machine:drone",
    "body:central hull",
    "arms:four support beams",
    "rotors:four spinning disks",
    "motion:opposite rotors counter-spin",
  ];
  const stateOps = [...ops, `time:${phase.toFixed(4)}`];
  return { pts, signal: signalFromProgram(stateOps), baseSignal: signalFromProgram(ops), ops };
}

function ellipsoidSurface(center, radii, color, lon, lat, phase = 0, ripple = 0) {
  const pts = [];
  for (let m = 0; m <= lat; m++) {
    const v = m / lat;
    const phi = Math.PI * (v - 0.5);
    for (let n = 0; n < lon; n++) {
      const u = n / lon;
      const theta = Math.PI * 2 * u;
      const wave = 1 + ripple * Math.sin(theta * 5 + phase) * Math.cos(phi * 3 - phase * 0.7);
      pts.push([
        center[0] + radii[0] * wave * Math.cos(phi) * Math.cos(theta),
        center[1] + radii[1] * wave * Math.sin(phi),
        center[2] + radii[2] * wave * Math.cos(phi) * Math.sin(theta),
        color,
      ]);
    }
  }
  return pts;
}

function makeCell(clock) {
  const phase = clock * 1.4;
  const lon = Math.max(18, edgeDivs * 2);
  const lat = Math.max(8, faceRows);
  const pts = [];

  pts.push(...ellipsoidSurface([0,0,0], [0.58,0.36,0.43], 0.62, lon, lat, phase, 0.035));
  pts.push(...ellipsoidSurface([-0.08,0.02,0.02], [0.17,0.12,0.14], 0.50, Math.max(14, edgeDivs), Math.max(6, Math.round(faceRows * 0.55)), phase, 0.012));

  const organelles = [
    [ 0.23,  0.07,  0.12, 0.045],
    [ 0.18, -0.10, -0.20, 0.038],
    [-0.26, -0.06,  0.17, 0.036],
    [-0.32,  0.12, -0.08, 0.030],
    [ 0.03, -0.16,  0.22, 0.032],
  ];
  for (const [x,y,z,r] of organelles) {
    const pulse = 1 + 0.12 * Math.sin(phase + x * 8 + z * 5);
    pts.push(...ball([x,y,z], r * pulse, 0.38, Math.max(28, faceRows * 3)));
  }

  for (let i = 0; i < Math.max(18, edgeDivs); i++) {
    const u = (i * 0.61803398875) % 1;
    const v = (i * 0.41421356237) % 1;
    const phi = Math.PI * (v - 0.5);
    const theta = Math.PI * 2 * u;
    const end = [
      0.55 * Math.cos(phi) * Math.cos(theta),
      0.33 * Math.sin(phi),
      0.40 * Math.cos(phi) * Math.sin(theta),
    ];
    pts.push(...line([-0.08,0.02,0.02,0.45], [end[0],end[1],end[2],0.45], Math.max(5, Math.round(edgeDivs * 0.35)), 0.45));
  }

  const ops = [
    "bio:cell",
    "membrane:closed ellipsoid surface",
    "nucleus:inner closed surface",
    "organelles:local closed bodies",
    "cytoskeleton:radial transport paths",
  ];
  const stateOps = [...ops, `time:${phase.toFixed(4)}`];
  return { pts, signal: signalFromProgram(stateOps), baseSignal: signalFromProgram(ops), ops };
}

function curvedBranch(start, angle, length, depth, color, pts, phase, side = 1, paths = null) {
  const steps = Math.max(5, Math.round(edgeDivs * 0.32));
  const bend = 0.16 * side;
  let prev = start;
  const path = [start];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = angle + bend * Math.sin(t * Math.PI);
    const p = [
      start[0] + Math.cos(a) * length * t,
      start[1] + Math.sin(a) * length * t,
      start[2] + Math.sin(t * Math.PI * 1.7 + phase + depth) * 0.035 * depth,
      color,
    ];
    pts.push(...line(prev, p, 2, color));
    prev = p;
    path.push(p);
  }
  if (paths) paths.push(path);
  if (depth > 0) {
    curvedBranch(prev, angle + 0.52, length * 0.62, depth - 1, color, pts, phase, side, paths);
    curvedBranch(prev, angle - 0.48, length * 0.58, depth - 1, color, pts, phase, -side, paths);
  }
}

function dendritePoint(start, angle, length, phase, side, t) {
  const bend = 0.16 * side;
  const a = angle + bend * Math.sin(t * Math.PI);
  return [
    start[0] + Math.cos(a) * length * t,
    start[1] + Math.sin(a) * length * t,
    start[2] + Math.sin(t * Math.PI * 1.7 + phase + 3) * 0.105,
    0.72,
  ];
}

function makeNeuron(clock) {
  const phase = clock * 1.7;
  const pts = [];
  pts.push(...ball([-0.36, 0, 0], 0.14, 0.62, Math.max(140, faceRows * 12)));

  const soma = [-0.36, 0, 0, 0.72];
  const dendriteAngles = [-2.7, -2.25, -1.75, 1.75, 2.25, 2.7, 3.12];
  dendriteAngles.forEach((a, i) => {
    curvedBranch(soma, a, 0.27 + (i % 2) * 0.05, 3, 0.50, pts, phase, i % 2 ? 1 : -1);
  });

  // Deterministic activation cycle:
  // 0.00-0.48: all main dendrites carry a wave inward to the soma.
  // 0.48-0.62: the soma lights up.
  // 0.62-1.00: the axon carries the wave outward.
  const cycle = (phase * 0.075) % 1;
  const dendriteU = Math.min(1, cycle / 0.48);
  if (cycle < 0.58) {
    const pulseT = 1 - dendriteU;
    dendriteAngles.forEach((a, i) => {
      const side = i % 2 ? 1 : -1;
      const length = 0.27 + (i % 2) * 0.05;
      const p0 = dendritePoint(soma, a, length, phase, side, Math.max(0, pulseT - 0.07));
      const p1 = dendritePoint(soma, a, length, phase, side, pulseT);
      const p2 = dendritePoint(soma, a, length, phase, side, Math.min(1, pulseT + 0.07));
      pts.push(...line(p0, p1, 3, 0.72));
      pts.push(...line(p1, p2, 3, 0.72));
      pts.push(...ball(p1, 0.017, 0.72, 14));
    });
  }
  if (cycle >= 0.44 && cycle <= 0.66) {
    const somaGlow = 0.022 + 0.020 * Math.sin(((cycle - 0.44) / 0.22) * Math.PI);
    pts.push(...ball(soma, somaGlow, 0.72, 28));
  }

  const axonSteps = Math.max(42, faceRows * 4);
  const axon = [];
  for (let i = 0; i <= axonSteps; i++) {
    const t = i / axonSteps;
    const x = -0.22 + t * 1.10;
    const y = 0.035 * Math.sin(t * Math.PI * 2.4);
    const z = 0.055 * Math.sin(t * Math.PI * 3.1 + 0.7);
    axon.push([x,y,z,0.66]);
    if (i > 0) pts.push(...line(axon[i-1], axon[i], 2, 0.66));
  }
  for (let i = 4; i < axon.length; i += 7) {
    pts.push(...ball(axon[i], 0.032, 0.38, Math.max(16, Math.round(faceRows * 1.4))));
  }
  if (cycle > 0.58) {
    const axonU = Math.min(1, (cycle - 0.58) / 0.42);
    const i = Math.floor(axonU * (axon.length - 1));
    const i0 = Math.max(0, i - 2);
    const i1 = Math.min(axon.length - 1, i + 2);
    pts.push(...line(axon[i0], axon[i], 3, 0.72));
    pts.push(...line(axon[i], axon[i1], 3, 0.72));
    pts.push(...ball(axon[i], 0.022, 0.72, 22));
  }

  const ops = [
    "bio:neuron",
    "soma:closed cell body",
    "dendrites:recursive branching paths",
    "axon:long signal path",
    "myelin:repeated insulating nodes",
    "motion:dendrite pulses feed soma and axon",
  ];
  const stateOps = [...ops, `time:${phase.toFixed(4)}`];
  return { pts, signal: signalFromProgram(stateOps), baseSignal: signalFromProgram(ops), ops };
}

function makeTissueFold(clock) {
  const phase = clock * 0.9;
  const cols = Math.max(16, edgeDivs * 2);
  const rows = Math.max(10, faceRows);
  const amp = 0.06 + 0.20 * (0.5 + 0.5 * Math.sin(phase));
  const pts = [];
  const grid = [];
  for (let i = 0; i <= cols; i++) {
    grid[i] = [];
    const u = i / cols;
    const x = (u - 0.5) * 1.15;
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const z = (v - 0.5) * 0.74;
      const fold = amp * Math.sin((u * 2.1 + 0.08) * Math.PI) * Math.exp(-Math.pow(z * 1.55, 2));
      const ridge = 0.035 * Math.sin(v * Math.PI * 6 + phase) * Math.sin(u * Math.PI);
      const p = [x, fold + ridge, z, 0.62];
      grid[i][j] = p;
      pts.push(p);
    }
  }
  for (let i = 0; i <= cols; i += Math.max(2, Math.round(cols / 18))) {
    for (let j = 1; j <= rows; j++) pts.push(...line(grid[i][j-1], grid[i][j], 1, 0.45));
  }
  for (let j = 0; j <= rows; j += Math.max(2, Math.round(rows / 10))) {
    for (let i = 1; i <= cols; i++) pts.push(...line(grid[i-1][j], grid[i][j], 1, 0.45));
  }
  for (let k = 0; k < Math.max(80, faceRows * 8); k++) {
    const u = (k * 0.61803398875 + phase * 0.02) % 1;
    const v = (k * 0.41421356237) % 1;
    const x = (u - 0.5) * 1.15;
    const z = (v - 0.5) * 0.74;
    const fold = amp * Math.sin((u * 2.1 + 0.08) * Math.PI) * Math.exp(-Math.pow(z * 1.55, 2));
    const ridge = 0.035 * Math.sin(v * Math.PI * 6 + phase) * Math.sin(u * Math.PI);
    const surfaceLift = 0.018 + 0.012 * Math.sin(u * Math.PI * 2 + phase);
    pts.push([x, fold + ridge + surfaceLift, z, 0.38]);
  }

  const ops = [
    "bio:tissue-fold",
    "sheet:2D cell lattice",
    "field:curvature gradient",
    "neighbors:keep local distances",
    "motion:fold amplitude changes over time",
  ];
  const stateOps = [...ops, `time:${phase.toFixed(4)}`, `fold:${amp.toFixed(4)}`];
  return { pts, signal: signalFromProgram(stateOps), baseSignal: signalFromProgram(ops), ops };
}

function spinePoint(t, phase) {
  const x = -0.52 + 1.04 * t;
  const y = 0.16 * Math.sin((t - 0.12) * Math.PI) - 0.10 * Math.sin(t * Math.PI * 2.1);
  const z = 0.055 * Math.sin(t * Math.PI * 3.0 + phase * 0.35);
  return [x, y, z, 0.66];
}

function makeCiliaWave(clock) {
  const phase = clock * 1.35;
  const ribs = Math.max(30, faceRows * 2);
  const samples = Math.max(10, Math.round(edgeDivs * 0.55));
  const pts = [];
  const spine = [];

  for (let i = 0; i <= ribs; i++) {
    const t = i / ribs;
    const p = spinePoint(t, phase);
    spine.push(p);
    if (i > 0) pts.push(...line(spine[i-1], p, 2, 0.66));
  }

  for (let i = 1; i < ribs; i++) {
    const t = i / ribs;
    const p = spine[i];
    const p0 = spine[Math.max(0, i - 1)];
    const p1 = spine[Math.min(ribs, i + 1)];
    const tangent = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const ribLen = 0.42 * Math.sin(Math.PI * t) * (0.72 + 0.20 * Math.sin(phase + t * 9.0));
    const traveling = Math.sin(phase * 2.2 + t * 13.0);

    for (const side of [-1, 1]) {
      const baseAngle = tangent + side * Math.PI / 2;
      let prev = p;
      for (let j = 1; j <= samples; j++) {
        const u = j / samples;
        const taper = 1 - 0.20 * u;
        const curve = side * 0.54 * Math.sin(u * Math.PI) * traveling;
        const angle = baseAngle + curve;
        const length = ribLen * u * taper;
        const waveZ = 0.07 * u * Math.sin(phase * 2.7 + t * 17.0 + u * 4.5);
        const qBend = axisAngle([0,0,1], angle);
        const local = action(qBend, [length, 0, waveZ, 0.50]);
        const pt = [p[0] + local[0], p[1] + local[1], p[2] + local[2], j === samples ? 0.72 : 0.50];
        pts.push(...line(prev, pt, 2, pt[3]));
        prev = pt;
      }
    }
  }

  for (let k = 0; k < Math.max(70, faceRows * 5); k++) {
    const t = (k * 0.61803398875 + phase * 0.035) % 1;
    const p = spinePoint(t, phase);
    const p2 = spinePoint(Math.min(1, t + 0.01), phase);
    const tangent = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
    const side = k % 2 === 0 ? 1 : -1;
    const angle = tangent + side * Math.PI / 2 + 0.35 * Math.sin(phase + t * 12);
    const len = 0.34 * Math.sin(Math.PI * t) * ((k * 0.41421356237) % 1);
    const q = axisAngle([0,0,1], angle);
    const off = action(q, [len, 0, 0.02 * Math.sin(k + phase), 0.38]);
    pts.push([p[0] + off[0], p[1] + off[1], p[2] + off[2], 0.38]);
  }

  const ops = [
    "bio:cilia-wave",
    "spine:curved carrier path",
    "ribs:paired branch orbits",
    "phase:traveling bend wave",
    "tips:bright endpoints mark direction",
  ];
  const stateOps = [...ops, `time:${phase.toFixed(4)}`];
  return { pts, signal: signalFromProgram(stateOps), baseSignal: signalFromProgram(ops), ops };
}

function ringAroundX(count, x, radius, tubeR, color) {
  const pts = [];
  const steps = Math.max(8, Math.round(faceRows * 0.8));
  for (let k = 0; k < count; k++) {
    const a0 = 2*Math.PI*k/count;
    for (let j = 0; j < steps; j++) {
      const b = 2*Math.PI*j/steps;
      pts.push([x + Math.sin(b)*tubeR, (radius+Math.cos(b)*tubeR)*Math.cos(a0),
                (radius+Math.cos(b)*tubeR)*Math.sin(a0), color]);
    }
  }
  return pts;
}

function helixBundle(strands, x0, length, radius, tubeR, turns, color, phaseOff=0) {
  const steps = Math.max(20, faceRows * 4);
  const ring  = Math.max(4, Math.round(edgeDivs / 5));
  const pts   = [];
  for (let s = 0; s < strands; s++) {
    const base = 2*Math.PI*s/strands + phaseOff;
    for (let k = 0; k < steps; k++) {
      const t = k / steps, a = base + 2*Math.PI*turns*t, x = x0 + length*t;
      for (let j = 0; j < ring; j++) {
        const b = 2*Math.PI*j/ring;
        pts.push([x + Math.sin(b)*tubeR, (radius+Math.cos(b)*tubeR)*Math.cos(a),
                  (radius+Math.cos(b)*tubeR)*Math.sin(a), color]);
      }
    }
  }
  return pts;
}

function makeMotor(phase) {
  const pts = [];
  // Outer shell
  const shellN = Math.max(100, faceRows * 20);
  for (let i = 0; i < shellN; i++) {
    const u = (i*0.61803398875)%1, v = (i*0.41421356237)%1;
    const phi = Math.acos(1-2*u), theta = 2*Math.PI*v;
    const r = 0.22 * (1 + 0.07*Math.sin(5*theta)*Math.cos(3*phi));
    const px = r*Math.cos(phi - Math.PI/2);
    const py = r*Math.sin(phi - Math.PI/2)*Math.cos(theta);
    const pz = r*Math.sin(phi - Math.PI/2)*Math.sin(theta);
    if (px > -0.03) pts.push([px, py, pz, 0.36]);
  }
  // Stator C26
  pts.push(...ringAroundX(26, 0,     0.190, 0.020, 0.42));
  pts.push(...ringAroundX(26, -0.02, 0.145, 0.013, 0.40));
  // MS ring C34 (rotates with W)
  for (let k = 0; k < 34; k++) {
    const a = 2*Math.PI*k/34 + phase;
    const steps = Math.max(6, Math.round(faceRows * 0.6));
    for (let j = 0; j < steps; j++) {
      const b = 2*Math.PI*j/steps;
      const r = 0.115 + Math.cos(b)*0.013;
      pts.push([0.025 + Math.sin(b)*0.013, Math.cos(a)*r, Math.sin(a)*r, 0.56]);
    }
  }
  // C ring C34
  for (let k = 0; k < 34; k++) {
    const a = 2*Math.PI*k/34 + phase + Math.PI/34;
    const steps = Math.max(6, Math.round(faceRows * 0.6));
    for (let j = 0; j < steps; j++) {
      const b = 2*Math.PI*j/steps;
      const r = 0.150 + Math.cos(b)*0.016;
      pts.push([0.09 + Math.sin(b)*0.016, Math.cos(a)*r, Math.sin(a)*r, 0.50]);
    }
  }
  // Hook + filament
  pts.push(...helixBundle(3, -0.22, 0.20, 0.040, 0.010, 1.5, 0.60, phase));
  pts.push(...helixBundle(3, -0.42, 1.10, 0.055, 0.009, 8.0, 0.64, phase));
  const ops = [
    "object:bacterial-motor",
    "stator:C26 fixed ring",
    "rotor:MS C34 ring",
    "c-ring:C34 co-rotating ring",
    "hook:helical connector",
    "filament:three-strand helical bundle",
  ];
  const stateOps = [...ops, `W:${phase.toFixed(4)}`];
  return { pts, signal: signalFromProgram(stateOps), baseSignal: signalFromProgram(ops), ops };
}

function makeBacterium(phase) {
  const NLon = Math.max(8, edgeDivs * 2);
  const NCyl = Math.max(6, faceRows);
  const NCap = Math.max(4, Math.round(faceRows * 0.6));
  const bodyLen = 0.50, bodyR = 0.20;
  const qz = axisAngle([0,0,1], 2*Math.PI / NLon);
  const pts = [];
  for (let n = 0; n < NLon; n++) {
    for (let m = 0; m <= NCyl; m++) {
      const seed = [bodyLen*(m/NCyl*2-1), bodyR, 0, 0.60];
      pts.push(action(qPow(qz, n), seed));
    }
    for (let m = 1; m <= NCap; m++) {
      const theta = Math.PI/2 * m/NCap;
      pts.push(action(qPow(qz, n), [ bodyLen + bodyR*Math.sin(theta), bodyR*Math.cos(theta), 0, 0.60]));
      pts.push(action(qPow(qz, n), [-bodyLen - bodyR*Math.sin(theta), bodyR*Math.cos(theta), 0, 0.60]));
    }
  }
  pts.push(...ringAroundX(10, bodyLen+0.04, 0.09, 0.015, 0.42));
  pts.push(...helixBundle(2, bodyLen+0.08, 1.30, 0.065, 0.010, 7.0, 0.64, phase));
  const ops = [
    "object:bacterium",
    "body:capsule from circle orbits",
    "motor:embedded basal ring",
    "flagellum:helical bundle",
  ];
  const stateOps = [...ops, `W:${phase.toFixed(4)}`];
  return { pts, signal: signalFromProgram(stateOps), baseSignal: signalFromProgram(ops), ops };
}

// ── Shape registry ────────────────────────────────────────

const SHAPES = {
  sphere: { label:"Sphere",      desc:"A compact rule closes circles at many latitudes, so the field becomes a smooth shell.", animated:false, build:()=>makeSphere() },
  tetra:  { label:"Tetrahedron", desc:"Four balanced corner points define four triangular faces. The field fills the closed solid surface between them.", animated:false, build:()=>makeTetra() },
  cube:   { label:"Cube",        desc:"A square rule is copied through depth, then the field samples the six faces of the closed box.", animated:false, build:()=>makeCube() },
  cell:   { label:"Cell",        desc:"A membrane, nucleus, organelles, and transport paths compose into one cell-like field. Time makes the membrane and organelles pulse.", animated:true, build:(ph)=>makeCell(ph) },
  neuron: { label:"Neuron",      desc:"A soma, branching dendrites, axon path, and traveling pulses compose into one neural morphology.", animated:true, build:(ph)=>makeNeuron(ph) },
  tissue: { label:"Tissue Fold", desc:"A flat cell sheet bends under a curvature signal while neighboring points stay connected.", animated:true, build:(ph)=>makeTissueFold(ph) },
  cilia:  { label:"Cilia Wave",  desc:"A central spine sends paired branch orbits outward. Time passes as a traveling bend wave, like coordinated cilia or a feathered flow field.", animated:true, build:(ph)=>makeCiliaWave(ph) },
};

// ── Morph state ───────────────────────────────────────────

let current   = "sphere";
let fromPts   = [];
let targetPts = [];
let morphT    = 1;
let morphStart = 0;
const MORPH_DUR = 0.65;

function buildShape(key, ph) { return SHAPES[key].build(ph ?? 0); }

function switchShape(key) {
  const res   = buildShape(key, wPhase);
  const newPts = res.pts ?? res;
  fromPts  = morphT < 1 ? cloudMorph(fromPts, targetPts, morphT) : (targetPts.length ? targetPts.slice() : newPts);
  targetPts = newPts;
  morphT   = 0;
  morphStart = performance.now() / 1000;
  current  = key;
}

function rebuildInPlace() {
  // Slider changed: rebuild current shape without morph animation
  const res   = buildShape(current, wPhase);
  const newPts = res.pts ?? res;
  fromPts  = newPts;
  targetPts = newPts;
  morphT   = 1;
}

// ── Rendering ─────────────────────────────────────────────

function draw() {
  requestAnimationFrame(draw);
  const now = performance.now() / 1000;
  if (SHAPES[current].animated) wPhase = now * 1.2;

  // Update morph
  if (morphT < 1) {
    morphT = Math.min(1, smooth((now - morphStart) / MORPH_DUR));
    if (SHAPES[current].animated) {
      const res = buildShape(current, wPhase);
      targetPts = res.pts ?? res;
    }
  } else if (SHAPES[current].animated) {
    const res = buildShape(current, wPhase);
    targetPts = res.pts ?? res;
    fromPts   = targetPts;
  }

  const pts = morphT >= 1 ? targetPts : cloudMorph(fromPts, targetPts, morphT);

  const res     = buildShape(current, wPhase);
  const signal = res.signal ?? [1,0,0,0];
  const baseSignal = res.baseSignal ?? signal;
  const ops = res.ops ?? [];
  const shape   = SHAPES[current];
  titleEl.textContent = shape.label;
  descEl.textContent  = shape.desc;
  const programBlock = ops.length ? `\n\nRule being sent:\n${fmtOps(ops)}` : "";
  const phaseLine = `\n\nTime wave:\n${phaseBar(wPhase * 0.12)}  ${(wPhase % 1).toFixed(2)}`;
  const shapeReadout = {
    sphere: `The signal tells the field how to make a closed round shell. The sliders do not change the signal; they only ask for more or fewer samples.\n\nShape signal:\n${fmt(signal)}${programBlock}\n\nVisible dots: ${pts.length}`,
    tetra:  `The signal tells the field where the four corners are and how to fill the triangular faces between them.\n\nShape signal:\n${fmt(signal)}${programBlock}\n\nVisible dots: ${pts.length}`,
    cube:   `The signal starts with a square, gives it depth, then samples the six faces. More resolution means more dots on the same cube.\n\nShape signal:\n${fmt(signal)}${programBlock}\n\nVisible dots: ${pts.length}`,
    cell:   `The base signal defines the cell parts. The time wave pulses the membrane and internal bodies without changing the identity of the cell.\n\nBase signal:\n${fmt(baseSignal)}${phaseLine}${programBlock}\n\nVisible dots: ${pts.length}`,
    neuron: `The base signal defines the neural shape. The time wave lights dendrites, feeds the soma, then sends pulses along the axon.\n\nBase signal:\n${fmt(baseSignal)}${phaseLine}${programBlock}\n\nVisible dots: ${pts.length}`,
    tissue: `The base signal defines a connected sheet. The time wave changes the fold while the sheet keeps its local neighborhood.\n\nBase signal:\n${fmt(baseSignal)}${phaseLine}${programBlock}\n\nVisible dots: ${pts.length}`,
    cilia:  `The base signal defines the spine and paired branches. The time wave pushes a bend through the whole field.\n\nBase signal:\n${fmt(baseSignal)}${phaseLine}${programBlock}\n\nVisible dots: ${pts.length}`,
  };
  readout.textContent = shapeReadout[current] ?? `Signal:\n${fmt(signal)}\n\nDots: ${pts.length}`;

  const ly = autoRotate ? yaw + now * 0.08 : yaw;
  const lp = autoRotate ? pitch + Math.sin(now * 0.18) * 0.05 : pitch;

  window.ClosureParticleRenderer.render(
    ctx,
    pts,
    { W, H, CX, CY, R },
    { yaw: ly, pitch: lp, time: now },
    { links: true }
  );
}

// ── Controls ──────────────────────────────────────────────

canvas.addEventListener("pointerdown", e => {
  dragging = true; autoRotate = false;
  lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", e => {
  if (!dragging) return;
  yaw   += (e.clientX - lastX) * 0.01;
  pitch += (e.clientY - lastY) * 0.01;
  pitch  = Math.max(-1.45, Math.min(1.45, pitch));
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener("pointerup",    () => { dragging = false; });
canvas.addEventListener("pointerleave", () => { dragging = false; });

document.querySelectorAll("[data-shape]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-shape]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    switchShape(btn.dataset.shape);
    autoRotate = true;
  });
});

const edgeSlider = document.getElementById("edge-resolution");
const edgeLabel  = document.getElementById("edge-resolution-label");
const faceSlider = document.getElementById("face-resolution");
const faceLabel  = document.getElementById("face-resolution-label");

if (edgeSlider) edgeSlider.addEventListener("input", () => {
  edgeDivs = Number(edgeSlider.value);
  if (edgeLabel) edgeLabel.textContent = String(edgeDivs);
  rebuildInPlace();
});
if (faceSlider) faceSlider.addEventListener("input", () => {
  faceRows = Number(faceSlider.value);
  faceCols = Math.round(faceRows * 1.55);
  if (faceLabel) faceLabel.textContent = String(faceRows);
  rebuildInPlace();
});

const initialShape = new URLSearchParams(location.search).get("shape") || "sphere";
const safeInitialShape = SHAPES[initialShape] ? initialShape : "sphere";
document.querySelectorAll("[data-shape]").forEach(btn => {
  btn.classList.toggle("active", btn.dataset.shape === safeInitialShape);
});
switchShape(safeInitialShape);
draw();
})();
