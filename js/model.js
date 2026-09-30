/**
 * @file Camada MODEL do Jogo da Velha.
 *
 * Guarda o estado da partida e aplica as regras de negócio (RN01 a RN07),
 * o placar (RF07) e a estratégia do adversário computador.
 * Não acessa o DOM: pode ser testada isoladamente no Node ou no navegador.
 */
(function (global) {
  'use strict';

  /* ======================================================================
     Constantes do domínio
     ====================================================================== */

  /** Quantidade de casas do tabuleiro 3x3 (RF01). */
  const BOARD_SIZE = 9;

  /** Índice da casa central, a mais valiosa estrategicamente. */
  const CENTER_CELL = 4;

  /** Marcas dos jogadores. */
  const PLAYERS = Object.freeze({ X: 'X', O: 'O' });

  /**
   * As 8 combinações vencedoras: 3 linhas, 3 colunas e 2 diagonais (RN03, RF05).
   * Os índices seguem a ordem de leitura: 0 é o canto superior esquerdo, 8 o inferior direito.
   */
  const WIN_LINES = Object.freeze([
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ]);

  /** Motivos pelos quais uma jogada pode ser recusada. */
  const MOVE_RESULT = Object.freeze({
    OCCUPIED: 'occupied',        // RF04, RN02: a casa já tem marca
    GAME_OVER: 'game-over',      // RN04: a partida já terminou
    OUT_OF_RANGE: 'out-of-range' // índice fora do tabuleiro
  });

  /** Tipos de evento publicados pelo Model aos seus observadores. */
  const MODEL_EVENTS = Object.freeze({
    MOVE: 'move',
    REJECTED: 'rejected',
    UNDO: 'undo',
    NEW_ROUND: 'new-round',
    SCORE_RESET: 'score-reset'
  });

  /** Níveis de dificuldade do computador, com os textos exibidos ao jogador. */
  const DIFFICULTIES = Object.freeze({
    facil:      { label: 'Fácil',      description: 'Joga de forma aleatória. Ideal para aprender.' },
    medio:      { label: 'Médio',      description: 'Vence quando pode e bloqueia suas trincas.' },
    dificil:    { label: 'Difícil',    description: 'Estratégia ótima na maioria das jogadas, com deslizes raros.' },
    impossivel: { label: 'Impossível', description: 'Estratégia perfeita (minimax). O melhor que você consegue é empatar.' }
  });

  /**
   * @typedef {'X'|'O'|null} Cell  Conteúdo de uma casa.
   *
   * @typedef {Object} BoardEvaluation
   * @property {'X'|'O'|null} winner  Jogador que fez trinca, se houver.
   * @property {number[]|null} line   Índices da trinca vencedora.
   * @property {boolean} draw         Tabuleiro cheio sem trinca (RN05).
   *
   * @typedef {Object} Score
   * @property {number} X      Vitórias do jogador X.
   * @property {number} O      Vitórias do jogador O.
   * @property {number} draws  Empates.
   *
   * @typedef {Object} GameState  Cópia imutável do estado, entregue a quem observa o Model.
   * @property {Cell[]} board
   * @property {'X'|'O'} currentPlayer
   * @property {'X'|'O'|null} winner
   * @property {number[]|null} winningLine
   * @property {boolean} isDraw
   * @property {boolean} isOver
   * @property {Score} score
   * @property {number} moveCount
   * @property {number|null} lastMove  Índice da última casa marcada.
   */

  /* ======================================================================
     Funções puras sobre o tabuleiro
     ====================================================================== */

  /**
   * Devolve o adversário de um jogador.
   * @param {'X'|'O'} player
   * @returns {'X'|'O'}
   */
  function opponentOf(player) {
    return player === PLAYERS.X ? PLAYERS.O : PLAYERS.X;
  }

  /**
   * Cria um tabuleiro vazio.
   * @returns {Cell[]}
   */
  function createEmptyBoard() {
    return Array(BOARD_SIZE).fill(null);
  }

  /**
   * Lista os índices das casas vazias.
   * @param {Cell[]} board
   * @returns {number[]}
   */
  function emptyCells(board) {
    const free = [];
    for (let index = 0; index < board.length; index++) {
      if (!board[index]) free.push(index);
    }
    return free;
  }

  /**
   * Verifica se há trinca ou empate em um tabuleiro qualquer.
   * @param {Cell[]} board
   * @returns {BoardEvaluation}
   */
  function evaluateBoard(board) {
    for (const line of WIN_LINES) {
      const [first, second, third] = line;
      const isTrinca = board[first] && board[first] === board[second] && board[first] === board[third];
      if (isTrinca) {
        return { winner: board[first], line: line.slice(), draw: false };
      }
    }
    return { winner: null, line: null, draw: board.every(Boolean) };
  }

  /**
   * Procura a casa que completaria uma trinca do jogador informado.
   * Serve tanto para vencer (própria marca) quanto para bloquear (marca do adversário).
   * @param {Cell[]} board
   * @param {'X'|'O'} player
   * @returns {number} Índice da casa, ou -1 se não houver.
   */
  function findWinningCell(board, player) {
    for (const line of WIN_LINES) {
      const cells = line.map(index => board[index]);
      const playerCount = cells.filter(cell => cell === player).length;
      const emptyPosition = cells.indexOf(null);
      if (playerCount === 2 && emptyPosition !== -1) {
        return line[emptyPosition];
      }
    }
    return -1;
  }

  /* ======================================================================
     GameModel: estado da partida e placar
     ====================================================================== */

  /**
   * Estado de uma sessão de jogo: tabuleiro, turno, resultado e placar acumulado.
   * Notifica os observadores a cada mudança (padrão Observer), para que o
   * Controller atualize a interface sem que o Model conheça a View.
   */
  class GameModel {
    constructor() {
      /** @type {Score} */
      this.score = { X: 0, O: 0, draws: 0 };
      /** @type {Set<Function>} */
      this.listeners = new Set();
      this.resetBoard();
    }

    /**
     * Registra um observador das mudanças de estado.
     * @param {(event: string, state: GameState, details?: Object) => void} listener
     * @returns {() => void} Função que cancela o registro.
     */
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    /**
     * Avisa todos os observadores sobre um evento.
     * @param {string} event
     * @param {Object} [details]
     */
    notify(event, details) {
      const state = this.getState();
      this.listeners.forEach(listener => listener(event, state, details));
    }

    /** Limpa o tabuleiro e devolve a vez ao jogador X (RN01). O placar não muda. */
    resetBoard() {
      /** @type {Cell[]} */
      this.board = createEmptyBoard();
      this.currentPlayer = PLAYERS.X;
      this.winner = null;
      this.winningLine = null;
      this.isDraw = false;
      /** Índices jogados, em ordem. Permite desfazer jogadas. */
      this.history = [];
    }

    /** @returns {boolean} Verdadeiro se houve vitória ou empate. */
    get isOver() {
      return Boolean(this.winner) || this.isDraw;
    }

    /** @returns {GameState} Cópia do estado atual. */
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

    /**
     * Tenta marcar uma casa para o jogador da vez (RF02 a RF05, RN02 a RN05).
     * @param {number} index Casa de 0 a 8.
     * @returns {{ok: boolean, reason?: string, occupant?: string, player?: string}}
     */
    play(index) {
      const rejection = this.validateMove(index);
      if (rejection) {
        if (rejection.reason !== MOVE_RESULT.OUT_OF_RANGE) {
          this.notify(MODEL_EVENTS.REJECTED, { index, ...rejection });
        }
        return { ok: false, ...rejection };
      }

      const player = this.currentPlayer;
      this.board[index] = player;
      this.history.push(index);
      this.applyResult(evaluateBoard(this.board));

      this.notify(MODEL_EVENTS.MOVE, { index, player });
      return { ok: true, player };
    }

    /**
     * Confere se a jogada é permitida.
     * @param {number} index
     * @returns {{reason: string, occupant?: string}|null} Motivo da recusa, ou null se válida.
     */
    validateMove(index) {
      const isValidIndex = Number.isInteger(index) && index >= 0 && index < BOARD_SIZE;
      if (!isValidIndex) return { reason: MOVE_RESULT.OUT_OF_RANGE };
      if (this.isOver) return { reason: MOVE_RESULT.GAME_OVER };
      if (this.board[index]) return { reason: MOVE_RESULT.OCCUPIED, occupant: this.board[index] };
      return null;
    }

    /**
     * Encerra a partida (vitória ou empate) ou passa a vez ao adversário (RF03).
     * @param {BoardEvaluation} evaluation
     */
    applyResult(evaluation) {
      if (evaluation.winner) {
        this.winner = evaluation.winner;
        this.winningLine = evaluation.line;
        this.score[evaluation.winner] += 1;
      } else if (evaluation.draw) {
        this.isDraw = true;
        this.score.draws += 1;
      } else {
        this.currentPlayer = opponentOf(this.currentPlayer);
      }
    }

    /**
     * Desfaz as últimas jogadas de uma partida em andamento.
     * Partidas encerradas não podem ser desfeitas, pois o placar já foi computado.
     * @param {number} [steps=1] Quantidade de jogadas a desfazer.
     * @returns {boolean} Verdadeiro se algo foi desfeito.
     */
    undo(steps = 1) {
      if (this.isOver || this.history.length === 0) return false;

      const count = Math.min(steps, this.history.length);
      for (let i = 0; i < count; i++) {
        this.board[this.history.pop()] = null;
      }
      const xPlaysNext = this.history.length % 2 === 0;
      this.currentPlayer = xPlaysNext ? PLAYERS.X : PLAYERS.O;

      this.notify(MODEL_EVENTS.UNDO, { steps: count });
      return true;
    }

    /** Começa uma nova rodada mantendo o placar (RF06, RN01, RN06). */
    newRound() {
      this.resetBoard();
      this.notify(MODEL_EVENTS.NEW_ROUND);
    }

    /**
     * Zera vitórias e empates e reinicia a rodada (RF08).
     * A confirmação exigida pela RN07 é feita antes, pelo Controller.
     */
    resetScore() {
      this.score = { X: 0, O: 0, draws: 0 };
      this.resetBoard();
      this.notify(MODEL_EVENTS.SCORE_RESET);
    }
  }

  /* ======================================================================
     Adversário computador
     ====================================================================== */

  /** Pontuação de uma vitória no minimax, descontada pelas casas já usadas. */
  const WIN_SCORE = 10;

  /** Probabilidade de o nível Médio preferir o centro quando ele está livre. */
  const MEDIUM_CENTER_CHANCE = 0.5;

  /** Probabilidade de o nível Difícil fazer uma jogada aleatória. */
  const HARD_MISTAKE_CHANCE = 0.2;

  /** Resultados do minimax já calculados, indexados pela posição. */
  const minimaxCache = new Map();

  /** Código numérico de cada conteúdo de casa, usado na chave do cache. */
  const CELL_CODES = Object.freeze({ X: 1, O: 2 });

  /**
   * Converte a posição em um número único (tabuleiro em base 3 + vez + marca do computador).
   * Chaves numéricas evitam criar textos a cada posição analisada (RNF03).
   * @param {Cell[]} board
   * @param {'X'|'O'} turn
   * @param {'X'|'O'} cpu
   * @returns {number}
   */
  function positionKey(board, turn, cpu) {
    let key = 0;
    for (let index = 0; index < BOARD_SIZE; index++) {
      key = key * 3 + (CELL_CODES[board[index]] || 0);
    }
    return key * 4 + (turn === PLAYERS.X ? 0 : 2) + (cpu === PLAYERS.X ? 0 : 1);
  }

  /**
   * Versão enxuta de evaluateBoard para o minimax: devolve só o vencedor, sem criar objetos.
   * @param {Cell[]} board
   * @returns {'X'|'O'|null}
   */
  function winnerOf(board) {
    for (const [first, second, third] of WIN_LINES) {
      if (board[first] && board[first] === board[second] && board[first] === board[third]) {
        return board[first];
      }
    }
    return null;
  }

  /**
   * Avalia uma posição com o algoritmo minimax.
   * O resultado é memorizado: o jogo da velha tem poucos milhares de posições,
   * então cada uma é calculada só uma vez (RNF03).
   * Vitórias mais rápidas valem mais; derrotas mais tardias valem menos.
   * @param {Cell[]} board   Tabuleiro (é alterado e restaurado durante a busca).
   * @param {'X'|'O'} turn   Quem joga nesta posição.
   * @param {'X'|'O'} cpu    Marca do computador.
   * @returns {number} Pontuação do ponto de vista do computador.
   */
  function minimax(board, turn, cpu) {
    const cacheKey = positionKey(board, turn, cpu);
    const cached = minimaxCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const winner = winnerOf(board);
    const freeCells = emptyCells(board);
    const filledCells = BOARD_SIZE - freeCells.length;
    let score;

    if (winner === cpu) score = WIN_SCORE - filledCells;
    else if (winner) score = filledCells - WIN_SCORE;
    else if (freeCells.length === 0) score = 0;
    else {
      const isCpuTurn = turn === cpu;
      score = isCpuTurn ? -Infinity : Infinity;
      for (const index of freeCells) {
        board[index] = turn;
        const childScore = minimax(board, opponentOf(turn), cpu);
        board[index] = null;
        score = isCpuTurn ? Math.max(score, childScore) : Math.min(score, childScore);
      }
    }

    minimaxCache.set(cacheKey, score);
    return score;
  }

  /**
   * Lista todas as jogadas de melhor pontuação para o computador.
   * @param {Cell[]} board
   * @param {'X'|'O'} cpu
   * @returns {number[]}
   */
  function bestMoves(board, cpu) {
    let bestScore = -Infinity;
    let moves = [];
    for (const index of emptyCells(board)) {
      board[index] = cpu;
      const score = minimax(board, opponentOf(cpu), cpu);
      board[index] = null;
      if (score > bestScore) {
        bestScore = score;
        moves = [index];
      } else if (score === bestScore) {
        moves.push(index);
      }
    }
    return moves;
  }

  /**
   * Sorteia um item de uma lista.
   * @template T
   * @param {T[]} items
   * @param {() => number} random Gerador entre 0 e 1.
   * @returns {T}
   */
  function pickRandom(items, random) {
    return items[Math.floor(random() * items.length)];
  }

  /**
   * Devolve a casa que vence ou, se não houver, a que bloqueia o adversário.
   * @param {Cell[]} board
   * @param {'X'|'O'} cpu
   * @returns {number} Índice da casa, ou -1.
   */
  function findWinOrBlock(board, cpu) {
    const winningCell = findWinningCell(board, cpu);
    return winningCell !== -1 ? winningCell : findWinningCell(board, opponentOf(cpu));
  }

  /**
   * Estratégia de cada nível de dificuldade.
   * Todas recebem (tabuleiro, marca do computador, gerador aleatório) e devolvem uma casa vazia.
   */
  const STRATEGIES = Object.freeze({
    facil(board, cpu, random) {
      return pickRandom(emptyCells(board), random);
    },

    medio(board, cpu, random) {
      const tacticalCell = findWinOrBlock(board, cpu);
      if (tacticalCell !== -1) return tacticalCell;
      if (!board[CENTER_CELL] && random() < MEDIUM_CENTER_CHANCE) return CENTER_CELL;
      return pickRandom(emptyCells(board), random);
    },

    dificil(board, cpu, random) {
      const tacticalCell = findWinOrBlock(board, cpu);
      if (tacticalCell !== -1) return tacticalCell;
      if (random() < HARD_MISTAKE_CHANCE) return pickRandom(emptyCells(board), random);
      return pickRandom(bestMoves(board, cpu), random);
    },

    impossivel(board, cpu, random) {
      return pickRandom(bestMoves(board, cpu), random);
    }
  });

  /** Adversário computador. */
  const CpuPlayer = Object.freeze({
    /**
     * Escolhe a casa que o computador vai marcar.
     * @param {Cell[]} board          Tabuleiro atual (não é alterado).
     * @param {'X'|'O'} cpu           Marca do computador.
     * @param {string} level          Chave de DIFFICULTIES.
     * @param {() => number} [random] Gerador aleatório, substituível nos testes.
     * @returns {number} Índice da casa, ou -1 se o tabuleiro estiver cheio.
     */
    chooseMove(board, cpu, level, random = Math.random) {
      const boardCopy = board.slice();
      if (emptyCells(boardCopy).length === 0) return -1;
      const strategy = STRATEGIES[level] || STRATEGIES.impossivel;
      return strategy(boardCopy, cpu, random);
    }
  });

  /* ======================================================================
     Exportação (navegador e Node)
     ====================================================================== */

  const publicApi = {
    GameModel, CpuPlayer, WIN_LINES, PLAYERS, MOVE_RESULT, MODEL_EVENTS, DIFFICULTIES,
    evaluateBoard, opponentOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicApi;
  else Object.assign(global, publicApi);
})(typeof window !== 'undefined' ? window : globalThis);
