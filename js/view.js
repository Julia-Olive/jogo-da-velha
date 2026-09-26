/**
 * VIEW — Renderização e captura de entradas do DOM.
 *
 * Não contém regras de jogo: apenas desenha o estado recebido do
 * Controller e traduz cliques/teclas em chamadas de callbacks.
 */
(function (global) {
  'use strict';

  /** Catálogo visual — baseado na imagem de referência "Tictactoe_style". */
  const STYLES = Object.freeze({
    croche:   { label: 'Crochê',                  desc: 'Fios macios em tons pastel.' },
    lousa:    { label: 'Lousa de professor',      desc: 'Giz branco e amarelo no quadro.' },
    terminal: { label: 'Terminal de computador',  desc: 'Monitor antigo, fósforo verde.' },
    papel:    { label: 'Papel e caneta',          desc: 'Caderno pautado e tinta azul.' },
    marmore:  { label: 'Mármore e pedra',         desc: 'Peças pesadas sobre mármore.' },
    aquarela: { label: 'Artesanato em aquarela',  desc: 'Pinceladas suaves em papel.' }
  });

  const PREVIEW_BOARD = ['X', 'O', 'X', 'O', 'X', 'O', null, 'O', 'X'];

  /* Traçados SVG (viewBox 0 0 100 100). Pequenas irregularidades dão o ar "feito à mão". */
  const PATHS = {
    X:        'M24 24 L76 76 M76 24 L24 76',
    O:        'M50 20 a30 30 0 1 1 -0.1 0',
    XHand:    'M23 21 C40 38 58 58 78 79 M77 22 C60 40 42 58 22 78',
    OHand:    'M52 19 C72 19 82 34 80 52 C78 70 62 82 46 80 C28 78 18 62 21 45 C24 30 36 22 55 22'
  };

  const FILTER_BY_STYLE = { lousa: 'url(#f-chalk)', papel: 'url(#f-ink)', aquarela: 'url(#f-watercolor)' };

  function markMarkup(player, style) {
    if (!player) return '';
    if (style === 'terminal') {
      return `<span class="mark mark--${player} mark--text" aria-hidden="true">${player}</span>`;
    }
    const hand = style === 'lousa' || style === 'papel' || style === 'aquarela';
    const d = PATHS[(player) + (hand ? 'Hand' : '')];
    const filter = FILTER_BY_STYLE[style] ? ` filter="${FILTER_BY_STYLE[style]}"` : '';
    // Camada de textura/brilho específica de cada material
    const tex = (style === 'croche' || style === 'marmore' || style === 'aquarela')
      ? `<path class="mark__tex" d="${d}"/>` : '';
    const bleed = style === 'aquarela' ? `<path class="mark__bleed" d="${d}"/>` : '';
    return `<svg class="mark mark--${player}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
           `<g${filter}>${bleed}<path class="mark__main" d="${d}"/>${tex}</g></svg>`;
  }

  function cellPosition(i) {
    return { row: Math.floor(i / 3) + 1, col: (i % 3) + 1 };
  }

  class GameView {
    constructor(doc = document) {
      this.doc = doc;
      const $ = id => doc.getElementById(id);
      this.el = {
        setupScreen: $('screen-setup'),
        gameScreen: $('screen-game'),
        setupForm: $('setup-form'),
        styleOptions: $('style-options'),
        difficultyOptions: $('difficulty-options'),
        cpuOptions: $('cpu-options'),
        cpuHint: $('cpu-options-hint'),
        setupSummary: $('setup-summary'),
        configChip: $('config-chip'),
        stage: $('stage'),
        board: $('board'),
        status: $('status'),
        statusBadge: $('status-badge'),
        statusText: $('status-text'),
        scoreX: $('score-x'),
        scoreO: $('score-o'),
        scoreDraw: $('score-draw'),
        scoreXWho: $('score-x-who'),
        scoreOWho: $('score-o-who'),
        btnNew: $('btn-new'),
        btnUndo: $('btn-undo'),
        btnReset: $('btn-reset'),
        btnSettings: $('btn-settings'),
        btnSound: $('btn-sound'),
        btnHelp: $('btn-help'),
        confirmDialog: $('confirm-dialog'),
        confirmTitle: $('confirm-title'),
        confirmMessage: $('confirm-message'),
        confirmOk: $('confirm-ok'),
        confirmCancel: $('confirm-cancel'),
        helpDialog: $('help-dialog'),
        helpLevels: $('help-levels')
      };
      this.style = 'papel';
      this.cells = [];
      this._rendered = Array(9).fill(undefined); // cache para evitar redesenhos desnecessários
      this._audio = null;
      this._createBoard();
      this._bindBoardNavigation();
    }

    /* ======================= Construção ======================= */

    /** RF01 — exatamente 9 <button>, em 3 linhas × 3 colunas. */
    _createBoard() {
      const frag = this.doc.createDocumentFragment();
      for (let i = 0; i < 9; i++) {
        const btn = this.doc.createElement('button');
        btn.type = 'button';
        btn.className = 'cell';
        btn.dataset.index = String(i);
        frag.appendChild(btn);
        this.cells.push(btn);
      }
      this.el.board.replaceChildren(frag);
    }

    renderStyleOptions(selected) {
      const html = Object.entries(STYLES).map(([key, s]) => {
        const mini = PREVIEW_BOARD.map(p =>
          `<span class="cell cell--mini">${markMarkup(p, key)}</span>`).join('');
        return `
          <label class="style-card">
            <input type="radio" name="style" value="${key}" ${key === selected ? 'checked' : ''}>
            <span class="style-card__body">
              <span class="stage stage--mini" data-style="${key}" aria-hidden="true">
                <span class="board board--mini">${mini}</span>
              </span>
              <span class="style-card__title">${s.label}</span>
              <span class="style-card__desc">${s.desc}</span>
              <span class="style-card__check" aria-hidden="true">✓ Selecionado</span>
            </span>
          </label>`;
      }).join('');
      this.el.styleOptions.innerHTML = html;
    }

    renderDifficultyOptions(difficulties, selected) {
      this.el.difficultyOptions.innerHTML = Object.entries(difficulties).map(([key, d], i) => `
        <label class="choice choice--level">
          <input type="radio" name="difficulty" value="${key}" ${key === selected ? 'checked' : ''}>
          <span class="choice__body">
            <span class="level-meter" aria-hidden="true">${'●'.repeat(i + 1)}${'○'.repeat(3 - i)}</span>
            <span class="choice__title">${d.label}</span>
            <span class="choice__desc">${d.description}</span>
          </span>
        </label>`).join('');
      this.el.helpLevels.innerHTML = Object.values(difficulties)
        .map(d => `<dt>${d.label}</dt><dd>${d.description}</dd>`).join('');
    }

    /* ======================= Tela de configuração ======================= */

    getSetupValues() {
      const f = this.el.setupForm;
      const val = name => (f.querySelector(`input[name="${name}"]:checked`) || {}).value;
      return { style: val('style'), mode: val('mode'), difficulty: val('difficulty'), humanMark: val('humanMark') };
    }

    setSetupValues(v) {
      const f = this.el.setupForm;
      Object.entries(v).forEach(([name, value]) => {
        const input = f.querySelector(`input[name="${name}"][value="${value}"]`);
        if (input) input.checked = true;
      });
    }

    setCpuOptionsEnabled(enabled) {
      this.el.cpuOptions.disabled = !enabled;
      this.el.cpuHint.hidden = enabled;
    }

    setSetupSummary(text) { this.el.setupSummary.textContent = text; }

    showScreen(name) {
      const isGame = name === 'game';
      this.el.setupScreen.hidden = isGame;
      this.el.gameScreen.hidden = !isGame;
      this.doc.defaultView && this.doc.defaultView.scrollTo && this.doc.defaultView.scrollTo(0, 0);
    }

    applyStyle(style) {
      this.style = STYLES[style] ? style : 'papel';
      this.el.gameScreen.dataset.style = this.style;
      this.el.stage.dataset.style = this.style;
      this._rendered = Array(9).fill(undefined); // força redesenho das marcas no novo estilo
    }

    setConfigChip(text) { this.el.configChip.textContent = text; }

    /* ======================= Tabuleiro ======================= */

    /**
     * @param {object} state  snapshot do Model
     * @param {object} opts   { locked:boolean, ghost:'X'|'O'|null, names:{X,O} }
     */
    renderBoard(state, opts = {}) {
      const { board, winningLine, isOver, isDraw, lastMove } = state;
      const locked = Boolean(opts.locked);
      const ghost = !locked && !isOver ? opts.ghost : null;
      const winSet = new Set(winningLine || []);

      this.el.board.dataset.locked = String(locked || isOver);
      this.el.board.dataset.over = isOver ? (isDraw ? 'draw' : 'win') : 'no';
      this.el.board.setAttribute('aria-busy', String(locked && !isOver));

      this.cells.forEach((cell, i) => {
        const mark = board[i];
        const key = `${mark || ''}|${mark ? '' : ghost || ''}|${this.style}`;
        if (this._rendered[i] !== key) {
          cell.innerHTML = mark
            ? markMarkup(mark, this.style)
            : (ghost ? `<span class="ghost">${markMarkup(ghost, this.style)}</span>` : '');
          cell.classList.toggle('is-new', Boolean(mark) && i === lastMove);
          this._rendered[i] = key;
        }
        if (mark) cell.dataset.mark = mark; else delete cell.dataset.mark;
        cell.classList.toggle('is-win', winSet.has(i));
        cell.classList.toggle('is-dim', isOver && !winSet.has(i) && !isDraw);

        const { row, col } = cellPosition(i);
        let label = `Casa ${i + 1}, linha ${row}, coluna ${col}: `;
        if (mark) {
          label += opts.names && opts.names[mark] ? `${mark} (${opts.names[mark]})` : mark;
          if (winSet.has(i)) label += ', parte da trinca vencedora';
        } else {
          label += 'vazia';
        }
        cell.setAttribute('aria-label', label);
        // Casas ocupadas ou tabuleiro bloqueado: continuam focáveis, mas anunciadas como indisponíveis
        cell.setAttribute('aria-disabled', String(Boolean(mark) || locked || isOver));
      });
    }

    /** CT05 — alerta visual (tremor) e sonoro na casa inválida. */
    flashInvalid(index) {
      const targets = [this.cells[index], this.el.status].filter(Boolean);
      targets.forEach(t => {
        t.classList.remove('is-invalid');
        void t.offsetWidth; // reinicia a animação
        t.classList.add('is-invalid');
      });
      clearTimeout(this._invalidTimer);
      this._invalidTimer = setTimeout(() => targets.forEach(t => t.classList.remove('is-invalid')), 700);
    }

    focusCell(i) { if (this.cells[i]) this.cells[i].focus(); }
    focusBoard() {
      const firstEmpty = this.cells.find(c => !c.dataset.mark) || this.cells[0];
      firstEmpty.focus();
    }

    /* ======================= Placar e status ======================= */

    renderScore(score, names) {
      this.el.scoreX.textContent = score.X;
      this.el.scoreO.textContent = score.O;
      this.el.scoreDraw.textContent = score.draws;
      this.el.scoreXWho.textContent = names.X;
      this.el.scoreOWho.textContent = names.O;
      this.el.scoreX.setAttribute('aria-label', `Vitórias de X (${names.X}): ${score.X}`);
      this.el.scoreO.setAttribute('aria-label', `Vitórias de O (${names.O}): ${score.O}`);
      this.el.scoreDraw.setAttribute('aria-label', `Empates: ${score.draws}`);
    }

    bumpScore(key) {
      const el = { X: this.el.scoreX, O: this.el.scoreO, draws: this.el.scoreDraw }[key];
      if (!el) return;
      const card = el.closest('.score');
      card.classList.remove('is-bump'); void card.offsetWidth; card.classList.add('is-bump');
    }

    /** @param {{tone:'turn'|'win'|'draw'|'error'|'busy', badge:string, text:string}} s */
    setStatus(s) {
      this.el.status.dataset.tone = s.tone;
      this.el.status.dataset.player = s.badge || '';
      this.el.statusBadge.textContent = s.badge || '';
      this.el.statusBadge.hidden = !s.badge;
      this.el.statusText.textContent = s.text;
    }

    setActionsState({ canUndo }) {
      this.el.btnUndo.disabled = !canUndo;
    }

    setSoundState(on) {
      this.el.btnSound.setAttribute('aria-pressed', String(on));
      this.el.btnSound.querySelector('.btn__icon').textContent = on ? '🔊' : '🔇';
      this.el.btnSound.querySelector('.btn__label').textContent = on ? 'Som ligado' : 'Som desligado';
    }

    /* ======================= Diálogos (nativos) ======================= */

    /** RF08 / RN07 — confirmação explícita usando <dialog>. Resolve true/false. */
    confirm({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }) {
      const d = this.el.confirmDialog;
      this.el.confirmTitle.textContent = title;
      this.el.confirmMessage.textContent = message;
      this.el.confirmOk.textContent = confirmLabel;
      this.el.confirmCancel.textContent = cancelLabel;
      const opener = this.doc.activeElement;
      return new Promise(resolve => {
        const onClose = () => {
          d.removeEventListener('close', onClose);
          if (opener && opener.focus) opener.focus();
          resolve(d.returnValue === 'confirm');
        };
        d.returnValue = 'cancel';
        d.addEventListener('close', onClose);
        if (typeof d.showModal === 'function') {
          d.showModal();
          this.el.confirmCancel.focus(); // opção segura em foco (prevenção de erros)
        } else {
          // Fallback para navegadores sem <dialog>
          d.returnValue = global.confirm(`${title}\n\n${message}`) ? 'confirm' : 'cancel';
          onClose();
        }
      });
    }

    openHelp() {
      const d = this.el.helpDialog;
      if (d.open) return;
      if (typeof d.showModal === 'function') d.showModal();
    }

    isDialogOpen() { return this.el.confirmDialog.open || this.el.helpDialog.open; }

    /* ======================= Som (feedback auditivo) ======================= */

    playSound(type) {
      try {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) return;
        this._audio = this._audio || new Ctx();
        const ctx = this._audio;
        const tones = {
          X:       [[520, 0.06]],
          O:       [[400, 0.06]],
          invalid: [[180, 0.09], [140, 0.12]],
          win:     [[523, 0.1], [659, 0.1], [784, 0.18]],
          lose:    [[392, 0.12], [330, 0.12], [262, 0.2]],
          draw:    [[440, 0.12], [440, 0.12]]
        }[type];
        if (!tones) return;
        let t = ctx.currentTime;
        tones.forEach(([freq, dur]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type === 'invalid' ? 'square' : 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t); osc.stop(t + dur + 0.02);
          t += dur;
        });
      } catch (_) { /* áudio é opcional */ }
    }

    /* ======================= Ligações de eventos ======================= */

    bindCellActivate(handler) {
      this.el.board.addEventListener('click', e => {
        const cell = e.target.closest('.cell');
        if (cell && this.el.board.contains(cell)) handler(Number(cell.dataset.index));
      });
    }

    /** Setas movem o foco entre as casas (comportamento puramente de interface). */
    _bindBoardNavigation() {
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
      this.el.board.addEventListener('keydown', e => {
        if (!(e.key in delta)) return;
        const cell = e.target.closest('.cell');
        if (!cell) return;
        e.preventDefault();
        const i = Number(cell.dataset.index);
        let next = i + delta[e.key];
        if (e.key === 'ArrowLeft' && i % 3 === 0) next = i + 2;
        if (e.key === 'ArrowRight' && i % 3 === 2) next = i - 2;
        if (next < 0) next += 9;
        if (next > 8) next -= 9;
        this.focusCell(next);
      });
    }

    bindNewRound(h) { this.el.btnNew.addEventListener('click', h); }
    bindUndo(h) { this.el.btnUndo.addEventListener('click', h); }
    bindResetScore(h) { this.el.btnReset.addEventListener('click', h); }
    bindOpenSettings(h) { this.el.btnSettings.addEventListener('click', h); }
    bindToggleSound(h) { this.el.btnSound.addEventListener('click', h); }
    bindHelp(h) { this.el.btnHelp.addEventListener('click', h); }

    bindSetupChange(h) {
      this.el.setupForm.addEventListener('change', () => h(this.getSetupValues()));
    }

    bindStart(h) {
      this.el.setupForm.addEventListener('submit', e => { e.preventDefault(); h(this.getSetupValues()); });
    }

    /** Converte teclas de atalho em ações semânticas para o Controller. */
    bindShortcuts(h) {
      this.doc.addEventListener('keydown', e => {
        if (e.defaultPrevented || e.altKey || e.metaKey) return;
        if (this.isDialogOpen()) return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        const inGame = !this.el.gameScreen.hidden;
        const k = e.key;
        let action = null;
        if (e.ctrlKey) {
          if (k.toLowerCase() === 'z' && inGame) action = { type: 'undo' };
        } else if (inGame && /^[1-9]$/.test(k)) action = { type: 'play', index: Number(k) - 1 };
        else if (inGame && (k === 'n' || k === 'N')) action = { type: 'new' };
        else if (inGame && (k === 'u' || k === 'U')) action = { type: 'undo' };
        else if (inGame && (k === 'm' || k === 'M')) action = { type: 'settings' };
        else if (k === 's' || k === 'S') action = { type: 'sound' };
        else if (k === '?') action = { type: 'help' };
        if (action) { e.preventDefault(); h(action); }
      });
    }
  }

  const api = { GameView, STYLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(global, api);
})(typeof window !== 'undefined' ? window : globalThis);
