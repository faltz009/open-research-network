// Defender's Mind — egregore simulator.
//
// Rules, from first principles:
// - Defender's identity is three resources: truth, good, beauty.
// - Resources decay with time. Defender must keep seeking what he lacks.
// - Each egregore has a stable tangent carrier. Scholars always help truth;
//   Activists always help good; Artists always help beauty; Trolls always hurt.
// - Defender does not know this at first. He learns trust by observing deltas.
// - Good egregores are never consumed or attacked. They are stable resource poles.
// - Bad egregores can grow by flocking. Once learned as bad, Defender avoids big
//   ones and prunes small ones when strong.
// - Belief is still encoded as a quaternion on S3: q = normalize([w,t,g,b]).
// - The closure operation here is tangent update + projection:
//   q' = project_S3(resource(q) + [dT,dG,dB] * field_strength).

const GRID_SIZE = 25;
const CELL = 14;
const ORIGIN_PX = 360;
const MAX_AGENTS = 38;
const AGENT_SPAWN_CHANCE = 0.12;
const SPAWN_RANGE = 22;
const AGENT_LIFE = 1200;
const FIELD_RADIUS = 6.5;
const MERGE_RADIUS = 2.25;
const CLASH_RADIUS = 1.7;
const BAD_HUNT_CELLS = 10;
const BAD_PRUNE_CELLS = 3;
const NEED_GOAL = 0.80;
const DECAY = 0.0021;
const FIELD_GAIN = 0.020;
const TRUST_GAIN = 0.055;
const CELL_GAIN = 0.11;

const MOVES = [
  [0,1],[0,-1],[1,0],[-1,0],
  [1,1],[1,-1],[-1,1],[-1,-1],
];

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function len3(v) { return Math.hypot(v[0], v[1], v[2]) || 1; }
function norm3(v) { const n = len3(v); return [v[0]/n, v[1]/n, v[2]/n]; }
function norm4(q) { const n = Math.hypot(...q) || 1; return q.map(x => x/n); }
function dot4(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]; }

function resourceToQuat(r) {
  const t = r.truth * 2 - 1;
  const g = r.good * 2 - 1;
  const b = r.beauty * 2 - 1;
  const mag2 = t*t + g*g + b*b;
  const scale = mag2 > 1 ? 1 / Math.sqrt(mag2) : 1;
  const vt = t * scale, vg = g * scale, vb = b * scale;
  const w = Math.sqrt(Math.max(0, 1 - vt*vt - vg*vg - vb*vb));
  return norm4([w, vt, vg, vb]);
}

const IDEAL_Q = resourceToQuat({ truth:1, good:1, beauty:1 });

function sigmaToIdeal(q) {
  // Signed S3 distance. q and -q are not equivalent here because the vector
  // parts encode semantic direction: anti-truth is not the same as truth.
  return Math.acos(clamp(dot4(q, IDEAL_Q), -1, 1)) / Math.PI;
}

function tangentCarrier(effect, strength) {
  return [0, effect[0] * strength, effect[1] * strength, effect[2] * strength];
}

function applyTangentCarrier(resources, carrier) {
  return {
    truth: clamp(resources.truth + carrier[1], 0, 1),
    good: clamp(resources.good + carrier[2], 0, 1),
    beauty: clamp(resources.beauty + carrier[3], 0, 1),
  };
}

function effectValue(effect) {
  return effect[0] + effect[1] + effect[2];
}

const GROUPS = [
  { name:"Scholars",  color:"#4ae", effect:[+1.00,+0.00,+0.00], weight:1.25, kind:"good" },
  { name:"Activists", color:"#4c8", effect:[+0.00,+1.00,+0.00], weight:1.25, kind:"good" },
  { name:"Artists",   color:"#a4d", effect:[+0.00,+0.00,+1.00], weight:1.25, kind:"good" },
  { name:"Doomers",   color:"#f73", effect:[-0.48,+0.14,-0.28], weight:0.90, kind:"bad" },
  { name:"Trolls",    color:"#f48", effect:[-0.72,-0.62,-0.66], weight:0.82, kind:"bad" },
  { name:"Normies",   color:"#bbb", effect:null,                weight:1.55, kind:"noise" },
];
const TOTAL_WEIGHT = GROUPS.reduce((s, g) => s + g.weight, 0);

