import type { TileComponentRegistry, TileComponentType } from "./types"
import { defaultTileComponents } from "./components"

class TileRegistry implements TileComponentRegistry {
  private readonly map = new Map<string, TileComponentType>()

  register(definition: string, component: TileComponentType): void {
    this.map.set(definition, component)
  }

  get(definition: string): TileComponentType | undefined {
    return this.map.get(definition)
  }
}

/** An empty tile registry. Register your own `tile/*` definitions onto it. */
export function createTileRegistry(): TileComponentRegistry {
  return new TileRegistry()
}

/** A tile registry pre-populated with the default `tile/*` component set. */
export function createDefaultTileRegistry(): TileComponentRegistry {
  const registry = createTileRegistry()
  for (const [definition, component] of Object.entries(defaultTileComponents)) {
    registry.register(definition, component)
  }
  return registry
}
