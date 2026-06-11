/**
 * Game/Config.ts
 * ---------------------------------------------------------------------------
 * Datos de diseño del juego: constantes globales, edificios, unidades,
 * árbol tecnológico, formas de gobierno y catálogo de eventos dinámicos.
 * Ningún otro archivo debería contener "números mágicos" de balance.
 */

// ------------------------------------------------------------------ Tipos --

export type Side = 'player' | 'enemy';

export interface ResourceCost {
  credits?: number;
  water?: number;
  food?: number;
}

/** Claves de los multiplicadores que aplican gobierno/tecnología/eventos. */
export type ModKey =
  | 'waterProduction'
  | 'foodProduction'
  | 'creditProduction'
  | 'allProduction'
  | 'unitDamage'
  | 'unitMaxHp'
  | 'unitSpeed'
  | 'turretDamage'
  | 'buildCost'
  | 'trainCost'
  | 'researchCost'
  | 'trainSpeed'
  | 'popGrowth'
  | 'consumption'
  | 'moraleGain';

export type Modifiers = Partial<Record<ModKey, number>>;

export interface BuildingDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  cost: ResourceCost;
  maxHp: number;
  /** Tamaño en celdas (ancho × alto). */
  tilesW: number;
  tilesH: number;
  buildTime: number; // segundos de construcción
  color: string;
  /** Producción por tick económico (1 s) una vez construido. */
  produces?: { water?: number; food?: number; credits?: number };
  /** Capacidad de población que aporta. */
  housing?: number;
  /** Puede entrenar unidades. */
  trains?: string[];
  /** Estadísticas de ataque (torretas). */
  attack?: { damage: number; range: number; cooldown: number };
  /** Tecnología requerida para poder construirlo. */
  requiresTech?: string;
}

export interface UnitDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  side: Side;
  cost: ResourceCost;
  trainTime: number;
  maxHp: number;
  damage: number;
  range: number;
  cooldown: number;
  speed: number;
  radius: number;
  color: string;
  shape: 'circle' | 'triangle' | 'diamond';
  /** Consumo logístico por tick (agua y comida). */
  upkeep: number;
  requiresTech?: string;
}

export interface TechDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  cost: number; // créditos
  requires: string[];
  modifiers?: Modifiers;
  /** Ids de unidades/edificios que desbloquea (informativo para la UI). */
  unlocks?: string[];
}

export interface GovernmentDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  modifiers: Modifiers;
  /** Moral hacia la que deriva la colonia bajo este gobierno. */
  moraleBaseline: number;
  pros: string[];
  cons: string[];
}

export interface EventChoice {
  label: string;
  /** Coste que debe poder pagarse para habilitar la opción. */
  cost?: ResourceCost;
  outcomeText: string;
}

export interface GameEventDef {
  id: string;
  title: string;
  icon: string;
  text: string;
  weight: number;
  /** Eventos con decisión muestran un modal y pausan la simulación. */
  choices?: EventChoice[];
}

// ------------------------------------------------------------- Constantes --

export const CONFIG = {
  tileSize: 32,
  mapCols: 64,
  mapRows: 44,
  cameraSpeed: 520, // px/s
  economyTickSeconds: 1,
  startingResources: { water: 250, food: 250, credits: 400 },
  startingPopulation: 10,
  startingMorale: 70,
  /** Consumo por colono y por tick. */
  popWaterUse: 0.35,
  popFoodUse: 0.3,
  /** Créditos que aporta cada colono trabajando, por tick. */
  popCreditIncome: 0.25,
  /** Probabilidad por tick de +1 colono si hay recursos y capacidad. */
  popGrowthChance: 0.12,
  governmentSwitchCost: 200,
  governmentCooldown: 60, // s entre cambios
  eventMinDelay: 32,
  eventMaxDelay: 58,
  waveInterval: 95, // s entre asedios enemigos
  firstWaveDelay: 75,
  unitSeparation: 18, // px de empuje entre unidades
} as const;

// -------------------------------------------------------------- Edificios --

