# GeoJSON Overlays Implementation Plan

## Overview

Add support for toggleable GeoJSON overlays on the Live Map, similar to the NEXRAD weather radar overlay. This will allow users to display aviation-related geographic data such as military zones, training areas, air refueling tracks, and airspace boundaries.

## Current State

- **NEXRAD Overlay**: Working WMS raster overlay with toggle button in MapControls
- **GeoJSON Files**: 14 files in `geojson/` directory (ignored by git)
- **Map Technology**: MapLibre GL JS with react-map-gl wrapper
- **Settings**: Zustand store with localStorage persistence

## GeoJSON Files Inventory

### Root Level (8 files)

- `DE_Mil_AWACS_Orbits.geojson` - Germany
- `NL_Mil_AWACS_Orbits.geojson` - Netherlands
- `PL_Mil_AWACS_Orbits.geojson` - Poland
- `UK_Mil_AAR_Zones.geojson` - United Kingdom
- `UK_Mil_AWACS_Orbits.geojson` - United Kingdom
- `UK_Mil_RC.geojson` - United Kingdom
- `US_A2A_refueling.geojson` - United States
- `US_ARTCC_boundaries.geojson` - United States

### IFT Subdirectory (3 files)

- `IFT/IFT_NAV_Routes.geojson` - United States
- `IFT/IFT_Training_Areas.geojson` - United States
- `IFT/USAFA_Training_Areas.geojson` - United States

### UK Advisory Subdirectory (3 files)

- `uk_advisory/airports.geojson` - United Kingdom
- `uk_advisory/runways.geojson` - United Kingdom
- `uk_advisory/shoreham.geojson` - United Kingdom

## Geographic Categorization

Based on file naming and content analysis:

### United States

- US Air-to-Air Refueling Tracks (`US_A2A_refueling.geojson`)
- US ARTCC Boundaries (`US_ARTCC_boundaries.geojson`)
- IFT Navigation Routes (`IFT/IFT_NAV_Routes.geojson`)
- IFT Training Areas (`IFT/IFT_Training_Areas.geojson`)
- USAFA Training Areas (`IFT/USAFA_Training_Areas.geojson`)

### United Kingdom

- UK Military AAR Zones (`UK_Mil_AAR_Zones.geojson`)
- UK Military AWACS Orbits (`UK_Mil_AWACS_Orbits.geojson`)
- UK Military RC (`UK_Mil_RC.geojson`)
- UK Airports (`uk_advisory/airports.geojson`)
- UK Runways (`uk_advisory/runways.geojson`)
- UK Shoreham (`uk_advisory/shoreham.geojson`)

### Europe (NATO)

- Germany Military AWACS Orbits (`DE_Mil_AWACS_Orbits.geojson`)
- Netherlands Military AWACS Orbits (`NL_Mil_AWACS_Orbits.geojson`)
- Poland Military AWACS Orbits (`PL_Mil_AWACS_Orbits.geojson`)

## User Requirements

1. **No Settings Modal Integration** - Toggle via map controls only (like NEXRAD)
2. **Grouped by Geographic Area** - US, UK, Europe categories
3. **Persistent Selection** - Save state to localStorage between page loads
4. **Similar to NEXRAD** - Follow existing overlay pattern

## Technical Design

### 1. Data Structure

```typescript
// acarshub-react/src/types/index.ts

export interface GeoJSONOverlay {
  id: string; // Unique identifier (e.g., "us_a2a_refueling")
  name: string; // Display name (e.g., "Air-to-Air Refueling")
  path: string; // File path (e.g., "/geojson/US_A2A_refueling.geojson")
  category: string; // Geographic category (e.g., "United States", "United Kingdom", "Europe")
  enabled: boolean; // Visibility state
  color?: string; // Override default color
  opacity?: number; // Override default opacity
}

export interface GeoJSONCategory {
  name: string; // Category name (e.g., "United States")
  overlays: GeoJSONOverlay[]; // Overlays in this category
}
```

### 2. GeoJSON Configuration

