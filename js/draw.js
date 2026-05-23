// Drawing with closure: a didactic construction.
// Point -> square -> face -> cube through repeated quaternion closure actions.

(function () {
const canvas = document.getElementById("draw-canvas");
if (!canvas) return;
const ctx = canvas.getContext("2d");
const title = document.getElementById("draw-title");
const desc = document.getElementById("draw-desc");
const readout = document.getElementById("draw-readout");
const restartBtn = document.getElementById("restart");
const toggleBtn = document.getElementById("toggle-play");
const timeline = document.getElementById("timeline");
const timelineLabel = document.getElementById("timeline-label");
const edgeResolution = document.getElementById("edge-resolution");
const edgeResolutionLabel = document.getElementById("edge-resolution-label");
const faceResolution = document.getElementById("face-resolution");
const faceResolutionLabel = document.getElementById("face-resolution-label");

let W = 540, H = 540, CX = 270, CY = 270, R = 175;
let yaw = 0.68, pitch = 0.42;
let dragging = false, lastX = 0, lastY = 0;
let auto = true;
let startedAt = performance.now();
let paused = false;
let pausedAt = 0;
let manualTimeline = false;
const DURATION = 40;
let edgeDivs = 24;
let faceRows = 18;
let faceCols = 28;
const CUBE_DEPTH = 0.74;
const BODY_X_SCALE = 1.46;
const BODY_Y_SCALE = 0.46;
const BODY_Z_SCALE = 0.88;
const BODY_Y_OFFSET = -0.08;
const WHEEL_RADIUS = 0.145;
const WHEEL_WIDTH = 0.055;
const WHEEL_SPOKES = 5;

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  W = Math.round((rect.width || 540) * dpr);
  H = Math.round((rect.height || 540) * dpr);
  canvas.width = W;
  canvas.height = H;
  CX = W / 2;
  CY = H / 2;
  R = Math.min(W, H) * 0.36;
}
resize();
addEventListener("resize", resize);

function mul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function inv(q) {
  return [q[0], -q[1], -q[2], -q[3]];
}

function norm(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

function axisAngle(axis, theta) {
  const n = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const h = theta / 2;
  const s = Math.sin(h) / n;
  return [Math.cos(h), axis[0] * s, axis[1] * s, axis[2] * s];
}

function action(q, p) {
  // Closure action on a point carrier:
  // P = [0,x,y,z]
  // P' = q P q^-1
  const r = mul(mul(q, [0, p[0], p[1], p[2]]), inv(q));
  return [r[1], r[2], r[3], p[3] ?? 0.6];
}

function qPow(q, n) {
  let out = [1, 0, 0, 0];
  for (let i = 0; i < n; i++) out = norm(mul(out, q));
  return out;
}

function fmt(q) {
  return `[${q.map(x => x.toFixed(4)).join(", ")}]`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smooth(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

function stage(t, a, b) {
  return smooth((t - a) / (b - a));
}

function line(a, b, n, color) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), color]);
  }
  return pts;
}

function cubeFaceRows() {
  return Math.max(4, Math.round(faceRows * 0.78));
}

function cubeFaceCols() {
  return Math.max(6, Math.round(faceCols * 0.62));
}

function carBodyRows() {
  return Math.max(6, Math.round(faceRows));
}

function carBodyCols() {
  return Math.max(4, Math.round(faceRows * 0.56));
}

function carCabinRows() {
  return Math.max(5, Math.round(faceRows * 0.78));
}

function carCabinCols() {
  return Math.max(4, Math.round(faceRows * 0.44));
}

function rotateAroundZ(p, phase) {
  const c = Math.cos(phase), s = Math.sin(phase);
  return [
    p[0] * c - p[1] * s,
    p[0] * s + p[1] * c,
    p[2],
    p[3],
  ];
}

function surfaceBoxPoint(i, count, center, half, color) {
  const u = ((i * 0.61803398875) % 1) * 2 - 1;
  const v = ((i * 0.41421356237) % 1) * 2 - 1;
  const faceId = i % 6;
  let p;
  if (faceId === 0) p = [ half[0], u * half[1], v * half[2]];
  else if (faceId === 1) p = [-half[0], u * half[1], v * half[2]];
  else if (faceId === 2) p = [u * half[0],  half[1], v * half[2]];
  else if (faceId === 3) p = [u * half[0], -half[1], v * half[2]];
  else if (faceId === 4) p = [u * half[0], v * half[1],  half[2]];
  else p = [u * half[0], v * half[1], -half[2]];
  return [p[0] + center[0], p[1] + center[1], p[2] + center[2], color];
}