export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'hq',
    name: 'Base Central «Artemis»',
    icon: '🏛️',
    description: 'Núcleo de la colonia. Si cae, la partida termina.',
    cost: {},
    maxHp: 2600,
    tilesW: 4,
    tilesH: 4,
    buildTime: 0,
    color: '#8ecae6',
    produces: { credits: 2 },
    housing: 10,
  },
  {
    id: 'habitat',
    name: 'Módulo Hábitat',
    icon: '🏠',
    description: '+8 de capacidad de población.',
    cost: { credits: 150 },
    maxHp: 600,
    tilesW: 2,
    tilesH: 2,
    buildTime: 12,
    color: '#bdb2ff',
    housing: 8,
  },
  {
    id: 'extractor',
    name: 'Extractor de Hielo',
    icon: '🧊',
    description: '+3 agua/s (×2 sobre un depósito de hielo).',
    cost: { credits: 120 },
    maxHp: 500,
    tilesW: 2,
    tilesH: 2,
    buildTime: 10,
    color: '#90e0ef',
    produces: { water: 3 },
  },
  {
    id: 'farm',
    name: 'Granja Hidropónica',
    icon: '🌾',
    description: '+3 comida/s. Consume el agua de la colonia.',
    cost: { credits: 140 },
    maxHp: 500,
    tilesW: 2,
    tilesH: 2,
    buildTime: 10,
    color: '#80ed99',
    produces: { food: 3 },
  },
  {
    id: 'exchange',
    name: 'Centro de Comercio Orbital',
    icon: '🛰️',
    description: '+4 créditos/s mediante contratos con la Tierra.',
    cost: { credits: 200 },
    maxHp: 500,
    tilesW: 2,
    tilesH: 2,
    buildTime: 14,
    color: '#ffd166',
    produces: { credits: 4 },
  },
  {
    id: 'barracks',
    name: 'Barracones',
    icon: '⚔️',
    description: 'Entrena unidades militares. Selecciónalo para reclutar.',
    cost: { credits: 250 },
    maxHp: 800,
    tilesW: 3,
    tilesH: 2,
    buildTime: 16,
    color: '#f4978e',
    trains: ['marine', 'rover', 'goliath'],
  },
  {
    id: 'turret',
    name: 'Torreta Defensiva',
    icon: '🗼',
    description: 'Defensa automática de la base.',
    cost: { credits: 180 },
    maxHp: 700,
    tilesW: 1,
    tilesH: 1,
    buildTime: 8,
    color: '#e63946',
    attack: { damage: 16, range: 170, cooldown: 0.9 },
  },
] as const;

// --------------------------------------------------------------- Unidades --

export const UNITS: readonly UnitDef[] = [
  {
    id: 'marine',
    name: 'Marine Lunar',
    icon: '🪖',
    description: 'Infantería básica. Barata y versátil.',
    side: 'player',
    cost: { credits: 60, food: 10 },
    trainTime: 6,
    maxHp: 70,
    damage: 8,
    range: 95,
    cooldown: 0.8,
    speed: 78,
    radius: 8,
    color: '#4cc9f0',
    shape: 'circle',
    upkeep: 0.2,
  },
  {
    id: 'rover',
    name: 'Róver de Combate',
    icon: '🛞',
    description: 'Vehículo rápido con cañón ligero.',
    side: 'player',
    cost: { credits: 130, water: 15 },
    trainTime: 9,
    maxHp: 120,
    damage: 15,
    range: 115,
    cooldown: 1.0,
    speed: 112,
    radius: 10,
    color: '#48bfe3',
    shape: 'triangle',
    upkeep: 0.3,
    requiresTech: 'rovers',
  },
  {
    id: 'goliath',
    name: 'Tanque «Goliat»',
    icon: '🦾',
    description: 'Blindado pesado de asalto. Lento pero devastador.',
    side: 'player',
    cost: { credits: 280, water: 30 },
    trainTime: 16,
    maxHp: 300,
    damage: 32,
    range: 135,
    cooldown: 1.6,
    speed: 56,
    radius: 13,
    color: '#5390d9',
    shape: 'diamond',
    upkeep: 0.5,
    requiresTech: 'heavyArmor',
  },
  // ------------------------------------------------------------- Enemigos --
  {
    id: 'raider',
    name: 'Merodeador',
    icon: '👾',
    description: 'Saqueador lunar ligero.',
    side: 'enemy',
    cost: {},
    trainTime: 0,
    maxHp: 55,
    damage: 7,
    range: 26,
    cooldown: 0.9,
    speed: 84,
    radius: 8,
    color: '#ef476f',
    shape: 'circle',
    upkeep: 0,
  },
  {
    id: 'spitter',
    name: 'Escupidor',
    icon: '🦂',
    description: 'Atacante a distancia.',
    side: 'enemy',
    cost: {},
    trainTime: 0,
    maxHp: 45,
    damage: 9,
    range: 120,
    cooldown: 1.4,
    speed: 70,
    radius: 8,
    color: '#f3722c',
    shape: 'triangle',
    upkeep: 0,
  },
  {
    id: 'brute',
    name: 'Coloso',
    icon: '🤖',
    description: 'Máquina de asedio pesada.',
    side: 'enemy',
    cost: {},
    trainTime: 0,
    maxHp: 260,
    damage: 22,
    range: 34,
    cooldown: 1.5,
    speed: 52,
    radius: 13,
    color: '#d00000',
    shape: 'diamond',
    upkeep: 0,
  },
] as const;

