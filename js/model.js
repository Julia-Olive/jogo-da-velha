/**
 * MODEL — Estado e regras de negócio do Jogo da Velha.
 *
 * Não conhece o DOM nem eventos. Toda a lógica de jogo (RN01–RN07),
 * placar (RF07) e inteligência do computador (níveis de dificuldade)
 * vive aqui, podendo ser testada isoladamente em Node ou no navegador.
 */
(function (global) {
  'use strict';

  /** RN03 / RF05 — as 8 combinações vencedoras (3 linhas, 3 colunas, 2 diagonais). */
  const WIN_LINES = Object.freeze([
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // linhas
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // colunas
    [0, 4, 8], [2, 4, 6]             // diagonais
  ]);

  const PLAYERS = Object.freeze({ X: 'X', O: 'O' });

  /** Resultado de uma tentativa de jogada. */
  const MOVE_RESULT = Object.freeze({
    OK: 'ok',
    OCCUPIED: 'occupied',     // RF04 / RN02
    GAME_OVER: 'game-over',   // RN04
    OUT_OF_RANGE: 'out-of-range'
  });

  /** Analisa um tabuleiro qualquer (função pura, reutilizada pela IA). */
  function evaluateBoard(board) {
    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], line: line.slice(), draw: false };
      }
    }
    const full = board.every(Boolean);
    return { winner: null, line: null, draw: full }; // RN05
  }

  function emptyCells(board) {
    const cells = [];
    board.forEach((v, i) => { if (!v) cells.push(i); });
    return cells;
  }

  class GameModel {
    constructor() {
      this.score = { X: 0, O: 0, draws: 0 };
      this.listeners = new Set();
      this._resetBoard();
    }

    /* ---------- Observador (Model → Controller) ---------- */
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    _emit(type, payload) {
      const snapshot = this.getState();
      this.listeners.forEach(fn => fn(type, snapshot, payload));
    }

    _resetBoard() {
      this.board = Array(9).fill(null);
      this.currentPlayer = PLAYERS.X; // RN01 — X sempre inicia
      this.winner = null;
      this.winningLine = null;
      this.isDraw = false;
      this.history = []; // pilha de índices jogados (permite desfazer)
    }

    get isOver() { return Boolean(this.winner) || this.isDraw; }

    getState() {
      return {
        board: this.board.slice(),
        currentPlayer: this.currentPlayer,
        winner: this.winner,
        winningLine: this.winningLine ? this.winningLine.slice() : null,
        isDraw: this.isDraw,
        isOver: this.isOver,
        score: { ...this.score },
        moveCount: this.history.length,
        lastMove: this.history.length ? this.history[this.history.length - 1] : null
      };
    }

    /** RF02 / RF03 / RF04 / RF05 / RN02 / RN04 */
    play(index) {
      if (!Number.isInteger(index) || index < 0 || index > 8) {
        return { ok: false, reason: MOVE_RESULT.OUT_OF_RANGE };
      }
      if (this.isOver) {
        this._emit('rejected', { index, reason: MOVE_RESULT.GAME_OVER });
        return { ok: false, reason: MOVE_RESULT.GAME_OVER };
      }
      if (this.board[index]) {
        // Turno NÃO é trocado (RF04)
        this._emit('rejected', { index, reason: MOVE_RESULT.OCCUPIED, occupant: this.board[index] });
        return { ok: false, reason: MOVE_RESULT.OCCUPIED, occupant: this.board[index] };
      }

      const player = this.currentPlayer;
      this.board[index] = player;
      this.history.push(index);

      const result = evaluateBoard(this.board);
      if (result.winner) {
        this.winner = result.winner;
        this.winningLine = result.line;
        this.score[result.winner] += 1; // RF07
      } else if (result.draw) {
        this.isDraw = true;
        this.score.draws += 1; // RF07
      } else {
        this.currentPlayer = player === PLAYERS.X ? PLAYERS.O : PLAYERS.X; // RF03
      }

      this._emit('move', { index, player });
      return { ok: true, player, winner: this.winner, draw: this.isDraw };
    }

    /** Desfaz a(s) última(s) jogada(s) de uma partida em andamento (controle do usuário). */
    undo(steps = 1) {
      if (this.isOver || this.history.length === 0) return false;
      const n = Math.min(steps, this.history.length);
      for (let i = 0; i < n; i++) {
        const idx = this.history.pop();
        this.board[idx] = null;
      }
      this.currentPlayer = this.history.length % 2 === 0 ? PLAYERS.X : PLAYERS.O;
      this._emit('undo', { steps: n });
      return true;
    }

    /** RF06 / RN01 / RN06 — limpa só o tabuleiro, preserva o placar. */
    newRound() {
      this._resetBoard();
      this._emit('new-round');
    }

    /** RF08 / RN07 — a confirmação é responsabilidade do Controller/View. */
    resetScore() {
      this.score = { X: 0, O: 0, draws: 0 };
      this._resetBoard();
      this._emit('score-reset');
    }
  }

  /* ================== Inteligência do computador ================== */

  /* Minimax com memoização: o tabuleiro tem poucos milhares de estados,
     então cada posição é calculada uma única vez (RNF03 — resposta imediata).
     A pontuação usa o nº de casas preenchidas para preferir vitórias rápidas. */
  const memo = new Map();

  function minimax(board, turn, ai) {
    const key = board.map(v => v || '-').join('') + turn + ai;
    if (memo.has(key)) return memo.get(key);

    const r = evaluateBoard(board);
    const filled = 9 - emptyCells(board).length;
    let best;
    if (r.winner === ai) best = 10 - filled;
    else if (r.winner) best = filled - 10;
    else if (r.draw) best = 0;
    else {
      best = turn === ai ? -Infinity : Infinity;
      for (const i of emptyCells(board)) {
        board[i] = turn;
        const s = minimax(board, turn === 'X' ? 'O' : 'X', ai);
        board[i] = null;
        best = turn === ai ? Math.max(best, s) : Math.min(best, s);
      }
    }
    memo.set(key, best);
    return best;
  }

  function bestMoves(board, ai) {
    let best = -Infinity;
    let moves = [];
    for (const i of emptyCells(board)) {
      board[i] = ai;
      const s = minimax(board, ai === 'X' ? 'O' : 'X', ai);
      board[i] = null;
      if (s > best) { best = s; moves = [i]; } else if (s === best) moves.push(i);
    }
    return moves;
  }

  function findLineCompletion(board, player) {
    for (const [a, b, c] of WIN_LINES) {
      const cells = [board[a], board[b], board[c]];
      if (cells.filter(v => v === player).length === 2 && cells.includes(null)) {
        return [a, b, c][cells.indexOf(null)];
      }
    }
    return -1;
  }

  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

  const DIFFICULTIES = Object.freeze({
    facil:      { label: 'Fácil',      description: 'Joga de forma aleatória. Ideal para aprender.' },
    medio:      { label: 'Médio',      description: 'Vence quando pode e bloqueia suas trincas.' },
    dificil:    { label: 'Difícil',    description: 'Estratégia ótima na maioria das jogadas, com deslizes raros.' },
    impossivel: { label: 'Impossível', description: 'Estratégia perfeita (minimax). O melhor que você consegue é empatar.' }
  });

  const AIPlayer = {
    /**
     * Escolhe uma casa para o computador.
     * @param {Array} board   tabuleiro atual (não é modificado)
     * @param {string} ai     marca do computador ('X' ou 'O')
     * @param {string} level  facil | medio | dificil | impossivel
     * @param {Function} rnd  gerador aleatório (injetável para testes)
     */
    chooseMove(board, ai, level, rnd = Math.random) {
      const b = board.slice();
      const free = emptyCells(b);
      if (free.length === 0) return -1;
      const human = ai === 'X' ? 'O' : 'X';

      switch (level) {
        case 'facil':
          return pick(free, rnd);
        case 'medio': {
          const win = findLineCompletion(b, ai);
          if (win >= 0) return win;
          const block = findLineCompletion(b, human);
          if (block >= 0) return block;
          if (!b[4] && rnd() < 0.5) return 4;
          return pick(free, rnd);
        }
        case 'dificil': {
          const win = findLineCompletion(b, ai);
          if (win >= 0) return win;
          const block = findLineCompletion(b, human);
          if (block >= 0) return block;
          if (rnd() < 0.2) return pick(free, rnd); // deslize ocasional
          return pick(bestMoves(b, ai), rnd);
        }
        case 'impossivel':
        default:
          return pick(bestMoves(b, ai), rnd);
      }
    }
  };

  const api = { GameModel, AIPlayer, WIN_LINES, PLAYERS, MOVE_RESULT, DIFFICULTIES, evaluateBoard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(global, api);
})(typeof window !== 'undefined' ? window : globalThis);
