// Shared visual renderer for closure demos.
// It does not generate shapes. It only projects and draws the point sets
// produced by draw.js and field.js.

(function () {
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function project(p, viewport, camera) {
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cp - z1 * sp;
  const z2 = p[1] * sp + z1 * cp;
  const d = (z2 + 1.25) * 0.44;
  return {
    x: viewport.CX + x1 * viewport.R,
    y: viewport.CY - y2 * viewport.R,
    d,
    z: z2,
    c: p[3] ?? 0.6,
  };
}

function palette(c, depth) {
  let rgb;
  if (c < 0.34) rgb = [170, 174, 180];
  else if (c < 0.46) rgb = [230, 155, 106];
  else if (c < 0.58) rgb = [235, 132, 176];
  else rgb = [65, 188, 228];
  const light = 0.62 + clamp(depth, 0, 1) * 0.52;
  return [
    Math.round(rgb[0] * light),
    Math.round(rgb[1] * light),
    Math.round(rgb[2] * light),
  ];
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
}

function drawBackdrop(ctx, W, H, time) {
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#071017");
  bg.addColorStop(0.48, "#0b0d16");
  bg.addColorStop(1, "#11141a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const grid = Math.max(18, Math.min(W, H) / 18);
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "rgba(90, 190, 220, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const drift = (time * 10) % grid;
  for (let x = -grid + drift; x < W + grid; x += grid) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x - W * 0.24, H);
  }
  for (let y = -grid; y < H + grid; y += grid) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y + W * 0.24);
  }
  ctx.stroke();
  ctx.restore();
}

function drawLinks(ctx, projected, scale) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = Math.max(0.35, scale * 0.65);
  ctx.beginPath();
  let open = false;
  for (let i = 1; i < projected.length; i++) {
    const a = projected[i - 1];
    const b = projected[i];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const near = dx * dx + dy * dy < scale * scale * 420;
    if (!near) {
      open = false;
      continue;
    }
    if (!open) {
      ctx.moveTo(a.x, a.y);
      open = true;
    }
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = "rgba(110, 220, 245, 0.105)";
  ctx.stroke();
  ctx.restore();
}

function render(ctx, pts, viewport, camera, options = {}) {
  const time = camera.time || 0;
  drawBackdrop(ctx, viewport.W, viewport.H, time);

  const sourceOrder = pts.map(p => project(p, viewport, camera));
  const projected = sourceOrder.slice().sort((a, b) => a.d - b.d);
  const scale = Math.max(0.75, Math.min(viewport.W, viewport.H) / 520);

  if (options.links !== false && sourceOrder.length < 9000) drawLinks(ctx, sourceOrder, scale);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of projected) {
    const depth = clamp(p.d, 0, 1);
    const rgb = palette(p.c, depth);
    const size = (1.4 + depth * 2.2) * scale;
    const glow = size * 2.1;
    const a = 0.024 + depth * 0.046;
    ctx.fillStyle = rgba(rgb, a);
    ctx.beginPath();
    ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  for (const p of projected) {
    const depth = clamp(p.d, 0, 1);
    const rgb = palette(p.c, depth);
    const size = (0.85 + depth * 1.45) * scale;
    ctx.fillStyle = rgba(rgb, 0.46 + depth * 0.42);
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba([255, 255, 255], 0.035 + depth * 0.060);
    ctx.beginPath();
    ctx.arc(p.x - size * 0.22, p.y - size * 0.22, Math.max(0.32, size * 0.22), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  return projected.length;
}

window.ClosureParticleRenderer = { render, project };
})();
