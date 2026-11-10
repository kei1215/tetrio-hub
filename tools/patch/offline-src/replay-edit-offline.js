/* qp-replay-edit-offline-v1
 * QP OFFLINE: REPLAY BOARD EDIT + spin counter, always on (no CONFIG switch offline).
 * The code is the same as the online patch: build_release.py --offline-src inlines
 * docs/replay-edit/tetrio-replay-edit.js and docs/counter/tetrio-spin-counter.js at the
 * markers below, so both clients always ship the same replay edit.
 * It starts when a replay is loaded and stops on HOME (W.__qpEmbedded rules); it never
 * touches live (non-replay) games.
 */
(function (window, document) {
  try {
    if (window.__qpReplayEditOffline) return;
    window.__qpReplayEditOffline = true;
    window.__qpEmbedded = true;
    window.__scEmbedded = function () {
/*QP_SPIN_COUNTER_SRC*/
    };
    var run = function () {
/*QP_REPLAY_EDIT_SRC*/
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
  } catch (e) { console.warn('[replay-edit]', e); }
})(window, document);