function pickGroup() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < GROUPS.length; i++) {
    r -= GROUPS[i].weight;
    if (r <= 0) return i;
  }
  return GROUPS.length - 1;
}

function randomNormieEffect() {
  const v = [Math.random()*2-1, Math.random()*2-1, Math.random()*2-1];
  const n = norm3(v);
  return [n[0]*0.24, n[1]*0.24, n[2]*0.24];
}

let defender, agents, tickCount, paused = false, speed = 120, gameLoop;

function freshLearning() {
  const out = {};
  for (const g of GROUPS) out[g.name] = { trust:0.50, effect:[0,0,0], n:0 };
  return out;
}

function resetWorld() {
  defender = {
    x: 0,
    y: 0,
    resources: { truth:0.55, good:0.55, beauty:0.55 },
    belief: resourceToQuat({ truth:0.55, good:0.55, beauty:0.55 }),
    cells: 10,
    trail: [],
    learning: freshLearning(),
    mode: "seeking",
    target: null,
    lastEvent: "",
    lastGoodLog: {},
    lastPressureLog: {},
    abu: { A:0, B:0, U:0, last:"B", detail:"waiting for contact" },
  };
  agents = [];
  tickCount = 0;
  document.getElementById("eventlog").innerHTML = "";
  for (let i = 0; i < 10; i++) spawnAgent();
  updateUI();
}

function spawnAgent(cx, cy, forcedGroup) {
  if (agents.length >= MAX_AGENTS) return;
  let x = cx ?? Math.floor(Math.random() * (SPAWN_RANGE*2 + 1)) - SPAWN_RANGE;
  let y = cy ?? Math.floor(Math.random() * (SPAWN_RANGE*2 + 1)) - SPAWN_RANGE;
  if (x === 0 && y === 0) x = 3;
  const groupIdx = forcedGroup ?? pickGroup();
  const group = GROUPS[groupIdx];
  const effect = group.effect ? group.effect.slice() : randomNormieEffect();
  agents.push({
    x, y,
    groupIdx,
    effect,
    age: 0,
    cells: 1 + Math.random() * 0.4,
    hunting: false,
  });
}

function bestStep(ex, ey, tx, ty) {
  let best = null, bestD = Infinity;
  for (const [dx, dy] of MOVES) {
    const nx = ex + dx, ny = ey + dy;
    if (Math.abs(nx) > GRID_SIZE || Math.abs(ny) > GRID_SIZE) continue;
    const d = dist(nx, ny, tx, ty);
    if (d < bestD) { bestD = d; best = [dx, dy]; }
  }
  return best;
}

function bestStepAway(ex, ey, tx, ty) {
  let best = null, bestD = -Infinity;
  for (const [dx, dy] of MOVES) {
    const nx = ex + dx, ny = ey + dy;
    if (Math.abs(nx) > GRID_SIZE || Math.abs(ny) > GRID_SIZE) continue;
    const d = dist(nx, ny, tx, ty);
    if (d > bestD) { bestD = d; best = [dx, dy]; }
  }
  return best;
}

function needs() {
  return [
    Math.max(0, NEED_GOAL - defender.resources.truth),
    Math.max(0, NEED_GOAL - defender.resources.good),
    Math.max(0, NEED_GOAL - defender.resources.beauty),
  ];
}

function lowestNeedIndex() {
  const n = needs();
  let focus = 0;
  if (n[1] > n[focus]) focus = 1;
  if (n[2] > n[focus]) focus = 2;
  return focus;
}

function focusGroupName() {
  return ["Scholars", "Activists", "Artists"][lowestNeedIndex()];
}

function allNeedsMet() {
  return defender.resources.truth >= NEED_GOAL &&
         defender.resources.good >= NEED_GOAL &&
         defender.resources.beauty >= NEED_GOAL;
}

function strongEnoughToPrune() {
  if (allNeedsMet()) return true;
  const minResource = Math.min(defender.resources.truth, defender.resources.good, defender.resources.beauty);
  if (defender.cells >= 42 && minResource >= 0.46) return true;
  return defender.cells >= 22 && minResource >= 0.52;
}

function learnedEffect(groupName) {
  return defender.learning[groupName].effect;
}

function learnedTrust(groupName) {
  return defender.learning[groupName].trust;
}

function learnedBad(groupName) {
  const rec = defender.learning[groupName];
  if (rec.n < 3) return false;
  return effectValue(rec.effect) < -0.0005 || rec.trust < 0.40;
}

