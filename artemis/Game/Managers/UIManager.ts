/**
 * Game/Managers/UIManager.ts
 * ---------------------------------------------------------------------------
 * Panel del comandante (HTML/CSS sobre el canvas): barra de recursos,
 * pestañas de construcción / tecnología / gobierno, panel de selección con
 * reclutamiento, registro de eventos, modales de decisión y fin de partida.
 */

import { fmt, fmtTime } from '../../Engine/MathUtils';
import { Building, Health, Trainer, UnitAI } from '../Components';
import {
  BUILDINGS,
  UNITS,
  buildingDef,
  unitDef,
  type GameEventDef,
  type ResourceCost,
} from '../Config';
import type { GameContext } from '../Context';
import { getMod, scaledCost } from '../Modifiers';

type LogKind = 'info' | 'good' | 'warn' | 'bad';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento de UI no encontrado: #${id}`);
  return node as T;
}

function costLabel(cost: ResourceCost): string {
  const parts: string[] = [];
  if (cost.credits) parts.push(`${cost.credits}💰`);
  if (cost.water) parts.push(`${cost.water}💧`);
  if (cost.food) parts.push(`${cost.food}🌾`);
  return parts.length > 0 ? parts.join(' ') : 'Gratis';
}

export class UIManager {
  private ctx: GameContext;

  // Barra superior.
  private waterEl = el<HTMLSpanElement>('res-water');
  private waterRateEl = el<HTMLSpanElement>('res-water-rate');
  private foodEl = el<HTMLSpanElement>('res-food');
  private foodRateEl = el<HTMLSpanElement>('res-food-rate');
  private creditsEl = el<HTMLSpanElement>('res-credits');
  private creditsRateEl = el<HTMLSpanElement>('res-credits-rate');
  private popEl = el<HTMLSpanElement>('res-pop');
  private moraleEl = el<HTMLSpanElement>('res-morale');
  private govLabelEl = el<HTMLSpanElement>('gov-label');
  private waveEl = el<HTMLSpanElement>('wave-timer');
  private clockEl = el<HTMLSpanElement>('game-clock');
  private effectsEl = el<HTMLDivElement>('active-effects');

  // Paneles.
  private buildButtonsEl = el<HTMLDivElement>('build-buttons');
  private techListEl = el<HTMLDivElement>('tech-list');
  private govListEl = el<HTMLDivElement>('gov-list');
  private selectionEl = el<HTMLDivElement>('selection-content');
  private logEl = el<HTMLDivElement>('event-log');
  private pauseBannerEl = el<HTMLDivElement>('pause-banner');

  // Modal y fin de partida.
  private modalLayerEl = el<HTMLDivElement>('modal-layer');
  private modalIconEl = el<HTMLDivElement>('modal-icon');
  private modalTitleEl = el<HTMLHeadingElement>('modal-title');
  private modalTextEl = el<HTMLParagraphElement>('modal-text');
  private modalChoicesEl = el<HTMLDivElement>('modal-choices');
  private gameOverEl = el<HTMLDivElement>('gameover');
  private gameOverTitleEl = el<HTMLHeadingElement>('gameover-title');
  private gameOverTextEl = el<HTMLParagraphElement>('gameover-text');

  private refreshTimer = 0;
  private modalOpen = false;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  /** Construye los paneles dinámicos una vez que todos los managers existen. */
  init(): void {
    this.bindTabs();
    this.renderBuildButtons();
    this.renderTechTree();
    this.renderGovernments();
    el<HTMLButtonElement>('restart-btn').addEventListener('click', () => location.reload());
    this.log('🌖 Bienvenido a la colonia Artemis, comandante. Expande la base y resiste.', 'info');
  }

  // ------------------------------------------------------------ Registro --

