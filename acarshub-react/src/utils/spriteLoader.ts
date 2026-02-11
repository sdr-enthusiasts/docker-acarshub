/**
 * Sprite Loader Utility
 *
 * Loads and queries pw-silhouettes spritesheet data for aircraft marker rendering.
 *
 * Source: https://github.com/plane-watch/pw-silhouettes
 * License: CC BY-NC-SA 4.0
 *
 * Usage:
 *   const loader = new SpriteLoader();
 *   await loader.load();
 *   const sprite = loader.getSprite('B738', '4/3');
 */

import type {
  SpriteLookupResult,
  SpritePosition,
  SpritesheetData,
} from "../types/sprites";
import { createLogger } from "./logger";

const logger = createLogger("SpriteLoader");

/**
 * Sprite loader for pw-silhouettes aircraft sprites
 */
export class SpriteLoader {
  private data: SpritesheetData | null = null;
  private loadPromise: Promise<void> | null = null;

  /**
   * Load spritesheet data from public assets
   */
  async load(): Promise<void> {
    // Return existing load promise if already loading
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._loadData();
    return this.loadPromise;
  }

  private async _loadData(): Promise<void> {
    try {
      const response = await fetch("/static/sprites/spritesheet.json");
      if (!response.ok) {
        throw new Error(`Failed to load spritesheet: ${response.statusText}`);
      }

      this.data = await response.json();
      logger.info("Spritesheet loaded", {
        version: this.data?.version,
        airframeCount: Object.keys(this.data?.airframeToSprite || {}).length,
        spriteCount: Object.keys(this.data?.sprites || {}).length,
      });
    } catch (error) {
      logger.error("Failed to load spritesheet", { error });
      throw error;
    }
  }

  /**
   * Check if spritesheet is loaded
   */
  isLoaded(): boolean {
    return this.data !== null;
  }

  /**
   * Get sprite for aircraft type
   *
   * Lookup priority:
   * 1. ICAO type designator (e.g., "B738", "A320")
   * 2. Generic category code (e.g., "4/3" for jet airliner)
   * 3. Fallback to unknown sprite
   *
   * @param typeDesignator - ICAO aircraft type designator (optional)
   * @param categoryCode - Generic category code from ADS-B (optional)
   * @returns Sprite lookup result or null if not loaded
   */
  getSprite(
    typeDesignator?: string,
    categoryCode?: string,
  ): SpriteLookupResult | null {
    if (!this.data) {
      logger.warn("getSprite called before spritesheet loaded");
      return null;
    }

    // Try airframe lookup by type designator
    if (typeDesignator) {
      const upperType = typeDesignator.toUpperCase();
      const spriteName = this.data.airframeToSprite[upperType];

      if (spriteName && this.data.sprites[spriteName]) {
        return {
          spriteName,
          sprite: this.data.sprites[spriteName],
          matchType: "airframe",
        };
      }
    }

    // Try generic lookup by category code
    if (categoryCode) {
      const spriteName = this.data.genericToSprite[categoryCode];

      if (spriteName && this.data.sprites[spriteName]) {
        return {
          spriteName,
          sprite: this.data.sprites[spriteName],
          matchType: "generic",
        };
      }
    }

    // Fallback - try to find a reasonable default
    // Priority: generic jet airliner (4/3) > any generic > first sprite
    const fallbackCandidates = ["4/3", "4/2", "4/1"];
    for (const candidate of fallbackCandidates) {
      const spriteName = this.data.genericToSprite[candidate];
      if (spriteName && this.data.sprites[spriteName]) {
        return {
          spriteName,
          sprite: this.data.sprites[spriteName],
          matchType: "fallback",
        };
      }
    }

    // Ultimate fallback: first sprite in the list
    const firstSpriteName = Object.keys(this.data.sprites)[0];
    if (firstSpriteName) {
      return {
        spriteName: firstSpriteName,
        sprite: this.data.sprites[firstSpriteName],
        matchType: "fallback",
      };
    }

    logger.error("No sprites available in spritesheet");
    return null;
  }

  /**
   * Compute sprite position in spritesheet for rendering
   *
   * @param spriteName - Name of sprite to position
   * @param frameIndex - Frame index for animations (default: 0)
   * @returns Sprite position data or null if not found
   */
  getSpritePosition(spriteName: string, frameIndex = 0): SpritePosition | null {
    if (!this.data) {
      return null;
    }

    const sprite = this.data.sprites[spriteName];
    if (!sprite) {
      logger.warn("Sprite not found", { spriteName });
      return null;
    }

    // Get sprite ID for requested frame
    const spriteId = sprite.ids[frameIndex % sprite.ids.length];

    // Calculate position in spritesheet
    // Sprites are arranged in a grid, left-to-right, top-to-bottom
    // Actual spritesheet is 576px wide (8 sprites per row at 72px each)
    const { spriteWidth, spriteHeight } = this.data.metadata;
    const spritesPerRow = 8; // Fixed layout: 8 sprites per row

    const col = spriteId % spritesPerRow;
    const row = Math.floor(spriteId / spritesPerRow);

    // Scale all positions and sizes to 60%
    const scale = 0.6;

    return {
      x: col * spriteWidth * scale,
      y: row * spriteHeight * scale,
      width: spriteWidth * scale,
      height: spriteHeight * scale,
      anchor: sprite.anchor,
      scale: sprite.scale,
      shouldRotate: !sprite.noRotate,
      frames: sprite.ids.length > 1 ? sprite.ids : undefined,
      frameTime: sprite.frameTime || undefined,
    };
  }

  /**
   * Get spritesheet metadata
   */
  getMetadata() {
    return this.data?.metadata || null;
  }

  /**
   * Get all available airframe type designators
   */
  getAvailableAirframes(): string[] {
    if (!this.data) {
      return [];
    }
    return Object.keys(this.data.airframeToSprite);
  }

  /**
   * Get statistics about loaded spritesheet
   */
  getStats() {
    if (!this.data) {
      return null;
    }

    const animatedSprites = Object.values(this.data.sprites).filter(
      (s) => s.ids.length > 1,
    ).length;

    return {
      version: this.data.version,
      totalAirframes: Object.keys(this.data.airframeToSprite).length,
      totalSprites: Object.keys(this.data.sprites).length,
      animatedSprites,
      genericCategories: Object.keys(this.data.genericToSprite).length,
    };
  }
}

/**
 * Singleton sprite loader instance
 */
let loaderInstance: SpriteLoader | null = null;

/**
 * Get the global sprite loader instance
 */
export function getSpriteLoader(): SpriteLoader {
  if (!loaderInstance) {
    loaderInstance = new SpriteLoader();
  }
  return loaderInstance;
}

/**
 * Preload spritesheet data (call on app initialization)
 */
export async function preloadSpritesheet(): Promise<void> {
  const loader = getSpriteLoader();
  await loader.load();
}
