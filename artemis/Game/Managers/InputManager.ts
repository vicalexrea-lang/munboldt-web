/**
 * Game/Managers/InputManager.ts
 * ---------------------------------------------------------------------------
 * Entrada del jugador estilo RTS:
 *   - Click izquierdo / arrastre: selección de unidades (caja de selección).
 *   - Click derecho: orden de movimiento, ataque a objetivo o attack-move
 *     (con la tecla A armada). Las órdenes en grupo usan formación.
 *   - Modo construcción: fantasma + colocación (Shift mantiene el modo).
 *   - WASD / flechas: desplazamiento de cámara. P: pausa. Esc: cancelar.
 *   - Click en el minimapa: centra la cámara.
 */

import type { EntityId } from '../../Engine/ECS';
import { dist } from '../../Engine/MathUtils';
import {
  Building,
  Mover,
  Position,
  Renderable,
  Selectable,
  Team,
  UnitAI,
} from '../Components';
import { buildingDef, CONFIG } from '../Config';
import type { GameContext } from '../Context';
import { placeBuilding } from '../Factory';
import { getMod, scaledCost } from '../Modifiers';
import type { MovementSystem } from '../Systems/MovementSystem';

const CLICK_TOLERANCE = 6; // px: arrastres menores cuentan como click
const PICK_RADIUS = 14; // px alrededor del cursor para click directo

export class InputManager {
  private ctx: GameContext;
  private movement: MovementSystem;
  private canvas: HTMLCanvasElement;

  private keys = new Set<string>();
  private mouseScreen = { x: 0, y: 0 };
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
  private shiftHeld = false;

  constructor(
    ctx: GameContext,
    movement: MovementSystem,
    canvas: HTMLCanvasElement,
    minimap: HTMLCanvasElement
  ) {
    this.ctx = ctx;
    this.movement = movement;
    this.canvas = canvas;

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    minimap.addEventListener('mousedown', (e) => this.onMinimapClick(e, minimap));
  }

  /** Posición actual del ratón en coordenadas de mundo. */
  get mouseWorld(): { x: number; y: number } {
    return this.ctx.camera.toWorld(this.mouseScreen.x, this.mouseScreen.y);
  }