```typescript
// acarshub-react/src/config/geojsonOverlays.ts

export const GEOJSON_OVERLAYS: GeoJSONCategory[] = [
  {
    name: "United States",
    overlays: [
      {
        id: "us_a2a_refueling",
        name: "Air-to-Air Refueling Tracks",
        path: "/geojson/US_A2A_refueling.geojson",
        category: "United States",
        enabled: false,
        color: "#00ff00", // Green for refueling tracks
        opacity: 0.7,
      },
      {
        id: "us_artcc_boundaries",
        name: "ARTCC Boundaries",
        path: "/geojson/US_ARTCC_boundaries.geojson",
        category: "United States",
        enabled: false,
        color: "#ff00ff", // Magenta for boundaries
        opacity: 0.6,
      },
      {
        id: "ift_nav_routes",
        name: "IFT Navigation Routes",
        path: "/geojson/IFT/IFT_NAV_Routes.geojson",
        category: "United States",
        enabled: false,
        color: "#ffff00", // Yellow for routes
        opacity: 0.7,
      },
      {
        id: "ift_training_areas",
        name: "IFT Training Areas",
        path: "/geojson/IFT/IFT_Training_Areas.geojson",
        category: "United States",
        enabled: false,
        color: "#ff8800", // Orange for training
        opacity: 0.5,
      },
      {
        id: "usafa_training_areas",
        name: "USAFA Training Areas",
        path: "/geojson/IFT/USAFA_Training_Areas.geojson",
        category: "United States",
        enabled: false,
        color: "#ff4444", // Red for USAFA
        opacity: 0.5,
      },
    ],
  },
  {
    name: "United Kingdom",
    overlays: [
      {
        id: "uk_mil_aar_zones",
        name: "Military AAR Zones",
        path: "/geojson/UK_Mil_AAR_Zones.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#00ff00",
        opacity: 0.7,
      },
      {
        id: "uk_mil_awacs_orbits",
        name: "Military AWACS Orbits",
        path: "/geojson/UK_Mil_AWACS_Orbits.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#00aaff",
        opacity: 0.7,
      },
      {
        id: "uk_mil_rc",
        name: "Military RC",
        path: "/geojson/UK_Mil_RC.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#ff00ff",
        opacity: 0.7,
      },
      {
        id: "uk_airports",
        name: "Airports",
        path: "/geojson/uk_advisory/airports.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#ffffff",
        opacity: 0.8,
      },
      {
        id: "uk_runways",
        name: "Runways",
        path: "/geojson/uk_advisory/runways.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#aaaaaa",
        opacity: 0.8,
      },
      {
        id: "uk_shoreham",
        name: "Shoreham",
        path: "/geojson/uk_advisory/shoreham.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#ffaa00",
        opacity: 0.7,
      },
    ],
  },
  {
    name: "Europe",
    overlays: [
      {
        id: "de_mil_awacs_orbits",
        name: "Germany AWACS Orbits",
        path: "/geojson/DE_Mil_AWACS_Orbits.geojson",
        category: "Europe",
        enabled: false,
        color: "#ffcc00",
        opacity: 0.7,
      },
      {
        id: "nl_mil_awacs_orbits",
        name: "Netherlands AWACS Orbits",
        path: "/geojson/NL_Mil_AWACS_Orbits.geojson",
        category: "Europe",
        enabled: false,
        color: "#ff6600",
        opacity: 0.7,
      },
      {
        id: "pl_mil_awacs_orbits",
        name: "Poland AWACS Orbits",
        path: "/geojson/PL_Mil_AWACS_Orbits.geojson",
        category: "Europe",
        enabled: false,
        color: "#ff0066",
        opacity: 0.7,
      },
    ],
  },
];
```

### 3. Settings Store Integration

```typescript
// acarshub-react/src/store/useSettingsStore.ts

interface MapSettings {
  // ... existing fields ...
  enabledGeoJSONOverlays: string[];  // Array of enabled overlay IDs
}

// Actions
setGeoJSONOverlay: (overlayId: string, enabled: boolean) => void;
toggleGeoJSONOverlay: (overlayId: string) => void;
setGeoJSONCategoryEnabled: (category: string, enabled: boolean) => void;
```

### 4. Component Structure

#### GeoJSONOverlayButton Component

