/**
 * Game/Managers/EventManager.ts
 * ---------------------------------------------------------------------------
 * Generador de eventos dinámicos: a intervalos aleatorios lanza situaciones
 * (tormentas solares, descubrimientos, huelgas…) que alteran los recursos.
 * Los eventos con decisión pausan la simulación y muestran un modal cuyas
 * opciones pueden requerir pagar un coste.
 */

import { randInt, randRange, pickWeighted, pick } from '../../Engine/MathUtils';
import { Building, Health, Position } from '../Components';
import { CONFIG, EVENTS, type GameEventDef, type Modifiers } from '../Config';
import type { GameContext } from '../Context';

interface TimedModifier {
  mods: Modifiers;
  /** Momento (state.elapsed) en que expira. */
  expiresAt: number;
  label: string;
}

export class EventManager {
  private ctx: GameContext;
  private nextEventIn = randRange(CONFIG.eventMinDelay, CONFIG.eventMaxDelay);
  private timed: TimedModifier[] = [];

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  update(dt: number): void {
    const { state } = this.ctx;

    // Expiración de efectos temporales.
    const before = this.timed.length;
    this.timed = this.timed.filter((tm) => tm.expiresAt > state.elapsed);
    if (this.timed.length < before) {
      this.ctx.ui.log('🌤️ Las condiciones vuelven a la normalidad.', 'info');
    }

    this.nextEventIn -= dt;
    if (this.nextEventIn <= 0) {
      this.nextEventIn = randRange(CONFIG.eventMinDelay, CONFIG.eventMaxDelay);
      this.trigger(pickWeighted(EVENTS));
    }
  }

  /** Modificadores combinados de todos los efectos temporales activos. */
  activeModifiers(): Modifiers {
    const combined: Modifiers = {};
    for (const tm of this.timed) {
      for (const [key, value] of Object.entries(tm.mods) as [keyof Modifiers, number][]) {
        combined[key] = (combined[key] ?? 1) * value;
      }
    }
    return combined;
  }

  /** Etiquetas de efectos activos (para la UI). */
  activeEffectLabels(): string[] {
    return this.timed.map((tm) => tm.label);
  }

  private addTimed(mods: Modifiers, seconds: number, label: string): void {
    this.timed.push({ mods, expiresAt: this.ctx.state.elapsed + seconds, label });
  }

  // ------------------------------------------------------------ Disparo --

  trigger(def: GameEventDef): void {
    const { ui } = this.ctx;
    ui.log(`${def.icon} EVENTO — ${def.title}: ${def.text}`, 'warn');

    if (def.choices) {
      ui.showEventModal(def, (choiceIndex) => this.resolveChoice(def, choiceIndex));
    } else {
      this.applyAutoEvent(def);
    }
  }

  private applyAutoEvent(def: GameEventDef): void {
    const { state, ui, effects, world } = this.ctx;
    switch (def.id) {
      case 'solarStorm': {
        this.addTimed({ allProduction: 0.5 }, 25, '☀️ Tormenta solar (-50% producción)');
        break;
      }
      case 'iceDiscovery': {
        const gained = randInt(150, 300);
        state.water += gained;
        ui.log(`🧊 Reservas de agua: +${gained}.`, 'good');
        break;
      }
      case 'harvestBoom': {
        const gained = randInt(100, 200);
        state.food += gained;
        ui.log(`🌾 Excedente de comida: +${gained}.`, 'good');
        break;
      }
      case 'colonists': {
        const slots = Math.max(0, state.popCapacity - state.population);
        const arrivals = Math.min(slots, randInt(3, 6));
        state.population += arrivals;
        ui.log(
          arrivals > 0
            ? `🚀 ${arrivals} colonos se unen a la colonia.`
            : '🚀 La lanzadera se marcha: no hay hábitats libres.',
          arrivals > 0 ? 'good' : 'warn'
        );
        break;
      }
      case 'meteorShower': {
        const buildings = world.query(Building, Health, Position);
        const hits = Math.min(buildings.length, randInt(1, 3));
        for (let i = 0; i < hits; i++) {
          const id = pick(buildings);
          const health = world.mustGet(id, Health);
          const pos = world.mustGet(id, Position);
          const damage = randInt(80, 180);
          health.hp -= damage;
          effects.boom(pos.x, pos.y, 26, '#ff7b00');
          if (health.hp <= 0) {
            world.destroyEntity(id);
            ui.log('☄️ ¡Un impacto directo destruye una estructura!', 'bad');
          } else {
            ui.log(`☄️ Impacto de meteorito: -${damage} de integridad estructural.`, 'bad');
          }
        }
        break;
      }
    }
  }

  private resolveChoice(def: GameEventDef, choiceIndex: number): void {
    const { state, ui } = this.ctx;
    const choice = def.choices![choiceIndex]!;

    if (choice.cost) state.pay(choice.cost);
    ui.log(`${def.icon} ${choice.outcomeText}`, 'info');

    switch (`${def.id}:${choiceIndex}`) {
      case 'minerStrike:0':
        state.morale = Math.min(100, state.morale + 8);
        break;
      case 'minerStrike:1':
        this.addTimed({ allProduction: 0.6 }, 30, '✊ Disturbios (-40% producción)');
        state.morale = Math.max(0, state.morale - 12);
        break;
      case 'traders:0':
        state.credits += 180;
        break;
      case 'pirates:1':
        this.ctx.enemies.spawnRaid(4 + state.wave);
        break;
    }
  }
}
