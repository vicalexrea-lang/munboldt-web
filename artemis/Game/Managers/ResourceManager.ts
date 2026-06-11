/**
 * Game/Managers/ResourceManager.ts
 * ---------------------------------------------------------------------------
 * Economía de la colonia. Una vez por tick (1 s):
 *   - Ingresos de los edificios productores (× multiplicadores y moral).
 *   - Ingresos por colonos trabajando.
 *   - Consumo de agua/comida por población y mantenimiento del ejército.
 *   - Crecimiento de población, deriva de moral y penalizaciones por escasez.
 */

import { CONFIG, unitDef } from '../Config';
import { Building, Health, Housing, Position, ResourceGenerator, Team, UnitAI } from '../Components';
import type { GameContext } from '../Context';
import { getMod, productionMod } from '../Modifiers';

export interface NetRates {
  water: number;
  food: number;
  credits: number;
}

export class ResourceManager {
  private ctx: GameContext;
  /** Tasas netas del último tick, para mostrarlas en la UI. */
  netRates: NetRates = { water: 0, food: 0, credits: 0 };
  waterShortage = false;
  foodShortage = false;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  /** Ejecuta un tick económico completo. */
  tick(): void {
    const { world, state } = this.ctx;
    state.tickCount++;

    const before = { water: state.water, food: state.food, credits: state.credits };

    // ------------------------------------------------------- Producción --
    const waterMod = productionMod(this.ctx, 'water');
    const foodMod = productionMod(this.ctx, 'food');
    const creditMod = productionMod(this.ctx, 'credits');

    for (const id of world.query(ResourceGenerator, Building)) {
      const building = world.mustGet(id, Building);
      if (!building.constructed) continue;
      const gen = world.mustGet(id, ResourceGenerator);
      state.water += gen.water * waterMod;
      state.food += gen.food * foodMod;
      state.credits += gen.credits * creditMod;
    }

    // Colonos trabajando.
    state.credits += state.population * CONFIG.popCreditIncome * creditMod;

    // --------------------------------------------------------- Consumo --
    const consumptionMod = getMod(this.ctx, 'consumption');
    let armyUpkeep = 0;
    for (const id of world.query(UnitAI, Team)) {
      if (world.mustGet(id, Team).side === 'player') {
        armyUpkeep += unitDef(world.mustGet(id, UnitAI).defId).upkeep;
      }
    }
    const waterUse = (state.population * CONFIG.popWaterUse + armyUpkeep) * consumptionMod;
    const foodUse = (state.population * CONFIG.popFoodUse + armyUpkeep) * consumptionMod;

    state.water -= waterUse;
    state.food -= foodUse;

    // ---------------------------------------------------------- Escasez --
    this.waterShortage = state.water <= 0;
    this.foodShortage = state.food <= 0;
    state.water = Math.max(0, state.water);
    state.food = Math.max(0, state.food);
    state.credits = Math.max(0, state.credits);

    if (this.waterShortage || this.foodShortage) {
      state.morale = Math.max(0, state.morale - 2.5);
      // La escasez prolongada cuesta vidas.
      if (state.tickCount % 5 === 0 && state.population > 0) {
        state.population--;
        this.ctx.ui.log('☠️ Un colono ha muerto por la escasez de suministros.', 'bad');
      }
      if (state.tickCount % 10 === 0) {
        this.ctx.ui.log(
          `⚠️ Escasez de ${this.waterShortage ? 'agua' : ''}${this.waterShortage && this.foodShortage ? ' y ' : ''}${this.foodShortage ? 'comida' : ''}: la moral cae.`,
          'warn'
        );
      }
    }

    // ------------------------------------------------ Capacidad y moral --
    state.popCapacity = 0;
    for (const id of world.query(Housing, Building)) {
      if (world.mustGet(id, Building).constructed) {
        state.popCapacity += world.mustGet(id, Housing).capacity;
      }
    }

    // La moral deriva lentamente hacia la base del gobierno actual.
    const baseline = this.ctx.government.moraleBaseline();
    const drift = baseline > state.morale ? 0.6 * getMod(this.ctx, 'moraleGain') : -0.6;
    if (Math.abs(baseline - state.morale) > 0.6) state.morale += drift;
    state.morale = Math.min(100, Math.max(0, state.morale));

    // ------------------------------------------------------ Crecimiento --
    const canGrow =
      !this.waterShortage &&
      !this.foodShortage &&
      state.food > 20 &&
      state.population < state.popCapacity;
    if (canGrow && Math.random() < CONFIG.popGrowthChance * getMod(this.ctx, 'popGrowth')) {
      state.population++;
      const hqPos = world.getComponent(state.hqEntity, Position);
      if (hqPos) this.ctx.effects.floatText(hqPos.x, hqPos.y - 40, '+1 👤', '#bdb2ff');
    }

    // ------------------------------------------------------- Tasas netas --
    this.netRates = {
      water: state.water - before.water,
      food: state.food - before.food,
      credits: state.credits - before.credits,
    };

    // ---------------------------------------------------------- Derrota --
    if (state.population <= 0 && !state.gameOver) {
      const hq = world.getComponent(state.hqEntity, Health);
      if (hq) hq.hp = 0; // sin colonos la base es inviable
      this.ctx.ui.showGameOver(
        '💀 Colonia perdida',
        'La población ha perecido. La Luna reclama lo que es suyo.'
      );
    }
  }
}