function isThreat(agent) {
  const group = GROUPS[agent.groupIdx];
  return group.kind === "bad" && learnedBad(group.name) && agent.cells >= BAD_HUNT_CELLS;
}

function isCullable(agent) {
  const group = GROUPS[agent.groupIdx];
  return group.kind === "bad" && learnedBad(group.name) && agent.cells >= BAD_PRUNE_CELLS;
}

function currentEffectEstimate(agent) {
  const group = GROUPS[agent.groupIdx];
  const rec = defender.learning[group.name];
  if (rec.n < 6) {
    // Before trust is earned, Defender can still sense the field direction.
    // Trust says whether to rely on it; the carrier says what resource it offers.
    if (group.kind === "good" || group.kind === "bad") return group.effect;
    return [0.02, 0.02, 0.02];
  }
  return rec.effect;
}

function targetScore(agent) {
  const group = GROUPS[agent.groupIdx];
  if (group.kind === "noise") return -Infinity;
  if (group.name !== focusGroupName()) return -Infinity;
  const tr = learnedTrust(group.name);
  if (tr < 0.35) return -Infinity;
  const n = needs();
  const focus = lowestNeedIndex();
  const estimate = currentEffectEstimate(agent);
  const focusHelp = Math.max(0, estimate[focus]) * Math.pow(n[focus] + 0.02, 2.5);
  const help = focusHelp;
  if (help <= 0) return -Infinity;
  const d = dist(defender.x, defender.y, agent.x, agent.y);
  const size = Math.log2(2 + agent.cells);
  return tr * Math.pow(help + 0.01, 2.0) * size / (1 + Math.sqrt(d) * 0.24);
}

function patrolTargetScore(agent) {
  if (!isCullable(agent)) return -Infinity;
  const d = dist(defender.x, defender.y, agent.x, agent.y);
  return (agent.cells + 3) / (1 + d * 0.055);
}

function agentTick(agent) {
  const group = GROUPS[agent.groupIdx];
  agent.age++;

  agent.hunting = isThreat(agent);
  let step = null;

  if (agent.hunting) {
    if (Math.random() < 0.28) step = bestStep(agent.x, agent.y, defender.x, defender.y);
  } else {
    let nearest = null, nearestD = Infinity;
    if (group.kind !== "noise") {
      const flockRadius = group.kind === "bad" ? 12 : 14;
      for (const other of agents) {
        if (other === agent || other.groupIdx !== agent.groupIdx) continue;
        const d = dist(agent.x, agent.y, other.x, other.y);
        if (d > 0.8 && d < nearestD && d < flockRadius) { nearest = other; nearestD = d; }
      }
    }
    const flockChance = group.kind === "bad" ? 0.34 : 0.62;
    if (nearest && Math.random() < flockChance) step = bestStep(agent.x, agent.y, nearest.x, nearest.y);
    else if (Math.random() < 0.22) step = MOVES[Math.floor(Math.random() * MOVES.length)];
  }

  if (step) {
    agent.x = clamp(agent.x + step[0], -GRID_SIZE, GRID_SIZE);
    agent.y = clamp(agent.y + step[1], -GRID_SIZE, GRID_SIZE);
  }
}

function mergeAgents() {
  for (let i = agents.length - 1; i >= 0; i--) {
    const a = agents[i];
    if (GROUPS[a.groupIdx].kind === "noise") continue;
    for (let j = i - 1; j >= 0; j--) {
      const b = agents[j];
      if (a.groupIdx !== b.groupIdx) continue;
      if (dist(a.x, a.y, b.x, b.y) > MERGE_RADIUS) continue;
      const total = a.cells + b.cells;
      a.effect = [
        (a.effect[0] * a.cells + b.effect[0] * b.cells) / total,
        (a.effect[1] * a.cells + b.effect[1] * b.cells) / total,
        (a.effect[2] * a.cells + b.effect[2] * b.cells) / total,
      ];
      a.x = Math.round((a.x * a.cells + b.x * b.cells) / total);
      a.y = Math.round((a.y * a.cells + b.y * b.cells) / total);
      a.cells = total;
      a.age = Math.min(a.age, b.age);
      agents.splice(j, 1);
      i = Math.min(i, agents.length);
      break;
    }
  }
}