// ------------------------------------------------------------ Tecnologías --

export const TECHS: readonly TechDef[] = [
  {
    id: 'mining1',
    name: 'Extracción Mejorada I',
    icon: '⛏️',
    description: '+25% de producción de agua.',
    cost: 150,
    requires: [],
    modifiers: { waterProduction: 1.25 },
  },
  {
    id: 'mining2',
    name: 'Extracción Mejorada II',
    icon: '💎',
    description: '+25% adicional de producción de agua.',
    cost: 350,
    requires: ['mining1'],
    modifiers: { waterProduction: 1.25 },
  },
  {
    id: 'agro1',
    name: 'Cultivos Optimizados I',
    icon: '🌱',
    description: '+25% de producción de comida.',
    cost: 150,
    requires: [],
    modifiers: { foodProduction: 1.25 },
  },
  {
    id: 'agro2',
    name: 'Cultivos Optimizados II',
    icon: '🧬',
    description: '+25% adicional de producción de comida.',
    cost: 350,
    requires: ['agro1'],
    modifiers: { foodProduction: 1.25 },
  },
  {
    id: 'trade1',
    name: 'Economía Orbital',
    icon: '📡',
    description: '+25% de ingresos de créditos.',
    cost: 220,
    requires: [],
    modifiers: { creditProduction: 1.25 },
  },
  {
    id: 'logistics',
    name: 'Logística Avanzada',
    icon: '📦',
    description: '-15% de consumo de agua y comida.',
    cost: 300,
    requires: ['trade1'],
    modifiers: { consumption: 0.85 },
  },
  {
    id: 'weapons1',
    name: 'Armas de Plasma I',
    icon: '🔫',
    description: '+20% de daño de las unidades.',
    cost: 250,
    requires: [],
    modifiers: { unitDamage: 1.2 },
  },
  {
    id: 'weapons2',
    name: 'Armas de Plasma II',
    icon: '⚡',
    description: '+25% adicional de daño de las unidades.',
    cost: 500,
    requires: ['weapons1'],
    modifiers: { unitDamage: 1.25 },
  },
  {
    id: 'armor1',
    name: 'Blindaje Compuesto',
    icon: '🛡️',
    description: '+25% de vida máxima de las unidades nuevas.',
    cost: 250,
    requires: [],
    modifiers: { unitMaxHp: 1.25 },
  },
  {
    id: 'turrets2',
    name: 'Torretas Mk-II',
    icon: '🎯',
    description: '+50% de daño de las torretas.',
    cost: 400,
    requires: ['weapons1'],
    modifiers: { turretDamage: 1.5 },
  },
  {
    id: 'rovers',
    name: 'Vehículos de Combate',
    icon: '🛞',
    description: 'Desbloquea el Róver de Combate.',
    cost: 300,
    requires: ['weapons1'],
    unlocks: ['rover'],
  },
  {
    id: 'heavyArmor',
    name: 'Industria Pesada',
    icon: '🏭',
    description: 'Desbloquea el Tanque «Goliat».',
    cost: 600,
    requires: ['rovers', 'armor1'],
    unlocks: ['goliath'],
  },
] as const;

// --------------------------------------------------------------- Gobierno --

export const GOVERNMENTS: readonly GovernmentDef[] = [
  {
    id: 'democracy',
    name: 'Democracia',
    icon: '🗳️',
    description: 'Gobierno civil con economía abierta.',
    modifiers: { creditProduction: 1.15, researchCost: 0.9, unitDamage: 0.9 },
    moraleBaseline: 80,
    pros: ['+15% créditos', '-10% coste de investigación', 'Moral alta (80)'],
    cons: ['-10% daño militar'],
  },
  {
    id: 'dictatorship',
    name: 'Dictadura Militar',
    icon: '🪖',
    description: 'La colonia al servicio del esfuerzo bélico.',
    modifiers: { unitDamage: 1.2, trainCost: 0.8, trainSpeed: 1.25, foodProduction: 0.9 },
    moraleBaseline: 45,
    pros: ['+20% daño militar', '-20% coste de reclutamiento', '+25% velocidad de entrenamiento'],
    cons: ['-10% comida', 'Moral baja (45)'],
  },
  {
    id: 'technocracy',
    name: 'Tecnocracia',
    icon: '🔬',
    description: 'Los ingenieros toman las decisiones.',
    modifiers: { allProduction: 1.15, researchCost: 0.75, popGrowth: 0.7, unitMaxHp: 0.9 },
    moraleBaseline: 65,
    pros: ['+15% toda la producción', '-25% coste de investigación'],
    cons: ['-30% crecimiento de población', '-10% vida de unidades'],
  },
] as const;

