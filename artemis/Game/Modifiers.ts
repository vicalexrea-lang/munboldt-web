/**
 * Game/Modifiers.ts
 * ---------------------------------------------------------------------------
 * Agregación de multiplicadores. Cada fuente (gobierno, tecnologías,
 * eventos activos) expone un mapa parcial ModKey→factor; aquí se combinan
 * multiplicativamente. La moral sólo afecta a la producción.
 */

import type { ModKey, ResourceCost } from './Config';
import type { GameContext } from './Context';

/** Factor combinado de gobierno × tecnología × eventos para una clave. */
export function getMod(ctx: GameContext, key: ModKey): number {
  const sources = [
    ctx.government.activeModifiers(),
    ctx.tech.activeModifiers(),
    ctx.events.activeModifiers(),
  ];
  let factor = 1;
  for (const mods of sources) factor *= mods[key] ?? 1;
  return factor;
}

/** Moral 0..100 → factor de producción 0.5..1.2 (a 70 de moral ≈ 1.0). */
export function moraleFactor(morale: number): number {
  return 0.5 + (morale / 100) * 0.7;
}

/** Factor total de producción para un recurso concreto. */
export function productionMod(
  ctx: GameContext,
  resource: 'water' | 'food' | 'credits'
): number {
  const key: ModKey =
    resource === 'water'
      ? 'waterProduction'
      : resource === 'food'
        ? 'foodProduction'
        : 'creditProduction';
  return getMod(ctx, key) * getMod(ctx, 'allProduction') * moraleFactor(ctx.state.morale);
}

/** Escala un coste por un factor (descuentos de doctrina, etc.). */
export function scaledCost(cost: ResourceCost, factor: number): ResourceCost {
  return {
    credits: cost.credits !== undefined ? Math.round(cost.credits * factor) : undefined,
    water: cost.water !== undefined ? Math.round(cost.water * factor) : undefined,
    food: cost.food !== undefined ? Math.round(cost.food * factor) : undefined,
  };
}
