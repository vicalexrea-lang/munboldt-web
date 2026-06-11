/**
 * Engine/ECS.ts
 * ---------------------------------------------------------------------------
 * Implementación propia de Entity-Component-System.
 *
 *  - Entity:    un simple identificador numérico (EntityId).
 *  - Component: clase base sin lógica; sólo datos.
 *  - System:    clase base con `update(dt)` que opera sobre consultas
 *               (queries) de entidades que poseen ciertos componentes.
 *  - World:     dueño de todas las entidades/componentes y orquestador
 *               de los sistemas registrados.
 *
 * La destrucción de entidades es diferida (se aplica al final del frame)
 * para que ningún sistema itere sobre datos ya liberados.
 */

export type EntityId = number;

/** Clase base de todos los componentes (sólo datos). */
export abstract class Component {}

/** Constructor concreto de un componente, usado como clave de almacén. */
export type ComponentClass<T extends Component = Component> = new (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => T;

export class World {
  private nextId: EntityId = 1;
  private alive = new Set<EntityId>();
  /** Un almacén (Map entidad→componente) por cada clase de componente. */
  private stores = new Map<ComponentClass, Map<EntityId, Component>>();
  private pendingDestroy = new Set<EntityId>();
  private systems: System[] = [];

  // ----------------------------------------------------------- Entidades --

  createEntity(): EntityId {
    const id = this.nextId++;
    this.alive.add(id);
    return id;
  }

  isAlive(id: EntityId): boolean {
    return this.alive.has(id) && !this.pendingDestroy.has(id);
  }

  /** Marca la entidad para destrucción al final del frame. */
  destroyEntity(id: EntityId): void {
    if (this.alive.has(id)) this.pendingDestroy.add(id);
  }

  /** Aplica las destrucciones diferidas. Llamar una vez por frame. */
  flushDestroyed(onDestroyed?: (id: EntityId) => void): void {
    for (const id of this.pendingDestroy) {
      if (onDestroyed) onDestroyed(id);
      for (const store of this.stores.values()) store.delete(id);
      this.alive.delete(id);
    }
    this.pendingDestroy.clear();
  }

  entityCount(): number {
    return this.alive.size;
  }

  // --------------------------------------------------------- Componentes --

  private storeFor(cls: ComponentClass): Map<EntityId, Component> {
    let store = this.stores.get(cls);
    if (!store) {
      store = new Map<EntityId, Component>();
      this.stores.set(cls, store);
    }
    return store;
  }

  addComponent<T extends Component>(id: EntityId, component: T): T {
    if (!this.alive.has(id)) {
      throw new Error(`addComponent: entidad ${id} no existe`);
    }
    this.storeFor(component.constructor as ComponentClass).set(id, component);
    return component;
  }

  removeComponent(id: EntityId, cls: ComponentClass): void {
    this.stores.get(cls)?.delete(id);
  }

  getComponent<T extends Component>(
    id: EntityId,
    cls: ComponentClass<T>
  ): T | undefined {
    return this.stores.get(cls)?.get(id) as T | undefined;
  }

  /** Igual que getComponent pero lanza si falta: para invariantes internas. */
  mustGet<T extends Component>(id: EntityId, cls: ComponentClass<T>): T {
    const c = this.getComponent(id, cls);
    if (!c) throw new Error(`Entidad ${id} no tiene componente ${cls.name}`);
    return c;
  }

  hasComponent(id: EntityId, cls: ComponentClass): boolean {
    return this.stores.get(cls)?.has(id) ?? false;
  }

  // -------------------------------------------------------------- Queries --

  /**
   * Devuelve los ids de todas las entidades vivas que poseen TODOS los
   * componentes indicados. Itera sobre el almacén más pequeño para
   * minimizar comprobaciones.
   */
  query(...classes: ComponentClass[]): EntityId[] {
    if (classes.length === 0) return [...this.alive];
    let smallest: Map<EntityId, Component> | undefined;
    for (const cls of classes) {
      const store = this.stores.get(cls);
      if (!store || store.size === 0) return [];
      if (!smallest || store.size < smallest.size) smallest = store;
    }
    const result: EntityId[] = [];
    outer: for (const id of smallest!.keys()) {
      if (!this.isAlive(id)) continue;
      for (const cls of classes) {
        if (!this.stores.get(cls)!.has(id)) continue outer;
      }
      result.push(id);
    }
    return result;
  }

  /** Variante con callback que entrega los componentes ya resueltos. */
  each<A extends Component>(
    a: ComponentClass<A>,
    fn: (id: EntityId, ca: A) => void
  ): void {
    for (const id of this.query(a)) fn(id, this.mustGet(id, a));
  }

  // -------------------------------------------------------------- Systems --

  registerSystem(system: System): void {
    this.systems.push(system);
    this.systems.sort((s1, s2) => s1.priority - s2.priority);
  }

  updateSystems(dt: number): void {
    for (const system of this.systems) {
      if (system.enabled) system.update(dt);
    }
  }
}

/** Clase base de los sistemas. Menor `priority` se ejecuta antes. */
export abstract class System {
  readonly world: World;
  priority = 0;
  enabled = true;

  constructor(world: World) {
    this.world = world;
  }

  abstract update(dt: number): void;
}