function decayResources() {
  defender.resources.truth = clamp(defender.resources.truth - DECAY, 0, 1);
  defender.resources.good = clamp(defender.resources.good - DECAY, 0, 1);
  defender.resources.beauty = clamp(defender.resources.beauty - DECAY, 0, 1);
}

function applyField(agent) {
  const group = GROUPS[agent.groupIdx];
  const d = dist(defender.x, defender.y, agent.x, agent.y);
  if (d > FIELD_RADIUS) return;

  const before = [defender.resources.truth, defender.resources.good, defender.resources.beauty];
  const needBefore = [
    Math.max(0, NEED_GOAL - before[0]),
    Math.max(0, NEED_GOAL - before[1]),
    Math.max(0, NEED_GOAL - before[2]),
  ];
  const proximity = 1 - d / FIELD_RADIUS;
  const size = Math.log2(2 + agent.cells);
  const pressure = group.kind === "bad" ? (strongEnoughToPrune() ? 0.46 : 0.22) : 1;
  const k = FIELD_GAIN * proximity * size * pressure;
  const carrier = tangentCarrier(agent.effect, k);

  defender.resources = applyTangentCarrier(defender.resources, carrier);

  const after = [defender.resources.truth, defender.resources.good, defender.resources.beauty];
  const delta = [after[0] - before[0], after[1] - before[1], after[2] - before[2]];
  const rawDelta = delta[0] + delta[1] + delta[2];
  const rec = defender.learning[group.name];
  // Learn the intrinsic field carrier, not the raw delta. Raw deltas are
  // distorted by distance, cluster size, and resource saturation; the carrier
  // is the stable thing Defender needs to remember.
  const observedCarrier = group.kind === "noise" ? agent.effect : [
    carrier[1] / (k || 1),
    carrier[2] / (k || 1),
    carrier[3] / (k || 1),
  ];
  const alpha = rec.n === 0 ? 1 : 0.10;
  rec.effect[0] = rec.effect[0] * (1 - alpha) + observedCarrier[0] * alpha;
  rec.effect[1] = rec.effect[1] * (1 - alpha) + observedCarrier[1] * alpha;
  rec.effect[2] = rec.effect[2] * (1 - alpha) + observedCarrier[2] * alpha;
  rec.n++;
  const intrinsicDelta = effectValue(observedCarrier) * k;
  const totalDelta = group.kind === "noise" ? rawDelta * 0.18 : intrinsicDelta;
  const abuSignal = group.kind === "noise"
    ? rawDelta * 0.18
    : dot3(observedCarrier, needBefore) * k;
  let abu = "B";
  if (abuSignal > 0.0006) abu = "A";
  else if (abuSignal < -0.0006) abu = "U";
  defender.abu[abu]++;
  defender.abu.last = abu;
  defender.abu.detail =
    abu === "A" ? `${group.name} restored a needed axis` :
    abu === "U" ? `${group.name} drained a needed axis` :
    `${group.name} was neutral/noisy`;
  if (group.kind === "noise") {
    rec.trust = clamp(rec.trust + (0.50 - rec.trust) * 0.03 + totalDelta * TRUST_GAIN * proximity * 3, 0.25, 0.75);
  } else {
    rec.trust = clamp(rec.trust + totalDelta * TRUST_GAIN * proximity * 10, 0.02, 1);
  }

  const cellsBefore = defender.cells;
  if (totalDelta > 0) {
    defender.cells = clamp(defender.cells + totalDelta * CELL_GAIN * 10, 1, 120);
    if (group.kind === "good") agent.cells = clamp(agent.cells + totalDelta * 0.18, 1, 120);
  } else {
    defender.cells = clamp(defender.cells + totalDelta * CELL_GAIN * 6, 1, 120);
  }
  const cellDelta = defender.cells - cellsBefore;

  if (group.kind === "good" && cellDelta > 0.01) {
    const last = defender.lastGoodLog[group.name] ?? -Infinity;
    if (tickCount - last >= 80) {
      defender.lastGoodLog[group.name] = tickCount;
      const axis = group.name === "Scholars" ? "truth" : group.name === "Activists" ? "good" : "beauty";
      const axisDelta = group.name === "Scholars" ? delta[0] : group.name === "Activists" ? delta[1] : delta[2];
      logEvent(`${group.name} restored ${axis} +${axisDelta.toFixed(2)} · Defender +${cellDelta.toFixed(2)} cells`, group.color);
    }
  }
}

