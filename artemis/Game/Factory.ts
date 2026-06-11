/**
 * Game/Factory.ts
 * ---------------------------------------------------------------------------
 * Creación de entidades completas (unidades y edificios) con todos sus
 * componentes, aplicando los multiplicadores vigentes en el momento de
 * creación (p. ej. vida máxima por blindaje o doctrina).
 */

import type { EntityId } from '../Engine/ECS';
import {
  Attacker,
  Building,
  Health,
  Housing,
  Mover,
  Position,
  Renderable,
  ResourceGenerator,
  Selectable,
  Team,
  Trainer,
  UnitAI,
  Velocity,
} from './Components';
import { buildingDef, unitDef } from './Config';
import type { GameContext } from './Context';
import { getMod } from './Modifiers';

/** Crea una unidad (aliada o enemiga) en la posición indicada del mundo. */
export function spawnUnit(ctx: GameContext, defId: string, x: number, y: number): EntityId {
  const def = unitDef(defId);
  const { world } = ctx;
  const id = world.createEntity();

  const hpMod = def.side === 'player' ? getMod(ctx, 'unitMaxHp') : 1;

  world.addComponent(id, new Position(x, y));
  world.addComponent(id, new Velocity());
  world.addComponent(id, new Health(Math.round(def.maxHp * hpMod)));
  world.addComponent(id, new Team(def.side));
  world.addComponent(id, new Renderable(def.shape, def.color, def.radius, def.icon));
  world.addComponent(id, new UnitAI(def.id));
  world.addComponent(id, new Mover(def.speed));
  world.addComponent(id, new Attacker(def.damage, def.range, def.cooldown, def.range + 110));
  if (def.side === 'player') world.addComponent(id, new Selectable());
  return id;
}

/**
 * Coloca un edificio con esquina en la celda (tileX, tileY). No verifica
 * coste (lo hace el InputManager); sí marca la rejilla como ocupada.
 * `instant` lo entrega ya construido (la base inicial).
 */
export function placeBuilding(
  ctx: GameContext,
  defId: string,
  tileX: number,
  tileY: number,
  instant = false
): EntityId {
  const def = buildingDef(defId);
  const { world, map } = ctx;

  map.occupyBuilding(tileX, tileY, def.tilesW, def.tilesH);

  const centerX = (tileX + def.tilesW / 2) * map.tileSize;
  const centerY = (tileY + def.tilesH / 2) * map.tileSize;

  const id = world.createEntity();
  const building = new Building(
    def.id,
    tileX,
    tileY,
    def.tilesW,
    def.tilesH,
    instant || def.buildTime <= 0 ? 1 : 0
  );
  building.onIceDeposit = map.areaHasIce(tileX, tileY, def.tilesW, def.tilesH);

  world.addComponent(id, building);
  world.addComponent(id, new Position(centerX, centerY));
  world.addComponent(id, new Health(def.maxHp));
  world.addComponent(id, new Team('player'));
  world.addComponent(
    id,
    new Renderable('rect', def.color, (Math.max(def.tilesW, def.tilesH) * map.tileSize) / 2, def.icon)
  );
  world.addComponent(id, new Selectable());

  if (def.produces) {
    const iceBonus = def.id === 'extractor' && building.onIceDeposit ? 2 : 1;
    world.addComponent(
      id,
      new ResourceGenerator(
        (def.produces.water ?? 0) * iceBonus,
        def.produces.food ?? 0,
        def.produces.credits ?? 0
      )
    );
  }
  if (def.housing) world.addComponent(id, new Housing(def.housing));
  if (def.trains) {
    world.addComponent(
      id,
      new Trainer(centerX, centerY + (def.tilesH / 2 + 1.2) * map.tileSize)
    );
  }
  if (def.attack) {
    world.addComponent(
      id,
      new Attacker(def.attack.damage, def.attack.range, def.attack.cooldown, def.attack.range)
    );
  }
  return id;
}

/** Libera las celdas del mapa cuando un edificio es destruido. */
export function releaseBuildingTiles(ctx: GameContext, id: EntityId): void {
  const building = ctx.world.getComponent(id, Building);
  if (building) {
    ctx.map.freeBuilding(building.tileX, building.tileY, building.tilesW, building.tilesH);
  }
}
