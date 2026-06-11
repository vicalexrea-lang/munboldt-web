/**
 * Game/Systems/CombatSystem.ts
 * ---------------------------------------------------------------------------
 * Combate en tiempo real: adquisición de objetivos, persecución, rangos,
 * cadencia de disparo, aplicación de daño y muerte de entidades. También
 * resuelve el fuego de las torretas defensivas.
 */

import { System, type EntityId } from '../../Engine/ECS';
import { dist } from '../../Engine/MathUtils';
import {
  Attacker,
  Building,
  Health,
  Mover,
  Position,
  Renderable,
  Team,
  UnitAI,
} from '../Components';
import type { GameContext } from '../Context';
import { getMod } from '../Modifiers';
import type { MovementSystem } from './MovementSystem';

const CHASE_REPATH = 0.5; // s entre recálculos de persecución

export class CombatSystem extends System {
  private ctx: GameContext;
  private movement: MovementSystem;

  constructor(ctx: GameContext, movement: MovementSystem) {
    super(ctx.world);
    this.ctx = ctx;
    this.movement = movement;
    this.priority = 30;
  }

  override update(dt: number): void {
    const { world } = this.ctx;

    // Enfriamiento global de armas.
    for (const id of world.query(Attacker)) {
      const atk = world.mustGet(id, Attacker);
      atk.cooldown = Math.max(0, atk.cooldown - dt);
    }

    this.updateUnits();
    this.updateTurrets();
  }

  // ----------------------------------------------------------- Unidades --

  private updateUnits(): void {
    const { world } = this.ctx;
    for (const id of world.query(UnitAI, Attacker, Position, Team, Mover)) {
      const ai = world.mustGet(id, UnitAI);
      const atk = world.mustGet(id, Attacker);
      const pos = world.mustGet(id, Position);
      const team = world.mustGet(id, Team);
      const mover = world.mustGet(id, Mover);

      // Valida el objetivo actual.
      if (ai.targetId !== null && !this.isValidTarget(ai.targetId, team.side)) {
        ai.targetId = null;
        if (ai.mode === 'attackTarget') ai.mode = 'idle';
      }

      // Adquisición automática (idle y attack-move).
      if (ai.targetId === null && (ai.mode === 'idle' || ai.mode === 'attackMove')) {
        ai.targetId = this.findNearestEnemy(pos, team.side, atk.aggroRange);
      }

      if (ai.targetId !== null) {
        this.engage(id, ai, atk, pos, team.side, mover);
        continue;
      }

      // Sin objetivo: si era una orden de movimiento y la ruta acabó → idle.
      if ((ai.mode === 'move' || ai.mode === 'attackMove') && mover.path.length === 0) {
        ai.mode = 'idle';
      }
    }
  }

  private engage(
    id: EntityId,
    ai: UnitAI,
    atk: Attacker,
    pos: Position,
    side: 'player' | 'enemy',
    mover: Mover
  ): void {
    const { world } = this.ctx;
    const targetPos = world.getComponent(ai.targetId!, Position);
    if (!targetPos) return;

    const targetRadius = this.effectiveRadius(ai.targetId!);
    const gap = dist(pos.x, pos.y, targetPos.x, targetPos.y) - targetRadius;

    if (gap <= atk.range) {
      mover.path = []; // en rango: detenerse y disparar
      if (atk.cooldown <= 0) {
        atk.cooldown = atk.cooldownMax;
        const mod = side === 'player' ? getMod(this.ctx, 'unitDamage') : 1;
        this.dealDamage(id, ai.targetId!, atk.damage * mod, atk.range > 45);
      }
    } else if (mover.repathCooldown <= 0) {
      // Persecución: re-traza ruta hacia el objetivo periódicamente.
      this.movement.commandMove(id, targetPos.x, targetPos.y);
      mover.repathCooldown = CHASE_REPATH;
    }
  }

  // ----------------------------------------------------------- Torretas --

  private updateTurrets(): void {
    const { world } = this.ctx;
    for (const id of world.query(Building, Attacker, Position, Team)) {
      const building = world.mustGet(id, Building);
      if (!building.constructed) continue;
      const atk = world.mustGet(id, Attacker);
      if (atk.cooldown > 0) continue;
      const pos = world.mustGet(id, Position);
      const team = world.mustGet(id, Team);

      const target = this.findNearestEnemy(pos, team.side, atk.range);
      if (target !== null) {
        atk.cooldown = atk.cooldownMax;
        this.dealDamage(id, target, atk.damage * getMod(this.ctx, 'turretDamage'), true);
      }
    }
  }

  // ----------------------------------------------------------- Utilidades --

  private isValidTarget(id: EntityId, attackerSide: 'player' | 'enemy'): boolean {
    const { world } = this.ctx;
    if (!world.isAlive(id)) return false;
    const team = world.getComponent(id, Team);
    return !!team && team.side !== attackerSide && world.hasComponent(id, Health);
  }

  /** Radio efectivo del blanco para medir el alcance contra edificios. */
  private effectiveRadius(id: EntityId): number {
    const render = this.ctx.world.getComponent(id, Renderable);
    if (!render) return 0;
    return render.shape === 'rect' ? render.size * 0.9 : render.size;
  }

  findNearestEnemy(
    pos: Position,
    side: 'player' | 'enemy',
    maxRange: number
  ): EntityId | null {
    const { world } = this.ctx;
    let best: EntityId | null = null;
    let bestDist = Infinity;
    for (const id of world.query(Health, Position, Team)) {
      const team = world.mustGet(id, Team);
      if (team.side === side) continue;
      const targetPos = world.mustGet(id, Position);
      const d =
        dist(pos.x, pos.y, targetPos.x, targetPos.y) - this.effectiveRadius(id);
      if (d <= maxRange && d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    return best;
  }

  private dealDamage(from: EntityId, to: EntityId, amount: number, beam: boolean): void {
    const { world, effects } = this.ctx;
    const health = world.getComponent(to, Health);
    const fromPos = world.getComponent(from, Position);
    const toPos = world.getComponent(to, Position);
    if (!health || !toPos) return;

    if (beam && fromPos) {
      const fromTeam = world.getComponent(from, Team);
      const color = fromTeam?.side === 'player' ? '#7df9ff' : '#ff5d73';
      effects.beam(fromPos.x, fromPos.y, toPos.x, toPos.y, color);
    } else {
      effects.boom(toPos.x, toPos.y, 8, '#ffba08');
    }

    health.hp -= amount;
    if (health.hp <= 0) this.kill(from, to, toPos);
  }

  private kill(killer: EntityId, victim: EntityId, at: Position): void {
    const { world, effects, state } = this.ctx;
    const victimTeam = world.getComponent(victim, Team);
    effects.boom(at.x, at.y, world.hasComponent(victim, Building) ? 30 : 14, '#ff7b00');

    // Botín por bajas enemigas.
    const killerTeam = world.getComponent(killer, Team);
    if (victimTeam?.side === 'enemy' && killerTeam?.side === 'player') {
      state.credits += 12;
      effects.floatText(at.x, at.y - 14, '+12💰', '#ffd166');
    }
    world.destroyEntity(victim);
  }
}
