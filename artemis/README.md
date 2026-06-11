# 🌖 ARTEMIS — RTS y simulador de colonia lunar

Juego de estrategia en tiempo real con gestión de supervivencia, escrito en
**TypeScript estricto** sobre un **ECS propio** y renderizado con **Canvas 2D**.
La interfaz (panel del comandante) es HTML/CSS puro superpuesto al canvas.

## Ejecutar

Desde la raíz del repositorio:

```bash
npm install          # una sola vez
npm run artemis      # dev server en http://localhost:4322
```

Otros comandos:

```bash
npm run artemis:check   # typecheck estricto (tsc --noEmit)
npm run artemis:build   # build de producción (artemis/dist)
```

## Cómo se juega

- **Recursos**: 💧 agua (extractores de hielo; ×2 sobre vetas de hielo),
  🌾 comida (granjas) y 💰 créditos (comercio + colonos). La población y el
  ejército consumen por tick; la escasez hunde la moral y mata colonos.
- **Construcción**: pestaña *Construir* → click en el mapa (Shift encadena).
- **Ejército**: construye Barracones, selecciónalos y recluta. Arrastra para
  seleccionar unidades; click derecho mueve, sobre un enemigo ataca, y
  `A` + click derecho ordena *attack-move*. Pathfinding A* sobre la rejilla.
- **Eventos**: tormentas solares, meteoritos, huelgas, piratas… algunos
  exigen decisiones en un modal que pausa la partida.
- **Tecnología**: árbol con prerequisitos que mejora economía, armas y
  desbloquea el Róver y el Tanque «Goliat».
- **Gobierno**: Democracia, Dictadura Militar o Tecnocracia, con bufos y
  nerfeos permanentes; cambiar cuesta créditos y tiene enfriamiento.
- **Oleadas**: merodeadores asedian la base con dificultad creciente. Si la
  Base Central cae (o la población llega a 0), fin de la partida.

Controles: `WASD/flechas` cámara (`Q` izquierda), `H` centrar en la base,
`P` pausa, `Esc` cancelar selección/construcción, click en el minimapa para
mover la cámara.

## Estructura

```
artemis/
├── index.html                      # Canvas + estructura de la UI
├── styles.css                      # Panel del comandante y menús
├── main.ts                         # Bucle principal y orquestación
├── Engine/
│   ├── ECS.ts                      # World / Entity / Component / System
│   ├── Pathfinding.ts              # A* con heap binario (8 direcciones)
│   └── MathUtils.ts                # Vectores, azar, formato
└── Game/
    ├── Config.ts                   # Datos de balance (edificios, unidades, techs…)
    ├── Components.ts               # Position, Health, UnitAI, ResourceGenerator…
    ├── Context.ts                  # GameState, cámara, efectos, contexto compartido
    ├── LunarMap.ts                 # Rejilla, cráteres y vetas de hielo
    ├── Factory.ts                  # Creación de unidades/edificios
    ├── Modifiers.ts                # Agregación de multiplicadores
    ├── Systems/
    │   ├── RenderSystem.ts         # Mapa, entidades, efectos y minimapa
    │   ├── MovementSystem.ts       # Waypoints A* + separación de unidades
    │   ├── CombatSystem.ts         # Objetivos, rango, daño y muertes
    │   └── TrainingSystem.ts       # Obras y colas de reclutamiento
    └── Managers/
        ├── ResourceManager.ts      # Economía por tick
        ├── EventManager.ts         # Eventos dinámicos y modales de decisión
        ├── GovernmentManager.ts    # Doctrinas y multiplicadores
        ├── TechManager.ts          # Árbol tecnológico
        ├── EnemyDirector.ts        # IA de asedio por oleadas
        ├── InputManager.ts         # Selección RTS, órdenes y colocación
        └── UIManager.ts            # Panel del comandante (DOM)
```
