/**
 * Game/Managers/TechManager.ts
 * ---------------------------------------------------------------------------
 * Árbol de tecnologías: prerequisitos, compra con créditos (afectada por el
 * multiplicador de coste de investigación) y agregación de los bonos de
 * todas las tecnologías investigadas.
 */

import { TECHS, techDef, type Modifiers, type TechDef, type UnitDef } from '../Config';
import type { GameContext } from '../Context';
import { getMod } from '../Modifiers';

export class TechManager {
  private ctx: GameContext;
  private researched = new Set<string>();
  /** Cache de modificadores combinados; se invalida al investigar. */
  private cachedMods: Modifiers | null = null;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  isResearched(id: string): boolean {
    return this.researched.has(id);
  }

  /** Coste real con el descuento de investigación vigente. */
  effectiveCost(id: string): number {
    return Math.round(techDef(id).cost * getMod(this.ctx, 'researchCost'));
  }

  canResearch(id: string): { ok: boolean; reason: string } {
    const def = techDef(id);
    if (this.researched.has(id)) return { ok: false, reason: 'Ya investigada' };
    for (const req of def.requires) {
      if (!this.researched.has(req)) {
        return { ok: false, reason: `Requiere ${techDef(req).name}` };
      }
    }
    const cost = this.effectiveCost(id);
    if (this.ctx.state.credits < cost) {
      return { ok: false, reason: `Faltan créditos (${cost})` };
    }
    return { ok: true, reason: '' };
  }

  research(id: string): boolean {
    const check = this.canResearch(id);
    if (!check.ok) return false;
    const def = techDef(id);
    this.ctx.state.credits -= this.effectiveCost(id);
    this.researched.add(id);
    this.cachedMods = null;
    this.ctx.ui.log(`${def.icon} Investigación completada: ${def.name}.`, 'good');
    return true;
  }

  /** Producto de los modificadores de todas las tecnologías investigadas. */
  activeModifiers(): Modifiers {
    if (this.cachedMods) return this.cachedMods;
    const combined: Modifiers = {};
    for (const id of this.researched) {
      const mods = techDef(id).modifiers;
      if (!mods) continue;
      for (const [key, value] of Object.entries(mods) as [keyof Modifiers, number][]) {
        combined[key] = (combined[key] ?? 1) * value;
      }
    }
    this.cachedMods = combined;
    return combined;
  }

  /** ¿Está disponible esta unidad según las tecnologías investigadas? */
  isUnitUnlocked(def: UnitDef): boolean {
    return !def.requiresTech || this.researched.has(def.requiresTech);
  }

  allTechs(): readonly TechDef[] {
    return TECHS;
  }
}