```typescript
// acarshub-react/src/components/Map/GeoJSONOverlayButton.tsx

/**
 * Dropdown button for GeoJSON overlay selection
 * Similar to MapProviderSelector but grouped by category
 *
 * Features:
 * - Grouped by geographic region (US, UK, Europe)
 * - Individual layer toggles with checkboxes
 * - Category-level toggle all
 * - Persistent state to localStorage
 */
```

#### GeoJSONOverlays Component

```typescript
// acarshub-react/src/components/Map/GeoJSONOverlays.tsx

/**
 * Renders all enabled GeoJSON overlays on the map
 * Similar to NexradOverlay but supports multiple layers
 *
 * Features:
 * - Dynamic Source/Layer creation for each enabled overlay
 * - Fetch GeoJSON data from public directory
 * - Apply styling (color, opacity, line width)
 * - Handle loading states and errors
 */
```

### 5. MapLibre Layer Configuration

```typescript
// GeoJSON layers use MapLibre's native GeoJSON source type
const geojsonSource: GeoJSONSourceSpecification = {
  type: "geojson",
  data: "/geojson/US_A2A_refueling.geojson", // URL or GeoJSON object
};

const lineLayer: LineLayerSpecification = {
  id: "us_a2a_refueling_lines",
  type: "line",
  source: "us_a2a_refueling_source",
  paint: {
    "line-color": overlay.color || "#00ff00",
    "line-width": 2,
    "line-opacity": overlay.opacity || 0.7,
  },
};

const fillLayer: FillLayerSpecification = {
  id: "us_a2a_refueling_fill",
  type: "fill",
  source: "us_a2a_refueling_source",
  paint: {
    "fill-color": overlay.color || "#00ff00",
    "fill-opacity": (overlay.opacity || 0.7) * 0.3, // Lighter fill
  },
};
```

## Implementation Phases

### Phase 1: Core Infrastructure (1 day)

- [ ] Create `GeoJSONOverlay` and `GeoJSONCategory` types
- [ ] Create `geojsonOverlays.ts` configuration file
- [ ] Add settings store actions for overlay management
- [ ] Add `enabledGeoJSONOverlays` to MapSettings interface
- [ ] Update DEFAULT_SETTINGS with empty array

### Phase 2: GeoJSONOverlays Component (1 day)

- [ ] Create GeoJSONOverlays.tsx component
- [ ] Implement dynamic Source/Layer rendering
- [ ] Add GeoJSON data fetching with error handling
- [ ] Apply styling from overlay configuration
- [ ] Handle LineString and Polygon geometry types
- [ ] Add loading states

### Phase 3: GeoJSONOverlayButton Component (1 day)

- [ ] Create GeoJSONOverlayButton.tsx dropdown component
- [ ] Implement category-based grouping
- [ ] Add individual overlay checkboxes
- [ ] Add category-level "toggle all" checkboxes
- [ ] Style to match existing map controls (32×32px button)
- [ ] Add keyboard navigation and accessibility

### Phase 4: MapControls Integration (0.5 day)

- [ ] Add GeoJSONOverlayButton to MapControls
- [ ] Position button in new control group (after NEXRAD)
- [ ] Update SCSS for proper spacing
- [ ] Ensure mobile responsiveness

### Phase 5: Public Assets & Docker (0.5 day)

- [ ] Copy geojson/ directory to acarshub-react/public/geojson/
- [ ] Update Dockerfile to include geojson files in build
- [ ] Update nginx config if needed for geojson MIME types
- [ ] Test GeoJSON file serving in production build

### Phase 6: Testing & Documentation (1 day)

- [ ] Add unit tests for GeoJSONOverlays component
- [ ] Add unit tests for GeoJSONOverlayButton component
- [ ] Test localStorage persistence
- [ ] Test with all 14 GeoJSON files
- [ ] Test map performance with multiple overlays enabled
- [ ] Update AGENTS.md with GeoJSON overlay documentation
- [ ] Add usage guide to README or docs

## File Changes

### New Files

- `acarshub-react/src/config/geojsonOverlays.ts` - Overlay configuration
- `acarshub-react/src/components/Map/GeoJSONOverlays.tsx` - Rendering component
- `acarshub-react/src/components/Map/GeoJSONOverlays.scss` - Styling (if needed)
- `acarshub-react/src/components/Map/GeoJSONOverlayButton.tsx` - Control button
- `acarshub-react/src/components/Map/GeoJSONOverlayButton.scss` - Dropdown styling
- `acarshub-react/src/components/Map/__tests__/GeoJSONOverlays.test.tsx` - Tests
- `acarshub-react/src/components/Map/__tests__/GeoJSONOverlayButton.test.tsx` - Tests
- `acarshub-react/public/geojson/` - Copy of all GeoJSON files

