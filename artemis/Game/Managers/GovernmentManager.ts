/**
 * Game/Managers/GovernmentManager.ts
 * ---------------------------------------------------------------------------
 * Doctrina y gobierno: selección de la forma de gobierno de la colonia y
 * aplicación de sus multiplicadores permanentes. Cambiar de gobierno cuesta
 * créditos (salvo la primera elección) y tiene un tiempo de enfriamiento.
 */

import { CONFIG, GOVERNMENTS, governmentDef, type GovernmentDef, type Modifiers } from '../Config';
import type { GameContext } from '../Context';

export class GovernmentManager {
  private ctx: GameContext;
  private current: GovernmentDef | null = null;
  private cooldown = 0;
  private everSelected = false;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  currentGovernment(): GovernmentDef | null {
    return this.current;
  }

  currentName(): string {
    return this.current ? `${this.current.icon} ${this.current.name}` : '🏳️ Consejo Provisional';
  }

  cooldownRemaining(): number {
    return this.cooldown;
  }

  switchCost(): number {
    return this.everSelected ? CONFIG.governmentSwitchCost : 0;
  }

  canSelect(id: string): { ok: boolean; reason: string } {
    if (this.current?.id === id) return { ok: false, reason: 'Ya es el gobierno actual' };
    if (this.cooldown > 0) {
      return { ok: false, reason: `Disponible en ${Math.ceil(this.cooldown)} s` };
    }
    if (this.ctx.state.credits < this.switchCost()) {
      return { ok: false, reason: `Faltan créditos (${this.switchCost()})` };
    }
    return { ok: true, reason: '' };
  }

  select(id: string): boolean {
    const check = this.canSelect(id);
    if (!check.ok) return false;
    const def = governmentDef(id);
    this.ctx.state.credits -= this.switchCost();
    this.current = def;
    this.cooldown = CONFIG.governmentCooldown;
    this.everSelected = true;
    this.ctx.ui.log(`${def.icon} Nueva doctrina instaurada: ${def.name}.`, 'info');
    return true;
  }

  /** Multiplicadores permanentes del gobierno vigente. */
  activeModifiers(): Modifiers {
    return this.current?.modifiers ?? {};
  }

  /** Moral hacia la que deriva la población bajo el gobierno actual. */
  moraleBaseline(): number {
    return this.current?.moraleBaseline ?? 60;
  }

  allGovernments(): readonly GovernmentDef[] {
    return GOVERNMENTS;
  }
}
