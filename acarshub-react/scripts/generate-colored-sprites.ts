#!/usr/bin/env node
/**
 * Generate Colored Sprite Sheets
 *
 * Takes the base pw-silhouettes sprite sheet (white fill + black outline)
 * and generates colored versions for each state in both themes.
 *
 * Uses sharp for image processing (lighter than canvas, easier to build)
 *
 * Output:
 * - spritesheet-mocha-default.png (#cdd6f4)
 * - spritesheet-mocha-alerts.png (#f38ba8)
 * - spritesheet-mocha-lowalt.png (#7f849c)
 * - spritesheet-mocha-acars.png (#89b4fa)
 * - spritesheet-mocha-vdlm.png (#a6e3a1)
 * - spritesheet-mocha-hfdl.png (#f9e2af)
 * - spritesheet-mocha-imsl.png (#fab387)
 * - spritesheet-mocha-irdm.png (#cba6f7)
 * - spritesheet-latte-default.png (#4c4f69)
 * - spritesheet-latte-alerts.png (#d20f39)
 * - spritesheet-latte-lowalt.png (#8c8fa1)
 * - spritesheet-latte-acars.png (#1e66f5)
 * - spritesheet-latte-vdlm.png (#40a02b)
 * - spritesheet-latte-hfdl.png (#df8e1d)
 * - spritesheet-latte-imsl.png (#fe640b)
 * - spritesheet-latte-irdm.png (#8839ef)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color definitions - matching message card decoder type colors
const COLORS = {
  mocha: {
    default: "#cdd6f4", // text
    alerts: "#f38ba8", // red
    lowalt: "#7f849c", // overlay1
    // Decoder types (matching message-card.scss)
    acars: "#89b4fa", // blue
    vdlm: "#a6e3a1", // green
    hfdl: "#f9e2af", // yellow
    imsl: "#fab387", // peach
    irdm: "#cba6f7", // mauve
  },
  latte: {
    default: "#4c4f69", // text
    alerts: "#d20f39", // red
    lowalt: "#8c8fa1", // overlay1
    // Decoder types (matching message-card.scss)
    acars: "#1e66f5", // blue
    vdlm: "#40a02b", // green
    hfdl: "#df8e1d", // yellow
    imsl: "#fe640b", // peach
    irdm: "#8839ef", // mauve
  },
};

// Outline colors - white for Mocha (dark theme), black for Latte (light theme)
const OUTLINE_COLORS = {
  mocha: "#ffffff", // white outline on dark map
  latte: "#000000", // black outline on light background
};

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Colorize sprite sheet
 *
 * Strategy:
 * - Black pixels (outline) become outline color
 * - White pixels (fill) become the target fill color
 * - Gray pixels (anti-aliasing) interpolate between outline and fill colors
 * - Transparent pixels stay transparent
 */
async function colorizeSprite(
  inputPath: string,
  outputPath: string,
  targetColor: string,
  outlineColor: string,
): Promise<void> {
  console.log(`Colorizing ${path.basename(outputPath)}...`);

  // Load image and get raw pixel data
  const image = sharp(inputPath);
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Parse target colors
  const target = hexToRgb(targetColor);
  const outline = hexToRgb(outlineColor);

  // Process each pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Skip fully transparent pixels
    if (a === 0) {
      continue;
    }

    // Calculate brightness (0 = black, 255 = white)
    const brightness = (r + g + b) / 3;

    // Interpolate between outline color (dark) and fill color (bright)
    // brightness 0-255 maps to outline -> fill
    const factor = brightness / 255;

    data[i] = Math.round(outline.r + (target.r - outline.r) * factor);
    data[i + 1] = Math.round(outline.g + (target.g - outline.g) * factor);
    data[i + 2] = Math.round(outline.b + (target.b - outline.b) * factor);
    // Alpha stays the same
  }

  // Save modified image
  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);

  console.log(`  ✓ Generated ${path.basename(outputPath)}`);
}

/**
 * Main function
 */
async function main() {
  const publicDir = path.join(__dirname, "..", "public", "static", "sprites");
  const inputPath = path.join(publicDir, "spritesheet.png");

  // Check if input exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input sprite sheet not found at ${inputPath}`);
    process.exit(1);
  }

  console.log("Generating colored sprite sheets...\n");

  // Generate all color variants
  for (const [theme, colors] of Object.entries(COLORS)) {
    const outlineColor = OUTLINE_COLORS[theme as keyof typeof OUTLINE_COLORS];
    for (const [state, color] of Object.entries(colors)) {
      const outputPath = path.join(
        publicDir,
        `spritesheet-${theme}-${state}.png`,
      );
      await colorizeSprite(inputPath, outputPath, color, outlineColor);
    }
  }

  console.log("\n✅ All colored sprite sheets generated successfully!");
  console.log(`\nGenerated files in: ${publicDir}`);
  console.log("\nState-based sprites:");
  console.log("  - spritesheet-mocha-default.png");
  console.log("  - spritesheet-mocha-alerts.png");
  console.log("  - spritesheet-mocha-lowalt.png");
  console.log("  - spritesheet-latte-default.png");
  console.log("  - spritesheet-latte-alerts.png");
  console.log("  - spritesheet-latte-lowalt.png");
  console.log("\nDecoder-type sprites:");
  console.log("  - spritesheet-mocha-acars.png (blue)");
  console.log("  - spritesheet-mocha-vdlm.png (green)");
  console.log("  - spritesheet-mocha-hfdl.png (yellow)");
  console.log("  - spritesheet-mocha-imsl.png (peach)");
  console.log("  - spritesheet-mocha-irdm.png (mauve)");
  console.log("  - spritesheet-latte-acars.png (blue)");
  console.log("  - spritesheet-latte-vdlm.png (green)");
  console.log("  - spritesheet-latte-hfdl.png (yellow)");
  console.log("  - spritesheet-latte-imsl.png (peach)");
  console.log("  - spritesheet-latte-irdm.png (mauve)");
}

main().catch((error) => {
  console.error("Error generating sprite sheets:", error);
  process.exit(1);
});
