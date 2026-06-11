/**
 * Game/Systems/RenderSystem.ts
 * ---------------------------------------------------------------------------
 * Dibujado completo de la escena en el Canvas: terreno lunar (pre-renderizado
 * en un canvas fuera de pantalla), edificios, unidades, barras de vida,
 * selección, efectos, fantasma de construcción, caja de selección y minimapa.
 */

import { System } from '../../Engine/ECS';
import { clamp } from '../../Engine/MathUtils';
import {
  Attacker,
  Building,
  Health,
  Position,
  Renderable,
  Selectable,
  Team,
  Trainer,
  UnitAI,
} from '../Components';
import { buildingDef, unitDef } from '../Config';
import type { GameContext } from '../Context';

export class RenderSystem extends System {
  private ctx: GameContext;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private minimap: HTMLCanvasElement;
  private mg: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;

  constructor(ctx: GameContext, canvas: HTMLCanvasElement, minimap: HTMLCanvasElement) {
    super(ctx.world);
    this.ctx = ctx;
    this.canvas = canvas;
    this.minimap = minimap;
    this.priority = 100;

    const g = canvas.getContext('2d');
    const mg = minimap.getContext('2d');
    if (!g || !mg) throw new Error('Canvas 2D no soportado');
    this.g = g;
    this.mg = mg;
    this.terrain = this.prerenderTerrain();
  }

  // ------------------------------------------------------------- Terreno --

  /** El terreno es estático: se pinta una vez a un canvas offscreen. */
  private prerenderTerrain(): HTMLCanvasElement {
    const { map } = this.ctx;
    const off = document.createElement('canvas');
    off.width = map.widthPx;
    off.height = map.heightPx;
    const t = off.getContext('2d')!;

    // Regolito base con ruido sutil por celda.
    for (let cy = 0; cy < map.rows; cy++) {
      for (let cx = 0; cx < map.cols; cx++) {
        const shade = 38 + Math.floor(Math.random() * 10);
        t.fillStyle = `rgb(${shade}, ${shade}, ${shade + 6})`;
        t.fillRect(cx * map.tileSize, cy * map.tileSize, map.tileSize, map.tileSize);
      }
    }

    // Rejilla tenue.
    t.strokeStyle = 'rgba(255,255,255,0.03)';
    t.lineWidth = 1;
    for (let cx = 0; cx <= map.cols; cx++) {
      t.beginPath();
      t.moveTo(cx * map.tileSize, 0);
      t.lineTo(cx * map.tileSize, map.heightPx);
      t.stroke();
    }
    for (let cy = 0; cy <= map.rows; cy++) {
      t.beginPath();
      t.moveTo(0, cy * map.tileSize);
      t.lineTo(map.widthPx, cy * map.tileSize);
      t.stroke();
    }

    // Depósitos de hielo.
    for (const cell of map.iceCells()) {
      const x = cell.x * map.tileSize;
      const y = cell.y * map.tileSize;
      t.fillStyle = 'rgba(120, 200, 255, 0.30)';
      t.fillRect(x, y, map.tileSize, map.tileSize);
      t.fillStyle = 'rgba(200, 240, 255, 0.85)';
      t.beginPath();
      t.moveTo(x + map.tileSize * 0.5, y + map.tileSize * 0.2);
      t.lineTo(x + map.tileSize * 0.78, y + map.tileSize * 0.72);
      t.lineTo(x + map.tileSize * 0.22, y + map.tileSize * 0.72);
      t.closePath();
      t.fill();
    }

    // Cráteres.
    for (const crater of map.craters) {
      const grad = t.createRadialGradient(crater.x, crater.y, crater.r * 0.2, crater.x, crater.y, crater.r);
      grad.addColorStop(0, 'rgba(8,8,14,0.95)');
      grad.addColorStop(0.8, 'rgba(20,20,28,0.9)');
      grad.addColorStop(1, 'rgba(90,90,100,0.55)');
      t.fillStyle = grad;
      t.beginPath();
      t.arc(crater.x, crater.y, crater.r, 0, Math.PI * 2);
      t.fill();
      t.strokeStyle = 'rgba(160,160,175,0.35)';
      t.lineWidth = 2;
      t.stroke();
    }
    return off;
  }

  // -------------------------------------------------------------- Update --

  override update(_dt: number): void {
    const { camera } = this.ctx;
    const g = this.g;

    g.fillStyle = '#06060c';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);

    g.save();
    g.translate(-camera.x, -camera.y);
    g.drawImage(this.terrain, 0, 0);

    this.drawBuildings();
    this.drawUnits();
    this.drawEffects();
    this.drawGhost();
    g.restore();

