/**
 * Track Elevation settings — the drawer group that corrects the loaded
 * track's elevations against the DEM: fill the missing values, replace every
 * elevation with a DEM sample, or restore the file's originals. This is the
 * ONLY entry point for the feature (no map/profile buttons), and it owns the
 * section's live DOM: the drawer rebuilds its sections on open/pick/language
 * change through content(), while state changes while the drawer sits open
 * repaint just this section's root, so progress ticks never rebuild the
 * drawer around it.
 *
 * States: idle (status line + action rows) → confirm (replace only) →
 * running (tile progress + cancel) → result (applied/restored/cancelled/
 * failed notes). "Replace" asks for an inline confirmation first — it
 * overwrites recorded elevations, and the user must see that DEM values can
 * differ before it runs. Every state re-renders from trackStore (no track →
 * disabled rows + hint; corrected track → restore row), and a genuinely new
 * track resets the notes. The elevation math lives in js/elevation/; this
 * module only speaks for it.
 */
import { t } from '../language/language.js';
import { icon } from './icons.js';
import { trackStore } from '../core/stores.js';
import {
  runElevationFix, cancelElevationFix, restoreOriginalElevations, isEleMissing,
} from '../elevation/elevationFix.js';
import { getTerrainProvider } from '../map/providers/terrain.js';
import { formatInt } from '../utils/format.js';

/** @typedef {{phase:'idle'}|
 *             {phase:'confirm'}|
 *             {phase:'running', mode:'fill'|'replace', done:number, total:number}|
 *             {phase:'result', kind:'applied'|'restored'|'cancelled'|'failed-all'|
 *                                 'nothing-to-fill'|'error'|'superseded',
 *              mode?:'fill'|'replace', applied?:number, failed?:number}} EleUiState */

/** @type {EleUiState} */
let uiState = { phase: 'idle' };
let root = null;
/** The running phase's progress line — updated in place, no rebuild. */
let progressLine = null;

let wired = false;

/** Subscribes the section to track and language updates (once). */
export function initTrackElevationSettings() {
  if (wired) return;
  wired = true;
  let wiredPoints = null;
  trackStore.subscribe((track) => {
    const points = track?.points ?? null;
    if (points !== wiredPoints) {
      // A new file (or the empty state): the old track's correction notes
      // describe data that is no longer on screen.
      wiredPoints = points;
      uiState = { phase: 'idle' };
      progressLine = null;
    }
    paint();
  });
}

/**
 * Builds the section's content for the drawer. Each build registers a fresh
 * root; state changes while this root is connected repaint into it.
 * @returns {DocumentFragment}
 */
export function trackElevationContent() {
  const frag = document.createDocumentFragment();
  root = document.createElement('div');
  root.className = 'ele-fix';
  frag.appendChild(root);
  paint();
  return frag;
}

/** @private Renders the current state into the section's root. The root is
 *  re-registered by every trackElevationContent() build, so this always
 *  paints the freshest root — connected or not (the drawer builds its
 *  sections before inserting them, and an orphaned older root is harmless). */
function paint() {
  if (!root) return;
  progressLine = null;
  root.replaceChildren(
    note(t('trackEleIntro'), 'ele-intro'),
    ...stateNodes(),
    ...footer(),
  );
}

/** @private The state-specific block between intro and footer. */
function stateNodes() {
  const track = trackStore.get();
  const nodes = [];
  switch (uiState.phase) {
    case 'confirm':
      nodes.push(note(t('trackEleReplaceWarn'), 'ele-warn'));
      nodes.push(buttonRow(
        { label: t('trackEleCancel'), value: 'ele-confirm-cancel', ghost: true, action: () => { uiState = { phase: 'idle' }; paint(); } },
        { label: t('trackEleConfirmReplace'), value: 'ele-confirm-replace', primary: true, action: () => start('replace') },
      ));
      return nodes;
    case 'running':
      nodes.push(note('', 'ele-progress'));
      progressLine = nodes[nodes.length - 1];
      progressLine.textContent = progressText();
      nodes.push(actionButton({
        label: t('trackEleCancel'), value: 'ele-cancel', ghost: true,
        action: () => {
          uiState = { phase: 'result', kind: 'cancelled' };
          cancelElevationFix();
          paint();
        },
      }));
      return nodes;
    case 'result':
      nodes.push(...resultNotes());
      // Applied/restored notes already state what is now in effect; the
      // outcomes that left the data untouched add the status line, so the
      // panel still answers "which elevations am I looking at".
      if (uiState.kind !== 'applied' && uiState.kind !== 'restored') {
        nodes.push(...statusNotes(track));
      }
      break;
    default:
      nodes.push(...statusNotes(track));
      break;
  }
  // Action rows (idle and result phases share them).
  nodes.push(actionButton({
    label: t('trackEleFill'), hint: t('trackEleFillHint'), value: 'ele-fill',
    icon: 'mountain',
    disabled: !track || uiState.phase === 'running',
    action: () => start('fill'),
  }));
  nodes.push(actionButton({
    label: t('trackEleReplace'), hint: t('trackEleReplaceHint'), value: 'ele-replace',
    icon: 'layers',
    disabled: !track || uiState.phase === 'running',
    action: () => { uiState = { phase: 'confirm' }; paint(); },
  }));
  if (track?.eleOriginal) {
    nodes.push(actionButton({
      label: t('trackEleRestore'), hint: t('trackEleRestoreHint'), value: 'ele-restore',
      icon: 'rotate-ccw',
      disabled: uiState.phase === 'running',
      action: () => {
        uiState = { phase: 'result', kind: 'restored' };
        restoreOriginalElevations();
        paint();
      },
    }));
  }
  if (!track) nodes.push(note(t('trackEleNeedTrack'), 'ele-warn'));
  return nodes;
}

