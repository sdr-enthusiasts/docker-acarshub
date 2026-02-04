#!/usr/bin/env node

/**
 * Test script to analyze aircraft.json and diagnose pairing issues
 *
 * This script loads the user's aircraft.json file and simulates the
 * pairing logic to understand why aircraft aren't appearing in the sidebar.
 */

const fs = require("fs");
const path = require("path");

// Load the aircraft.json file
const aircraftJsonPath = path.join(__dirname, "aircraft.json");

console.log("=".repeat(80));
console.log("ACARS Hub Aircraft Pairing Diagnostic Tool");
console.log("=".repeat(80));
console.log();

if (!fs.existsSync(aircraftJsonPath)) {
  console.error("ERROR: aircraft.json not found at:", aircraftJsonPath);
  process.exit(1);
}

const aircraftData = JSON.parse(fs.readFileSync(aircraftJsonPath, "utf8"));

console.log("File loaded successfully!");
console.log(`Timestamp: ${new Date(aircraftData.now * 1000).toISOString()}`);
console.log(
  `Total messages received: ${aircraftData.messages.toLocaleString()}`,
);
console.log(`Aircraft in file: ${aircraftData.aircraft.length}`);
console.log();

// Analyze the aircraft
console.log("=".repeat(80));
console.log("AIRCRAFT ANALYSIS");
console.log("=".repeat(80));
console.log();

const stats = {
  total: aircraftData.aircraft.length,
  withPosition: 0,
  withFlight: 0,
  withTail: 0,
  withType: 0,
  withDbFlags: 0,
  byType: {},
  military: 0,
  interesting: 0,
  pia: 0,
  ladd: 0,
};

// Sample aircraft for detailed output
const sampleSize = Math.min(10, aircraftData.aircraft.length);

console.log(`First ${sampleSize} aircraft (sample):`);
console.log("-".repeat(80));

for (let i = 0; i < sampleSize; i++) {
  const ac = aircraftData.aircraft[i];
  console.log(`${i + 1}. Hex: ${ac.hex || "N/A"}`);
  console.log(`   Flight: ${ac.flight || "N/A"}`);
  console.log(`   Tail (r): ${ac.r || "N/A"}`);
  console.log(`   Type (t): ${ac.t || "N/A"}`);
  console.log(
    `   Position: ${ac.lat && ac.lon ? `${ac.lat.toFixed(4)}, ${ac.lon.toFixed(4)}` : "N/A"}`,
  );
  console.log(`   dbFlags: ${ac.dbFlags !== undefined ? ac.dbFlags : "N/A"}`);
  console.log();
}

console.log("-".repeat(80));
console.log();

// Gather statistics
for (const ac of aircraftData.aircraft) {
  if (ac.lat !== undefined && ac.lon !== undefined) {
    stats.withPosition++;
  }
  if (ac.flight) {
    stats.withFlight++;
  }
  if (ac.r) {
    stats.withTail++;
  }
  if (ac.t) {
    stats.withType++;
    stats.byType[ac.t] = (stats.byType[ac.t] || 0) + 1;
  }

  // Check dbFlags
  if (ac.dbFlags !== undefined && ac.dbFlags !== null) {
    stats.withDbFlags++;
    const flags =
      typeof ac.dbFlags === "string" ? parseInt(ac.dbFlags, 10) : ac.dbFlags;
    if (!isNaN(flags)) {
      if (flags & 1) stats.military++;
      if (flags & 2) stats.interesting++;
      if (flags & 4) stats.pia++;
      if (flags & 8) stats.ladd++;
    }
  }
}

console.log("STATISTICS:");
console.log("-".repeat(80));
console.log(`Total aircraft: ${stats.total}`);
console.log(
  `Aircraft with position data: ${stats.withPosition} (${((stats.withPosition / stats.total) * 100).toFixed(1)}%)`,
);
console.log(
  `Aircraft with flight/callsign: ${stats.withFlight} (${((stats.withFlight / stats.total) * 100).toFixed(1)}%)`,
);
console.log(
  `Aircraft with tail/registration: ${stats.withTail} (${((stats.withTail / stats.total) * 100).toFixed(1)}%)`,
);
console.log(
  `Aircraft with type code: ${stats.withType} (${((stats.withType / stats.total) * 100).toFixed(1)}%)`,
);
console.log(
  `Aircraft with dbFlags: ${stats.withDbFlags} (${((stats.withDbFlags / stats.total) * 100).toFixed(1)}%)`,
);
console.log();

if (stats.withDbFlags > 0) {
  console.log("dbFlags breakdown:");
  console.log(`  Military (bit 1): ${stats.military}`);
  console.log(`  Interesting (bit 2): ${stats.interesting}`);
  console.log(`  PIA (bit 4): ${stats.pia}`);
  console.log(`  LADD (bit 8): ${stats.ladd}`);
  console.log();
}

console.log("Top 10 aircraft types:");
const sortedTypes = Object.entries(stats.byType)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

for (const [type, count] of sortedTypes) {
  console.log(`  ${type}: ${count}`);
}
console.log();

// Check for potential issues
console.log("=".repeat(80));
console.log("POTENTIAL ISSUES");
console.log("=".repeat(80));
console.log();

const issues = [];

if (stats.withPosition === 0) {
  issues.push("❌ CRITICAL: No aircraft have position data (lat/lon)");
  issues.push("   This means NO aircraft will appear on the map.");
}

if (stats.total === 0) {
  issues.push("❌ CRITICAL: No aircraft in the file");
  issues.push("   Check if ADS-B receiver is running and feeding data.");
}

if (stats.withFlight < stats.total * 0.3) {
  issues.push(
    `⚠️  WARNING: Only ${stats.withFlight} aircraft have flight/callsign data`,
  );
  issues.push("   ACARS pairing will be difficult without callsigns.");
}

if (stats.withTail < stats.total * 0.3) {
  issues.push(
    `⚠️  WARNING: Only ${stats.withTail} aircraft have tail/registration data`,
  );
  issues.push("   ACARS pairing fallback (tail matching) will be limited.");
}

if (issues.length === 0) {
  console.log("✅ No obvious issues detected with aircraft.json structure.");
  console.log();
  console.log("The sidebar should populate IF:");
  console.log("  1. The React app is receiving this data via Socket.IO");
  console.log("  2. The pairing logic is matching ADS-B aircraft correctly");
  console.log("  3. No filters are active that hide all aircraft");
  console.log();
  console.log("Next steps:");
  console.log("  - Check browser DevTools console for errors");
  console.log("  - Check Socket.IO connection status in the UI");
  console.log("  - Verify filters are not hiding aircraft");
  console.log("  - Check if ACARS message groups exist (need backend data)");
} else {
  for (const issue of issues) {
    console.log(issue);
  }
}

console.log();
console.log("=".repeat(80));
console.log("DIAGNOSTIC COMPLETE");
console.log("=".repeat(80));
