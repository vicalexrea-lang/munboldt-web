/**
 * main.ts
 * ---------------------------------------------------------------------------
 * Punto de entrada de ARTEMIS: crea el mundo ECS, el mapa lunar, los
 * sistemas y managers, coloca la base inicial y ejecuta el bucle principal
 * con requestAnimationFrame. La economía corre en ticks fijos de 1 s; la
 * simulación y el render, por frame.
 */

import { World, type EntityId } from './Engine/ECS';
import { clamp } from './Engine/MathUtils';
import { CONFIG } from './Game/Config';
import { Camera, EffectsLayer, GameState, type GameContext } from './Game/Context';
import { LunarMap } from './Game/LunarMap';
import { placeBuilding, releaseBuildingTiles, spawnUnit } from './Game/Factory';
import { Position } from './Game/Components';
import { MovementSystem } from './Game/Systems/MovementSystem';
import { CombatSystem } from './Game/Systems/CombatSystem';
import { TrainingSystem } from './Game/Systems/TrainingSystem';
import { RenderSystem } from './Game/Systems/RenderSystem';
import { ResourceManager } from './Game/Managers/ResourceManager';
import { EventManager } from './Game/Managers/EventManager';
import { GovernmentManager } from './Game/Managers/GovernmentManager';
import { TechManager } from './Game/Managers/TechManager';
import { InputManager } from './Game/Managers/InputManager';
import { UIManager } from './Game/Managers/UIManager';
import { EnemyDirector } from './Game/Managers/EnemyDirector';

class ArtemisGame {
  private ctx: GameContext;
  private render: RenderSystem;
  private canvas: HTMLCanvasElement;
  private lastFrame = performance.now();
  private economyAccumulator = 0;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const minimap = document.getElementById('minimap') as HTMLCanvasElement;
    if (!this.canvas || !minimap) throw new Error('Faltan los canvas del juego en el DOM');

    // ----------------------------------------------------------- Núcleo --
    const world = new World();
    const map = new LunarMap();
    const state = new GameState();
    const camera = new Camera(map.widthPx, map.heightPx);
    const effects = new EffectsLayer();

    // El contexto se rellena por fases (los managers se referencian entre
    // sí a través de él, nunca en sus constructores).
    const ctx = { world, map, state, camera, effects } as GameContext;
    this.ctx = ctx;

    // --------------------------------------------------------- Sistemas --
    const movement = new MovementSystem(ctx);
    const combat = new CombatSystem(ctx, movement);
    const training = new TrainingSystem(ctx);
    world.registerSystem(training);
    world.registerSystem(movement);
    world.registerSystem(combat);
    this.render = new RenderSystem(ctx, this.canvas, minimap);

    // --------------------------------------------------------- Managers --
    ctx.ui = new UIManager(ctx);
    ctx.resources = new ResourceManager(ctx);
    ctx.government = new GovernmentManager(ctx);
    ctx.tech = new TechManager(ctx);
    ctx.events = new EventManager(ctx);
    ctx.enemies = new EnemyDirector(ctx, movement);
    ctx.input = new InputManager(ctx, movement, this.canvas, minimap);
    ctx.ui.init();

    // ------------------------------------------------------ Mundo inicial --
    this.setupInitialColony();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    const hqPos = world.getComponent(state.hqEntity, Position);
    if (hqPos) camera.centerOn(hqPos.x, hqPos.y);
  }

  private setupInitialColony(): void {
    const { map, state } = this.ctx;
    const hqTileX = Math.floor(map.cols / 2) - 2;
    const hqTileY = Math.floor(map.rows / 2) - 2;
    state.hqEntity = placeBuilding(this.ctx, 'hq', hqTileX, hqTileY, true);

    // Escolta inicial de marines bajo la base.
    const below = map.tileCenter(hqTileX + 2, hqTileY + 6);
    for (let i = 0; i < 3; i++) {
      spawnUnit(this.ctx, 'marine', below.x + (i - 1) * 26, below.y);
    }
    state.popCapacity = 10;
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx.camera.resize(this.canvas.width, this.canvas.height);
  }

  start(): void {
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(now: number): void {
    const dt = clamp((now - this.lastFrame) / 1000, 0, 0.05);
    this.lastFrame = now;
    const { state, world, input, ui, effects } = this.ctx;

    // La cámara responde siempre, incluso en pausa.
    input.update(dt);

    if (!state.paused && !state.gameOver) {
      state.elapsed += dt;

      this.ctx.government.update(dt);
      this.ctx.events.update(dt);
      this.ctx.enemies.update(dt);

      world.updateSystems(dt); // entrenamiento → movimiento → combate
      effects.update(dt);

      this.economyAccumulator += dt;
      while (this.economyAccumulator >= CONFIG.economyTickSeconds) {
        this.economyAccumulator -= CONFIG.economyTickSeconds;
        this.ctx.resources.tick();
      }

      world.flushDestroyed((id) => this.onEntityDestroyed(id));
    }

    this.render.update(dt);
    ui.update(dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  private onEntityDestroyed(id: EntityId): void {
    const { state } = this.ctx;
    releaseBuildingTiles(this.ctx, id);
    state.selected = state.selected.filter((sel) => sel !== id);

    if (id === state.hqEntity) {
      this.ctx.ui.showGameOver(
        '💥 Base Central destruida',
        'Los merodeadores han arrasado el corazón de la colonia.'
      );
    }
  }
}

new ArtemisGame().start();