  log(message: string, kind: LogKind = 'info'): void {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${kind}`;
    entry.innerHTML = `<span class="log-time">${fmtTime(this.ctx.state.elapsed)}</span> ${message}`;
    this.logEl.prepend(entry);
    while (this.logEl.children.length > 40) this.logEl.lastChild?.remove();
  }

  // ------------------------------------------------------------- Update --

  update(dt: number): void {
    this.refreshTimer -= dt;
    if (this.refreshTimer > 0) return;
    this.refreshTimer = 0.2;

    const { state, resources } = this.ctx;
    this.waterEl.textContent = fmt(state.water);
    this.foodEl.textContent = fmt(state.food);
    this.creditsEl.textContent = fmt(state.credits);
    this.setRate(this.waterRateEl, resources.netRates.water);
    this.setRate(this.foodRateEl, resources.netRates.food);
    this.setRate(this.creditsRateEl, resources.netRates.credits);

    this.popEl.textContent = `${state.population}/${state.popCapacity}`;
    this.moraleEl.textContent = `${Math.round(state.morale)}%`;
    this.moraleEl.className =
      state.morale > 60 ? 'value good' : state.morale > 30 ? 'value warn' : 'value bad';

    this.govLabelEl.textContent = this.ctx.government.currentName();
    this.waveEl.textContent =
      state.wave === 0
        ? `1ª oleada en ${fmtTime(this.ctx.enemies.secondsToNextWave())}`
        : `Oleada ${state.wave} · próxima en ${fmtTime(this.ctx.enemies.secondsToNextWave())}`;
    this.clockEl.textContent = fmtTime(state.elapsed);

    const labels = this.ctx.events.activeEffectLabels();
    this.effectsEl.textContent = labels.join('  ·  ');
    this.effectsEl.classList.toggle('hidden', labels.length === 0);

    this.pauseBannerEl.classList.toggle('hidden', !state.paused || this.modalOpen || state.gameOver);

    this.refreshBuildAffordability();
    this.renderTechTree();
    this.renderGovernments();
    this.refreshSelectionPanel();
  }

  private setRate(node: HTMLSpanElement, rate: number): void {
    const rounded = Math.round(rate * 10) / 10;
    node.textContent = `${rounded >= 0 ? '+' : ''}${rounded}/s`;
    node.className = `rate ${rounded >= 0 ? 'good' : 'bad'}`;
  }

  // ------------------------------------------------------------ Pestañas --

  private bindTabs(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll<HTMLElement>('.tab-panel').forEach((panel) => {
          panel.classList.toggle('hidden', panel.id !== `tab-${btn.dataset['tab']}`);
        });
      });
    });
  }

  // -------------------------------------------------------- Construcción --

  private renderBuildButtons(): void {
    this.buildButtonsEl.innerHTML = '';
    for (const def of BUILDINGS) {
      if (def.id === 'hq') continue;
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.dataset['building'] = def.id;
      btn.innerHTML = `
        <span class="btn-icon">${def.icon}</span>
        <span class="btn-body">
          <span class="btn-name">${def.name}</span>
          <span class="btn-desc">${def.description}</span>
          <span class="btn-cost">${costLabel(def.cost)}</span>
        </span>`;
      btn.title = def.description;
      btn.addEventListener('click', () => {
        const { state } = this.ctx;
        state.placing = state.placing === def.id ? null : def.id;
        if (state.placing) {
          this.log(`📐 Colocando ${def.name}: click izquierdo para construir, derecho para cancelar.`, 'info');
        }
      });
      this.buildButtonsEl.appendChild(btn);
    }
  }

  private refreshBuildAffordability(): void {
    const factor = getMod(this.ctx, 'buildCost');
    this.buildButtonsEl.querySelectorAll<HTMLButtonElement>('.build-btn').forEach((btn) => {
      const def = buildingDef(btn.dataset['building']!);
      const cost = scaledCost(def.cost, factor);
      btn.classList.toggle('unaffordable', !this.ctx.state.canAfford(cost));
      btn.classList.toggle('active', this.ctx.state.placing === def.id);
      const costEl = btn.querySelector('.btn-cost');
      if (costEl) costEl.textContent = costLabel(cost);
    });
  }

  // ---------------------------------------------------------- Tecnología --

  private renderTechTree(): void {
    if (el<HTMLDivElement>('tab-tech').classList.contains('hidden')) return;
    this.techListEl.innerHTML = '';
    for (const def of this.ctx.tech.allTechs()) {
      const researched = this.ctx.tech.isResearched(def.id);
      const check = this.ctx.tech.canResearch(def.id);
      const node = document.createElement('button');
      node.className = `tech-node ${researched ? 'researched' : check.ok ? 'available' : 'locked'}`;
      node.disabled = researched || !check.ok;
      const status = researched
        ? '✅ Investigada'
        : check.ok
          ? `Investigar — ${this.ctx.tech.effectiveCost(def.id)}💰`
          : `🔒 ${check.reason}`;
      const reqs = def.requires.length > 0
        ? `<span class="tech-req">Requiere: ${def.requires.map((r) => this.ctx.tech.allTechs().find((t) => t.id === r)?.name ?? r).join(', ')}</span>`
        : '';
      node.innerHTML = `
        <span class="btn-icon">${def.icon}</span>
        <span class="btn-body">
          <span class="btn-name">${def.name}</span>
          <span class="btn-desc">${def.description}</span>
          ${reqs}
          <span class="btn-cost">${status}</span>
        </span>`;
      if (!researched && check.ok) {
        node.addEventListener('click', () => this.ctx.tech.research(def.id));
      }
      this.techListEl.appendChild(node);
    }
  }

  // ------------------------------------------------------------ Gobierno --

  private renderGovernments(): void {
    if (el<HTMLDivElement>('tab-gov').classList.contains('hidden')) return;
    this.govListEl.innerHTML = '';
    const current = this.ctx.government.currentGovernment();
    const cost = this.ctx.government.switchCost();
    for (const def of this.ctx.government.allGovernments()) {
      const isCurrent = current?.id === def.id;
      const check = this.ctx.government.canSelect(def.id);
      const card = document.createElement('div');
      card.className = `gov-card ${isCurrent ? 'current' : ''}`;
      card.innerHTML = `
        <h3>${def.icon} ${def.name}</h3>
        <p>${def.description}</p>
        <ul class="gov-pros">${def.pros.map((p) => `<li>✔ ${p}</li>`).join('')}</ul>
        <ul class="gov-cons">${def.cons.map((c) => `<li>✘ ${c}</li>`).join('')}</ul>`;
      const btn = document.createElement('button');
      btn.className = 'gov-select-btn';
      btn.textContent = isCurrent
        ? 'Doctrina actual'
        : check.ok
          ? cost > 0
            ? `Instaurar (${cost}💰)`
            : 'Instaurar (gratis)'
          : check.reason;
      btn.disabled = isCurrent || !check.ok;
      if (!isCurrent && check.ok) {
        btn.addEventListener('click', () => this.ctx.government.select(def.id));
      }
      card.appendChild(btn);
      this.govListEl.appendChild(card);
    }
  }

  // ----------------------------------------------------------- Selección --

  refreshSelectionPanel(): void {
    const { world, state } = this.ctx;
    state.selected = state.selected.filter((id) => world.isAlive(id));

    if (state.selected.length === 0) {
      this.selectionEl.innerHTML =
        '<p class="hint">Sin selección. Arrastra con el ratón para seleccionar unidades; click en un edificio para gestionarlo.</p>';
      return;
    }

    // Un único edificio seleccionado → panel de gestión.
    const first = state.selected[0]!;
    if (state.selected.length === 1 && world.hasComponent(first, Building)) {
      this.renderBuildingPanel(first);
      return;
    }

    // Grupo de unidades → recuento por tipo.
    const counts = new Map<string, number>();
    for (const id of state.selected) {
      const ai = world.getComponent(id, UnitAI);
      if (ai) counts.set(ai.defId, (counts.get(ai.defId) ?? 0) + 1);
    }
    const parts = [...counts.entries()]
      .map(([defId, count]) => {
        const def = unitDef(defId);
        return `<span class="unit-chip">${def.icon} ${def.name} ×${count}</span>`;
      })
      .join(' ');
    this.selectionEl.innerHTML = `
      <p><strong>${state.selected.length}</strong> unidades seleccionadas</p>
      <p>${parts}</p>
      <p class="hint">Click derecho: mover · sobre un enemigo: atacar · A + click derecho: attack-move</p>`;
  }

  private renderBuildingPanel(id: number): void {
    const { world } = this.ctx;
    const building = world.mustGet(id, Building);
    const health = world.mustGet(id, Health);
    const def = buildingDef(building.defId);

    let html = `
      <h3>${def.icon} ${def.name}</h3>
      <p>${def.description}</p>
      <p>Integridad: <strong>${Math.ceil(health.hp)}/${health.max}</strong>${
        building.constructed ? '' : ` · 🏗️ ${Math.round(building.buildProgress * 100)}%`
      }</p>`;

    const trainer = world.getComponent(id, Trainer);
    if (trainer && building.constructed && def.trains) {
      html += '<div class="train-row">';
      for (const unitId of def.trains) {
        const u = unitDef(unitId);
        const unlocked = this.ctx.tech.isUnitUnlocked(u);
        const cost = scaledCost(u.cost, getMod(this.ctx, 'trainCost'));
        const affordable = this.ctx.state.canAfford(cost);
        html += `
          <button class="train-btn ${!unlocked || !affordable ? 'unaffordable' : ''}"
                  data-unit="${u.id}" ${!unlocked ? 'disabled' : ''}
                  title="${u.description}">
            <span class="btn-icon">${u.icon}</span>
            <span class="btn-name">${u.name}</span>
            <span class="btn-cost">${unlocked ? costLabel(cost) : '🔒 Requiere tecnología'}</span>
          </button>`;
      }
      html += '</div>';
      if (trainer.queue.length > 0) {
        const queueIcons = trainer.queue.map((q) => unitDef(q).icon).join(' ');
        html += `<p>Cola: ${queueIcons}</p>`;
      }
    }
    this.selectionEl.innerHTML = html;

    // Enlaza los botones de reclutamiento recién creados.
    this.selectionEl.querySelectorAll<HTMLButtonElement>('.train-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = unitDef(btn.dataset['unit']!);
        const cost = scaledCost(u.cost, getMod(this.ctx, 'trainCost'));
        if (!this.ctx.state.canAfford(cost)) {
          this.log('🚫 Recursos insuficientes para reclutar.', 'warn');
          return;
        }
        const tr = world.getComponent(id, Trainer);
        if (!tr) return;
        this.ctx.state.pay(cost);
        tr.queue.push(u.id);
        this.log(`${u.icon} ${u.name} añadido a la cola de entrenamiento.`, 'info');
      });
    });
  }

  // --------------------------------------------------------------- Modal --

  showEventModal(def: GameEventDef, resolve: (choiceIndex: number) => void): void {
    this.modalOpen = true;
    this.ctx.state.paused = true;
    this.modalIconEl.textContent = def.icon;
    this.modalTitleEl.textContent = def.title;
    this.modalTextEl.textContent = def.text;
    this.modalChoicesEl.innerHTML = '';

    def.choices!.forEach((choice, index) => {
      const btn = document.createElement('button');
      btn.className = 'modal-choice';
      const affordable = !choice.cost || this.ctx.state.canAfford(choice.cost);
      btn.innerHTML = `${choice.label}${choice.cost ? ` <span class="btn-cost">(${costLabel(choice.cost)})</span>` : ''}`;
      btn.disabled = !affordable;
      if (!affordable) btn.title = 'No puedes pagar esta opción';
      btn.addEventListener('click', () => {
        this.modalLayerEl.classList.add('hidden');
        this.modalOpen = false;
        this.ctx.state.paused = false;
        resolve(index);
      });
      this.modalChoicesEl.appendChild(btn);
    });
    this.modalLayerEl.classList.remove('hidden');
  }

  // ------------------------------------------------------ Fin de partida --

  showGameOver(title: string, text: string): void {
    if (this.ctx.state.gameOver) return;
    this.ctx.state.gameOver = true;
    const { state } = this.ctx;
    this.gameOverTitleEl.textContent = title;
    this.gameOverTextEl.textContent =
      `${text} Has resistido ${fmtTime(state.elapsed)} y ${state.wave} oleada(s) ` +
      `con una población final de ${state.population} colonos.`;
    this.gameOverEl.classList.remove('hidden');
  }
}