function boxSurfaceGrid(center, half, color, nu, nv) {
  const pts = [];
  const faces = [
    [[ half[0], 0, 0], [0, half[1], 0], [0, 0, half[2]]],
    [[-half[0], 0, 0], [0, half[1], 0], [0, 0, half[2]]],
    [[0,  half[1], 0], [half[0], 0, 0], [0, 0, half[2]]],
    [[0, -half[1], 0], [half[0], 0, 0], [0, 0, half[2]]],
    [[0, 0,  half[2]], [half[0], 0, 0], [0, half[1], 0]],
    [[0, 0, -half[2]], [half[0], 0, 0], [0, half[1], 0]],
  ];
  for (const [origin, axisA, axisB] of faces) {
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const a = (i / nu) * 2 - 1;
        const b = (j / nv) * 2 - 1;
        pts.push([
          center[0] + origin[0] + axisA[0] * a + axisB[0] * b,
          center[1] + origin[1] + axisA[1] * a + axisB[1] * b,
          center[2] + origin[2] + axisA[2] * a + axisB[2] * b,
          color,
        ]);
      }
    }
  }
  return pts;
}

function wheelLocalPoint(i, count, color) {
  if (i < WHEEL_SPOKES * 5) {
    const spoke = Math.floor(i / 5);
    const t = (i % 5 + 1) / 5;
    const a = spoke * Math.PI * 2 / WHEEL_SPOKES;
    const z = (i % 2 === 0) ? -WHEEL_WIDTH : WHEEL_WIDTH;
    return [Math.cos(a) * WHEEL_RADIUS * t, Math.sin(a) * WHEEL_RADIUS * t, z, color];
  }
  const j = i - WHEEL_SPOKES * 5;
  const a = Math.PI * 2 * ((j * 0.61803398875) % 1);
  const z = (((j * 0.41421356237) % 1) * 2 - 1) * WHEEL_WIDTH;
  return [Math.cos(a) * WHEEL_RADIUS, Math.sin(a) * WHEEL_RADIUS, z, color];
}

function squareVertices(u) {
  const P = [0.52, 0, 0, 0.66];
  const q = axisAngle([0, 0, 1], Math.PI / 2 * u);
  const pts = [];
  for (let k = 0; k < 4; k++) pts.push(action(qPow(q, k), P));
  return { pts, q };
}

function squareEdges(vertices, edgeU) {
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % 4];
    const partial = [
      lerp(a[0], b[0], edgeU),
      lerp(a[1], b[1], edgeU),
      lerp(a[2], b[2], edgeU),
      0.66,
    ];
    pts.push(...line(a, partial, edgeDivs, 0.66));
  }
  return pts;
}

function faceGrid(vertices, faceU) {
  const pts = [];
  const n = Math.max(1, Math.floor(faceRows * faceU));
  const a = vertices[0], b = vertices[1], c = vertices[2], d = vertices[3];
  for (let i = 0; i <= n; i++) {
    const s = i / Math.max(1, n);
    const left = [lerp(a[0], d[0], s), lerp(a[1], d[1], s), lerp(a[2], d[2], s), 0.55];
    const right = [lerp(b[0], c[0], s), lerp(b[1], c[1], s), lerp(b[2], c[2], s), 0.55];
    pts.push(...line(left, right, faceCols, 0.55));
  }
  return pts;
}

function cubePoints(baseVerts, cubeU) {
  const pts = [];
  const depth = CUBE_DEPTH * cubeU;
  const qx = axisAngle([1, 0, 0], Math.PI / 2 * cubeU);
  const back = baseVerts.map(p => [p[0], p[1], p[2] + depth, 0.38]);
  pts.push(...squareEdges(baseVerts, 1));
  pts.push(...squareEdges(back, 1).map(p => [p[0], p[1], p[2], 0.38]));
  for (let i = 0; i < 4; i++) pts.push(...line(baseVerts[i], back[i], edgeDivs, 0.45));
  const faceAmount = stage(cubeU, 0.35, 1);
  if (faceAmount > 0) pts.push(...cubeFaces(baseVerts, back, faceAmount));
  return { pts, qx };
}