function resolveCombat() {
  for (let i = agents.length - 1; i >= 0; i--) {
    const a = agents[i];
    const group = GROUPS[a.groupIdx];
    if (!isCullable(a)) continue;
    const combatRadius = strongEnoughToPrune() ? CLASH_RADIUS * 1.85 : CLASH_RADIUS;
    if (dist(defender.x, defender.y, a.x, a.y) > combatRadius) continue;

    // If Defender is not in patrol state yet, contact with a harmful cluster
    // is avoided, not resolved as combat. The field itself already drains him;
    // repeated melee damage here pins him down before he can restore himself.
    if (!strongEnoughToPrune()) {
      const last = defender.lastPressureLog[group.name] ?? -Infinity;
      if (tickCount - last >= 45) {
        defender.lastPressureLog[group.name] = tickCount;
        logEvent(`Pressed by ${group.name} (${a.cells.toFixed(1)} cells) — avoiding until restored`, "#e66");
      }
      continue;
    }

    const hit = Math.sqrt(defender.cells) * 0.52;
    const back = Math.sqrt(a.cells) * 0.13;
    const beforeA = a.cells;
    const beforeD = defender.cells;
    a.cells -= hit;
    defender.cells = clamp(defender.cells - back, 1, 120);
    logEvent(`Pruned ${group.name}: −${Math.min(hit, beforeA).toFixed(1)} cells; Defender −${(beforeD - defender.cells).toFixed(1)} cells`, "#f88");
    if (a.cells <= 0.6) {
      logEvent(`${group.name} egregore destroyed`, "#a44");
      agents.splice(i, 1);
    }
  }
}

function moveDefender() {
  let target = null;
  let flee = null;

  if (strongEnoughToPrune()) {
    defender.mode = "patrol";
    let best = -Infinity;
    for (const a of agents) {
      const score = patrolTargetScore(a);
      if (score > best) { best = score; target = a; }
    }
  } else {
    defender.mode = "seeking";
    let best = -Infinity;
    for (const a of agents) {
      const group = GROUPS[a.groupIdx];
      const d = dist(defender.x, defender.y, a.x, a.y);
      // Avoid only immediate danger. If avoidance reaches too far, Defender
      // spends the whole simulation running from bad poles instead of restoring
      // the depleted resource that would make him strong enough to prune them.
      if (isThreat(a) && a.cells >= defender.cells * 0.75 && d < CLASH_RADIUS * 2.2) {
        flee = a;
      }
      const score = targetScore(a);
      if (score > best) { best = score; target = a; }
    }
  }

  let step = null;
  if (flee) {
    step = bestStepAway(defender.x, defender.y, flee.x, flee.y);
    defender.target = `avoid ${GROUPS[flee.groupIdx].name}`;
  } else if (target) {
    step = bestStep(defender.x, defender.y, target.x, target.y);
    defender.target = `${defender.mode} ${GROUPS[target.groupIdx].name}`;
  } else if (Math.random() < 0.16) {
    step = MOVES[Math.floor(Math.random() * MOVES.length)];
    defender.target = "explore";
  }

  if (!step) {
    defender.target = defender.mode === "patrol" ? "patrol clear" : "explore";
    return;
  }
  defender.trail.push([defender.x, defender.y]);
  if (defender.trail.length > 64) defender.trail.shift();
  defender.x = clamp(defender.x + step[0], -GRID_SIZE, GRID_SIZE);
  defender.y = clamp(defender.y + step[1], -GRID_SIZE, GRID_SIZE);
}

function tick() {
  if (paused) return;
  tickCount++;
  if (Math.random() < AGENT_SPAWN_CHANCE) spawnAgent();

  for (const a of agents) agentTick(a);
  agents = agents.filter(a => a.age < AGENT_LIFE);
  mergeAgents();

  decayResources();
  moveDefender();
  for (const a of agents) applyField(a);
  resolveCombat();

  defender.belief = resourceToQuat(defender.resources);
  updateUI();
}

const canvas = document.getElementById("grid");
const ctx = canvas.getContext("2d");
function gx(x) { return ORIGIN_PX + x * CELL; }
function gy(y) { return ORIGIN_PX - y * CELL; }

