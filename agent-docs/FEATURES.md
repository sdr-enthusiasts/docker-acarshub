# ACARS Hub - Feature Documentation

This document describes the key features of ACARS Hub.

## Message Processing

### ACARS Decoders

**Client-Side Decoding** (@airframes/acars-decoder):

- Parses ACARS message text into structured label/value pairs
- Provides "Full", "Partial", or "None" decode levels
- Displays formatted output alongside raw text
- Alert terms highlighted in decoded output

**Server-Side Decoding** (libacars):

- Decodes CPDLC messages (Controller-Pilot Data Link)
- Parses frequency information (ground station data)
- Handles complex message structures
- Backend sends decoded data as JSON

### Duplicate Detection

**Three Detection Strategies**:

1. **Full Field Match**:
   - Compares 13 fields: text, data, libacars, location, flight times
   - Increments duplicate counter (e.g., "1", "2", "3")
   - Promotes message to front of group

2. **Text-Only Match**:
   - Compares message text field only
   - Used when full field match fails
   - Prevents database bloat from identical messages

3. **Multi-Part Sequence**:
   - Detects AzzA patterns (e.g., M01A, M02A, M03A)
   - Detects AAAz patterns (e.g., AAA1, AAA2, AAA3)
   - Merges text fields across parts
   - Tracks parts in `msgno_parts` (e.g., "M01A M02A M03A")
   - Re-decodes merged text for accurate output

**Duplicate Handling**:

- Time-based filtering (8-second window for multi-part)
- Station separation (ACARS and VDLM messages kept separate)
- Part duplicate tracking (e.g., "M01A M02Ax2 M03A")

### Message Groups

**Grouping Strategy**:

- Messages grouped by aircraft/station identifier
- One group can have multiple identifiers (flight, tail, hex)
- Groups stored globally in Zustand (shared between pages)

**Group Structure**:

- `identifiers[]` - All known IDs
- `messages[]` - Up to 50 messages (configurable)
- `lastUpdated` - Timestamp for culling
- `has_alerts`, `num_alerts` - Alert tracking

**Culling System**:

- **Level 1**: Messages per group (default 50, range 10-200)
- **Level 2**: Total groups (default 50, range 10-200)
- **ADS-B-aware**: Never culls groups with active ADS-B aircraft
- **Race protection**: Skips culling until ADS-B data received

## Alert System

### Alert Term Matching

**Match Algorithm**:

- Word boundary matching with regex `\b{term}\b`
- Case-insensitive search
- Multi-field search: text, data, decoded_msg
- Ignore terms support (negative matching)

**Client-Side Processing**:

- Messages checked on arrival in Zustand store
- Sets `matched=true` and `matched_text[]` on matches
- Alert count updated in real-time
- Global alert count in navigation badge

**Alert Highlighting**:

- Matched terms highlighted in red within message content
- Works in raw text, decoded text, and libacars data
- HTML-safe rendering (prevents XSS)

### Notifications

**Sound Alerts**:

- Global AlertSoundManager component (works on ALL pages)
- Shared Audio element (prevents browser autoplay blocking)
- 2-second debouncing between alerts
- Volume control from Settings
- Firefox: Works across page reloads
- Chromium: Requires "Test Sound" click per reload

**Desktop Notifications**:

- Browser notification API integration
- Permission request flow
- Only for alert messages (matched=true)
- Time-based filtering (within 5 seconds)
- Shows matched terms in notification body
- Click handler focuses browser window

### Alert Management

**Alert Terms**:

- Stored in SQLite database (persistent)
- Real-time sync via Socket.IO
- Terms automatically uppercase
- Duplicate prevention
- Backend broadcasts updates to all clients

**Read/Unread Tracking**:

- UIDs tracked in localStorage (Set)
- Manual "Mark Read" button per message
- "Mark All Alerts Read" button on Alerts page
- Badge shows unread alert count only
- Read messages dimmed (60% opacity)
- No auto-mark behavior (explicit user control)

## Search Functionality

### Multi-Field Search

**Searchable Fields** (10):

- Flight number
- Tail number
- ICAO hex code
- Departure airport (DEPA)
- Destination airport (DSTA)
- Frequency
- Message label
- Message number
- Message text (full-text)
- Station ID

