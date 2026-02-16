/**
 * TypeScript interfaces for pw-silhouettes spritesheet data
 *
 * Source: https://github.com/plane-watch/pw-silhouettes
 * License: CC BY-NC-SA 4.0
 *
 * Spritesheet contains professional aircraft silhouettes compiled into a single PNG
 * with metadata describing sprite positions, animations, and anchor points.
 */

/**
 * Spritesheet metadata describing the PNG file structure
 */
export interface SpritesheetMetadata {
  /** Path to the PNG file (relative to JSON location) */
  png: string;
  /** Width of each sprite cell in pixels */
  spriteWidth: number;
  /** Height of each sprite cell in pixels */
  spriteHeight: number;
}

/**
 * Sprite definition with rendering properties
 */
export interface SpriteDefinition {
  /** Array of sprite IDs (frame numbers in spritesheet) */
  ids: number[];
  /** Scale multiplier for rendering (default: 1) */
  scale: number;
  /** Anchor point within the sprite (center of rotation) */
  anchor: {
    x: number;
    y: number;
  };
  /** If true, sprite should not rotate with aircraft heading */
  noRotate?: boolean;
  /** Frame time in milliseconds for animations (null = static) */
  frameTime?: number | null;
}

/**
 * Complete spritesheet data structure
 */
export interface SpritesheetData {
  /** Schema version */
  version: number;
  /** Metadata about the spritesheet PNG */
  metadata: SpritesheetMetadata;
  /** Map of ICAO type designators to sprite names */
  airframeToSprite: Record<string, string>;
  /** Map of generic category codes to sprite names */
  genericToSprite: Record<string, string>;
  /** Map of sprite names to sprite definitions */
  sprites: Record<string, SpriteDefinition>;
}

/**
 * Computed sprite position for rendering
 */
export interface SpritePosition {
  /** X coordinate in spritesheet (pixels) */
  x: number;
  /** Y coordinate in spritesheet (pixels) */
  y: number;
  /** Width of sprite (pixels) */
  width: number;
  /** Height of sprite (pixels) */
  height: number;
  /** Anchor point for rotation */
  anchor: {
    x: number;
    y: number;
  };
  /** Scale multiplier */
  scale: number;
  /** Whether sprite should rotate with heading */
  shouldRotate: boolean;
  /** Animation frame IDs (if animated) */
  frames?: number[];
  /** Frame time in milliseconds (if animated) */
  frameTime?: number;
}

/**
 * Result of sprite lookup
 */
export interface SpriteLookupResult {
  /** Sprite name that was matched */
  spriteName: string;
  /** Sprite definition */
  sprite: SpriteDefinition;
  /** How the sprite was matched */
  matchType: "airframe" | "generic" | "fallback";
}
