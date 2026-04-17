import cron from 'node-cron';
import { getAllWidgets, setCache, getSyncState, updateSyncState, getSetting, safeParseJson } from '../db/db.js';
import { getFetcher } from '../api/widgets-registry.js';

let cronTask = null;
// Module-level flag: set synchronously before any await to prevent concurrent runs
let _syncRunning = false;

/**
 * Run a full sync of all non-paused widgets.
 * Tracks progress in sync_state for pause/resume support.
 */
export async function runSync(startFromWidgetId = null) {
  if (_syncRunning) return;
  _syncRunning = true;

  const allWidgets = getAllWidgets().filter(w => !w.paused);
  if (!allWidgets.length) { _syncRunning = false; return; }

  let startIndex = 0;
  if (startFromWidgetId) {
    const idx = allWidgets.findIndex(w => w.id === startFromWidgetId);
    // idx is the widget that was interrupted mid-fetch — resume from the one after it
    startIndex = idx >= 0 ? idx + 1 : 0;
  }

  updateSyncState({
    in_progress: 1,
    started_at: new Date().toISOString(),
    total_widgets: allWidgets.length,
    synced_count: startIndex
  });

  try {
    for (let i = startIndex; i < allWidgets.length; i++) {
      const widget = allWidgets[i];
      updateSyncState({ last_widget_synced: widget.id, synced_count: i });

      const fetcher = getFetcher(widget.id);
      if (!fetcher) continue;

      try {
        const overrides = safeParseJson(widget.params);
        const data = await fetcher(overrides, widget.id);
        setCache(widget.id, data);
      } catch {
        // Error already logged to fetch_logs in client.js; continue with next widget
      }
    }
  } finally {
    _syncRunning = false;
    updateSyncState({
      in_progress: 0,
      synced_count: allWidgets.length,
      last_widget_synced: null
    });
  }
}

/**
 * Resume a previously interrupted sync from the last checkpointed widget.
 */
export async function resumeSync() {
  const state = getSyncState();
  return runSync(state.last_widget_synced || null);
}

/**
 * Start the global cron scheduler.
 * Schedule is read from the settings table (key: cron_schedule).
 * Default: 0 2 * * * (2am daily)
 */
export function startCron() {
  const schedule = getSetting('cron_schedule') || '0 2 * * *';
  if (cronTask) cronTask.stop();
  if (!cron.validate(schedule)) {
    console.warn(`[scheduler] Invalid cron expression "${schedule}", using default 0 2 * * *`);
    cronTask = cron.schedule('0 2 * * *', () => runSync().catch(console.error));
  } else {
    cronTask = cron.schedule(schedule, () => runSync().catch(console.error));
  }
  console.log(`[scheduler] Cron started: ${schedule}`);
}

/**
 * Restart cron with a new schedule (called from settings route).
 */
export function restartCron(newSchedule) {
  if (cronTask) cronTask.stop();
  if (!cron.validate(newSchedule)) {
    console.warn(`[scheduler] Invalid cron expression "${newSchedule}"`);
    return;
  }
  cronTask = cron.schedule(newSchedule, () => runSync().catch(console.error));
  console.log(`[scheduler] Cron restarted: ${newSchedule}`);
}