/** @private The idle phase's status line: what the current elevations ARE
 *  (file originals, DEM-filled or DEM-replaced), or what is missing. */
function statusNotes(track) {
  if (!track) return [];
  if (track.eleSource === 'fill') return [note(t('trackEleStatusFill'), 'ele-status')];
  if (track.eleSource === 'replace') return [note(t('trackEleStatusReplace'), 'ele-status')];
  let missing = 0;
  for (const p of track.points) if (isEleMissing(p.ele)) missing++;
  if (missing > 0) {
    return [note(t('trackEleStatusMissing', { n: formatInt(missing) }), 'ele-status')];
  }
  return [note(t('trackEleStatusOriginal'), 'ele-status')];
}

/** @private The result phase's notes: mode + counts, partial failure made
 *  explicit, or the specific dead-end message. */
function resultNotes() {
  if (uiState.kind === 'applied') {
    const label = uiState.mode === 'fill'
      ? t('trackEleResultFill', { n: formatInt(uiState.applied ?? 0) })
      : t('trackEleResultReplace', { n: formatInt(uiState.applied ?? 0) });
    const notes = [note(label, 'ele-ok')];
    if ((uiState.failed ?? 0) > 0) {
      notes.push(note(t('trackEleResultFailed', { n: formatInt(uiState.failed ?? 0) }), 'ele-warn'));
    }
    return notes;
  }
  if (uiState.kind === 'restored') return [note(t('trackEleRestored'), 'ele-ok')];
  if (uiState.kind === 'cancelled') return [note(t('trackEleCancelled'))];
  if (uiState.kind === 'failed-all') return [note(t('trackEleFailedAll'), 'ele-warn')];
  if (uiState.kind === 'nothing-to-fill') return [note(t('trackEleNothingToFill'))];
  if (uiState.kind === 'error') return [note(t('trackEleFailedAll'), 'ele-warn')];
  return [];
}

/** @private Runs one correction, tracking tile progress. */
async function start(mode) {
  uiState = { phase: 'running', mode, done: 0, total: 0 };
  paint();
  const result = await runElevationFix(mode, {
    onProgress: ({ done, total }) => {
      if (uiState.phase !== 'running') return;
      uiState.done = done;
      uiState.total = total;
      // In-place text update — the running block must not rebuild under the
      // user's cursor (the cancel button would lose focus/hover every tick).
      if (progressLine?.isConnected) progressLine.textContent = progressText();
    },
  });
  // A superseded run says nothing: a newer run, a cancel or a new track has
  // already reset the section.
  if (result.status !== 'superseded') {
    uiState = {
      phase: 'result',
      kind: result.status,
      mode: result.mode,
      applied: result.applied,
      failed: result.failed,
    };
    paint();
  }
}

/** @private */
function progressText() {
  return t('trackEleProgress', {
    done: formatInt(uiState.phase === 'running' ? uiState.done : 0),
    total: formatInt(uiState.phase === 'running' ? uiState.total : 0),
  });
}

/* Building blocks ---------------------------------------------------------------- */

/** @private One small text note block. */
function note(text, extraClass = '') {
  const el = document.createElement('div');
  el.className = `ele-note${extraClass ? ` ${extraClass}` : ''}`;
  el.textContent = text;
  return el;
}

/** @private One full-width .menu-item action row: icon, then a two-line
 *  text column (title + the row's own explainer). */
function actionButton({ label, hint, value, icon: iconName, ghost = false, disabled = false, action }) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'menu-item';
  row.dataset.value = value;
  row.disabled = disabled;
  if (ghost) row.classList.add('menu-item-ghost');
  if (iconName) {
    const ic = document.createElement('span');
    ic.className = 'menu-item-icon';
    ic.innerHTML = icon(iconName);
    row.appendChild(ic);
  }
  const text = document.createElement('span');
  text.className = 'menu-item-text';
  const labelEl = document.createElement('span');
  labelEl.className = 'menu-item-label';
  labelEl.textContent = label;
  text.appendChild(labelEl);
  if (hint) {
    const hintEl = document.createElement('span');
    hintEl.className = 'menu-item-desc';
    hintEl.textContent = hint;
    text.appendChild(hintEl);
  }
  row.appendChild(text);
  row.addEventListener('click', action);
  return row;
}

/** @private A row of small buttons (confirm/cancel pairs). Single actions
 *  span the full menu-item width instead. */
function buttonRow(...buttons) {
  if (buttons.length === 1) return actionButton(buttons[0]);
  const row = document.createElement('div');
  row.className = 'ele-actions';
  for (const cfg of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-small ${cfg.primary ? 'btn-primary' : 'btn-ghost'}`;
    btn.dataset.value = cfg.value;
    btn.textContent = cfg.label;
    btn.addEventListener('click', cfg.action);
    row.appendChild(btn);
  }
  return row;
}

/** @private The footer: where the DEM data comes from, what requesting it
 *  discloses, and the tile set's required attribution. */
function footer() {
  const provider = getTerrainProvider();
  const notes = [note(t('trackElePrivacy'), 'ele-privacy')];
  const attrib = document.createElement('div');
  attrib.className = 'ele-note ele-attrib';
  attrib.append(`${t('trackEleAttributionLabel')} `);
  const link = document.createElement('a');
  link.href = provider.attributionUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = t(provider.labelKey);
  attrib.appendChild(link);
  notes.push(attrib);
  return notes;
}
