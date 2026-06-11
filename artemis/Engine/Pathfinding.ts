/**
 * Engine/Pathfinding.ts
 * ---------------------------------------------------------------------------
 * A* sobre rejilla con 8 direcciones, heurística octil y montículo binario.
 * No permite "cortar esquinas" en diagonal entre dos celdas bloqueadas.
 */

export interface GridLike {
  cols: number;
  rows: number;
  /** true si la celda es transitable. */
  isWalkable(cx: number, cy: number): boolean;
}

export interface Cell {
  x: number;
  y: number;
}

/** Montículo binario mínimo especializado en nodos A*. */
class MinHeap {
  private items: { idx: number; f: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(idx: number, f: number): void {
    this.items.push({ idx, f });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent]!.f <= this.items[i]!.f) break;
      [this.items[parent], this.items[i]] = [this.items[i]!, this.items[parent]!];
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0]!;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.items[l]!.f < this.items[smallest]!.f) smallest = l;
        if (r < this.items.length && this.items[r]!.f < this.items[smallest]!.f) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i]!, this.items[smallest]!];
        i = smallest;
      }
    }
    return top.idx;
  }
}

const SQRT2 = Math.SQRT2;

function octile(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return ax > ay ? ax + (SQRT2 - 1) * ay : ay + (SQRT2 - 1) * ax;
}

/**
 * Calcula la ruta entre dos celdas. Devuelve la lista de celdas (sin incluir
 * la de origen) o `null` si no hay camino. `maxExpansions` acota el coste en
 * mapas grandes (devuelve null si se supera).
 */
export function findPath(
  grid: GridLike,
  start: Cell,
  goal: Cell,
  maxExpansions = 6000
): Cell[] | null {
  const { cols, rows } = grid;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  if (!inside(start.x, start.y) || !inside(goal.x, goal.y)) return null;

  // Si el destino está bloqueado, busca la celda transitable más cercana.
  let target = goal;
  if (!grid.isWalkable(goal.x, goal.y)) {
    const near = nearestWalkable(grid, goal, 6);
    if (!near) return null;
    target = near;
  }
  if (start.x === target.x && start.y === target.y) return [];

  const total = cols * rows;
  const gScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const idxOf = (x: number, y: number) => y * cols + x;

  const open = new MinHeap();
  const startIdx = idxOf(start.x, start.y);
  gScore[startIdx] = 0;
  open.push(startIdx, octile(target.x - start.x, target.y - start.y));

  let expansions = 0;
  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue;
    closed[current] = 1;

    const cx = current % cols;
    const cy = (current / cols) | 0;
    if (cx === target.x && cy === target.y) {
      return reconstruct(cameFrom, current, cols);
    }
    if (++expansions > maxExpansions) return null;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!inside(nx, ny) || !grid.isWalkable(nx, ny)) continue;
        // Evita cortar esquinas: en diagonal ambos ortogonales deben ser libres.
        if (dx !== 0 && dy !== 0) {
          if (!grid.isWalkable(cx + dx, cy) || !grid.isWalkable(cx, cy + dy)) continue;
        }
        const nIdx = idxOf(nx, ny);
        if (closed[nIdx]) continue;
        const step = dx !== 0 && dy !== 0 ? SQRT2 : 1;
        const tentative = gScore[current]! + step;
        if (tentative < gScore[nIdx]!) {
          gScore[nIdx] = tentative;
          cameFrom[nIdx] = current;
          open.push(nIdx, tentative + octile(target.x - nx, target.y - ny));
        }
      }
    }
  }
  return null;
}

function reconstruct(cameFrom: Int32Array, end: number, cols: number): Cell[] {
  const path: Cell[] = [];
  let current = end;
  while (current !== -1) {
    path.push({ x: current % cols, y: (current / cols) | 0 });
    current = cameFrom[current]!;
  }
  path.reverse();
  path.shift(); // descarta la celda de origen
  return simplify(path);
}

/** Colapsa tramos colineales para reducir waypoints. */
function simplify(path: Cell[]): Cell[] {
  if (path.length <= 2) return path;
  const out: Cell[] = [path[0]!];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = path[i]!;
    const c = path[i + 1]!;
    const d1x = Math.sign(b.x - a.x);
    const d1y = Math.sign(b.y - a.y);
    const d2x = Math.sign(c.x - b.x);
    const d2y = Math.sign(c.y - b.y);
    if (d1x !== d2x || d1y !== d2y) out.push(b);
  }
  out.push(path[path.length - 1]!);
  return out;
}

/** Búsqueda en anillo de la celda transitable más cercana a `goal`. */
export function nearestWalkable(grid: GridLike, goal: Cell, maxRadius: number): Cell | null {
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = goal.x + dx;
        const y = goal.y + dy;
        if (x >= 0 && y >= 0 && x < grid.cols && y < grid.rows && grid.isWalkable(x, y)) {
          return { x, y };
        }
      }
    }
  }
  return null;
}
