/**
 * Game/Components.ts
 * ---------------------------------------------------------------------------
 * Todos los componentes ECS del juego. Sólo datos: la lógica vive en los
 * sistemas y managers.
 */

import { Component, type EntityId } from '../Engine/ECS';
import type { Vec2 } from '../Engine/MathUtils';
import type { Side } from './Config';

// ----------------------------------------------------------------- Básicos --

export class Position extends Component {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
  }
}

export class Velocity extends Component {
  x = 0;
  y = 0;
}

export class Health extends Component {
  hp: number;
  max: number;
  constructor(max: number) {
    super();
    this.max = max;
    this.hp = max;
  }
}

export class Team extends Component {
  side: Side;
  constructor(side: Side) {
    super();
    this.side = side;
  }
}

export type Shape = 'circle' | 'rect' | 'triangle' | 'diamond';

export class Renderable extends Component {
  shape: Shape;
  color: string;
  /** Radio para unidades; medio-lado para edificios. */
  size: number;
  icon: string;
  constructor(shape: Shape, color: string, size: number, icon = '') {
    super();
    this.shape = shape;
    this.color = color;
    this.size = size;
    this.icon = icon;
  }
}

export class Selectable extends Component {
  selected = false;
}

// ---------------------------------------------------------------- Unidades --

export type AIMode = 'idle' | 'move' | 'attackMove' | 'attackTarget';

export class UnitAI extends Component {
  /** Id de la definición (marine, raider…). */
  defId: string;
  mode: AIMode = 'idle';
  /** Objetivo explícito de ataque (orden del jugador o IA). */
  targetId: EntityId | null = null;
  /** Destino final de la orden actual. */
  destX = 0;
  destY = 0;
  constructor(defId: string) {
    super();
    this.defId = defId;
  }
}

export class Mover extends Component {
  speed: number;
  path: Vec2[] = [];
  /** Tiempo hasta poder recalcular ruta (evita spamear A*). */
  repathCooldown = 0;
  constructor(speed: number) {
    super();
    this.speed = speed;
  }
}

export class Attacker extends Component {
  damage: number;
  range: number;
  cooldownMax: number;
  cooldown = 0;
  /** Distancia a la que adquiere objetivos por sí solo. */
  aggroRange: number;
  constructor(damage: number, range: number, cooldownMax: number, aggroRange: number) {
    super();
    this.damage = damage;
    this.range = range;
    this.cooldownMax = cooldownMax;
    this.aggroRange = aggroRange;
  }
}

// --------------------------------------------------------------- Edificios --

export class Building extends Component {
  defId: string;
  tileX: number;
  tileY: number;
  tilesW: number;
  tilesH: number;
  /** 0..1: en obras hasta llegar a 1. */
  buildProgress: number;
  /** El extractor produce el doble sobre hielo. */
  onIceDeposit = false;
  constructor(
    defId: string,
    tileX: number,
    tileY: number,
    tilesW: number,
    tilesH: number,
    buildProgress: number
  ) {
    super();
    this.defId = defId;
    this.tileX = tileX;
    this.tileY = tileY;
    this.tilesW = tilesW;
    this.tilesH = tilesH;
    this.buildProgress = buildProgress;
  }

  get constructed(): boolean {
    return this.buildProgress >= 1;
  }
}

export class ResourceGenerator extends Component {
  water: number;
  food: number;
  credits: number;
  constructor(water: number, food: number, credits: number) {
    super();
    this.water = water;
    this.food = food;
    this.credits = credits;
  }
}

export class Housing extends Component {
  capacity: number;
  constructor(capacity: number) {
    super();
    this.capacity = capacity;
  }
}

/** Cola de entrenamiento de un edificio militar. */
export class Trainer extends Component {
  queue: string[] = [];
  /** Segundos transcurridos del elemento en cabeza. */
  progress = 0;
  rallyX: number;
  rallyY: number;
  constructor(rallyX: number, rallyY: number) {
    super();
    this.rallyX = rallyX;
    this.rallyY = rallyY;
  }
}
