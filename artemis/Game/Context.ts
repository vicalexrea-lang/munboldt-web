/**
 * Game/Context.ts
 * ---------------------------------------------------------------------------
 * Estado global mutable de la partida, cámara, efectos visuales y el
 * "contexto" que comparte referencias entre sistemas y managers.
 * Sólo importa TIPOS de los managers para evitar ciclos en tiempo de
 * ejecución (los imports de tipo se borran al compilar).
 */

import type { EntityId, World } from '../Engine/ECS';
import { clamp } from '../Engine/MathUtils';
import { CONFIG } from './Config';
import type { LunarMap } from './LunarMap';
import type { ResourceManager } from './Managers/ResourceManager';
import type { EventManager } from './Managers/EventManager';
import type { GovernmentManager } from './Managers/GovernmentManager';
import type { TechManager } from './Managers/TechManager';
import type { InputManager } from './Managers/InputManager';
import type { UIManager } from './Managers/UIManager';
import type { EnemyDirector } from './Managers/EnemyDirector';

// ----------------------------------------------------------------- Estado --

export class GameState {
  water: number = CONFIG.startingResources.water;
  food: number = CONFIG.startingResources.food;
  credits: number = CONFIG.startingResources.credits;
  population: number = CONFIG.startingPopulation;
  popCapacity = 0;
  morale: number = CONFIG.startingMorale;

  /** La simulación se pausa con modales de evento o pausa manual (P). */
  paused = false;
  gameOver = false;
  victoryText = '';
  elapsed = 0; // segundos de partida
  tickCount = 0;
  wave = 0;

  /** Entidades seleccionadas por el jugador. */
  selected: EntityId[] = [];
  /** Id de edificio en modo colocación (ghost), o null. */
  placing: string | null = null;
  /** Tecla A armada: el siguiente click derecho será attack-move. */
  attackMoveArmed = false;

  /** Entidad de la Base Central, fijada al crear el mundo. */
  hqEntity: EntityId = 0;

  canAfford(cost: { credits?: number; water?: number; food?: number }): boolean {
    return (
      this.credits >= (cost.credits ?? 0) &&
      this.water >= (cost.water ?? 0) &&
      this.food >= (cost.food ?? 0)
    );
  }

  pay(cost: { credits?: number; water?: number; food?: number }): void {
    this.credits -= cost.credits ?? 0;
    this.water -= cost.water ?? 0;
    this.food -= cost.food ?? 0;
  }
}

// ----------------------------------------------------------------- Cámara --

export class Camera {
  x = 0;
  y = 0;
  viewW = 0;
  viewH = 0;
  worldW: number;
  worldH: number;

  constructor(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
  }

  resize(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.clampToWorld();
  }

  move(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clampToWorld();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx - this.viewW / 2;
    this.y = wy - this.viewH / 2;
    this.clampToWorld();
  }

  private clampToWorld(): void {
    this.x = clamp(this.x, 0, Math.max(0, this.worldW - this.viewW));
    this.y = clamp(this.y, 0, Math.max(0, this.worldH - this.viewH));
  }

  toWorld(screenX: number, screenY: number): { x: number; y: number } {
    return { x: screenX + this.x, y: screenY + this.y };
  }

  toScreen(worldX: number, worldY: number): { x: number; y: number } {
    return { x: worldX - this.x, y: worldY - this.y };
  }
}

// ---------------------------------------------------------------- Efectos --

export type Effect =
  | { kind: 'beam'; x1: number; y1: number; x2: number; y2: number; color: string; ttl: number; max: number }
  | { kind: 'boom'; x: number; y: number; radius: number; color: string; ttl: number; max: number }
  | { kind: 'text'; x: number; y: number; text: string; color: string; ttl: number; max: number };

export class EffectsLayer {
  effects: Effect[] = [];

  beam(x1: number, y1: number, x2: number, y2: number, color: string): void {
    this.effects.push({ kind: 'beam', x1, y1, x2, y2, color, ttl: 0.12, max: 0.12 });
  }

  boom(x: number, y: number, radius: number, color: string): void {
    this.effects.push({ kind: 'boom', x, y, radius, color, ttl: 0.45, max: 0.45 });
  }

  floatText(x: number, y: number, text: string, color: string): void {
    this.effects.push({ kind: 'text', x, y, text, color, ttl: 1.4, max: 1.4 });
  }

  update(dt: number): void {
    for (const fx of this.effects) fx.ttl -= dt;
    this.effects = this.effects.filter((fx) => fx.ttl > 0);
  }
}

// --------------------------------------------------------------- Contexto --

/**
 * Bolsa de referencias compartidas. Se construye en main.ts y se inyecta en
 * sistemas y managers; los campos de managers se rellenan tras instanciarlos.
 */
export interface GameContext {
  world: World;
  map: LunarMap;
  state: GameState;
  camera: Camera;
  effects: EffectsLayer;
  resources: ResourceManager;
  events: EventManager;
  government: GovernmentManager;
  tech: TechManager;
  input: InputManager;
  ui: UIManager;
  enemies: EnemyDirector;
}
