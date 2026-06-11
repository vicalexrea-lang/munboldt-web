/**
 * Engine/MathUtils.ts
 * ---------------------------------------------------------------------------
 * Utilidades matemáticas y de azar compartidas por todo el juego.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Entero aleatorio en [min, max] (ambos incluidos). */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Real aleatorio en [min, max). */
export function randRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function pick<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: lista vacía');
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Elección ponderada: cada item aporta su `weight`. */
export function pickWeighted<T extends { weight: number }>(items: readonly T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}

/** Formatea un número grande para la UI (1.2k, 3.4M…). */
export function fmt(n: number): string {
  const v = Math.floor(n);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

/** Formatea segundos como m:ss. */
export function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
