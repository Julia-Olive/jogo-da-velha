/**
 * @file Camada CONTROLLER do Jogo da Velha.
 *
 * Recebe as ações do usuário vindas da View, aciona o Model e decide o que
 * mostrar. Cuida do fluxo entre telas, da vez do computador, dos textos de
 * status, das confirmações (RN07) e das preferências salvas no navegador.
 */
(function (global) {
  'use strict';

  /* ======================================================================
     Constantes
     ====================================================================== */

  /** Modos de jogo. */
  const MODES = Object.freeze({ TWO_PLAYERS: 'pvp', CPU: 'cpu' });

  /** Telas da aplicação. */
  const SCREENS = Object.freeze({ SETUP: 'setup', GAME: 'game' });

  /** Tons da faixa de status (cada um tem cor e ícone próprios no CSS). */
  const TONES = Object.freeze({ TURN: 'turn', WIN: 'win', DRAW: 'draw', ERROR: 'error', BUSY: 'busy' });

  /** Pausa antes da jogada do computador, para o jogador perceber a troca de vez. */
  const CPU_THINKING_DELAY_MS = 450;

  /** Chave usada para guardar as preferências no navegador. */
  const PREFERENCES_KEY = 'jogo-da-velha:prefs:v1';

  const DEFAULT_PREFERENCES = Object.freeze({
    style: 'papel',
    mode: MODES.TWO_PLAYERS,
    difficulty: 'medio',
    humanMark: 'X',
    sound: true
  });

  /** Descrição de cada trinca, usada na mensagem de vitória. */
  const LINE_DESCRIPTIONS = Object.freeze({
    '0,1,2': 'na linha 1', '3,4,5': 'na linha 2', '6,7,8': 'na linha 3',
    '0,3,6': 'na coluna 1', '1,4,7': 'na coluna 2', '2,5,8': 'na coluna 3',
    '0,4,8': 'na diagonal principal', '2,4,6': 'na diagonal secundária'
  });

  const NEXT_ROUND_HINT = 'Clique em “Nova partida” para continuar.';

  /* ======================================================================
     Preferências
     ====================================================================== */

  /**
   * Leitura e gravação das preferências no localStorage.
   * Se o armazenamento estiver bloqueado, o jogo segue com os valores padrão.
   */
  const PreferencesStore = Object.freeze({
    /** @returns {typeof DEFAULT_PREFERENCES} */
    load() {
      try {
        const saved = JSON.parse(global.localStorage.getItem(PREFERENCES_KEY) || '{}');
        return { ...DEFAULT_PREFERENCES, ...saved };
      } catch (_error) {
        return { ...DEFAULT_PREFERENCES };
      }
    },

    /** @param {typeof DEFAULT_PREFERENCES} preferences */
    save(preferences) {
      try {
        global.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
      } catch (_error) {
        // Sem armazenamento disponível: as preferências valem só nesta visita.
      }
    }
  });

  /* ======================================================================
     GameController
     ====================================================================== */

  class GameController {
    /**
     * @param {GameModel} model
     * @param {GameView} view
     * @param {Object} [options]
     * @param {number} [options.cpuDelay]    Pausa antes da jogada do computador (ms).
     * @param {() => number} [options.random] Gerador aleatório do computador.
     * @param {boolean} [options.persist]    Salvar preferências no navegador.
     */
    constructor(model, view, options = {}) {
      this.model = model;
      this.view = view;
      this.cpuDelay = options.cpuDelay ?? CPU_THINKING_DELAY_MS;
      this.random = options.random || Math.random;
      this.persist = options.persist !== false;
      this.preferences = this.persist ? PreferencesStore.load() : { ...DEFAULT_PREFERENCES };
      this.cpuTimer = null;
      /** Aviso temporário exibido no status (jogada inválida ou espera). */
      this.pendingNotice = null;

      this.initSetupScreen();
      this.bindViewEvents();
      this.model.subscribe((event, state, details) => this.handleModelChange(event, state, details));
      this.view.setSoundState(this.preferences.sound);
      this.view.showScreen(SCREENS.SETUP);
    }

    /* ------------------------------ Jogadores ------------------------------ */

    /** @returns {boolean} Verdadeiro no modo contra o computador. */
    get isCpuMode() {
      return this.preferences.mode === MODES.CPU;
    }

    /** @returns {'X'|'O'} Marca do computador. */
    get cpuMark() {
      return global.opponentOf(this.preferences.humanMark);
    }

    /** @returns {{X: string, O: string}} Nome exibido para cada marca. */
    playerNames() {
      if (!this.isCpuMode) return { X: 'Jogador X', O: 'Jogador O' };
      return this.preferences.humanMark === 'X'
        ? { X: 'Você', O: 'Computador' }
        : { X: 'Computador', O: 'Você' };
    }

    /**
     * @param {GameState} [state]
     * @returns {boolean} Verdadeiro se for a vez do computador.
     */
    isCpuTurn(state = this.model.getState()) {
      return this.isCpuMode && !state.isOver && state.currentPlayer === this.cpuMark;
    }

    /* ------------------------- Tela de configuração ------------------------- */

    initSetupScreen() {
      this.view.renderStyleOptions(this.preferences.style);
      this.view.renderDifficultyOptions(global.DIFFICULTIES, this.preferences.difficulty);
      this.view.setSetupValues({ mode: this.preferences.mode, humanMark: this.preferences.humanMark });
      this.handleSetupChange(this.view.getSetupValues());
    }

    /** @param {Object} values Valores atuais do formulário de configuração. */
    handleSetupChange(values) {
      this.view.setCpuOptionsEnabled(values.mode === MODES.CPU);
      this.view.setSetupSummary(`Resumo: ${this.describeSettings(values)}`);
    }

    /**
     * @param {{style: string, mode: string, difficulty: string, humanMark: string}} settings
     * @returns {string} Resumo legível da configuração.
     */
    describeSettings(settings) {
      const style = global.STYLES[settings.style] ? global.STYLES[settings.style].label : settings.style;
      if (settings.mode !== MODES.CPU) return `${style} · 2 jogadores`;
      const level = global.DIFFICULTIES[settings.difficulty].label;
      return `${style} · Contra o computador (${level}) · Você joga com ${settings.humanMark}`;
    }

    /** @param {Object} values Inicia a partida com a configuração escolhida. */
    startGame(values) {
      this.cancelCpuMove();
      this.preferences = { ...this.preferences, ...values };
      this.savePreferences();
      this.view.applyStyle(this.preferences.style);
      this.view.setConfigChip(this.describeSettings(this.preferences));
      this.view.showScreen(SCREENS.GAME);
      this.model.newRound();
      this.view.focusBoard();
    }

    /** Volta à tela de configuração, confirmando antes se houver partida em andamento. */
    async openSettings() {
      const state = this.model.getState();
      const hasGameInProgress = state.moveCount > 0 && !state.isOver;
      if (hasGameInProgress) {
        const confirmed = await this.view.confirm({
          title: 'Sair da partida atual?',
          message: 'A partida em andamento será descartada. O placar da sessão será mantido.',
          confirmLabel: 'Ir para configurações',
          cancelLabel: 'Continuar jogando'
        });
        if (!confirmed) return;
      }

      this.cancelCpuMove();
      this.view.setSetupValues(this.preferences);
      this.handleSetupChange(this.view.getSetupValues());
      this.view.showScreen(SCREENS.SETUP);
      const selectedStyle = this.view.el.setupForm.querySelector('input[name="style"]:checked');
      if (selectedStyle) selectedStyle.focus();
    }

    /* --------------------------- Ações do usuário --------------------------- */

    /** @param {number} index Casa escolhida pelo jogador. */
    handleCellActivate(index) {
      if (this.isCpuTurn()) {
        this.pendingNotice = { tone: TONES.BUSY, text: 'Aguarde: o computador está escolhendo a jogada.' };
        this.render();
        return;
      }
      this.model.play(index); // o Model valida a jogada (RN02, RN04) e avisa o resultado
    }

    /** Limpa o tabuleiro mantendo o placar (RF06, RN06). */
    newRound() {
      this.cancelCpuMove();
      this.model.newRound();
      this.view.focusBoard();
    }

    /**
     * Desfaz a última jogada do usuário.
     * Contra o computador, desfaz também a resposta dele, devolvendo a vez ao usuário.
     */
    undo() {
      const state = this.model.getState();
      if (!this.canUndo(state)) return;

      const cpuStillThinking = Boolean(this.cpuTimer);
      this.cancelCpuMove();
      const steps = this.isCpuMode && !cpuStillThinking && state.moveCount >= 2 ? 2 : 1;
      this.model.undo(steps);
    }

    /**
     * @param {GameState} state
     * @returns {boolean} Verdadeiro se há jogada do usuário para desfazer.
     */
    canUndo(state) {
      if (state.isOver || state.moveCount === 0) return false;
      if (!this.isCpuMode) return true;
      return state.board.includes(this.preferences.humanMark);
    }

    /**
     * Zera o placar após confirmação explícita (RF08, RN07).
     * @returns {Promise<boolean>} Verdadeiro se o placar foi zerado.
     */
    async resetScore() {
      const confirmed = await this.view.confirm({
        title: 'Zerar o placar?',
        message: 'Todas as vitórias e empates desta sessão voltarão a 0 e a rodada será reiniciada. Esta ação não pode ser desfeita.',
        confirmLabel: 'Sim, zerar placar',
        cancelLabel: 'Cancelar'
      });
      if (!confirmed) return false;

      this.cancelCpuMove();
      this.model.resetScore();
      this.view.focusBoard();
      return true;
    }

    toggleSound() {
      this.preferences.sound = !this.preferences.sound;
      this.savePreferences();
      this.view.setSoundState(this.preferences.sound);
    }

    savePreferences() {
      if (this.persist) PreferencesStore.save(this.preferences);
    }

    /** @param {string} soundName */
    playSound(soundName) {
      if (this.preferences.sound) this.view.playSound(soundName);
    }

    /* -------------------------- Reação ao Model -------------------------- */

    /**
     * Chamado pelo Model a cada mudança de estado.
     * @param {string} event
     * @param {GameState} state
     * @param {Object} [details]
     */
    handleModelChange(event, state, details) {
      if (event === global.MODEL_EVENTS.REJECTED) {
        this.handleRejectedMove(state, details);
        return;
      }

      this.pendingNotice = null;
      this.render();
      if (event === global.MODEL_EVENTS.MOVE) this.celebrateMove(state, details.player);
      this.scheduleCpuMoveIfNeeded(state);
    }

    /**
     * Explica por que a jogada foi recusada e dá alerta visual e sonoro (CT05, CT06).
     * @param {GameState} state
     * @param {{index: number, reason: string, occupant?: string}} rejection
     */
    handleRejectedMove(state, rejection) {
      const text = rejection.reason === global.MOVE_RESULT.OCCUPIED
        ? `Jogada inválida: a casa ${rejection.index + 1} já tem ${rejection.occupant}. ` +
          `Escolha uma casa vazia, continua ${this.turnDescription(state.currentPlayer)}.`
        : 'A partida terminou. Clique em “Nova partida” para jogar de novo.';

      this.pendingNotice = { tone: TONES.ERROR, text };
      this.playSound('invalid');
      this.render();
      this.view.flashInvalid(rejection.index);
    }

    /**
     * Dá o retorno sonoro e visual de uma jogada aceita.
     * @param {GameState} state
     * @param {'X'|'O'} player Quem acabou de jogar.
     */
    celebrateMove(state, player) {
      if (state.winner) {
        this.view.bumpScore(state.winner);
        const cpuWon = this.isCpuMode && state.winner === this.cpuMark;
        this.playSound(cpuWon ? 'lose' : 'win');
      } else if (state.isDraw) {
        this.view.bumpScore('draws');
        this.playSound('draw');
      } else {
        this.playSound(player);
      }
    }

    /** @param {GameState} state Agenda a jogada do computador quando for a vez dele. */
    scheduleCpuMoveIfNeeded(state) {
      const gameIsVisible = !this.view.el.gameScreen.hidden;
      if (!this.isCpuTurn(state) || this.cpuTimer || !gameIsVisible) return;

      this.cpuTimer = setTimeout(() => this.playCpuMove(), this.cpuDelay);
      this.render(); // mostra "Computador está pensando…"
    }

    playCpuMove() {
      this.cpuTimer = null;
      const state = this.model.getState();
      if (!this.isCpuTurn(state)) return;
      const move = global.CpuPlayer.chooseMove(state.board, this.cpuMark, this.preferences.difficulty, this.random);
      this.model.play(move);
    }

    cancelCpuMove() {
      clearTimeout(this.cpuTimer);
      this.cpuTimer = null;
    }

    /* ------------------------------ Exibição ------------------------------ */

    /**
     * @param {'X'|'O'} player
     * @returns {string} Ex.: "a vez do Jogador O", "a sua vez (X)".
     */
    turnDescription(player) {
      if (!this.isCpuMode) return `a vez do Jogador ${player}`;
      return player === this.preferences.humanMark
        ? `a sua vez (${player})`
        : `a vez do computador (${player})`;
    }

    /**
     * @param {GameState} state
     * @returns {{tone: string, badge: string, text: string}} Conteúdo da faixa de status.
     */
    buildStatus(state) {
      if (state.winner) return this.buildWinStatus(state);
      if (state.isDraw) {
        return { tone: TONES.DRAW, badge: '', text: `Partida empatada! Deu velha. ${NEXT_ROUND_HINT}` };
      }

      const badge = state.currentPlayer;
      if (this.pendingNotice) return { ...this.pendingNotice, badge };
      if (this.isCpuTurn(state)) return { tone: TONES.BUSY, badge, text: `Computador (${badge}) está pensando…` };
      if (this.isCpuMode) return { tone: TONES.TURN, badge, text: `Sua vez, você joga com ${badge}` };
      return { tone: TONES.TURN, badge, text: `Vez do ${this.playerNames()[badge]}` };
    }

    /**
     * @param {GameState} state
     * @returns {{tone: string, badge: string, text: string}}
     */
    buildWinStatus(state) {
      const where = LINE_DESCRIPTIONS[state.winningLine.join(',')] || '';
      let text;
      if (!this.isCpuMode) text = `Jogador ${state.winner} venceu! Trinca ${where}.`;
      else if (state.winner === this.preferences.humanMark) text = `Você venceu! Trinca ${where}.`;
      else text = `O computador venceu com trinca ${where}. Tente de novo!`;
      return { tone: TONES.WIN, badge: state.winner, text: `${text} ${NEXT_ROUND_HINT}` };
    }

    /** Redesenha tabuleiro, placar, status e botões a partir do estado atual. */
    render() {
      const state = this.model.getState();
      const cpuTurn = this.isCpuTurn(state);
      const names = this.playerNames();

      this.view.renderBoard(state, { locked: cpuTurn, ghost: cpuTurn ? null : state.currentPlayer, names });
      this.view.renderScore(state.score, names);
      this.view.setStatus(this.buildStatus(state));
      this.view.setActionsState({ canUndo: this.canUndo(state) });
    }

    /* ------------------------------- Eventos ------------------------------- */

    bindViewEvents() {
      const view = this.view;
      view.bindSetupChange(values => this.handleSetupChange(values));
      view.bindStart(values => this.startGame(values));
      view.bindCellActivate(index => this.handleCellActivate(index));
      view.bindNewRound(() => this.newRound());
      view.bindUndo(() => this.undo());
      view.bindResetScore(() => this.resetScore());
      view.bindOpenSettings(() => this.openSettings());
      view.bindToggleSound(() => this.toggleSound());
      view.bindHelp(() => view.openHelp());
      view.bindShortcuts(action => this.runShortcut(action));
    }

    /** @param {{type: string, index?: number}} action Ação vinda de um atalho de teclado. */
    runShortcut(action) {
      const handlers = {
        play: () => {
          this.handleCellActivate(action.index);
          this.view.focusCell(action.index);
        },
        new: () => this.newRound(),
        undo: () => this.undo(),
        settings: () => this.openSettings(),
        sound: () => this.toggleSound(),
        help: () => this.view.openHelp()
      };
      if (handlers[action.type]) handlers[action.type]();
    }
  }

  /* ======================================================================
     Exportação e inicialização
     ====================================================================== */

  const publicApi = { GameController };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicApi;
  else Object.assign(global, publicApi);

  /** Cria a aplicação quando a página termina de carregar. */
  function startApplication() {
    global.app = new GameController(new global.GameModel(), new global.GameView(document));
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApplication);
    else startApplication();
  }
})(typeof window !== 'undefined' ? window : globalThis);
