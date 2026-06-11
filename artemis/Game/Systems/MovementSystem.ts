/**
 * Game/Systems/MovementSystem.ts
 * ---------------------------------------------------------------------------
 * Movimiento de unidades: seguimiento de waypoints calculados con A*,
 * recálculo de ruta cuando el camino se invalida (p. ej. un edificio nuevo)
 * y separación suave entre unidades para que no se apilen.
 */

import { System, type EntityId } from '../../Engine/ECS';
import { findPath } from '../../Engine/Pathfinding';
import { dist, distSq, type Vec2 } from '../../Engine/MathUtils';
import { Mover, Position, UnitAI, Velocity } from '../Components';
import { CONFIG } from '../Config';
import type { GameContext } from '../Context';

const ARRIVE_EPSILON = 6; // px para dar un waypoint por alcanzado

export class MovementSystem extends System {
  private ctx: GameContext;

  constructor(ctx: GameContext) {
    super(ctx.world);
    this.ctx = ctx;
    this.priority = 20;
  }

  /**
   * Ordena a una entidad moverse a un punto del mundo. Calcula la ruta A*
   * inmediatamente; si no hay camino la unidad queda quieta.
   */
  commandMove(id: EntityId, destX: number, destY: number): boolean {
    const { world, map } = this.ctx;
    const pos = world.getComponent(id, Position);
    const mover = world.getComponent(id, Mover);
    if (!pos || !mover) return false;

    const start = map.worldToTile(pos.x, pos.y);
    const goal = map.worldToTile(destX, destY);
    const cells = findPath(map, start, goal);
    if (!cells) {
      mover.path = [];
      return false;
    }
    const path: Vec2[] = cells.map((c) => map.tileCenter(c.x, c.y));
    // El último tramo apunta al destino exacto si su celda es transitable.
    if (map.isWalkable(goal.x, goal.y)) {
      if (path.length > 0) path[path.length - 1] = { x: destX, y: destY };
      else path.push({ x: destX, y: destY });
    }
    mover.path = path;
    mover.repathCooldown = 0.4;
    return true;
  }

  override update(dt: number): void {
    const { world } = this.ctx;
    const movers = world.query(Position, Velocity, Mover, UnitAI);

    for (const id of movers) {
      const pos = world.mustGet(id, Position);
      const vel = world.mustGet(id, Velocity);
      const mover = world.mustGet(id, Mover);
      mover.repathCooldown = Math.max(0, mover.repathCooldown - dt);

      vel.x = 0;
      vel.y = 0;

      const waypoint = mover.path[0];
      if (waypoint) {
        const d = dist(pos.x, pos.y, waypoint.x, waypoint.y);
        if (d <= ARRIVE_EPSILON) {
          mover.path.shift();
        } else {
          vel.x = ((waypoint.x - pos.x) / d) * mover.speed;
          vel.y = ((waypoint.y - pos.y) / d) * mover.speed;
        }
      }
    }

    // Integración + separación entre unidades cercanas.
    this.applySeparation(movers);
    for (const id of movers) {
      const pos = world.mustGet(id, Position);
      const vel = world.mustGet(id, Velocity);
      const next = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
      // No atravesar celdas bloqueadas: si el paso cae en muro, deslizar.
      if (this.walkablePx(next.x, next.y)) {
        pos.x = next.x;
        pos.y = next.y;
      } else if (this.walkablePx(next.x, pos.y)) {
        pos.x = next.x;
      } else if (this.walkablePx(pos.x, next.y)) {
        pos.y = next.y;
      } else {
        // Atascado contra un obstáculo nuevo: forzar recálculo de ruta.
        const mover = world.mustGet(id, Mover);
        const target = mover.path[mover.path.length - 1];
        if (target && mover.repathCooldown <= 0) {
          this.commandMove(id, target.x, target.y);
        }
      }
    }
  }

  private walkablePx(wx: number, wy: number): boolean {
    const { map } = this.ctx;
    const cell = map.worldToTile(wx, wy);
    return map.isWalkable(cell.x, cell.y);
  }

  /** Empuje suave para que las unidades no se solapen. */
  private applySeparation(ids: EntityId[]): void {
    const { world } = this.ctx;
    const minDist = CONFIG.unitSeparation;
    const minDistSq = minDist * minDist;
    for (let i = 0; i < ids.length; i++) {
      const posA = world.mustGet(ids[i]!, Position);
      for (let j = i + 1; j < ids.length; j++) {
        const posB = world.mustGet(ids[j]!, Position);
        const d2 = distSq(posA.x, posA.y, posB.x, posB.y);
        if (d2 >= minDistSq || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = ((minDist - d) / d) * 0.35;
        const dx = (posB.x - posA.x) * push;
        const dy = (posB.y - posA.y) * push;
        if (this.walkablePx(posA.x - dx, posA.y - dy)) {
          posA.x -= dx;
          posA.y -= dy;
        }
        if (this.walkablePx(posB.x + dx, posB.y + dy)) {
          posB.x += dx;
          posB.y += dy;
        }
      }
    }
  }
}
