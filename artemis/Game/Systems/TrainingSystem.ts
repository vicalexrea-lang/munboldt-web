/**
 * Game/Systems/TrainingSystem.ts
 * ---------------------------------------------------------------------------
 * Avanza las obras de construcción de los edificios y las colas de
 * entrenamiento de los barracones, creando la unidad junto al edificio al
 * completarse.
 */

import { System } from '../../Engine/ECS';
import { randRange } from '../../Engine/MathUtils';
import { Building, Position, Trainer } from '../Components';
import { buildingDef, unitDef } from '../Config';
import type { GameContext } from '../Context';
import { spawnUnit } from '../Factory';
import { getMod } from '../Modifiers';

export class TrainingSystem extends System {
  private ctx: GameContext;

  constructor(ctx: GameContext) {
    super(ctx.world);
    this.ctx = ctx;
    this.priority = 10;
  }

  override update(dt: number): void {
    const { world } = this.ctx;

    // Progreso de construcción.
    for (const id of world.query(Building)) {
      const building = world.mustGet(id, Building);
      if (building.constructed) continue;
      const def = buildingDef(building.defId);
      building.buildProgress = Math.min(1, building.buildProgress + dt / def.buildTime);
      if (building.constructed) {
        this.ctx.ui.log(`🏗️ ${def.name} terminado.`, 'good');
      }
    }

    // Colas de entrenamiento.
    const trainSpeed = getMod(this.ctx, 'trainSpeed');
    for (const id of world.query(Trainer, Building, Position)) {
      const building = world.mustGet(id, Building);
      if (!building.constructed) continue;
      const trainer = world.mustGet(id, Trainer);
      const head = trainer.queue[0];
      if (!head) continue;

      const def = unitDef(head);
      trainer.progress += dt * trainSpeed;
      if (trainer.progress >= def.trainTime) {
        trainer.progress = 0;
        trainer.queue.shift();
        const spawnX = trainer.rallyX + randRange(-14, 14);
        const spawnY = trainer.rallyY + randRange(-10, 10);
        spawnUnit(this.ctx, def.id, spawnX, spawnY);
        this.ctx.ui.log(`${def.icon} ${def.name} listo para el servicio.`, 'good');
      }
    }
  }
}
