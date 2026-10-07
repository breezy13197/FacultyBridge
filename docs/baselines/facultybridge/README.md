# FacultyBridge v1.2

FacultyBridge is the landing page for the Faculty Tools suite.

## Included tools

- SyllabusBridge v2.1 — amber/gold
- CalendarBridge v7.5.3 — orange
- QuestionBridge v4.2 — green
- ExamBridge v1.8 — purple (in development)
- ItemBridge v1.8.4 — teal (in development)
- GradeBridge v6.0.1 — blue
- GroupBridge v1.2.1 — coral
- A reserved modular card for future Bridge tools

## What changed from v1.1

- Added SyllabusBridge.
- Added GroupBridge.
- Updated the suite count and About/footer copy for seven active tools.
- Added visible per-tool version badges.
- Corrected tool-card accent colors to match the established Faculty Tools color identities.
- Kept the registry-driven architecture so future Bridges remain a configuration change rather than a page redesign.
- Hardened theme storage so the landing page still works if browser storage is unavailable.

## Run locally

Open `index.html` in a modern browser. No build process or server is required for the landing page itself.

## Connect the Bridge applications

By default, FacultyBridge expects this deployment structure:

```text
FacultyBridge root/
  index.html
  assets/
  SyllabusBridge/index.html
  CalendarBridge/index.html
  QuestionBridge/index.html
  ExamBridge/index.html
  ItemBridge/index.html
  GradeBridge/index.html
  GroupBridge/index.html
```

If the tools are hosted at different URLs, edit the `url` fields in `assets/facultybridge.js`.

## Add another Bridge

Add one object to the `FB_TOOLS` array in `assets/facultybridge.js`. The card grid is generated from that registry, so the page does not need to be structurally redesigned when the suite grows.

## Design system

The package includes the shared Faculty Tools UI framework CSS plus a FacultyBridge-specific stylesheet. Theme selection uses the shared `ft-theme` localStorage key when storage is available.