function cubeFaces(front, back, amount) {
  const pts = [];
  const n = Math.max(1, Math.floor(cubeFaceRows() * amount));
  const faces = [
    [front[0], front[1], front[2], front[3], 0.52],
    [back[0], back[1], back[2], back[3], 0.38],
    [front[0], front[1], back[1], back[0], 0.45],
    [front[1], front[2], back[2], back[1], 0.45],
    [front[2], front[3], back[3], back[2], 0.45],
    [front[3], front[0], back[0], back[3], 0.45],
  ];
  for (const [a, b, c, d, color] of faces) {
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const left = [lerp(a[0], d[0], s), lerp(a[1], d[1], s), lerp(a[2], d[2], s), color];
      const right = [lerp(b[0], c[0], s), lerp(b[1], c[1], s), lerp(b[2], c[2], s), color];
      pts.push(...line(left, right, cubeFaceCols(), color));
    }
  }
  return pts;
}

function scaleTranslate(pts, scale, move, color) {
  return pts.map(p => [p[0] * scale[0] + move[0], p[1] * scale[1] + move[1], p[2] * scale[2] + move[2], color ?? p[3]]);
}

function morphScaleTranslate(pts, fromScale, toScale, fromMove, toMove, u, toColor) {
  return pts.map(p => {
    const sx = lerp(fromScale[0], toScale[0], u);
    const sy = lerp(fromScale[1], toScale[1], u);
    const sz = lerp(fromScale[2], toScale[2], u);
    const mx = lerp(fromMove[0], toMove[0], u);
    const my = lerp(fromMove[1], toMove[1], u);
    const mz = lerp(fromMove[2], toMove[2], u);
    return [
      p[0] * sx + mx,
      p[1] * sy + my,
      p[2] * sz + mz,
      lerp(p[3] ?? 0.6, toColor, u),
    ];
  });
}

function cloudMorph(fromPts, toPts, u) {
  const pts = [];
  for (let i = 0; i < toPts.length; i++) {
    const a = fromPts[i % fromPts.length];
    const b = toPts[i];
    pts.push([
      lerp(a[0], b[0], u),
      lerp(a[1], b[1], u),
      lerp(a[2], b[2], u),
      lerp(a[3] ?? 0.6, b[3] ?? 0.6, u),
    ]);
  }
  return pts;
}

function wheelTargetPoints(center, phase, color) {
  const pts = [];
  for (let i = 0; i < 96; i++) {
    const lp = wheelLocalPoint(i, 96, color);
    const rp = rotateAroundZ(lp, phase);
    pts.push([rp[0] + center[0], rp[1] + center[1], rp[2] + center[2], color]);
  }
  return pts;
}

function wheelAnchorCloud(center, count, color) {
  const pts = [];
  for (let i = 0; i < count; i++) pts.push([center[0], center[1], center[2], color]);
  return pts;
}

function cubeToBody(cube, u) {
  const orient = stage(u, 0.00, 0.42);
  const stretch = stage(u, 0.28, 1.00);
  const root = Math.SQRT1_2;
  return cube.map(p => {
    // First rotate the square/cube carrier into car axes, then stretch it.
    // This keeps every cube sample matched to itself instead of reassigning
    // the cube to an unrelated target cloud.
    const rx = (p[0] + p[1]) * root;
    const ry = (-p[0] + p[1]) * root;
    const rz = p[2] - 0.37;
    const x0 = lerp(p[0], rx, orient);
    const y0 = lerp(p[1], ry, orient);
    const z0 = lerp(p[2], rz, orient);
    return [
      x0 * lerp(1.00, BODY_X_SCALE, stretch),
      y0 * lerp(1.00, BODY_Y_SCALE, stretch) + BODY_Y_OFFSET * stretch,
      z0 * lerp(1.00, BODY_Z_SCALE, stretch),
      lerp(p[3] ?? 0.6, 0.66, stretch),
    ];
  });
}