    this.drawSelectionBox();
    this.drawMinimap();
  }

  // ----------------------------------------------------------- Edificios --

  private drawBuildings(): void {
    const { world, map } = this.ctx;
    const g = this.g;

    for (const id of world.query(Building, Position, Renderable, Health)) {
      const building = world.mustGet(id, Building);
      const render = world.mustGet(id, Renderable);
      const health = world.mustGet(id, Health);
      const def = buildingDef(building.defId);

      const x = building.tileX * map.tileSize;
      const y = building.tileY * map.tileSize;
      const w = building.tilesW * map.tileSize;
      const h = building.tilesH * map.tileSize;

      // Plataforma.
      g.fillStyle = 'rgba(15,15,22,0.85)';
      g.fillRect(x - 2, y - 2, w + 4, h + 4);

      // Cuerpo (atenuado mientras está en obras).
      g.globalAlpha = building.constructed ? 1 : 0.45;
      g.fillStyle = render.color;
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.globalAlpha = 1;

      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 2;
      g.strokeRect(x + 3, y + 3, w - 6, h - 6);

      // Icono.
      g.font = `${Math.floor(Math.min(w, h) * 0.45)}px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(render.icon, x + w / 2, y + h / 2);

      // Marcador de hielo bajo el extractor.
      if (building.defId === 'extractor' && building.onIceDeposit) {
        g.font = '12px serif';
        g.fillText('🧊×2', x + w / 2, y + h - 8);
      }

      // Barra de progreso de obra.
      if (!building.constructed) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(x + 4, y + h - 10, w - 8, 6);
        g.fillStyle = '#ffd166';
        g.fillRect(x + 4, y + h - 10, (w - 8) * building.buildProgress, 6);
      }

      // Barra de vida (si está dañado o seleccionado).
      const selected = world.getComponent(id, Selectable)?.selected ?? false;
      if (health.hp < health.max || selected) {
        this.drawHealthBar(x + 4, y - 10, w - 8, health.hp / health.max);
      }
      if (selected) {
        g.strokeStyle = '#80ffdb';
        g.lineWidth = 2;
        g.setLineDash([6, 4]);
        g.strokeRect(x - 3, y - 3, w + 6, h + 6);
        g.setLineDash([]);
        // Alcance de la torreta y cola de entrenamiento.
        const atk = world.getComponent(id, Attacker);
        if (atk) this.drawRangeRing(x + w / 2, y + h / 2, atk.range);
        const trainer = world.getComponent(id, Trainer);
        if (trainer && trainer.queue.length > 0) {
          const unit = unitDef(trainer.queue[0]!);
          g.fillStyle = 'rgba(0,0,0,0.6)';
          g.fillRect(x + 4, y + h + 4, w - 8, 6);
          g.fillStyle = '#4cc9f0';
          g.fillRect(x + 4, y + h + 4, (w - 8) * (trainer.progress / unit.trainTime), 6);
        }
      }
    }
  }

  // ------------------------------------------------------------ Unidades --

  private drawUnits(): void {
    const { world } = this.ctx;
    const g = this.g;

    for (const id of world.query(UnitAI, Position, Renderable, Health, Team)) {
      const pos = world.mustGet(id, Position);
      const render = world.mustGet(id, Renderable);
      const health = world.mustGet(id, Health);
      const team = world.mustGet(id, Team);
      const r = render.size;

      const selected = world.getComponent(id, Selectable)?.selected ?? false;
      if (selected) {
        g.strokeStyle = '#80ffdb';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(pos.x, pos.y, r + 5, 0, Math.PI * 2);
        g.stroke();
      }

      g.fillStyle = render.color;
      g.strokeStyle = team.side === 'player' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      switch (render.shape) {
        case 'circle':
          g.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          break;
        case 'triangle':
          g.moveTo(pos.x, pos.y - r);
          g.lineTo(pos.x + r, pos.y + r);
          g.lineTo(pos.x - r, pos.y + r);
          g.closePath();
          break;
        case 'diamond':
          g.moveTo(pos.x, pos.y - r);
          g.lineTo(pos.x + r, pos.y);
          g.lineTo(pos.x, pos.y + r);
          g.lineTo(pos.x - r, pos.y);
          g.closePath();
          break;
        default:
          g.rect(pos.x - r, pos.y - r, r * 2, r * 2);
      }
      g.fill();
      g.stroke();

      if (health.hp < health.max || selected) {
        this.drawHealthBar(pos.x - r, pos.y - r - 8, r * 2, health.hp / health.max);
      }
    }
  }

  // ----------------------------------------------------- Efectos y extras --

  private drawEffects(): void {
    const g = this.g;
    for (const fx of this.ctx.effects.effects) {
      const life = fx.ttl / fx.max;
      switch (fx.kind) {
        case 'beam':
          g.globalAlpha = life;
          g.strokeStyle = fx.color;
          g.lineWidth = 2.5;
          g.beginPath();
          g.moveTo(fx.x1, fx.y1);
          g.lineTo(fx.x2, fx.y2);
          g.stroke();
          break;
        case 'boom':
          g.globalAlpha = life;
          g.strokeStyle = fx.color;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(fx.x, fx.y, fx.radius * (1.6 - life * 0.6), 0, Math.PI * 2);
          g.stroke();
          break;
        case 'text':
          g.globalAlpha = life;
          g.fillStyle = fx.color;
          g.font = 'bold 13px sans-serif';
          g.textAlign = 'center';
          g.fillText(fx.text, fx.x, fx.y - (1 - life) * 24);
          break;
      }
      g.globalAlpha = 1;
    }
  }

  /** Fantasma del edificio en colocación, verde/rojo según validez. */
  private drawGhost(): void {
    const { state, map, input } = this.ctx;
    if (!state.placing) return;
    const def = buildingDef(state.placing);
    const mouse = input.mouseWorld;
    const cell = map.worldToTile(mouse.x, mouse.y);
    const cx = cell.x - Math.floor(def.tilesW / 2);
    const cy = cell.y - Math.floor(def.tilesH / 2);
    const ok = map.canPlaceBuilding(cx, cy, def.tilesW, def.tilesH) && state.canAfford(def.cost);

    const g = this.g;
    g.globalAlpha = 0.55;
    g.fillStyle = ok ? '#52b788' : '#e63946';
    g.fillRect(cx * map.tileSize, cy * map.tileSize, def.tilesW * map.tileSize, def.tilesH * map.tileSize);
    g.globalAlpha = 1;
    g.strokeStyle = ok ? '#b7e4c7' : '#ffccd5';
    g.lineWidth = 2;
    g.strokeRect(cx * map.tileSize, cy * map.tileSize, def.tilesW * map.tileSize, def.tilesH * map.tileSize);
    g.font = '20px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(
      def.icon,
      (cx + def.tilesW / 2) * map.tileSize,
      (cy + def.tilesH / 2) * map.tileSize
    );
  }

  private drawSelectionBox(): void {
    const rect = this.ctx.input.selectionRect();
    if (!rect) return;
    const g = this.g;
    g.strokeStyle = '#80ffdb';
    g.lineWidth = 1.5;
    g.fillStyle = 'rgba(128,255,219,0.08)';
    g.fillRect(rect.x, rect.y, rect.w, rect.h);
    g.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }

  private drawHealthBar(x: number, y: number, width: number, ratio: number): void {
    const g = this.g;
    const r = clamp(ratio, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(x, y, width, 5);
    g.fillStyle = r > 0.55 ? '#70e000' : r > 0.25 ? '#ffd000' : '#ff3c38';
    g.fillRect(x, y, width * r, 5);
  }

  private drawRangeRing(x: number, y: number, range: number): void {
    const g = this.g;
    g.strokeStyle = 'rgba(230,57,70,0.45)';
    g.lineWidth = 1.5;
    g.setLineDash([8, 6]);
    g.beginPath();
    g.arc(x, y, range, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }

  // ------------------------------------------------------------- Minimapa --

  private drawMinimap(): void {
    const { world, map, camera } = this.ctx;
    const mg = this.mg;
    const sx = this.minimap.width / map.widthPx;
    const sy = this.minimap.height / map.heightPx;

    mg.fillStyle = '#15151f';
    mg.fillRect(0, 0, this.minimap.width, this.minimap.height);

    mg.fillStyle = 'rgba(120,200,255,0.7)';
    for (const cell of map.iceCells()) {
      mg.fillRect(cell.x * map.tileSize * sx, cell.y * map.tileSize * sy, 2, 2);
    }
    mg.fillStyle = '#000';
    for (const crater of map.craters) {
      mg.beginPath();
      mg.arc(crater.x * sx, crater.y * sy, crater.r * sx, 0, Math.PI * 2);
      mg.fill();
    }

    for (const id of world.query(Position, Team, Renderable)) {
      const pos = world.mustGet(id, Position);
      const team = world.mustGet(id, Team);
      const isBuilding = world.hasComponent(id, Building);
      mg.fillStyle = team.side === 'player' ? (isBuilding ? '#8ecae6' : '#4cc9f0') : '#ef476f';
      const size = isBuilding ? 4 : 2;
      mg.fillRect(pos.x * sx - size / 2, pos.y * sy - size / 2, size, size);
    }

    // Marco de la cámara.
    mg.strokeStyle = 'rgba(255,255,255,0.8)';
    mg.lineWidth = 1;
    mg.strokeRect(camera.x * sx, camera.y * sy, camera.viewW * sx, camera.viewH * sy);
  }
}
