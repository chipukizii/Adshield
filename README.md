# 🛡️ AdShield — Browser Extension

> High-coverage advertisement blocking and privacy protection for Chrome.

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](manifest.json)
[![Manifest](https://img.shields.io/badge/Manifest-V3-green)](manifest.json)
[![License](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![Status](https://img.shields.io/badge/status-In%20Development-orange)](#roadmap)

---

## Overview

AdShield is a production-quality browser extension built on Chrome Manifest V3.

It blocks advertisements, tracking requests, intrusive pop-ups and video overlays using three independent, coordinated filtering layers:

1. **Network Layer** — Chrome Declarative Net Request (DNR) blocks ad server requests before they download.
2. **Cosmetic Layer** — CSS selectors and MutationObserver hide ad HTML elements on every page.
3. **Video / Pop-up Layer** — Specialized protection for video player overlays and unwanted new windows.

---

## Features (Planned — See Roadmap)

- [x] Project structure and architecture (Phase 1)
- [ ] Network request blocking with DNR (Phase 2)
- [ ] Cosmetic filtering with EasyList (Phase 3)
- [ ] Privacy and tracker protection (Phase 4)
- [ ] Video advertising protection (Phase 5)
- [ ] Full statistics dashboard (Phase 6)
- [ ] Automatic filter updates (Phase 7)
- [ ] Chrome Web Store release (Phase 9)

---

## Technical Stack

| Component | Technology |
|---|---|
| Extension Platform | Chrome Manifest V3 |
| Network Blocking | Declarative Net Request API |
| DOM Filtering | Content Scripts + MutationObserver |
| Background Logic | Service Worker |
| Storage | chrome.storage.local |
| UI | Vanilla JS + HTML5 + CSS3 |
| Filter Sources | EasyList, EasyPrivacy, uBlock filters |

---

## Installation (Development)

> Requires Google Chrome 88+

1. Clone the repository:
   ```
   git clone https://github.com/YOUR_USERNAME/adshield-browser-extension.git
   cd adshield-browser-extension
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (top-right toggle)

4. Click **Load unpacked** and select the `adshield-browser-extension` folder

5. The AdShield icon will appear in your Chrome toolbar

---

## Project Structure

```
adshield-browser-extension/
├── manifest.json                  # Chrome Extension Manifest V3
├── rules/
│   └── base-rules.json            # Declarative Net Request rules
├── src/
│   ├── background/
│   │   └── service-worker.js      # Central background coordinator
│   ├── content/
│   │   └── content-main.js        # Content script entry point
│   ├── popup/
│   │   ├── popup.html             # Extension popup UI
│   │   ├── popup.css              # Popup styles
│   │   └── popup.js               # Popup controller
│   ├── dashboard/
│   │   └── dashboard.html         # Full settings dashboard (Phase 6)
│   ├── engines/
│   │   ├── network/               # Network filtering engine (Phase 2)
│   │   ├── cosmetic/              # Cosmetic filtering engine (Phase 3)
│   │   ├── video/                 # Video protection engine (Phase 5)
│   │   ├── privacy/               # Privacy engine (Phase 4)
│   │   ├── popup-protection/      # Pop-up protection engine (Phase 4)
│   │   ├── stats/                 # Statistics engine (Phase 6)
│   │   └── filter-manager/        # Filter parsing engine (Phase 2)
│   └── shared/
│       ├── constants.js           # Shared constants
│       └── storage.js             # Storage utility
├── filters/
│   └── bundled/                   # Bundled filter lists (Phase 2)
├── assets/
│   ├── icons/                     # Extension icons
│   └── images/                    # UI images
├── docs/                          # Technical documentation
└── tests/                         # Test suite (Phase 8)
```

---

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 — Foundation | Project structure, manifest, popup scaffold | ✅ In Progress |
| 2 — Network Filtering | DNR engine, EasyList integration | ⏳ Upcoming |
| 3 — Cosmetic Filtering | CSS hiding, MutationObserver | ⏳ Upcoming |
| 4 — Privacy & Pop-ups | Tracker blocking, popup protection | ⏳ Upcoming |
| 5 — Video Protection | Video overlay filtering, stream compatibility | ⏳ Upcoming |
| 6 — Dashboard | Statistics UI, whitelist management | ⏳ Upcoming |
| 7 — Automation | Filter auto-updates, performance optimization | ⏳ Upcoming |
| 8 — QA | Testing suite, false positive audits | ⏳ Upcoming |
| 9 — Release | Chrome Web Store submission | ⏳ Upcoming |

---

## Known Limitations

- **Server-Side Ad Insertion (SSAI)** — Ads stitched directly into video streams (Hulu, Peacock, NFL+) cannot be blocked without breaking playback. This is a documented technical limitation of all browser-based ad blockers.
- **DRM-protected segments** — Segments tied to DRM decryption keys cannot be selectively removed.
- **Native sponsored content** — Editorial "sponsored" articles written by humans cannot be distinguished from regular content automatically.

---

## Privacy Policy

AdShield collects **no browsing data**. All filtering happens locally on your device. Settings are stored in `chrome.storage.local` and never transmitted to any server.

---

## Contributing

This project is in active development. Contribution guidelines will be published after Phase 1 is complete.

---

## License

MIT License — See [LICENSE](LICENSE) for details.

---

## Attribution

Filter lists provided by:
- [EasyList](https://easylist.to/) — licensed CC BY-SA 3.0
- [EasyPrivacy](https://easylist.to/) — licensed CC BY-SA 3.0
- [uBlock Origin filters](https://github.com/uBlockOrigin/uAssets) — licensed GPL-3.0

Full attribution details in [docs/filter-attribution.md](docs/filter-attribution.md).
