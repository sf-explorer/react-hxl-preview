import type { HxlComponentRegistry, HxlComponentType } from "./types"
import { defaultComponents } from "./components"

class ComponentRegistry implements HxlComponentRegistry {
  private readonly map = new Map<string, HxlComponentType>()

  register(type: string, component: HxlComponentType): void {
    this.map.set(type, component)
  }

  get(type: string): HxlComponentType | undefined {
    return this.map.get(type)
  }
}

/** An empty registry. Register your own component types onto it. */
export function createHxlRegistry(): HxlComponentRegistry {
  return new ComponentRegistry()
}

/**
 * A registry pre-populated with the eight default component types
 * (stack, card, text, field, separator, button, tabs, accordion).
 *
 * Build this once at app startup — it is a lookup table, not per-frame state.
 */
export function createDefaultHxlRegistry(): HxlComponentRegistry {
  const registry = createHxlRegistry()
  for (const [type, component] of Object.entries(defaultComponents)) {
    registry.register(type, component)
  }
  return registry
}
