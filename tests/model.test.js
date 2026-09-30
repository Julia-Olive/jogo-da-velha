/**
 * Testes unitários do MODEL (regras de negócio e adversário computador).
 * Executar:  node --test tests/model.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GameModel, CpuPlayer, WIN_LINES, evaluateBoard } = require('../js/model.js');

function playAll(model, moves) {
  return moves.map(i => model.play(i));
}

test('RF01/RN03: existem exatamente 8 combinações vencedoras', () => {
  assert.equal(WIN_LINES.length, 8);
  const m = new GameModel();
  assert.equal(m.getState().board.length, 9);
});

test('RN01: X sempre inicia', () => {
  const m = new GameModel();
  assert.equal(m.getState().currentPlayer, 'X');
});

test('RF02/RF03: registra jogada e alterna o turno', () => {
  const m = new GameModel();
  const r = m.play(4);
  assert.equal(r.ok, true);
  assert.equal(m.getState().board[4], 'X');
  assert.equal(m.getState().currentPlayer, 'O');
});

test('CT01: vitória de X por linha (0,1,2)', () => {
  const m = new GameModel();
  playAll(m, [0, 3, 1, 4, 2]);
  const s = m.getState();
  assert.equal(s.winner, 'X');
  assert.deepEqual(s.winningLine, [0, 1, 2]);
  assert.equal(s.score.X, 1);
});

test('CT02: vitória de O por coluna 2 (1,4,7)', () => {
  const m = new GameModel();
  playAll(m, [0, 1, 2, 4, 5, 7]);
  const s = m.getState();
  assert.equal(s.winner, 'O');
  assert.deepEqual(s.winningLine, [1, 4, 7]);
  assert.equal(s.score.O, 1);
});

test('CT03: vitória de X pela diagonal principal (0,4,8)', () => {
  const m = new GameModel();
  playAll(m, [0, 1, 4, 2, 8]);
  assert.equal(m.getState().winner, 'X');
  assert.deepEqual(m.getState().winningLine, [0, 4, 8]);
});

test('RN03: todas as 8 trincas são detectadas para X e O', () => {
  for (const line of WIN_LINES) {
    for (const p of ['X', 'O']) {
      const b = Array(9).fill(null);
      line.forEach(i => { b[i] = p; });
      const r = evaluateBoard(b);
      assert.equal(r.winner, p);
      assert.deepEqual(r.line, line);
    }
  }
});

test('CT04/RN05: empate ("velha") incrementa empates', () => {
  const m = new GameModel();
  // X: 0,1,5,6,8   O: 2,3,4,7
  playAll(m, [0, 2, 1, 3, 5, 4, 6, 7, 8]);
  const s = m.getState();
  assert.equal(s.winner, null);
  assert.equal(s.isDraw, true);
  assert.equal(s.score.draws, 1);
});

test('CT05/RF04/RN02: casa ocupada é recusada e turno mantido', () => {
  const m = new GameModel();
  m.play(4);
  const events = [];
  m.subscribe((t, _s, p) => events.push([t, p]));
  const r = m.play(4);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'occupied');
  assert.equal(m.getState().board[4], 'X');
  assert.equal(m.getState().currentPlayer, 'O');
  assert.equal(events[0][0], 'rejected');
});

test('CT06/RN04: nenhuma jogada é aceita após o fim', () => {
  const m = new GameModel();
  playAll(m, [0, 3, 1, 4, 2]);
  const r = m.play(8);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'game-over');
  assert.equal(m.getState().board[8], null);
  assert.equal(m.getState().score.X, 1, 'placar não muda');
});

test('CT07/RF06/RN06: nova partida limpa tabuleiro e preserva placar', () => {
  const m = new GameModel();
  playAll(m, [0, 1, 2, 4, 5, 7]); // O vence
  m.newRound();
  const s = m.getState();
  assert.deepEqual(s.board, Array(9).fill(null));
  assert.equal(s.currentPlayer, 'X', 'X recomeça mesmo após vitória de O');
  assert.equal(s.score.O, 1);
});

test('CT08/RF08: zerar placar volta tudo a 0 e reinicia a rodada', () => {
  const m = new GameModel();
  playAll(m, [0, 3, 1, 4, 2]);
  m.newRound();
  playAll(m, [0, 2, 1, 3, 5, 4, 6, 7, 8]);
  m.play(0); // tabuleiro já acabou, rejeitado
  m.resetScore();
  const s = m.getState();
  assert.deepEqual(s.score, { X: 0, O: 0, draws: 0 });
  assert.deepEqual(s.board, Array(9).fill(null));
});

test('Desfazer: remove a última jogada e devolve o turno', () => {
  const m = new GameModel();
  playAll(m, [4, 0, 8]);
  assert.equal(m.undo(1), true);
  assert.equal(m.getState().board[8], null);
  assert.equal(m.getState().currentPlayer, 'X');
  assert.equal(m.undo(2), true);
  assert.equal(m.getState().moveCount, 0);
  assert.equal(m.undo(1), false, 'nada a desfazer');
});

test('Desfazer não é permitido após o fim (placar já computado)', () => {
  const m = new GameModel();
  playAll(m, [0, 3, 1, 4, 2]);
  assert.equal(m.undo(1), false);
});

test('Índice inválido é recusado', () => {
  const m = new GameModel();
  assert.equal(m.play(9).ok, false);
  assert.equal(m.play(-1).ok, false);
  assert.equal(m.play(1.5).ok, false);
});

/* ------------------------- Computador ------------------------- */

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('RNF03: decisão mais cara do computador (tabuleiro vazio, sem cache) em menos de 50 ms', () => {
  const t0 = performance.now();
  CpuPlayer.chooseMove(Array(9).fill(null), 'X', 'impossivel');
  const dt = performance.now() - t0;
  assert.ok(dt < 50, `${dt.toFixed(1)} ms`);
});