function hexAlpha(hex, a) {
  let h = hex.replace("#","");
  if (h.length === 3) h = h.split("").map(c => c+c).join("");
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

let HAT_SPRITE = null;
(function loadHat() {
  const img = new Image();
  img.onload = () => { HAT_SPRITE = img; };
  img.src = "defender-hat.jpg";
})();

function drawHat(x, y) {
  if (HAT_SPRITE) ctx.drawImage(HAT_SPRITE, x - 15, y - 24, 30, 30);
  else {
    ctx.fillStyle = "#fe4";
    ctx.beginPath(); ctx.arc(x, y - 6, 6, 0, Math.PI*2); ctx.fill();
  }
}

function drawCluster(x, y, cells, color, trust, hunting) {
  const n = Math.max(1, Math.round(cells));
  const r = n === 1 ? 5 : 3.4;
  const positions = [[0,0]];
  let placed = 1, ring = 1;
  while (placed < n) {
    const rr = r * 1.9 * ring;
    const slots = Math.max(6, ring * 6);
    for (let i = 0; i < slots && placed < n; i++) {
      const a = i / slots * Math.PI * 2 + ring * 0.26;
      positions.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      placed++;
    }
    ring++;
  }
  let maxR = r;
  for (const p of positions) maxR = Math.max(maxR, Math.hypot(p[0], p[1]) + r);
  ctx.fillStyle = hexAlpha(color, 0.035 + trust * 0.045);
  ctx.beginPath(); ctx.arc(x, y, maxR + 6, 0, Math.PI*2); ctx.fill();
  if (hunting) {
    ctx.strokeStyle = "rgba(255,70,70,0.72)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, maxR + 11, 0, Math.PI*2); ctx.stroke();
  }
  for (const [dx, dy] of positions) {
    ctx.fillStyle = hexAlpha(color, 0.90);
    ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI*2); ctx.fill();
  }
}

function draw() {
  ctx.fillStyle = "#0c0c12";
  ctx.fillRect(0, 0, 720, 720);
  ctx.fillStyle = "#16161f";
  for (let xi = -GRID_SIZE; xi <= GRID_SIZE; xi += 2)
    for (let yi = -GRID_SIZE; yi <= GRID_SIZE; yi += 2)
      ctx.fillRect(gx(xi), gy(yi), 1, 1);

  for (const a of agents) {
    const group = GROUPS[a.groupIdx];
    const ax = gx(a.x), ay = gy(a.y);
    const grad = ctx.createRadialGradient(ax, ay, 2, ax, ay, FIELD_RADIUS * CELL);
    grad.addColorStop(0, hexAlpha(group.color, 0.09));
    grad.addColorStop(1, hexAlpha(group.color, 0.00));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(ax, ay, FIELD_RADIUS * CELL, 0, Math.PI*2); ctx.fill();
  }

  const dx = gx(defender.x), dy = gy(defender.y);
  for (const a of agents) {
    const d = dist(defender.x, defender.y, a.x, a.y);
    if (d > FIELD_RADIUS) continue;
    const group = GROUPS[a.groupIdx];
    ctx.strokeStyle = hexAlpha(group.color, (1 - d / FIELD_RADIUS) * 0.44);
    ctx.lineWidth = learnedTrust(group.name) > 0.5 ? 1.3 : 0.8;
    ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(gx(a.x), gy(a.y)); ctx.stroke();
  }

  for (const a of agents) {
    const group = GROUPS[a.groupIdx];
    drawCluster(gx(a.x), gy(a.y), a.cells, group.color, learnedTrust(group.name), a.hunting);
  }

  for (let i = 0; i < defender.trail.length; i++) {
    const p = defender.trail[i];
    const a = i / defender.trail.length;
    ctx.fillStyle = `rgba(255,230,80,${(0.05 + a * 0.22).toFixed(2)})`;
    ctx.fillRect(gx(p[0])-1, gy(p[1])-1, 3, 3);
  }

  drawCluster(dx, dy, defender.cells, "#fc4", 1, false);
  drawHat(dx, dy - 16);
  requestAnimationFrame(draw);
}

function logEvent(msg, color) {
  const el = document.getElementById("eventlog");
  const row = document.createElement("div");
  row.style.color = color || "#666";
  row.textContent = `t=${tickCount}  ${msg}`;
  el.appendChild(row);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 180) el.removeChild(el.firstChild);
}

function setBar(barId, valId, value, fmt) {
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  if (!bar || !val) return;
  bar.style.width = `${Math.round(clamp(value,0,1) * 100)}%`;
  val.textContent = fmt ? fmt(value) : value.toFixed(2);
}