### Modified Files

- `acarshub-react/src/types/index.ts` - Add GeoJSON types
- `acarshub-react/src/store/useSettingsStore.ts` - Add overlay actions
- `acarshub-react/src/components/Map/MapControls.tsx` - Add button
- `acarshub-react/src/components/Map/Map.tsx` - Add GeoJSONOverlays component
- `acarshub-react/src/components/Map/index.ts` - Export new components
- `Dockerfile` - Copy geojson files to /webapp/dist/geojson/

## Design Considerations

### Color Scheme

- Use distinct colors per overlay to avoid visual confusion
- Lighter fill opacity (30% of line opacity) for polygon areas
- Default to green for refueling/AAR, magenta for boundaries, yellow for routes
- Allow color override in configuration

### Performance

- Lazy load GeoJSON files (fetch only when enabled)
- Use MapLibre's native GeoJSON rendering (GPU-accelerated)
- Consider simplification for very large files
- Monitor performance with all 14 overlays enabled

### UX

- Group by geographic region for easy discovery
- Preserve user selections in localStorage
- Show loading indicator while fetching GeoJSON
- Handle fetch errors gracefully (show error, disable overlay)
- Mobile-first dropdown design

### Accessibility

- Keyboard navigation for dropdown menu
- ARIA labels for checkboxes and categories
- Screen reader support for overlay states
- Focus management when opening/closing dropdown

## Testing Strategy

### Unit Tests

- GeoJSONOverlays: rendering, data fetching, error handling
- GeoJSONOverlayButton: dropdown behavior, category toggles, state persistence
- Settings store: overlay enable/disable actions

### Integration Tests

- Multiple overlays enabled simultaneously
- Category-level toggle all functionality
- localStorage persistence across page reloads
- Map re-renders when overlays change

### E2E Tests (optional)

- User enables overlay → GeoJSON appears on map
- User disables overlay → GeoJSON disappears
- Category toggle all → all overlays in category toggled

## Open Questions

1. **GeoJSON File Serving**
   - Should we serve from public/ or via backend API?
   - **Answer**: Serve from public/ (static assets via nginx)

2. **Overlay Ordering**
   - What z-index for GeoJSON layers? (above/below aircraft markers?)
   - **Answer**: Below aircraft markers, above base map

3. **Legend**
   - Add legend showing overlay colors and names?
   - **Answer**: Optional future enhancement

4. **Custom Overlays**
   - Allow users to upload their own GeoJSON files?
   - **Answer**: Deferred to future enhancement

5. **Mobile UX**
   - How to handle many overlays on small screens?
   - **Answer**: Scrollable dropdown with compact checkboxes

## Success Criteria

- [ ] All 14 GeoJSON overlays can be individually toggled
- [ ] Overlays grouped by geographic region (US, UK, Europe)
- [ ] Toggle state persists across page reloads
- [ ] Button follows existing map control design (32×32px, mobile 44×44px)
- [ ] No settings modal interaction (map controls only)
- [ ] Performance acceptable with all overlays enabled
- [ ] Works in production Docker build
- [ ] All tests passing (`just ci`)
- [ ] Mobile-responsive dropdown
- [ ] Accessible keyboard navigation

## Estimated Timeline

- **Total**: 4-5 days
- **Phase 1**: 1 day (infrastructure)
- **Phase 2**: 1 day (rendering component)
- **Phase 3**: 1 day (control button)
- **Phase 4**: 0.5 day (integration)
- **Phase 5**: 0.5 day (assets & Docker)
- **Phase 6**: 1 day (testing & docs)

## Future Enhancements

- Custom overlay upload via Settings modal
- GeoJSON editing/annotation tools
- Sharing overlays between users
- Server-side overlay management
- Dynamic overlay updates (fetch from external sources)
- Performance optimization for very large GeoJSON files
- Legend component showing active overlays
- Overlay search/filter functionality
