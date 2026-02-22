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

import spritesheetData from "../../public/static/sprites/spritesheet.json";
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
      // Import spritesheet data directly - Vite handles base path
      // Use a timeout to prevent mobile Safari from hanging
      const loadPromise = new Promise<void>((resolve, reject) => {
        try {
          this.data = spritesheetData as SpritesheetData;
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Sprite load timeout")), 3000);
      });

      await Promise.race([loadPromise, timeoutPromise]);

      logger.info("Spritesheet loaded", {
        version: this.data?.version,
        airframeCount: Object.keys(this.data?.airframeToSprite || {}).length,
        spriteCount: Object.keys(this.data?.sprites || {}).length,
      });
    } catch (error) {
      logger.error("Failed to load spritesheet", { error });
      // Set data to null on error so isLoaded() returns false
      this.data = null;
      this.loadPromise = null;
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
    //
    // spritesPerRow: the upstream pw-silhouettes sheet is always 576px wide
    // at 72px per sprite (8 columns). This is a fixed layout property of the
    // upstream project -- new sprites are only ever appended as new rows.
    // We own this constant; it is intentionally NOT taken from spritesheet.json
    // because that file is upstream and must not be modified.
    const { spriteWidth, spriteHeight } = this.data.metadata;
    const spritesPerRow = Math.round(576 / spriteWidth);

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
   * Get the CSS background-size value for the spritesheet at the given scale.
   *
   * Use this value for the `background-size` CSS property on sprite elements
   * so it stays in sync with the actual sheet dimensions derived from the JSON.
   *
   * The sheet width is fixed at 576px (8 columns × 72px per sprite).
   * The sheet height is computed from the maximum sprite ID present in the
   * JSON, so it automatically reflects new rows added by upstream updates
   * without any manual intervention.
   *
   * @param scale - Display scale factor (default: 0.6)
   * @returns CSS background-size string (e.g. "345.6px 1468.8px") or null
   */
  getCSSBackgroundSize(scale = 0.6): string | null {
    if (!this.data) {
      return null;
    }
    const { spriteWidth, spriteHeight } = this.data.metadata;
    // Fixed column count: upstream sheet is always 576px wide at 72px per sprite.
    const spritesPerRow = Math.round(576 / spriteWidth);
    // Derive sheet height from the highest sprite ID in the JSON.
    // When upstream adds a new row, the max ID increases and the height
    // recomputes automatically -- no manual update required.
    const allIds = Object.values(this.data.sprites).flatMap((s) => s.ids);
    const maxId = Math.max(...allIds);
    const numRows = Math.ceil((maxId + 1) / spritesPerRow);
    const sheetWidth = spritesPerRow * spriteWidth;
    const sheetHeight = numRows * spriteHeight;
    return `${sheetWidth * scale}px ${sheetHeight * scale}px`;
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
