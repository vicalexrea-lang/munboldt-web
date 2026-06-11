/**
 * Game/LunarMap.ts
 * ---------------------------------------------------------------------------
 * El terreno lunar: rejilla de colisión para el pathfinding, cráteres
 * (intransitables), depósitos de hielo (bonifican extractores) y utilidades
 * de conversión mundo↔celda y de ocupación de edificios.
 */

import type { GridLike } from '../Engine/Pathfinding';
import { randInt } from '../Engine/MathUtils';
import { CONFIG } from './Config';

export const TILE = {
  free: 0,
  crater: 1,
  building: 2,
} as const;

export class LunarMap implements GridLike {
  readonly cols = CONFIG.mapCols;
  readonly rows = CONFIG.mapRows;
  readonly tileSize = CONFIG.tileSize;
  readonly widthPx = this.cols * this.tileSize;
  readonly heightPx = this.rows * this.tileSize;

  /** 0 libre, 1 cráter, 2 edificio. */
  private grid = new Uint8Array(this.cols * this.rows);
  /** Celdas con depósito de hielo (transitables y construibles). */
  private ice = new Set<number>();
  /** Cráteres decorativos para el render: centro y radio en px. */
  readonly craters: { x: number; y: number; r: number }[] = [];

  constructor() {
    this.generate();
  }

  private idx(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  private generate(): void {
    // Cráteres aleatorios lejos de la zona inicial de la base (centro).
    const centerX = this.cols / 2;
    const centerY = this.rows / 2;
    const craterCount = 16;
    for (let i = 0; i < craterCount; i++) {
      const cx = randInt(3, this.cols - 4);
      const cy = randInt(3, this.rows - 4);
      const radius = randInt(1, 3);
      if (Math.hypot(cx - centerX, cy - centerY) < 9 + radius) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) {
            this.grid[this.idx(x, y)] = TILE.crater;
          }
        }
      }
      this.craters.push({
        x: (cx + 0.5) * this.tileSize,
        y: (cy + 0.5) * this.tileSize,
        r: (radius + 0.4) * this.tileSize,
      });
    }

    // Vetas de hielo: pequeños racimos repartidos por el mapa.
    for (let i = 0; i < 12; i++) {
      const cx = randInt(2, this.cols - 3);
      const cy = randInt(2, this.rows - 3);
      for (let j = 0; j < randInt(2, 5); j++) {
        const x = cx + randInt(-1, 1);
        const y = cy + randInt(-1, 1);
        if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) {
          if (this.grid[this.idx(x, y)] === TILE.free) this.ice.add(this.idx(x, y));
        }
      }
    }
  }

  // ------------------------------------------------------------ Consultas --

  isWalkable(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false;
    return this.grid[this.idx(cx, cy)] === TILE.free;
  }

  tileAt(cx: number, cy: number): number {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return TILE.crater;
    return this.grid[this.idx(cx, cy)]!;
  }

  hasIce(cx: number, cy: number): boolean {
    return this.ice.has(this.idx(cx, cy));
  }

  iceCells(): { x: number; y: number }[] {
    return [...this.ice].map((i) => ({ x: i % this.cols, y: Math.floor(i / this.cols) }));
  }

  worldToTile(wx: number, wy: number): { x: number; y: number } {
    return { x: Math.floor(wx / this.tileSize), y: Math.floor(wy / this.tileSize) };
  }

  tileCenter(cx: number, cy: number): { x: number; y: number } {
    return { x: (cx + 0.5) * this.tileSize, y: (cy + 0.5) * this.tileSize };
  }

  // ------------------------------------------------------------ Edificios --

  /** ¿Puede colocarse un edificio de tilesW×tilesH con esquina en (cx,cy)? */
  canPlaceBuilding(cx: number, cy: number, tilesW: number, tilesH: number): boolean {
    if (cx < 0 || cy < 0 || cx + tilesW > this.cols || cy + tilesH > this.rows) return false;
    for (let y = cy; y < cy + tilesH; y++) {
      for (let x = cx; x < cx + tilesW; x++) {
        if (this.grid[this.idx(x, y)] !== TILE.free) return false;
      }
    }
    return true;
  }

  occupyBuilding(cx: number, cy: number, tilesW: number, tilesH: number): void {
    for (let y = cy; y < cy + tilesH; y++) {
      for (let x = cx; x < cx + tilesW; x++) {
        this.grid[this.idx(x, y)] = TILE.building;
      }
    }
  }

  freeBuilding(cx: number, cy: number, tilesW: number, tilesH: number): void {
    for (let y = cy; y < cy + tilesH; y++) {
      for (let x = cx; x < cx + tilesW; x++) {
        this.grid[this.idx(x, y)] = TILE.free;
      }
    }
  }

  /** ¿Alguna celda del área tiene hielo? (bonus de extractor) */
  areaHasIce(cx: number, cy: number, tilesW: number, tilesH: number): boolean {
    for (let y = cy; y < cy + tilesH; y++) {
      for (let x = cx; x < cx + tilesW; x++) {
        if (this.hasIce(x, y)) return true;
      }
    }
    return false;
  }
}
