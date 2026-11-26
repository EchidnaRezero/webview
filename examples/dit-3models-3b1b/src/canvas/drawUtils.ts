// Strict 3B1B Obsidian + 3-Color Semantic Palette (zero rainbow soup)
export const PALETTE = {
  bg: '#060910',
  surface: '#0c121e',
  surfaceHi: '#121b2d',
  grid: 'rgba(148, 163, 184, 0.045)',
  border: 'rgba(148, 163, 184, 0.22)',
  borderSoft: 'rgba(148, 163, 184, 0.12)',
  text: '#f1f5f9',
  text2: '#cbd5e1',
  muted: '#64748b',

  // Strictly 3 semantic colors + 1 subtle warning/gate accent
  // Token modality colors (role q/k/v is indicated by glyphs, not conflated with color)
  img: '#38bdf8',       // Cyan-Sky: Image / Latent tokens
  imgDim: 'rgba(56, 189, 248, 0.16)',
  txt: '#f59e0b',       // Amber: Text / Prompt / ctx tokens
  txtDim: 'rgba(245, 158, 11, 0.16)',
  attn: '#2dd4bf',      // Teal: Attention / XAI / Output
  attnDim: 'rgba(45, 212, 191, 0.18)',
  gate: '#f43f5e',      // Coral: Gate / Trap / Pad / Warning (used sparingly)
  gateDim: 'rgba(244, 63, 94, 0.15)',
};

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
export const easeInOut = (x: number) => {
  const t = clamp(x, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export function drawGridBg(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  const step = 36;
  ctx.beginPath();
  for (let x = step; x < W; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = step; y < H; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  lw = 1.2,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Draw a 3D isometric tensor cuboid (like latent [C, h, w] or velocity v) */
export function drawCuboid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
  color: string,
  fillFront: string,
  gridDivs = 0,
) {
  ctx.save();
  // Top face
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y - dy);
  ctx.lineTo(x + w + dx, y - dy);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fillStyle = color + '28';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Right face
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + dx, y - dy);
  ctx.lineTo(x + w + dx, y + h - dy);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fillStyle = color + '18';
  ctx.fill();
  ctx.stroke();

  // Depth slices on right face
  for (let i = 1; i <= 2; i++) {
    const f = i / 3;
    ctx.beginPath();
    ctx.moveTo(x + w + dx * f, y - dy * f);
    ctx.lineTo(x + w + dx * f, y + h - dy * f);
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Front face
  ctx.fillStyle = fillFront;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x, y, w, h);

  // Optional patch grid on front face
  if (gridDivs > 1) {
    ctx.strokeStyle = color + '44';
    ctx.lineWidth = 0.8;
    for (let i = 1; i < gridDivs; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (w / gridDivs) * i, y);
      ctx.lineTo(x + (w / gridDivs) * i, y + h);
      ctx.moveTo(x, y + (h / gridDivs) * i);
      ctx.lineTo(x + w, y + (h / gridDivs) * i);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Draw stacked 3D depth layers (multi-head attention or repeated DiT blocks) */
export function drawDepthStack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  count = 4,
  stepX = 6,
  stepY = -5,
) {
  ctx.save();
  for (let k = count; k >= 1; k--) {
    const alpha = 0.14 + (1 - k / (count + 1)) * 0.35;
    roundRect(
      ctx,
      x + k * stepX,
      y + k * stepY,
      w,
      h,
      8,
      'rgba(12, 18, 30, 0.55)',
      color + Math.round(alpha * 255).toString(16).padStart(2, '0'),
      1,
    );
  }
  ctx.restore();
}

/** Draw an arrow with optional animated glowing pulse along it */
export function drawFlowArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  pulseT?: number,
  dashed = false,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  if (dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const hs = 6.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hs * Math.cos(ang - 0.42), y2 - hs * Math.sin(ang - 0.42));
  ctx.lineTo(x2 - hs * Math.cos(ang + 0.42), y2 - hs * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();

  // Animated glowing dot
  if (pulseT !== undefined) {
    const px = lerp(x1, x2, pulseT);
    const py = lerp(y1, y2, pulseT);
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, py, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
}

/** Draw a 3B1B RoPE rotation phasor dial */
export function drawRopeDial(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  color: string,
  label: string,
  frozen = false,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? 'rgba(100,116,139,0.08)' : color + '18';
  ctx.fill();
  ctx.strokeStyle = frozen ? 'rgba(148,163,184,0.4)' : color;
  ctx.lineWidth = 1.4;
  if (frozen) ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Axis crosshairs
  ctx.strokeStyle = 'rgba(148,163,184,0.18)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - r + 3, cy);
  ctx.lineTo(cx + r - 3, cy);
  ctx.moveTo(cx, cy - r + 3);
  ctx.lineTo(cx, cy + r - 3);
  ctx.stroke();

  // Rotating vector arrow
  const vx = cx + Math.cos(angle) * (r - 4);
  const vy = cy + Math.sin(angle) * (r - 4);
  ctx.strokeStyle = frozen ? '#94a3b8' : color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(vx, vy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(vx, vy, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#cbd5e1' : '#ffffff';
  ctx.fill();

  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.fillStyle = frozen ? '#94a3b8' : color;
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, cy + r + 14);
  ctx.restore();
}
