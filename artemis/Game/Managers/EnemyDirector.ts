/**
 * Game/Managers/EnemyDirector.ts
 * ---------------------------------------------------------------------------
 * IA enemiga de asedio: genera oleadas periódicas de merodeadores en los
 * bordes del mapa y les ordena marchar contra la Base Central. La dificultad
 * escala con el número de oleada. También reactiva a los enemigos ociosos.
 */

import { randInt, randRange } from '../../Engine/MathUtils';
import { Mover, Position, Team, UnitAI } from '../Components';
import { CONFIG } from '../Config';
import type { GameContext } from '../Context';
import { spawnUnit } from '../Factory';
import type { MovementSystem } from '../Systems/MovementSystem';

export class EnemyDirector {
  private ctx: GameContext;
  private movement: MovementSystem;
  private nextWaveIn: number = CONFIG.firstWaveDelay;
  private reorderTimer = 3;

  constructor(ctx: GameContext, movement: MovementSystem) {
    this.ctx = ctx;
    this.movement = movement;
  }

  secondsToNextWave(): number {
    return this.nextWaveIn;
  }

  update(dt: number): void {
    this.nextWaveIn -= dt;
    if (this.nextWaveIn <= 0) {
      this.nextWaveIn = CONFIG.waveInterval;
      this.spawnWave();
    }

    // Reactiva enemigos que se quedaron sin órdenes (objetivo destruido…).
    this.reorderTimer -= dt;
    if (this.reorderTimer <= 0) {
      this.reorderTimer = 3;
      this.reorderIdleEnemies();
    }
  }

  /** Oleada programada: composición que escala con el número de oleada. */
  spawnWave(): void {
    const { state, ui } = this.ctx;
    state.wave++;
    const wave = state.wave;

    const raiders = 3 + wave * 2;
    const spitters = wave >= 2 ? wave - 1 : 0;
    const brutes = wave >= 3 ? Math.floor(wave / 2) : 0;

    ui.log(
      `🚨 ¡OLEADA ${wave}! Se acercan ${raiders + spitters + brutes} hostiles a la colonia.`,
      'bad'
    );
    this.spawnGroup(raiders, spitters, brutes);
  }

  /** Incursión inmediata (evento pirata). */
  spawnRaid(count: number): void {
    this.ctx.ui.log('🏴‍☠️ ¡Asalto pirata en el perímetro!', 'bad');
    this.spawnGroup(count, Math.floor(count / 3), 0);
  }

  private spawnGroup(raiders: number, spitters: number, brutes: number): void {
    const { map } = this.ctx;
    // Punto de aparición en un borde aleatorio del mapa.
    const edge = randInt(0, 3);
    const margin = map.tileSize * 1.5;
    let baseX = 0;
    let baseY = 0;
    switch (edge) {
      case 0: baseX = randRange(margin, map.widthPx - margin); baseY = margin; break;
      case 1: baseX = randRange(margin, map.widthPx - margin); baseY = map.heightPx - margin; break;
      case 2: baseX = margin; baseY = randRange(margin, map.heightPx - margin); break;
      default: baseX = map.widthPx - margin; baseY = randRange(margin, map.heightPx - margin);
    }

    const composition: string[] = [
      ...Array<string>(raiders).fill('raider'),
      ...Array<string>(spitters).fill('spitter'),
      ...Array<string>(brutes).fill('brute'),
    ];
    for (const defId of composition) {
      const x = baseX + randRange(-60, 60);
      const y = baseY + randRange(-60, 60);
      const id = spawnUnit(this.ctx, defId, x, y);
      this.sendAgainstBase(id);
    }
  }

  private sendAgainstBase(id: number): void {
    const { world, state } = this.ctx;
    const hqPos = world.getComponent(state.hqEntity, Position);
    const ai = world.getComponent(id, UnitAI);
    if (!hqPos || !ai) return;
    ai.mode = 'attackMove';
    ai.destX = hqPos.x;
    ai.destY = hqPos.y;
    this.movement.commandMove(id, hqPos.x, hqPos.y);
  }

  private reorderIdleEnemies(): void {
    const { world } = this.ctx;
    for (const id of world.query(UnitAI, Team, Mover)) {
      if (world.mustGet(id, Team).side !== 'enemy') continue;
      const ai = world.mustGet(id, UnitAI);
      const mover = world.mustGet(id, Mover);
      if (ai.mode === 'idle' && ai.targetId === null && mover.path.length === 0) {
        this.sendAgainstBase(id);
      }
    }
  }
}
