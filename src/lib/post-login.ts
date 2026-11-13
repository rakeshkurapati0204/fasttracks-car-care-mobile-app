// What the app does for a person right after they sign in or open it, besides showing their screen: register for notifications, copy the phone's contacts.
// These ask permission (system dialogs) and do real work, so they must never compete with the first screen or with each other:
//   - they start only once the screen has been drawn and touches have settled, not in the middle of the sign-in hand-over;
//   - they run ONE AT A TIME, each finishing (its dialog answered, its work done) before the next starts, so two dialogs are never on screen together;
//   - a task that fails or throws never stops the next one, and signing out cancels whatever has not started.
// `runInOrder` is pure so it runs under `npm test`.

export type Task = () => Promise<unknown>;

/** Runs the tasks one after another. Stops early when `isCancelled()` turns true; a failing task is skipped over, not fatal. */
export async function runInOrder(tasks: Task[], isCancelled: () => boolean): Promise<void> {
  for (const task of tasks) {
    if (isCancelled()) return;
    try { await task(); } catch { /* one chore failing must not stop the others */ }
  }
}
