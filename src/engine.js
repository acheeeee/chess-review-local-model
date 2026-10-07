const ENGINE_PATH = `${import.meta.env?.BASE_URL ?? '/'}stockfish-19-lite-single.js`;

function abortError() {
  return new DOMException('分析已取消', 'AbortError');
}

export function parseInfo(line) {
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
  const multiPv = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
  const mateText = line.match(/\bscore mate (-?\d+)/)?.[1];
  const cpText = line.match(/\bscore cp (-?\d+)/)?.[1];
  const pv = line.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/) ?? [];
  const wdl = line.match(/\bwdl (\d+) (\d+) (\d+)/);

  // `cp 0` is a valid (and common) evaluation, so never use a truthy test here.
  if (!pv.length || (mateText === undefined && cpText === undefined)) return null;
  return {
    depth,
    // MultiPV lines are kept: slot 1 is the engine's choice, 2+ are alternatives.
    multiPv,
    cp: cpText === undefined ? null : Number(cpText),
    mate: mateText === undefined ? null : Number(mateText),
    pv,
    wdl: wdl ? wdl.slice(1).map(Number) : null,
  };
}

/** Serialises UCI searches for the single Stockfish Web Worker. */
export class Stockfish {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.queue = [];
    this.active = null;
    this.starting = false;
    // Mirrors the engine's current MultiPV option so it is only re-sent on change.
    this.multiPv = 1;
  }

  start() {
    if (this.ready) return this.ready;
    this.starting = true;
    let resolveReady;
    let rejectReady;
    this.ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const ready = this.ready;
    this.startResolve = resolveReady;
    this.startReject = rejectReady;
    try {
      this.worker = new Worker(ENGINE_PATH);
      this.worker.onerror = (event) => this.fail(new Error(`引擎無法啟動：${event.message || 'Worker 發生錯誤'}`));
      this.worker.onmessage = ({ data }) => this.onMessage(String(data));
      this.worker.postMessage('uci');
    } catch (error) { this.fail(error); }
    return ready;
  }

  onMessage(line) {
    if (line === 'uciok') {
      this.worker.postMessage('setoption name UCI_ShowWDL value true');
      this.worker.postMessage('isready');
      return;
    }
    if (line === 'readyok' && this.starting) {
      this.starting = false;
      this.startResolve?.();
      this.startResolve = null;
      this.startReject = null;
      this.pump();
      return;
    }
    if (line.startsWith('info ') && this.active) {
      const info = parseInfo(line);
      if (!info) return;
      // Keep the deepest line per MultiPV slot; slot 1 is the main line.
      const previous = this.active.lines.get(info.multiPv);
      if (!previous || info.depth >= previous.depth) this.active.lines.set(info.multiPv, info);
      if (info.multiPv === 1 && info.depth >= this.active.info.depth) this.active.info = info;
      return;
    }
    if (line.startsWith('bestmove ') && this.active) {
      const active = this.active;
      this.active = null;
      clearTimeout(active.stopTimer);
      active.signal?.removeEventListener('abort', active.abortHandler);
      const bestMove = line.split(/\s+/)[1] ?? '(none)';
      const lines = [...active.lines.entries()]
        .sort(([left], [right]) => left - right)
        .map(([multiPv, info]) => ({ ...info, multiPv }));
      if (active.cancelled) active.reject(abortError());
      else if (active.info.cp === null && active.info.mate === null) active.reject(new Error('引擎未回傳可用評估，請重新分析。'));
      else active.resolve({ ...active.info, bestMove, lines });
      this.pump();
    }
  }

  /**
   * Queues one search. `movetime` (ms) takes priority over `depth`, which is how
   * the deep mode spends more time on key moments. `multiPv` > 1 also returns
   * alternative lines in `lines`.
   */
  async analyse(fen, { depth = 13, movetime = 0, multiPv = 1, signal } = {}) {
    if (signal?.aborted) throw abortError();
    await this.start();
    if (signal?.aborted) throw abortError();
    return new Promise((resolve, reject) => {
      const job = { fen, depth, movetime, multiPv, signal, resolve, reject, info: null, lines: null, cancelled: false, abortHandler: null, stopTimer: null };
      job.abortHandler = () => this.cancel(job);
      signal?.addEventListener('abort', job.abortHandler, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }

  pump() {
    if (this.starting || this.active || !this.worker) return;
    const job = this.queue.shift();
    if (!job) return;
    if (job.signal?.aborted) {
      job.signal.removeEventListener('abort', job.abortHandler);
      job.reject(abortError());
      this.pump();
      return;
    }
    job.info = { depth: 0, multiPv: 1, cp: null, mate: null, pv: [], wdl: null };
    job.lines = new Map();
    this.active = job;
    if (job.multiPv !== this.multiPv) {
      this.worker.postMessage(`setoption name MultiPV value ${job.multiPv}`);
      this.multiPv = job.multiPv;
    }
    this.worker.postMessage(`position fen ${job.fen}`);
    this.worker.postMessage(job.movetime > 0 ? `go movetime ${job.movetime}` : `go depth ${job.depth}`);
  }

  cancel(job) {
    if (job !== this.active) {
      const index = this.queue.indexOf(job);
      if (index !== -1) this.queue.splice(index, 1);
      job.signal?.removeEventListener('abort', job.abortHandler);
      job.reject(abortError());
      return;
    }
    if (job.cancelled) return;
    job.cancelled = true;
    this.worker?.postMessage('stop');
    // A healthy UCI engine answers `stop` with bestmove. If it does not, reset
    // the worker rather than leaving the UI in an uncancellable state.
    job.stopTimer = setTimeout(() => this.fail(abortError()), 2500);
  }

  cancelAll() {
    for (const job of [...this.queue]) this.cancel(job);
    if (this.active) this.cancel(this.active);
  }

  fail(error) {
    const reason = error instanceof Error || error?.name === 'AbortError' ? error : new Error(String(error));
    clearTimeout(this.active?.stopTimer);
    if (this.active) {
      this.active.signal?.removeEventListener('abort', this.active.abortHandler);
      this.active.reject(reason);
    }
    for (const job of this.queue) {
      job.signal?.removeEventListener('abort', job.abortHandler);
      job.reject(reason);
    }
    this.active = null;
    this.queue = [];
    this.worker?.terminate();
    this.worker = null;
    // A new worker starts at the engine default again.
    this.multiPv = 1;
    this.startReject?.(reason);
    this.startResolve = null;
    this.startReject = null;
    this.ready = null;
    this.starting = false;
  }

  stop() { this.fail(abortError()); }
}