function carPoints(baseVerts, carU, wheelClock = 0) {
  const cube = cubePoints(baseVerts, 1).pts;
  const bodyAmount = stage(carU, 0.00, 0.46);
  const cabinAmount = stage(carU, 0.42, 0.64);
  const anchorAmount = stage(carU, 0.58, 0.70);
  const wheelAmount = stage(carU, 0.68, 0.88);
  const motionAmount = stage(carU, 0.88, 1.00);
  const phase = carU >= 1 ? wheelClock * 3.2 : motionAmount * Math.PI * 2;

  const pts = cubeToBody(cube, bodyAmount);

  if (cabinAmount > 0) {
    const cabinBase = boxSurfaceGrid([0.02, 0.005, -0.03], [0.33, 0.012, 0.22], 0.50, carCabinRows(), carCabinCols());
    const cabinTarget = boxSurfaceGrid([0.02, 0.16, -0.03], [0.33, 0.16, 0.22], 0.50, carCabinRows(), carCabinCols());
    pts.push(...cloudMorph(cabinBase, cabinTarget, cabinAmount));
  }

  const centers = [
    [ 0.47, -0.265,  0.285],
    [-0.47, -0.265,  0.285],
    [ 0.47, -0.265, -0.285],
    [-0.47, -0.265, -0.285],
  ];
  if (anchorAmount > 0) {
    for (const c of centers) {
      const anchor = [c[0], lerp(-0.16, c[1], anchorAmount), c[2], 0.34];
      pts.push(...line([c[0], -0.16, c[2], 0.34], anchor, Math.max(1, Math.floor(9 * anchorAmount)), 0.34));
    }
  }
  if (wheelAmount > 0) {
    for (const c of centers) {
      const anchors = wheelAnchorCloud([c[0], c[1], c[2]], 96, 0.24);
      const target = wheelTargetPoints(c, phase, 0.24);
      pts.push(...cloudMorph(anchors, target, wheelAmount));
    }
  }
  const qBody = axisAngle([0, 1, 0], bodyAmount * Math.PI / 10);
  const qCabin = axisAngle([0, 0, 1], cabinAmount * Math.PI / 8);
  const qWheel = axisAngle([0, 0, 1], phase);
  const qCar = norm(mul(mul(qBody, qCabin), qWheel));
  return { pts, bodyAmount, cabinAmount, anchorAmount, wheelAmount, motionAmount, qCar };
}

function construction(progress, elapsed = 0) {
  const closeU = stage(progress, 0.03, 0.16);
  const edgeU = stage(progress, 0.14, 0.25);
  const faceU = stage(progress, 0.24, 0.36);
  const cubeU = stage(progress, 0.35, 0.54);
  const carU = stage(progress, 0.54, 1.00);

  const square = squareVertices(closeU);
  let pts = [];

  if (closeU <= 0) pts.push([0.52, 0, 0, 0.66]);
  else pts.push(...square.pts);
  if (edgeU > 0) pts.push(...squareEdges(square.pts, edgeU));
  if (faceU > 0) pts.push(...faceGrid(square.pts, faceU));

  let qTotal = square.q;
  let qx = [1, 0, 0, 0];
  let car = null;
  if (cubeU > 0) {
    const cube = cubePoints(square.pts, cubeU);
    pts.push(...cube.pts);
    qx = cube.qx;
    qTotal = norm(mul(qTotal, qx));
  }
  if (carU > 0) {
    car = carPoints(square.pts, carU, Math.max(0, elapsed - DURATION));
    pts = car.pts;
    qTotal = norm(mul(qTotal, car.qCar));
  }

  const qClose = qPow(square.q, 4);
  const step =
    closeU < 1 ? "1. close a four-step orbit" :
    edgeU < 1 ? "2. connect the closed orbit" :
    faceU < 1 ? "3. fill the face" :
    cubeU < 1 ? "4. compose a perpendicular operation" :
    carU < 1 ? "5. reuse the closed cube as parts" :
    "6. car state with W motion";

  return { pts, qTotal, qz: square.q, qx, qClose, closeU, edgeU, faceU, cubeU, carU, car, step };
}

