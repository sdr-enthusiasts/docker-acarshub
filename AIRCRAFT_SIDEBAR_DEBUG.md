# Aircraft Sidebar Debug Guide

If you're not seeing aircraft in the sidebar on the Live Map page, follow these debugging steps.

## Quick Diagnostic (Browser Console)

1. Open the Live Map page
2. Open browser DevTools (F12 or Right-click → Inspect)
3. Go to the Console tab
4. Paste this code and press Enter:

```javascript
// ACARS Hub Aircraft Sidebar Diagnostic
console.log("=".repeat(80));
console.log("ACARS Hub Aircraft Sidebar Diagnostic");
console.log("=".repeat(80));

// Check if store exists
if (window.__ACARS_STORE__) {
  const store = window.__ACARS_STORE__.getState();

  console.log("\n✅ Store is accessible");
  console.log("\nADS-B Data:");
  console.log("  Aircraft count:", store.adsbAircraft?.aircraft?.length || 0);
  console.log(
    "  Last update:",
    store.adsbAircraft?.now
      ? new Date(store.adsbAircraft.now * 1000).toISOString()
      : "N/A",
  );

  console.log("\nMessage Groups:");
  console.log("  Total groups:", store.messageGroups?.size || 0);
  console.log(
    "  Groups with alerts:",
    Array.from(store.messageGroups?.values() || []).filter((g) => g.has_alerts)
      .length,
  );

  console.log("\nMap Settings (Filters):");
  const settings = store.settings?.settings?.map || {};
  console.log("  Show only ACARS:", settings.showOnlyAcars);
  console.log("  Show only Unread:", settings.showOnlyUnread);
  console.log("  Show only Military:", settings.showOnlyMilitary);
  console.log("  Show only Interesting:", settings.showOnlyInteresting);
  console.log("  Show only PIA:", settings.showOnlyPIA);
  console.log("  Show only LADD:", settings.showOnlyLADD);

  console.log("\nConnection:");
  console.log("  Socket connected:", store.isConnected);

  // Count how many aircraft would pass filters
  const aircraft = store.adsbAircraft?.aircraft || [];
  const messageGroups = store.messageGroups || new Map();

  let visibleCount = 0;
  let withMessages = 0;
  let withAlerts = 0;
  let withUnread = 0;

  for (const ac of aircraft) {
    // Check if has messages
    let hasMessages = false;
    for (const [, group] of messageGroups) {
      if (group.identifiers.includes(ac.hex.toUpperCase())) {
        hasMessages = true;
        if (group.has_alerts) withAlerts++;
        if (group.messages.some((m) => !store.readMessageUids?.has(m.uid))) {
          withUnread++;
        }
        break;
      }
    }

    if (hasMessages) withMessages++;

    // Check if would be visible with current filters
    let visible = true;

    if (settings.showOnlyAcars && !hasMessages) visible = false;
    if (settings.showOnlyUnread && !hasMessages) visible = false; // simplified check
    if (settings.showOnlyMilitary && !(ac.dbFlags & 1)) visible = false;
    if (settings.showOnlyInteresting && !(ac.dbFlags & 2)) visible = false;
    if (settings.showOnlyPIA && !(ac.dbFlags & 4)) visible = false;
    if (settings.showOnlyLADD && !(ac.dbFlags & 8)) visible = false;

    if (visible) visibleCount++;
  }

  console.log("\nAircraft Breakdown:");
  console.log("  Total ADS-B aircraft:", aircraft.length);
  console.log("  With ACARS messages:", withMessages);
  console.log("  With alerts:", withAlerts);
  console.log("  With unread messages:", withUnread);
  console.log("  VISIBLE after filters:", visibleCount);

  // Diagnose issues
  console.log("\n" + "=".repeat(80));
  console.log("DIAGNOSIS:");
  console.log("=".repeat(80));

  if (aircraft.length === 0) {
    console.log("❌ PROBLEM: No ADS-B aircraft data received");
    console.log("   - Check if ADS-B is enabled in backend");
    console.log("   - Check ADSB_URL environment variable");
    console.log("   - Check if aircraft.json is accessible");
  } else if (withMessages === 0) {
    console.log("⚠️  No aircraft have ACARS messages paired");
    console.log(
      "   - This is normal if you only have ADS-B (no ACARS receiver)",
    );
    console.log("   - Aircraft will show in sidebar, but with 0 messages");
    console.log(
      '   - If "Show only ACARS" filter is ON, sidebar will be empty',
    );
  } else if (visibleCount === 0) {
    console.log("❌ PROBLEM: Filters are hiding all aircraft!");
    console.log(
      "   - Turn off filters in the map controls (top-right buttons)",
    );
    console.log("   - Or in the aircraft list filter dropdown");
  } else {
    console.log("✅ Everything looks normal!");
    console.log(
      `   - ${visibleCount} aircraft should be visible in the sidebar`,
    );
    console.log("   - If you still don't see them, try refreshing the page");
  }
} else {
  console.log("❌ ERROR: Store not found");
  console.log("   - Are you on the Live Map page?");
  console.log("   - Try refreshing the page");
}

console.log("\n" + "=".repeat(80));
```

## Common Issues & Solutions

### Issue 1: "Show only ACARS" filter is enabled

**Symptom**: Sidebar is empty, but you have ADS-B aircraft

**Solution**: Click the airplane icon button in the top-right map controls to disable the "Show only aircraft with ACARS" filter.

### Issue 2: No ADS-B data being received

**Symptom**: Console shows "Total ADS-B aircraft: 0"

**Solution**:

- Check backend logs for ADS-B errors
- Verify `ADSB_URL` environment variable points to correct aircraft.json endpoint
- Test the URL directly: <http://your-adsb-source/aircraft.json>

### Issue 3: Socket.IO not connected

**Symptom**: Console shows "Socket connected: false"

**Solution**:

- Check network tab for failed WebSocket connections
- Verify backend is running
- Check browser console for connection errors

### Issue 4: All filters are enabled

**Symptom**: Console shows "VISIBLE after filters: 0" but you have aircraft

**Solution**: Disable filters one by one:

1. Open the filter dropdown in the aircraft list
2. Click "Clear All Filters"
3. Or disable individual filters in the map controls

## Manual Filter Reset

If the diagnostic shows filters are active and you want to reset them completely:

```javascript
// Reset all map filters to default
if (window.__ACARS_STORE__) {
  const store = window.__ACARS_STORE__;
  store.getState().settings.setShowOnlyAcars(false);
  store.getState().settings.setShowOnlyUnread(false);
  store.getState().settings.setShowOnlyMilitary(false);
  store.getState().settings.setShowOnlyInteresting(false);
  store.getState().settings.setShowOnlyPIA(false);
  store.getState().settings.setShowOnlyLADD(false);
  console.log("✅ All map filters reset to OFF");
  console.log("Refresh the page to see changes");
}
```

## Still Having Issues?

If none of the above helps:

1. **Export your logs**: Settings → Advanced → Export Logs (TXT)
2. **Take a screenshot** of the diagnostic output above
3. **Note your setup**:
   - Do you have an ACARS receiver? (Yes/No)
   - Do you have an ADS-B receiver? (Yes/No)
   - What backend version are you running?
4. **Open an issue** on GitHub with this information

## Expected Behavior

- **ADS-B only**: You should see all aircraft in the sidebar with 0 messages each
- **ACARS only**: You should see message groups in Live Messages, but no aircraft on the map
- **ADS-B + ACARS**: You should see aircraft on the map with message counts for those that match

The sidebar shows **all ADS-B aircraft** by default, unless you have filters enabled.