  /** Caja de selección en pantalla, o null si no se está arrastrando. */
  selectionRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.dragging || !this.dragStart) return null;
    const x = Math.min(this.dragStart.x, this.mouseScreen.x);
    const y = Math.min(this.dragStart.y, this.mouseScreen.y);
    return {
      x,
      y,
      w: Math.abs(this.mouseScreen.x - this.dragStart.x),
      h: Math.abs(this.mouseScreen.y - this.dragStart.y),
    };
  }

  /** Desplazamiento de cámara con teclado; llamar cada frame. */
  update(dt: number): void {
    const speed = CONFIG.cameraSpeed * dt;
    const { camera } = this.ctx;
    if (this.keys.has('w') || this.keys.has('arrowup')) camera.move(0, -speed);
    if (this.keys.has('s') || this.keys.has('arrowdown')) camera.move(0, speed);
    // A está reservada para armar attack-move: el paneo izquierdo usa Q o ←.
    if (this.keys.has('arrowleft') || this.keys.has('q')) camera.move(-speed, 0);
    if (this.keys.has('arrowright') || this.keys.has('d')) camera.move(speed, 0);
  }

  // ------------------------------------------------------------- Ratón --

  private canvasPoint(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.ctx.state.gameOver) return;
    const point = this.canvasPoint(e);
    this.mouseScreen = point;

    if (e.button === 0) {
      if (this.ctx.state.placing) {
        this.tryPlaceBuilding();
        return;
      }
      this.dragStart = point;
      this.dragging = true;
    } else if (e.button === 2) {
      if (this.ctx.state.placing) {
        this.ctx.state.placing = null; // cancelar construcción
        return;
      }
      const world = this.ctx.camera.toWorld(point.x, point.y);
      this.issueCommand(world.x, world.y);
    }
  }

  private onMouseMove(e: MouseEvent): void {
    this.mouseScreen = this.canvasPoint(e);
    this.shiftHeld = e.shiftKey;
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button !== 0 || !this.dragging || !this.dragStart) return;
    const rect = this.selectionRect();
    this.dragging = false;
    const start = this.dragStart;
    this.dragStart = null;
    if (!rect) return;

    if (rect.w < CLICK_TOLERANCE && rect.h < CLICK_TOLERANCE) {
      this.selectAtPoint(start.x, start.y, e.shiftKey);
    } else {
      this.selectInRect(rect, e.shiftKey);
    }
  }

  private onMinimapClick(e: MouseEvent, minimap: HTMLCanvasElement): void {
    const rect = minimap.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    this.ctx.camera.centerOn(fx * this.ctx.map.widthPx, fy * this.ctx.map.heightPx);
  }

  // ------------------------------------------------------------ Teclado --

  private onKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keys.add(key);
    this.shiftHeld = e.shiftKey;

    if (key === 'escape') {
      this.ctx.state.placing = null;
      this.ctx.state.attackMoveArmed = false;
      this.clearSelection();
    } else if (key === 'a' && this.ctx.state.selected.length > 0) {
      this.ctx.state.attackMoveArmed = true;
    } else if (key === 'p') {
      if (!this.ctx.state.gameOver) {
        this.ctx.state.paused = !this.ctx.state.paused;
        this.ctx.ui.log(this.ctx.state.paused ? '⏸️ Partida en pausa.' : '▶️ Partida reanudada.', 'info');
      }
    } else if (key === 'h') {
      const hqPos = this.ctx.world.getComponent(this.ctx.state.hqEntity, Position);
      if (hqPos) this.ctx.camera.centerOn(hqPos.x, hqPos.y);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
    this.shiftHeld = e.shiftKey;
  }

  // ---------------------------------------------------------- Selección --

  private clearSelection(): void {
    const { world, state } = this.ctx;
    for (const id of state.selected) {
      const sel = world.getComponent(id, Selectable);
      if (sel) sel.selected = false;
    }
    state.selected = [];
  }

  private addToSelection(id: EntityId): void {
    const { world, state } = this.ctx;
    const sel = world.getComponent(id, Selectable);
    if (!sel || sel.selected) return;
    sel.selected = true;
    state.selected.push(id);
  }

  private selectAtPoint(sx: number, sy: number, additive: boolean): void {
    const { world, camera } = this.ctx;
    const point = camera.toWorld(sx, sy);
    if (!additive) this.clearSelection();

    // Prioridad a las unidades; después edificios.
    let best: EntityId | null = null;
    let bestDist = Infinity;
    for (const id of world.query(Selectable, Position, Renderable)) {
      const pos = world.mustGet(id, Position);
      const render = world.mustGet(id, Renderable);
      const isUnit = world.hasComponent(id, UnitAI);
      const radius = isUnit ? render.size + PICK_RADIUS : render.size;
      const d = dist(point.x, point.y, pos.x, pos.y);
      if (d > radius) continue;
      const score = isUnit ? d : d + 10_000; // las unidades ganan siempre
      if (score < bestDist) {
        bestDist = score;
        best = id;
      }
    }
    if (best !== null) this.addToSelection(best);
    this.ctx.ui.refreshSelectionPanel();
  }

  private selectInRect(
    rect: { x: number; y: number; w: number; h: number },
    additive: boolean
  ): void {
    const { world, camera } = this.ctx;
    const a = camera.toWorld(rect.x, rect.y);
    const b = camera.toWorld(rect.x + rect.w, rect.y + rect.h);
    if (!additive) this.clearSelection();

    for (const id of world.query(Selectable, Position, UnitAI)) {
      const pos = world.mustGet(id, Position);
      if (pos.x >= a.x && pos.x <= b.x && pos.y >= a.y && pos.y <= b.y) {
        this.addToSelection(id);
      }
    }
    this.ctx.ui.refreshSelectionPanel();
  }

  // ------------------------------------------------------------ Órdenes --

  private issueCommand(wx: number, wy: number): void {
    const { world, state } = this.ctx;
    const units = state.selected.filter((id) => world.hasComponent(id, UnitAI));
    if (units.length === 0) return;

    // ¿Hay un enemigo bajo el cursor? → ataque dirigido.
    const target = this.enemyAt(wx, wy);
    const attackMove = state.attackMoveArmed;
    state.attackMoveArmed = false;

    let index = 0;
    for (const id of units) {
      const ai = world.getComponent(id, UnitAI);
      const mover = world.getComponent(id, Mover);
      if (!ai || !mover) continue;

      if (target !== null) {
        ai.mode = 'attackTarget';
        ai.targetId = target;
        const targetPos = world.getComponent(target, Position);
        if (targetPos) this.movement.commandMove(id, targetPos.x, targetPos.y);
      } else {
        const offset = this.formationOffset(index, units.length);
        ai.mode = attackMove ? 'attackMove' : 'move';
        ai.targetId = null;
        ai.destX = wx + offset.x;
        ai.destY = wy + offset.y;
        this.movement.commandMove(id, ai.destX, ai.destY);
      }
      index++;
    }

    this.ctx.effects.boom(wx, wy, 10, target !== null ? '#ff5d73' : attackMove ? '#ffba08' : '#80ffdb');
  }

  private enemyAt(wx: number, wy: number): EntityId | null {
    const { world } = this.ctx;
    let best: EntityId | null = null;
    let bestDist = Infinity;
    for (const id of world.query(Team, Position, Renderable)) {
      if (world.mustGet(id, Team).side !== 'enemy') continue;
      const pos = world.mustGet(id, Position);
      const render = world.mustGet(id, Renderable);
      const d = dist(wx, wy, pos.x, pos.y);
      if (d <= render.size + PICK_RADIUS && d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    return best;
  }

  /** Formación en rejilla compacta alrededor del punto de destino. */
  private formationOffset(index: number, total: number): { x: number; y: number } {
    if (total === 1) return { x: 0, y: 0 };
    const perRow = Math.ceil(Math.sqrt(total));
    const spacing = CONFIG.unitSeparation + 6;
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    return {
      x: (col - (perRow - 1) / 2) * spacing,
      y: (row - (perRow - 1) / 2) * spacing,
    };
  }

  // ------------------------------------------------------- Construcción --

  private tryPlaceBuilding(): void {
    const { state, map, ui } = this.ctx;
    if (!state.placing) return;
    const def = buildingDef(state.placing);
    const cost = scaledCost(def.cost, getMod(this.ctx, 'buildCost'));

    const mouse = this.mouseWorld;
    const cell = map.worldToTile(mouse.x, mouse.y);
    const cx = cell.x - Math.floor(def.tilesW / 2);
    const cy = cell.y - Math.floor(def.tilesH / 2);

    if (!map.canPlaceBuilding(cx, cy, def.tilesW, def.tilesH)) {
      ui.log('🚫 Terreno no apto para construir ahí.', 'warn');
      return;
    }
    if (!state.canAfford(cost)) {
      ui.log('🚫 Recursos insuficientes para esa estructura.', 'warn');
      return;
    }

    state.pay(cost);
    placeBuilding(this.ctx, def.id, cx, cy);
    ui.log(`🏗️ ${def.name} en construcción (${cost.credits ?? 0}💰).`, 'info');

    if (!this.shiftHeld) state.placing = null; // Shift encadena construcciones
  }
}
