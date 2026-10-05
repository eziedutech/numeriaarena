/**
 * Sends the answers waiting in the device's outbox to the student's seat.
 * Only answers given while signed in to that same seat go; a guest's stay on
 * the device. The server acknowledges each one (it leaves the outbox) or
 * refuses it with a reason (set aside with it, never dropped).
 */
import type { LocalStore } from './storage.js';
import { online } from './offline.js';
import { seatKey, sendAnswers, studentState } from './home/student.js';

/** Answers in one request, as the server takes them. */
const BATCH = 200;
/** Requests in one go; what is left waits for the next play. */
const ROUNDS = 25;

let running = false;

export async function syncAnswers(store: LocalStore): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let round = 0; round < ROUNDS; round++) {
      const s = studentState();
      if (!s || !online()) return;
      const rows = await store.pendingFor(seatKey(s), BATCH);
      if (rows.length === 0) return;
      const r = await sendAnswers(s, rows);
      if (typeof r === 'string') {
        console.info(`[sync] answers wait on the device: ${r}`);
        return;
      }
      await store.ack(r.acked);
      if (r.rejected.length > 0) {
        await store.reject(r.rejected);
        console.warn(`[sync] ${r.rejected.length} answer(s) refused: ${r.rejected[0].reason}`);
      }
      console.info(`[sync] ${r.acked.length} answer(s) sent to the seat`);
      if (rows.length < BATCH) return;
    }
  } catch (error) {
    console.warn(`[sync] answers wait on the device: ${String(error)}`);
  } finally {
    running = false;
  }
}
