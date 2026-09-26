/**
 * CONTROLLER — Recebe eventos da View, aciona o Model e decide o que exibir.
 *
 * Responsável por: fluxo de telas, turno do computador, textos de status,
 * confirmações (RN07) e persistência das preferências do usuário.
 */
(function (global) {
  'use strict';

  const PREFS_KEY = 'jogo-da-velha:prefs:v1';
  const DEFAULT_PREFS = { style: 'papel', mode: 'pvp', difficulty: 'medio', humanMark: 'X', sound: true };

  const LINE_NAMES = {
    '0,1,2': 'na linha 1', '3,4,5': 'na linha 2', '6,7,8': 'na linha 3',
    '0,3,6': 'na coluna 1', '1,4,7': 'na coluna 2', '2,5,8': 'na coluna 3',
    '0,4,8': 'na diagonal principal', '2,4,6': 'na diagonal secundária'
  };

  const storage = {
    load() {
      try { return { ...DEFAULT_PREFS, ...JSON.parse(global.localStorage.getItem(PREFS_KEY) || '{}') }; }
      catch (_) { return { ...DEFAULT_PREFS }; }
    },
    save(prefs) {
      try { global.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* opcional */ }
    }
  };

  class GameController {
    /**
     * @param {GameModel} model
     * @param {GameView} view
     * @param {{aiDelay?:number, random?:Function, persist?:boolean}} options
     */
    constructor(model, view, options = {}) {
      this.model = model;
      this.view = view;
      this.aiDelay = options.aiDelay ?? 450;
      this.random = options.random || Math.random;
      this.persist = options.persist !== false;
      this.prefs = this.persist ? storage.load() : { ...DEFAULT_PREFS };
      this.aiTimer = null;
      this.lastError = null; // mensagem de jogada inválida atual

      this._initSetup();
      this._bindEvents();
      this.model.subscribe((type, state, payload) => this._onModelChange(type, state, payload));
      this.view.setSoundState(this.prefs.sound);
      this.view.showScreen('setup');
    }

    /* ======================= Configuração ======================= */

    _initSetup() {
      const v = this.view;
      v.renderStyleOptions(this.prefs.style);
      v.renderDifficultyOptions(global.DIFFICULTIES, this.prefs.difficulty);
      v.setSetupValues({ mode: this.prefs.mode, humanMark: this.prefs.humanMark });
      this._onSetupChange(v.getSetupValues());
    }

    _onSetupChange(values) {
      this.view.setCpuOptionsEnabled(values.mode === 'cpu');
      this.view.setSetupSummary('Resumo: ' + this._describeConfig(values));
    }

    _describeConfig(c) {
      const style = global.STYLES[c.style] ? global.STYLES[c.style].label : c.style;
      if (c.mode !== 'cpu') return `${style} · 2 jogadores`;
      const level = global.DIFFICULTIES[c.difficulty].label;
      return `${style} · Contra o computador (${level}) · Você joga com ${c.humanMark}`;
    }

    startGame(values) {
      this._cancelAi();
      this.prefs = { ...this.prefs, ...values };
      if (this.persist) storage.save(this.prefs);
      this.view.applyStyle(this.prefs.style);
      this.view.setConfigChip(this._describeConfig(this.prefs));
      this.view.showScreen('game');
      this.model.newRound();
      this.view.focusBoard();
    }

    async openSettings() {
      const s = this.model.getState();
      if (s.moveCount > 0 && !s.isOver) {
        const ok = await this.view.confirm({
          title: 'Sair da partida atual?',
          message: 'A partida em andamento será descartada. O placar da sessão será mantido.',
          confirmLabel: 'Ir para configurações',
          cancelLabel: 'Continuar jogando'
        });
        if (!ok) return;
      }
      this._cancelAi();
      this.view.setSetupValues(this.prefs);
      this._onSetupChange(this.view.getSetupValues());
      this.view.showScreen('setup');
      const checked = this.view.el.setupForm.querySelector('input[name="style"]:checked');
      if (checked) checked.focus();
    }

    /* ======================= Jogadores ======================= */

    get vsCpu() { return this.prefs.mode === 'cpu'; }
    get aiMark() { return this.prefs.humanMark === 'X' ? 'O' : 'X'; }

    names() {
      if (!this.vsCpu) return { X: 'Jogador X', O: 'Jogador O' };
      return this.prefs.humanMark === 'X' ? { X: 'Você', O: 'Computador' } : { X: 'Computador', O: 'Você' };
    }

    isAiTurn(state = this.model.getState()) {
      return this.vsCpu && !state.isOver && state.currentPlayer === this.aiMark;
    }

    /* ======================= Ações do usuário ======================= */

    handleCellActivate(index) {
      const state = this.model.getState();
      if (this.isAiTurn(state)) {
        this.lastError = { tone: 'busy', text: 'Aguarde: o computador está escolhendo a jogada.' };
        this._render();
        return;
      }
      this.model.play(index); // o Model valida RN02/RN04 e notifica
    }

    newRound() {
      this._cancelAi();
      this.model.newRound(); // RF06 / RN06
      this.view.focusBoard();
    }

    undo() {
      const s = this.model.getState();
      if (!this._canUndo(s)) return;
      if (this.aiTimer) {           // computador ainda "pensando": desfaz só a jogada humana
        this._cancelAi();
        this.model.undo(1);
      } else if (this.vsCpu) {
        // Volta até ser a vez do humano novamente
        const steps = s.moveCount >= 2 ? 2 : 1;
        this.model.undo(steps);
      } else {
        this.model.undo(1);
      }
    }

    async resetScore() {
      const ok = await this.view.confirm({       // RF08 / RN07
        title: 'Zerar o placar?',
        message: 'Todas as vitórias e empates desta sessão voltarão a 0 e a rodada será reiniciada. Esta ação não pode ser desfeita.',
        confirmLabel: 'Sim, zerar placar',
        cancelLabel: 'Cancelar'
      });
      if (!ok) return false;
      this._cancelAi();
      this.model.resetScore();
      this.view.focusBoard();
      return true;
    }

    toggleSound() {
      this.prefs.sound = !this.prefs.sound;
      if (this.persist) storage.save(this.prefs);
      this.view.setSoundState(this.prefs.sound);
    }

    _sound(type) { if (this.prefs.sound) this.view.playSound(type); }

    /* ======================= Reação ao Model ======================= */

    _onModelChange(type, state, payload) {
      if (type === 'rejected') {
        const { index, reason, occupant } = payload;
        const turnName = this._turnLabel(state.currentPlayer);
        if (reason === 'occupied') {
          this.lastError = {
            tone: 'error',
            text: `Jogada inválida: a casa ${index + 1} já tem ${occupant}. Escolha uma casa vazia — continua ${turnName}.`
          };
        } else {
          this.lastError = { tone: 'error', text: 'A partida terminou. Clique em “Nova partida” para jogar de novo.' };
        }
        this._sound('invalid');
        this._render();
        this.view.flashInvalid(index);
        return;
      }

      this.lastError = null;
      this._render();

      if (type === 'move') {
        if (state.winner) {
          this.view.bumpScore(state.winner);
          this._sound(this.vsCpu && state.winner === this.aiMark ? 'lose' : 'win');
        } else if (state.isDraw) {
          this.view.bumpScore('draws');
          this._sound('draw');
        } else {
          this._sound(payload.player);
        }
      }

      this._maybeScheduleAi(state);
    }

    _maybeScheduleAi(state) {
      if (!this.isAiTurn(state) || this.aiTimer || this.view.el.gameScreen.hidden) return;
      const run = () => {
        this.aiTimer = null;
        const s = this.model.getState();
        if (!this.isAiTurn(s)) return;
        const move = global.AIPlayer.chooseMove(s.board, this.aiMark, this.prefs.difficulty, this.random);
        this.model.play(move);
      };
      this.aiTimer = setTimeout(run, this.aiDelay);
      this._render(); // mostra "pensando…"
    }

    _cancelAi() {
      if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    }

    _turnLabel(player) {
      if (!this.vsCpu) return `a vez do Jogador ${player}`;
      return player === this.prefs.humanMark ? `a sua vez (${player})` : `a vez do computador (${player})`;
    }

    _statusFor(state) {
      const names = this.names();
      if (state.winner) {
        const where = LINE_NAMES[state.winningLine.join(',')] || '';
        let text;
        if (!this.vsCpu) text = `Jogador ${state.winner} venceu! Trinca ${where}.`;
        else if (state.winner === this.prefs.humanMark) text = `Você venceu! Trinca ${where}.`;
        else text = `O computador venceu com trinca ${where}. Tente de novo!`;
        return { tone: 'win', badge: state.winner, text: `${text} Clique em “Nova partida” para continuar.` };
      }
      if (state.isDraw) {
        return { tone: 'draw', badge: '', text: 'Partida empatada! Deu velha. Clique em “Nova partida” para continuar.' };
      }
      if (this.lastError) return { ...this.lastError, badge: state.currentPlayer };
      if (this.isAiTurn(state)) {
        return { tone: 'busy', badge: state.currentPlayer, text: `Computador (${state.currentPlayer}) está pensando…` };
      }
      if (this.vsCpu) return { tone: 'turn', badge: state.currentPlayer, text: `Sua vez — você joga com ${state.currentPlayer}` };
      return { tone: 'turn', badge: state.currentPlayer, text: `Vez do ${names[state.currentPlayer]}` };
    }

    _render() {
      const state = this.model.getState();
      const aiTurn = this.isAiTurn(state);
      const names = this.names();
      this.view.renderBoard(state, { locked: aiTurn, ghost: aiTurn ? null : state.currentPlayer, names });
      this.view.renderScore(state.score, names);
      this.view.setStatus(this._statusFor(state));
      this.view.setActionsState({ canUndo: this._canUndo(state) });
    }

    _canUndo(state) {
      if (state.isOver || state.moveCount === 0) return false;
      if (!this.vsCpu) return true;
      return state.board.some(v => v === this.prefs.humanMark); // só há o que desfazer se o humano já jogou
    }

    /* ======================= Eventos ======================= */

    _bindEvents() {
      const v = this.view;
      v.bindSetupChange(values => this._onSetupChange(values));
      v.bindStart(values => this.startGame(values));
      v.bindCellActivate(i => this.handleCellActivate(i));
      v.bindNewRound(() => this.newRound());
      v.bindUndo(() => this.undo());
      v.bindResetScore(() => this.resetScore());
      v.bindOpenSettings(() => this.openSettings());
      v.bindToggleSound(() => this.toggleSound());
      v.bindHelp(() => v.openHelp());
      v.bindShortcuts(action => {
        switch (action.type) {
          case 'play': this.handleCellActivate(action.index); v.focusCell(action.index); break;
          case 'new': this.newRound(); break;
          case 'undo': this.undo(); break;
          case 'settings': this.openSettings(); break;
          case 'sound': this.toggleSound(); break;
          case 'help': v.openHelp(); break;
        }
      });
    }
  }

  const api = { GameController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(global, api);

  // Inicialização automática no navegador
  if (typeof document !== 'undefined' && !global.__JOGO_DA_VELHA_NO_AUTOSTART__) {
    const boot = () => {
      global.app = new GameController(new global.GameModel(), new global.GameView(document));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
