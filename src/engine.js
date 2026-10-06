const ENGINE_PATH = `${import.meta.env.BASE_URL}stockfish-19-lite-single.js`;

function parseInfo(line) {
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
  const mate = line.match(/\bscore mate (-?\d+)/)?.[1];
  const cp = line.match(/\bscore cp (-?\d+)/)?.[1];
  const pv = line.match(/\bpv (.+)$/)?.[1]?.split(' ') ?? [];
  const wdl = line.match(/\bwdl (\d+) (\d+) (\d+)/);
  if (!pv.length || (!mate && !cp)) return null;
  return { depth, cp: cp === undefined ? null : Number(cp), mate: mate === undefined ? null : Number(mate), pv, wdl: wdl ? wdl.slice(1).map(Number) : null };
}

export class Stockfish {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.pending = null;
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(ENGINE_PATH);
        this.worker.onerror = (event) => reject(new Error(`引擎無法啟動：${event.message}`));
        this.worker.onmessage = ({ data }) => this.onMessage(String(data), resolve);
        this.worker.postMessage('uci');
      } catch (error) { reject(error); }
    });
    return this.ready;
  }

  onMessage(line, resolveReady) {
    if (line === 'uciok') {
      this.worker.postMessage('setoption name UCI_ShowWDL value true');
      this.worker.postMessage('isready');
      return;
    }
    if (line === 'readyok') { resolveReady(); return; }
    if (line.startsWith('info ') && this.pending) {
      const info = parseInfo(line);
      if (info && info.depth >= this.pending.info.depth) this.pending.info = info;
      return;
    }
    if (line.startsWith('bestmove ') && this.pending) {
      const bestMove = line.split(' ')[1];
      const { resolve, info } = this.pending;
      this.pending = null;
      resolve({ ...info, bestMove });
    }
  }

  async analyse(fen, depth = 13) {
    await this.start();
    if (this.pending) throw new Error('已有分析正在進行');
    return new Promise((resolve) => {
      this.pending = { resolve, info: { depth: 0, cp: 0, mate: null, pv: [], wdl: null } };
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  stop() { this.worker?.terminate(); this.worker = null; this.ready = null; this.pending = null; }
}