// ---------------------------------------------------------------- Eventos --

export const EVENTS: readonly GameEventDef[] = [
  {
    id: 'solarStorm',
    title: 'Tormenta Solar',
    icon: '☀️',
    text: 'Una eyección de masa coronal castiga la superficie: la producción cae un 50% durante 25 segundos.',
    weight: 3,
  },
  {
    id: 'iceDiscovery',
    title: 'Descubrimiento de Hielo',
    icon: '🧊',
    text: 'Los topógrafos localizan una bolsa de hielo subterránea. ¡Reservas de agua ampliadas!',
    weight: 3,
  },
  {
    id: 'meteorShower',
    title: 'Lluvia de Meteoritos',
    icon: '☄️',
    text: 'Fragmentos rocosos impactan en la colonia y dañan estructuras.',
    weight: 2,
  },
  {
    id: 'colonists',
    title: 'Llegada de Colonos',
    icon: '🚀',
    text: 'Una lanzadera de la Tierra trae nuevos colonos voluntarios.',
    weight: 2,
  },
  {
    id: 'harvestBoom',
    title: 'Cosecha Excepcional',
    icon: '🌾',
    text: 'Las granjas hidropónicas rinden por encima de lo esperado.',
    weight: 2,
  },
  {
    id: 'minerStrike',
    title: 'Huelga de Mineros',
    icon: '✊',
    text: 'Los operarios de los extractores exigen mejores condiciones. ¿Cómo respondes, comandante?',
    weight: 2,
    choices: [
      {
        label: 'Negociar y pagar 150 créditos',
        cost: { credits: 150 },
        outcomeText: 'Los mineros vuelven al trabajo satisfechos. Moral +8.',
      },
      {
        label: 'Reprimir la huelga',
        outcomeText: 'La producción cae un 40% durante 30 s y la moral se desploma (-12).',
      },
    ],
  },
  {
    id: 'traders',
    title: 'Caravana Comercial',
    icon: '🛒',
    text: 'Un carguero independiente ofrece comprar excedente de agua.',
    weight: 2,
    choices: [
      {
        label: 'Vender 100 de agua por 180 créditos',
        cost: { water: 100 },
        outcomeText: 'Trato cerrado: +180 créditos.',
      },
      {
        label: 'Rechazar la oferta',
        outcomeText: 'La caravana sigue su ruta.',
      },
    ],
  },
  {
    id: 'pirates',
    title: 'Ultimátum Pirata',
    icon: '🏴‍☠️',
    text: 'Una banda de merodeadores exige un tributo… o atacarán de inmediato.',
    weight: 2,
    choices: [
      {
        label: 'Pagar 200 créditos de tributo',
        cost: { credits: 200 },
        outcomeText: 'Los piratas se retiran… por ahora.',
      },
      {
        label: 'Rechazar: ¡que vengan!',
        outcomeText: '¡Asalto pirata inminente!',
      },
    ],
  },
] as const;

// ------------------------------------------------------------- Búsquedas --

export function buildingDef(id: string): BuildingDef {
  const def = BUILDINGS.find((b) => b.id === id);
  if (!def) throw new Error(`BuildingDef desconocido: ${id}`);
  return def;
}

export function unitDef(id: string): UnitDef {
  const def = UNITS.find((u) => u.id === id);
  if (!def) throw new Error(`UnitDef desconocido: ${id}`);
  return def;
}

export function techDef(id: string): TechDef {
  const def = TECHS.find((t) => t.id === id);
  if (!def) throw new Error(`TechDef desconocido: ${id}`);
  return def;
}

export function governmentDef(id: string): GovernmentDef {
  const def = GOVERNMENTS.find((g) => g.id === id);
  if (!def) throw new Error(`GovernmentDef desconocido: ${id}`);
  return def;
}