test('Computador: sempre escolhe uma casa vazia, em todos os níveis', () => {
  const rnd = seeded(42);
  for (const level of ['facil', 'medio', 'dificil', 'impossivel']) {
    for (let g = 0; g < 30; g++) {
      const m = new GameModel();
      while (!m.isOver) {
        const mv = CpuPlayer.chooseMove(m.board, m.currentPlayer, level, rnd);
        assert.equal(m.board[mv], null);
        assert.equal(m.play(mv).ok, true);
      }
    }
  }
});

test('Computador médio: vence quando pode e bloqueia o adversário', () => {
  // O pode vencer em 5 (linha 3,4,5)
  const b1 = ['X', 'X', null, 'O', 'O', null, 'X', null, null];
  assert.equal(CpuPlayer.chooseMove(b1, 'O', 'medio'), 5);
  // X ameaça 0,1,2; O deve bloquear em 2
  const b2 = ['X', 'X', null, null, 'O', null, null, null, null];
  assert.equal(CpuPlayer.chooseMove(b2, 'O', 'medio'), 2);
});

/** Explora TODAS as sequências de jogadas humanas contra o computador no nível Impossível. */
function exhaustive(cpuMark) {
  let losses = 0, games = 0;
  (function explore(m) {
    if (m.isOver) {
      games++;
      if (m.winner && m.winner !== cpuMark) losses++;
      return;
    }
    if (m.currentPlayer === cpuMark) {
      const mv = CpuPlayer.chooseMove(m.board, cpuMark, 'impossivel', () => 0);
      const c = cloneModel(m); c.play(mv); explore(c);
    } else {
      m.board.forEach((v, i) => { if (!v) { const c = cloneModel(m); c.play(i); explore(c); } });
    }
  })(new GameModel());
  return { losses, games };
}
function cloneModel(m) {
  const c = new GameModel();
  m.history.forEach(i => c.play(i));
  return c;
}

test('Computador impossível: nunca perde jogando como O (busca exaustiva)', () => {
  const r = exhaustive('O');
  assert.ok(r.games > 0);
  assert.equal(r.losses, 0);
});

test('Computador impossível: nunca perde jogando como X (busca exaustiva)', () => {
  assert.equal(exhaustive('X').losses, 0);
});

test('Níveis de dificuldade são progressivos (taxa de vitória do computador contra jogador aleatório)', () => {
  const rnd = seeded(7);
  const rate = level => {
    let wins = 0;
    const N = 300;
    for (let g = 0; g < N; g++) {
      const m = new GameModel();
      while (!m.isOver) {
        const mv = m.currentPlayer === 'O'
          ? CpuPlayer.chooseMove(m.board, 'O', level, rnd)
          : CpuPlayer.chooseMove(m.board, 'X', 'facil', rnd);
        m.play(mv);
      }
      if (m.winner === 'O') wins++;
    }
    return wins / N;
  };
  const f = rate('facil'), md = rate('medio'), i = rate('impossivel');
  assert.ok(f < md, `fácil (${f}) < médio (${md})`);
  assert.ok(md <= i, `médio (${md}) <= impossível (${i})`);
});