**Search Features**:

- Debounced search (500ms after typing stops)
- Manual search submit button
- Clear all fields button
- Empty state detection
- Real-time search as user types

### Full-Text Search

**Backend**: SQLite FTS5 (Full-Text Search)

- `messages_fts` virtual table
- Triggers keep FTS in sync with `messages` table
- Fast search across large datasets

**Frontend**: Text search across 40+ message fields

- Identifier match: Shows all messages for that aircraft
- Content match: Filters individual messages
- Works with other filters (pause, labels, alerts, no-text)
- Performance optimized with useMemo

### Pagination

**Results Display**:

- 50 results per page
- Smart page number display (first, last, current range, ellipsis)
- Previous/Next navigation
- Jump to page capability
- Scroll to top on page change
- Dual pagination (top and bottom)

## Live Map

### Map Technology

**MapLibre GL JS**:

- GPU-accelerated rendering (60fps with 100+ aircraft)
- WebGL-based map rendering
- Better performance than Leaflet
- Native rotation support

**Map Providers**:

- CartoDB (default, no API key required)
  - Dark Matter (dark theme)
  - Light All (light theme)
- Maptiler (optional, requires API key)
  - Vector tiles
  - Additional professional styles

### Aircraft Display

**ADS-B Data**:

- Backend polls aircraft.json every 5 seconds
- Payload optimized (52 fields → 13 fields = 75% reduction)
- Broadcast via Socket.IO to all clients

**ADS-B ↔ ACARS Pairing** (3 strategies):

1. Hex match (ICAO 24-bit address) - highest priority
2. ICAO callsign match (flight number) - medium priority
3. Tail/registration match - fallback

**Aircraft Markers**:

- 81 different aircraft shapes
- 300+ type mappings
- Rotation based on heading
- Color-coded:
  - Red: Alerts
  - Yellow/Peach: Unread messages
  - Green: Read messages
  - Blue: ADS-B only (no messages)
  - Signal strength gradient

**Hover Tooltips**:

- Callsign/tail/hex (priority order)
- Match strategy badge (hex/flight/tail)
- Altitude, speed, heading
- Aircraft type
- Message count (green highlight)
- Alert count (red highlight)

**Click Handlers**:

- Click marker → open ACARS messages modal
- Modal reuses MessageGroup component
- Keyboard support (Escape to close)
- Click outside to close
- Focus management for accessibility

### Map Features

**Range Rings**:

- Dynamic viewport-based sizing
- 3 rings that fit current view perfectly
- Distance to nearest edge calculation
- 70% safety margin (prevents clipping)
- Smart interval rounding (10, 20, 50, 100, 200, 500, etc.)
- Cardinal direction labels (N, S, E, W)
- Privacy protection (disabled if backend sets ENABLE_RANGE_RINGS=false)

**NEXRAD Weather Radar**:

- WMS tiles from Iowa State Mesonet
- Auto-refresh every 5 minutes
- Timestamp display
- Toggle button in MapControls
- Theme-aware styling

**Station Marker**:

- Pulsing animated marker
- Shows receiver position
- Theme-aware (Catppuccin red)
- Respects reduced motion preferences

**Aircraft List Sidebar**:

- Sortable by callsign, altitude, speed, messages, alerts
- Text search across callsign, hex, tail, type
- Filter toggles (ACARS-only, alerts-only, unread-only)
- Hover sync with map markers
- Click to center map on aircraft
- Persistent preferences to localStorage

### Unread Message Tracking

**Read State**:

- Tracked in AppStore (Set of message UIDs)
- Automatic marking as read when modal opened
- Manual "Mark All Messages as Read" button
- Unread-only filter in aircraft list
- Persistent state across page refreshes

## Statistics & Graphs

### RRD Time-Series Charts

**Time Periods**:

- 1 hour, 6 hours, 12 hours
- 24 hours, 1 week
- 30 days, 6 months, 1 year

**Decoder Types**:

- Combined (all decoders)
- ACARS, VDLM2, HFDL, IMSL, IRDM
- Errors

**Features**:

