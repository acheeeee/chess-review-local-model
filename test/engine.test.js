import assert from 'node:assert/strict';
import test from 'node:test';
import { Stockfish, parseInfo } from '../src/engine.js';

class FakeWorker {
  constructor() { this.messages = []; FakeWorker.instance = this; }
  postMessage(message) {
    this.messages.push(message);
    if (message === 'uci') queueMicrotask(() => this.onmessage({ data: 'uciok' }));
    if (message === 'isready') queueMicrotask(() => this.onmessage({ data: 'readyok' }));
  }
  respond(message) { this.onmessage({ data: message }); }
  terminate() { this.terminated = true; }
}

const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

test('keeps cp 0 and ignores secondary MultiPV lines', () => {
  assert.equal(parseInfo('info depth 12 score cp 0 pv e2e4 e7e5').cp, 0);
  assert.equal(parseInfo('info depth 12 multipv 2 score cp 50 pv d2d4 d7d5'), null);
});

test('serializes UCI searches until each bestmove is received', async () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = FakeWorker;
  try {
    const engine = new Stockfish();
    const one = engine.analyse('fen-one', { depth: 10 });
    const two = engine.analyse('fen-two', { depth: 11 });
    await nextTurn();
    const worker = FakeWorker.instance;
    assert.deepEqual(worker.messages.slice(0, 5), ['uci', 'setoption name UCI_ShowWDL value true', 'isready', 'position fen fen-one', 'go depth 10']);
    assert.equal(worker.messages.includes('go depth 11'), false);
    worker.respond('info depth 10 score cp 0 pv e2e4');
    worker.respond('bestmove e2e4');
    assert.deepEqual(await one, { depth: 10, cp: 0, mate: null, pv: ['e2e4'], wdl: null, bestMove: 'e2e4' });
    assert.deepEqual(worker.messages.slice(-2), ['position fen fen-two', 'go depth 11']);
    worker.respond('info depth 11 score cp 25 pv d2d4');
    worker.respond('bestmove d2d4');
    assert.equal((await two).bestMove, 'd2d4');
    engine.stop();
  } finally { globalThis.Worker = originalWorker; }
});

test('aborting an active search sends stop and rejects only after bestmove', async () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = FakeWorker;
  try {
    const engine = new Stockfish();
    const controller = new AbortController();
    const pending = engine.analyse('fen-cancel', { signal: controller.signal });
    await nextTurn();
    controller.abort();
    assert.equal(FakeWorker.instance.messages.at(-1), 'stop');
    FakeWorker.instance.respond('bestmove e2e4');
    await assert.rejects(pending, { name: 'AbortError' });
    engine.stop();
  } finally { globalThis.Worker = originalWorker; }
});