function text(c, progress) {
  const step =
    c.closeU < 1 ? {
      name: "1. Mark four points on a circle",
      body: `Start with one point P0.

The signal says: turn around the circle.
The decoder marks four landmarks:
start, one turn, two turns, three turns.

The turn grows until one step is 90 degrees.

Closure form:
q(u) = cos(u*pi/4) + k sin(u*pi/4)

Landmarks:
P0 = q^0 P0 q^-0
P1 = q^1 P0 q^-1
P2 = q^2 P0 q^-2
P3 = q^3 P0 q^-3

At u=1:
one step = pi/2 = 90 degrees
four steps close the circle`
    } :
    c.edgeU < 1 ? {
      name: "2. Draw the edges",
      body: `Take one closed pair A -> B.

Draw ${edgeDivs} small steps between A and B.
That number is the drawing resolution.
Higher resolution means more dots.

For each dot:
s = m / N
E(m) = (1-s)A + sB

While the edge is growing, B is still
moving into place:
B(u) = (1-u)A + uB

The line is made by mixing the two ends.`
    } :
    c.faceU < 1 ? {
      name: "3. Fill the face",
      body: `The square has four corners:
A, B, C, D.

First pick a point on the left edge.
Then pick the matching point on the right edge.
Then draw a line between those two points.

Do that for ${faceRows} rows.
Each row has ${faceCols} dots.

Left and right edge points:
r = i / R, R = ${faceRows}
L(r) = (1-r)A + rD
R(r) = (1-r)B + rC

Dot across that row:
s = j / C, C = ${faceCols}
F(i,j) = (1-s)L(r) + sR(r)

That is the face: a mesh of mixed points.`
    } :
    c.cubeU < 1 ? {
      name: "4. Add depth",
      body: `Start with the square face.

Make a second copy behind it.
The copy moves backward as the step grows.

Depth:
d(u) = ${CUBE_DEPTH}u
back = front + [0, 0, d(u)]

Connect each front corner to its back copy.
Then fill the six faces with the same
mesh rule from step 3.

Face resolution:
rows = ${cubeFaceRows()}
columns = ${cubeFaceCols()}

Depth turn:
qx(u) = cos(u*pi/4) + i sin(u*pi/4)`
    } :
    c.carU < 1 ? {
      name: "5. Shape the car",
      body: `Keep the cube dots.
Move every dot by the same map.

Turn the cube axes:
x0 = (x + y) / sqrt(2)
y0 = (-x + y) / sqrt(2)
z0 = z - ${CUBE_DEPTH / 2}

Stretch into a car body:
x' = ${BODY_X_SCALE} x0
y' = ${BODY_Y_SCALE} y0 ${BODY_Y_OFFSET}
z' = ${BODY_Z_SCALE} z0

The blue body is still the cube,
remapped point by point.

Cabin: grow a small box upward.

Wheels: place four anchors, then draw
a circle around each anchor.`
    } :
    {
      name: "6. Spin the wheels with W",
      body: `The car is now a static RGB shape.
W is the motion dial.

Each wheel is drawn near its own center.
First make local wheel dots:
radius = ${WHEEL_RADIUS}
half width = ${WHEEL_WIDTH}
spokes = ${WHEEL_SPOKES}

Tire dot:
L(a,z) = [r cos(a), r sin(a), z]

Spoke dot:
L(a,t,z) = [rt cos(a), rt sin(a), z]

W turns those local dots:
theta = W
L'(W) = Rz(theta)L

Then place the rotated wheel at each
of the four wheel centers.

Body and cabin stay fixed.
Only the wheel angle changes.`
    };

  const progressText = c.car ? `
body ${Math.round(c.car.bodyAmount * 100)}%
cabin ${Math.round(c.car.cabinAmount * 100)}%
anchors ${Math.round(c.car.anchorAmount * 100)}%
wheels ${Math.round(c.car.wheelAmount * 100)}%
W ${Math.round(c.car.motionAmount * 100)}%` :
`corners ${Math.round(c.closeU * 100)}%
edges ${Math.round(c.edgeU * 100)}%
face ${Math.round(c.faceU * 100)}%
depth ${Math.round(c.cubeU * 100)}%`;

  return `${step.name}

${step.body}

Shape signal:
q = ${fmt(c.qTotal)}

Same construction → same signal.
Change any step → different signal.

Visible dots: ${c.pts.length}

Progress:
${progressText}`;
}