- Interactive Chart.js line charts
- Hover tooltips
- Responsive scaling
- Theme-aware colors
- Real-time data fetching via Socket.IO

### Signal Level Distribution

**Data Source**: Per-decoder signal level tables

- `level_acars`, `level_vdlm2`, `level_hfdl`, `level_imsl`, `level_irdm`

**Display**:

- Line chart showing signal distribution
- Float filtering (legacy database compatibility)
- Multiple decoder datasets
- Catppuccin theming

### Frequency Distribution

**Data Source**: Per-decoder frequency tables

- `freqs_acars`, `freqs_vdlm2`, `freqs_hfdl`, `freqs_imsl`, `freqs_irdm`

**Display**:

- Bar chart showing frequency usage
- Rainbow color palette
- "Other" aggregation for rare frequencies
- Per-decoder filtering

### Alert Terms Frequency

**Display**:

- Bar chart showing alert term matches
- Tol color palette (12 colors)
- Real-time updates

### Message Count Statistics

**Data**:

- Data messages vs empty messages
- Per-decoder breakdown
- Total counts

**Display**:

- Separate bar charts
- Theme-aware colors

## System Status

### Real-Time Monitoring

**Status Dashboard**:

- 10-second auto-refresh
- Real-time decoder health
- Thread status (database, scheduler, decoders)
- Message rate (total, per-minute)
- Error tracking

**Decoder Status**:

- Connection state (connected/disconnected)
- Thread health
- Message counts (total, per-minute)
- Decoding errors

**Server Status**:

- TCP listener health
- System threads status

**Configuration Summary**:

- Enabled decoders display

**Navigation Indicator**:

- Pulsing red ⚠ when system has errors
- Error state tracked from backend

## Settings System

### Appearance

- Theme (Catppuccin Mocha/Latte)
- Animations toggle
- Connection status visibility

### Regional & Time

- Time format (12hr/24hr/auto-detect)
- Date format (locale-based options)
- Timezone (UTC/local)

### Notification Settings

- Desktop notifications (browser API)
- Sound alerts
- Volume control
- Alerts-only mode

### Data & Privacy

- Max messages per aircraft (10-200, default 50)
- Max message groups (10-200, default 50)
- Cache management
- Auto-clear settings

### Map Settings

- Map provider (CartoDB/Maptiler)
- Maptiler API key
- Station lat/lon
- Range ring radii
- Default center/zoom
- NEXRAD overlay toggle
- Range rings toggle

### Advanced Settings

- Log level (error/warn/info/debug/trace)
- Log viewer with export (TXT/JSON)
- Alert term management

### Persistence

- localStorage via Zustand middleware
- Import/Export settings (JSON)
- Reset to defaults

## Performance Features

### Frontend Optimization

- Code splitting (React, Chart.js, MapLibre, decoder chunks)
- Efficient re-rendering (React.memo, useMemo, useCallback)
- Memory management (two-level culling system)
- Map GPU acceleration (60fps with 100+ aircraft)

### Backend Optimization

- Non-blocking I/O (Flask-SocketIO with gevent)
- Database indexes on common queries
- FTS5 for fast search
- Per-decoder signal/frequency tables
- Message deduplication
- RRD constant-size storage

### Network Optimization

- WebSocket binary protocol
- ADS-B payload reduction (75%)
- Event-driven (no polling)
- gzip compression for static assets

## Mobile Features

### Mobile-First Design

- Base styles for mobile (320px+)
- Touch targets minimum 44x44px
- No horizontal scrolling
- Responsive breakpoints (768px, 1024px)

### Mobile UX

- Full-screen modals on mobile
- Scrollable tab navigation
- Larger touch targets
- Input field font sizing (1rem for keyboard UX)
- Responsive table layouts
- Simplified navigation

## Accessibility Features

### WCAG 2.1 AA Compliance

- Color contrast: 4.5:1 for normal text
- Touch targets: 44x44px minimum
- Keyboard navigation: All interactive elements
- Screen reader support: ARIA landmarks, labels, roles
- Focus management: Visible indicators, modal traps

### Testing

- Automated axe-core tests (25+)
- Keyboard navigation tests
- Color contrast validation (both themes)
- Focus management validation