function effectGlyph(v) {
  if (Math.abs(v) < 0.0005) return `<span style="color:#666">0</span>`;
  return v > 0 ? `<span style="color:#6c6">+</span>` : `<span style="color:#e66">−</span>`;
}

function updateUI() {
  setBar("tbar", "tval", defender.resources.truth);
  setBar("gbar", "gval", defender.resources.good);
  setBar("bbar", "bval", defender.resources.beauty);
  document.getElementById("tick").textContent = tickCount;
  document.getElementById("pos").textContent = `(${defender.x},${defender.y})`;
  document.getElementById("bel").textContent = `[${defender.belief.map(x => x.toFixed(2)).join(", ")}]`;
  document.getElementById("mass").textContent = `${Math.round(defender.cells)} cells`;
  let fields = 0;
  for (const a of agents) if (dist(defender.x, defender.y, a.x, a.y) <= FIELD_RADIUS) fields++;
  document.getElementById("inFields").textContent = `${fields} · ${defender.mode} · ${defender.target || "none"}`;
  const stateReadout = document.getElementById("state-readout");
  if (stateReadout) {
    stateReadout.textContent =
`mode: ${defender.mode}
target: ${defender.target || "none"}
cells: ${defender.cells.toFixed(1)}
field contact: ${fields}

ABU:
last ${defender.abu.last} - ${defender.abu.detail}
A ${defender.abu.A}   B ${defender.abu.B}   U ${defender.abu.U}

q:
[${defender.belief.map(x => x.toFixed(3)).join(", ")}]`;
  }

  document.getElementById("trust-list").innerHTML = GROUPS.map(g => {
    const rec = defender.learning[g.name];
    const pct = Math.round(rec.trust * 100);
    const dir = rec.trust > 0.56 ? "#6c6" : rec.trust < 0.44 ? "#e66" : "#aaa";
    const learned = rec.n
      ? `T${effectGlyph(rec.effect[0])} G${effectGlyph(rec.effect[1])} B${effectGlyph(rec.effect[2])}`
      : `<span style="color:#555">? ? ?</span>`;
    return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;">
      <span style="width:84px;color:${g.color}">${g.name}</span>
      <div style="flex:1;height:7px;background:#ececf1;border:1px solid #d7d7df;position:relative;">
        <div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:#aaa;"></div>
        <div style="height:100%;background:${g.color};width:${pct}%"></div>
      </div>
      <span style="width:24px;color:${dir};text-align:right">${pct}</span>
      <span style="width:82px;font-family:monospace;font-size:10px;color:#444">${learned}<span style="color:#999;font-size:9px"> n=${rec.n}</span></span>
    </div>`;
  }).join("");
}

function togglePause() {
  paused = !paused;
  document.getElementById("pauseBtn").textContent = paused ? "Resume" : "Pause";
}

const speeds = [["Slow",350],["Normal",120],["Fast",55],["Turbo",24]];
let speedIndex = 1;
function toggleSpeed() {
  speedIndex = (speedIndex + 1) % speeds.length;
  speed = speeds[speedIndex][1];
  document.getElementById("spd").textContent = speeds[speedIndex][0];
  clearInterval(gameLoop);
  gameLoop = setInterval(tick, speed);
}

canvas.addEventListener("click", e => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);
  const x = Math.round((mx - ORIGIN_PX) / CELL);
  const y = Math.round((ORIGIN_PX - my) / CELL);
  if (Math.abs(x) <= GRID_SIZE && Math.abs(y) <= GRID_SIZE) spawnAgent(x, y);
});

function reset() { resetWorld(); }

resetWorld();
draw();
gameLoop = setInterval(tick, speed);

window.DefenderLoopDebug = {
  step(n = 1) {
    const wasPaused = paused;
    paused = false;
    for (let i = 0; i < n; i++) tick();
    paused = wasPaused;
  },
  snapshot() {
    return {
      tick: tickCount,
      resources: { ...defender.resources },
      cells: defender.cells,
      mode: defender.mode,
      target: defender.target,
      trust: Object.fromEntries(GROUPS.map(g => [g.name, defender.learning[g.name].trust])),
      effects: Object.fromEntries(GROUPS.map(g => [g.name, defender.learning[g.name].effect.slice()])),
      agents: agents.map(a => ({ group: GROUPS[a.groupIdx].name, cells: a.cells, x: a.x, y: a.y })),
    };
  }
};
