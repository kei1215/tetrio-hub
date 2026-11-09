# v4.8235 bookmarklet / v4.8237 desktop feature baseline

## Browser bookmarklet (QP OFFLINE v4.8235)
- Offline bookmarklet loader: v4.8235 with the 30-day cache (core cache name `tetrio-patch-offline-v4.8235-hold1`). The launcher code itself is cached for 30 days (`tetrio-patch-offline-v4.8235-core5`).
- Core client: the vO 4.8235 offline client, byte-patched against the official `tetrio.js` of the TETR.IO client of 2026-11-09. A different official `tetrio.js` is refused (length + SHA-256); the cached bundle keeps working until it is refreshed.
- Revive missions: vertical, horizontal, 4-way (quad) and orbit screen modes.
- Mission editor: QP-Mission-Editor v6.4 (keeps the v5.3 settings).
- Reverse HYPERSPEED track: Kugelhagel OVERDRIVE, looped at 188.499583 seconds (3:08.499583).
- Browser fallback music asset: https://kei1215.github.io/tetrio-hub/patch/v4.8233/kugelhagel-overdrive.mp3.
- Render-test buttons are not exposed in the bookmarklet shell.
- Replay board edit and board rotation bookmarklets are separate tools and are not part of QP OFFLINE.

## Desktop patch (A / R / O v4.8237)
- Anchors follow the TETR.IO client of 2026-11-09 (renamed minified identifiers; the Zenith base class is read from the client).
- CONFIG > QP PATCH TOOLS > REPLAY BOARD EDIT (ON/OFF, default OFF):
  - pausing a replay makes the board playable from that moment; play/seek returns to the paused scene;
  - spin counter (SPIN by lines/piece, T-SPIN with mini / T pieces placed, QUAD);
  - starts when TETRA CHANNEL opens or a replay is loaded, stops when neither is true or HOME opens;
  - runs while QP TOOLS are paused;
  - while ON, the patch replay presentation and native next-round auto play are off; player names stay.
- A (AI) downloads require Discord login with the server role.

## Change log
- v4.8233: quad screen mode, input inversion, reverse HYPERSPEED track, mission editor v6.3.
- v4.8234: REPLAY BOARD EDIT added to the desktop patch.
- v4.8235: desktop and browser builds follow the TETR.IO client of 2026-11-09.
- v4.8236: REPLAY BOARD EDIT runs while QP TOOLS are paused; it starts on TETRA CHANNEL or replay load.
- v4.8237: REPLAY BOARD EDIT stops outside TETRA CHANNEL / replay and on HOME.
