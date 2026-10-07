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

test('parses every MultiPV slot and keeps cp 0', () => {
  assert.equal(parseInfo('info depth 12 score cp 0 pv e2e4 e7e5').cp, 0);
  assert.equal(parseInfo('info depth 12 score cp 0 pv e2e4').multiPv, 1, 'a line without multipv is slot 1');
  const second = parseInfo('info depth 12 multipv 2 score cp 50 pv d2d4 d7d5');
  assert.equal(second.multiPv, 2);
  assert.deepEqual(second.pv, ['d2d4', 'd7d5']);
  assert.equal(parseInfo('info depth 10 currmove e2e4 currmovenumber 1'), null, 'lines without a score or pv are ignored');
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
    const first = await one;
    assert.equal(first.cp, 0);
    assert.equal(first.bestMove, 'e2e4');
    assert.deepEqual(first.pv, ['e2e4']);
    assert.equal(first.lines.length, 1, 'a single-PV search still reports one line');
    assert.deepEqual(worker.messages.slice(-2), ['position fen fen-two', 'go depth 11']);
    worker.respond('info depth 11 score cp 25 pv d2d4');
    worker.respond('bestmove d2d4');
    assert.equal((await two).bestMove, 'd2d4');
    engine.stop();
  } finally { globalThis.Worker = originalWorker; }
});

test('deep searches use movetime and collect the MultiPV candidate lines', async () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = FakeWorker;
  try {
    const engine = new Stockfish();
    const pending = engine.analyse('fen-key', { movetime: 2500, multiPv: 3 });
    await nextTurn();
    const worker = FakeWorker.instance;
    assert.deepEqual(worker.messages.slice(-3), ['setoption name MultiPV value 3', 'position fen fen-key', 'go movetime 2500'], 'movetime wins over depth and MultiPV is set first');
    worker.respond('info depth 18 multipv 1 score cp 30 pv e2e4 e7e5');
    worker.respond('info depth 18 multipv 2 score cp 10 pv d2d4 d7d5');
    worker.respond('info depth 18 multipv 3 score mate 5 pv g1f3 b8c6');
    // A shallower repeat must not overwrite a deeper line for the same slot.
    worker.respond('info depth 9 multipv 2 score cp -400 pv c2c4');
    worker.respond('bestmove e2e4');
    const result = await pending;
    assert.equal(result.cp, 30, 'slot 1 drives the headline evaluation');
    assert.deepEqual(result.lines.map((line) => line.multiPv), [1, 2, 3]);
    assert.deepEqual(result.lines.map((line) => line.cp), [30, 10, null]);
    assert.equal(result.lines[2].mate, 5);
    assert.deepEqual(result.lines[1].pv, ['d2d4', 'd7d5'], 'the deeper line for slot 2 is kept');

    // The option is only re-sent when the next job needs a different value.
    const next = engine.analyse('fen-plain', { depth: 12 });
    await nextTurn();
    assert.deepEqual(worker.messages.slice(-3), ['setoption name MultiPV value 1', 'position fen fen-plain', 'go depth 12']);
    worker.respond('info depth 12 score cp 5 pv e2e4');
    worker.respond('bestmove e2e4');
    await next;
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