function draw() {
  requestAnimationFrame(draw);
  const now = performance.now();
  const elapsed = manualTimeline ? pausedAt : (paused ? pausedAt : (now - startedAt) / 1000);
  const progress = Math.min(1, elapsed / DURATION);
  if (timeline && !manualTimeline) timeline.value = String(Math.round(progress * 1000));
  if (timelineLabel) timelineLabel.textContent = `${Math.round(progress * 100)}%`;
  const c = construction(progress, elapsed);

  title.textContent = "Thought Engine";
  desc.innerHTML = "When you read &#8220;tree,&#8221; your brain builds a shape &mdash; an internal simulation assembled from every tree you have ever seen, climbed, or imagined; and whether you think in English, Mandarin, or Swahili, you are pointing at the same shape.<br><br>A thought engine does exactly that: it grows shapes from signals, one rotation at a time, until the whole structure closes. The signal is not a compressed version of the shape &mdash; it is the rule that generates it; a categorical difference, because rules do not degrade. Drag the sliders: more dots, more detail, same four numbers. Transmit those four numbers anywhere and the receiver, running the same decoder, reconstructs the same shape at whatever resolution it needs.<br><br>The same operation that builds the corners builds the face; the same operation that builds the face builds the cube; the same operation that builds the cube builds the car. Conway&#8217;s Game of Life works by one rule and generates computers, oscillators, and gliders from three lines. The thought engine works by one operation &mdash; rotate, close, compose &mdash; and generates any shape or motion you can describe geometrically. The car here is one instance of that.<br><br>Because the operation is the same regardless of what the carriers represent, it is not limited to drawing cars; it works the same way for motion, for sequences, for concepts. The signal for &#8220;tree&#8221; in any language points to the same carrier &mdash; the shape the word stands for, before any language names it. A world built this way understands things the way brains do: by building an internal model, shape by shape, one signal at a time.";
  readout.textContent = text(c, progress);

  const t = now / 1000;
  const localYaw = auto ? yaw + t * 0.08 : yaw;
  const localPitch = auto ? pitch + Math.sin(t * 0.18) * 0.05 : pitch;
  window.ClosureParticleRenderer.render(
    ctx,
    c.pts,
    { W, H, CX, CY, R },
    { yaw: localYaw, pitch: localPitch, time: t },
    { links: true }
  );
}

canvas.addEventListener("pointerdown", e => {
  dragging = true;
  auto = false;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", e => {
  if (!dragging) return;
  yaw += (e.clientX - lastX) * 0.01;
  pitch += (e.clientY - lastY) * 0.01;
  pitch = Math.max(-1.45, Math.min(1.45, pitch));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointerleave", () => { dragging = false; });

restartBtn.addEventListener("click", () => {
  startedAt = performance.now();
  paused = false;
  pausedAt = 0;
  manualTimeline = false;
  if (timeline) timeline.value = "0";
  toggleBtn.textContent = "Pause";
});

toggleBtn.addEventListener("click", () => {
  if (paused) {
    startedAt = performance.now() - pausedAt * 1000;
    paused = false;
    manualTimeline = false;
    toggleBtn.textContent = "Pause";
  } else {
    pausedAt = (performance.now() - startedAt) / 1000;
    paused = true;
    toggleBtn.textContent = "Play";
  }
});

if (timeline) {
  timeline.addEventListener("input", () => {
    const progress = Number(timeline.value) / 1000;
    pausedAt = progress * DURATION;
    paused = true;
    manualTimeline = true;
    toggleBtn.textContent = "Play";
    if (timelineLabel) timelineLabel.textContent = `${Math.round(progress * 100)}%`;
  });
}

if (edgeResolution) {
  edgeResolution.addEventListener("input", () => {
    edgeDivs = Number(edgeResolution.value);
    if (edgeResolutionLabel) edgeResolutionLabel.textContent = String(edgeDivs);
  });
}

if (faceResolution) {
  faceResolution.addEventListener("input", () => {
    faceRows = Number(faceResolution.value);
    faceCols = Math.round(faceRows * 1.55);
    if (faceResolutionLabel) faceResolutionLabel.textContent = String(faceRows);
  });
}

draw();
})();
