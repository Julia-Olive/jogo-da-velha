/**
 * @file Camada VIEW do Jogo da Velha.
 *
 * Desenha na página o estado recebido do Controller e transforma cliques
 * e teclas em chamadas de funções (callbacks). Não contém regras de jogo.
 */
(function (global) {
  'use strict';

  /* ======================================================================
     Catálogo visual
     ====================================================================== */

  /** Estilos de tabuleiro disponíveis, inspirados na imagem de referência "Tictactoe_style". */
  const STYLES = Object.freeze({
    croche:   { label: 'Crochê',                 desc: 'Fios macios em tons pastel.' },
    lousa:    { label: 'Lousa de professor',     desc: 'Giz branco e amarelo no quadro.' },
    terminal: { label: 'Terminal de computador', desc: 'Monitor antigo, fósforo verde.' },
    papel:    { label: 'Papel e caneta',         desc: 'Caderno pautado e tinta azul.' },
    marmore:  { label: 'Mármore e pedra',        desc: 'Peças pesadas sobre mármore.' },
    aquarela: { label: 'Artesanato em aquarela', desc: 'Pinceladas suaves em papel.' }
  });

  const DEFAULT_STYLE = 'papel';

  /** Partida de exemplo exibida nas miniaturas da tela de configuração. */
  const PREVIEW_BOARD = ['X', 'O', 'X', 'O', 'X', 'O', null, 'O', 'X'];

  /** Número de casas por linha do tabuleiro. */
  const BOARD_COLUMNS = 3;

  /** Número de níveis do medidor de dificuldade (●○○○). */
  const DIFFICULTY_METER_SIZE = 4;

  /** Duração do alerta visual de jogada inválida, em milissegundos. */
  const INVALID_FLASH_MS = 700;

  /**
   * Traçados SVG das marcas (viewBox 0 0 100 100).
   * As versões "à mão" têm pequenas irregularidades para os estilos artesanais.
   */
  const MARK_PATHS = Object.freeze({
    X: 'M24 24 L76 76 M76 24 L24 76',
    O: 'M50 20 a30 30 0 1 1 -0.1 0',
    XHandDrawn: 'M23 21 C40 38 58 58 78 79 M77 22 C60 40 42 58 22 78',
    OHandDrawn: 'M52 19 C72 19 82 34 80 52 C78 70 62 82 46 80 C28 78 18 62 21 45 C24 30 36 22 55 22'
  });

  /** Estilos que usam traço feito à mão. */
  const HAND_DRAWN_STYLES = new Set(['lousa', 'papel', 'aquarela']);

  /** Estilos com camada extra de textura (fio de lã, brilho da pedra, pigmento). */
  const TEXTURED_STYLES = new Set(['croche', 'marmore', 'aquarela']);

  /** Filtro SVG (definido no index.html) aplicado a cada estilo. */
  const STYLE_FILTERS = Object.freeze({
    lousa: 'url(#f-chalk)',
    papel: 'url(#f-ink)',
    aquarela: 'url(#f-watercolor)'
  });

  /**
   * Notas de cada efeito sonoro: pares [frequência em Hz, duração em segundos].
   * O som é gerado pelo próprio navegador (Web Audio), sem arquivos externos.
   */
  const SOUND_NOTES = Object.freeze({
    X:       [[520, 0.06]],
    O:       [[400, 0.06]],
    invalid: [[180, 0.09], [140, 0.12]],
    win:     [[523, 0.1], [659, 0.1], [784, 0.18]],
    lose:    [[392, 0.12], [330, 0.12], [262, 0.2]],
    draw:    [[440, 0.12], [440, 0.12]]
  });
  const SOUND_VOLUME = 0.12;
  const SOUND_SILENCE = 0.0001;

  /** Deslocamento de foco para cada seta do teclado dentro do tabuleiro. */
  const ARROW_OFFSETS = Object.freeze({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 });

  /** Atalhos de teclado (tecla em minúscula → ação). */
  const GAME_SHORTCUTS = Object.freeze({ n: 'new', u: 'undo', m: 'settings' });
  const GLOBAL_SHORTCUTS = Object.freeze({ s: 'sound', '?': 'help' });

  /* ======================================================================
     Funções auxiliares de marcação
     ====================================================================== */

  /**
   * Gera o HTML de uma marca (X ou O) no estilo escolhido.
   * @param {'X'|'O'|null} player
   * @param {string} style
   * @returns {string}
   */
  function markMarkup(player, style) {
    if (!player) return '';
    if (style === 'terminal') {
      return `<span class="mark mark--${player} mark--text" aria-hidden="true">${player}</span>`;
    }

    const path = MARK_PATHS[HAND_DRAWN_STYLES.has(style) ? `${player}HandDrawn` : player];
    const filter = STYLE_FILTERS[style] ? ` filter="${STYLE_FILTERS[style]}"` : '';
    const bleedLayer = style === 'aquarela' ? `<path class="mark__bleed" d="${path}"/>` : '';
    const textureLayer = TEXTURED_STYLES.has(style) ? `<path class="mark__tex" d="${path}"/>` : '';

    return `<svg class="mark mark--${player}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
           `<g${filter}>${bleedLayer}<path class="mark__main" d="${path}"/>${textureLayer}</g></svg>`;
  }

  /**
   * Converte o índice da casa em linha e coluna, contando a partir de 1.
   * @param {number} index
   * @returns {{row: number, col: number}}
   */
  function cellPosition(index) {
    return { row: Math.floor(index / BOARD_COLUMNS) + 1, col: (index % BOARD_COLUMNS) + 1 };
  }

  /**
   * Monta o texto lido por leitores de tela para uma casa (RNF05).
   * @param {number} index
   * @param {'X'|'O'|null} mark
   * @param {boolean} isWinning
   * @param {{X: string, O: string}} [names]
   * @returns {string}
   */
  function describeCell(index, mark, isWinning, names) {
    const { row, col } = cellPosition(index);
    const prefix = `Casa ${index + 1}, linha ${row}, coluna ${col}: `;
    if (!mark) return `${prefix}vazia`;
    const owner = names && names[mark] ? `${mark} (${names[mark]})` : mark;
    return prefix + owner + (isWinning ? ', parte da trinca vencedora' : '');
  }

  /**
   * Calcula a casa de destino ao navegar com as setas, dando a volta nas bordas.
   * @param {number} index
   * @param {string} key
   * @returns {number}
   */
  function neighborCell(index, key) {
    const column = index % BOARD_COLUMNS;
    const size = BOARD_COLUMNS * BOARD_COLUMNS;
    if (key === 'ArrowLeft' && column === 0) return index + BOARD_COLUMNS - 1;
    if (key === 'ArrowRight' && column === BOARD_COLUMNS - 1) return index - BOARD_COLUMNS + 1;
    return (index + ARROW_OFFSETS[key] + size) % size;
  }

  /**
   * Reinicia uma animação CSS removendo e reaplicando a classe.
   * @param {HTMLElement} element
   * @param {string} className
   */
  function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth; // força o navegador a recalcular o layout
    element.classList.add(className);
  }

  /* ======================================================================
     GameView
     ====================================================================== */

  /** Interface do jogo: telas, tabuleiro, placar, status, diálogos e som. */
  class GameView {
    /** @param {Document} [doc=document] */
    constructor(doc = document) {
      this.doc = doc;
      this.el = this.findElements();
      this.style = DEFAULT_STYLE;
      /** @type {HTMLButtonElement[]} */
      this.cells = [];
      /** Última versão desenhada de cada casa, para evitar redesenhos (RNF03). */
      this.renderedCells = Array(BOARD_COLUMNS * BOARD_COLUMNS).fill(undefined);
      this.audioContext = null;
      this.invalidTimer = null;

      this.createBoard();
      this.bindBoardNavigation();
    }

    /** @returns {Object<string, HTMLElement>} Elementos da página usados pela View. */
    findElements() {
      const byId = id => this.doc.getElementById(id);
      return {
        setupScreen: byId('screen-setup'),
        gameScreen: byId('screen-game'),
        setupForm: byId('setup-form'),
        styleOptions: byId('style-options'),
        difficultyOptions: byId('difficulty-options'),
        cpuOptions: byId('cpu-options'),
        cpuHint: byId('cpu-options-hint'),
        setupSummary: byId('setup-summary'),
        configChip: byId('config-chip'),
        stage: byId('stage'),
        board: byId('board'),
        status: byId('status'),
        statusBadge: byId('status-badge'),
        statusText: byId('status-text'),
        scoreX: byId('score-x'),
        scoreO: byId('score-o'),
        scoreDraw: byId('score-draw'),
        scoreXWho: byId('score-x-who'),
        scoreOWho: byId('score-o-who'),
        btnNew: byId('btn-new'),
        btnUndo: byId('btn-undo'),
        btnReset: byId('btn-reset'),
        btnSettings: byId('btn-settings'),
        btnSound: byId('btn-sound'),
        btnHelp: byId('btn-help'),
        confirmDialog: byId('confirm-dialog'),
        confirmTitle: byId('confirm-title'),
        confirmMessage: byId('confirm-message'),
        confirmOk: byId('confirm-ok'),
        confirmCancel: byId('confirm-cancel'),
        helpDialog: byId('help-dialog'),
        helpLevels: byId('help-levels')
      };
    }

    /* ---------------------------- Construção ---------------------------- */

    /** Cria exatamente 9 botões em grade 3x3 (RF01, RNF05). */
    createBoard() {
      const fragment = this.doc.createDocumentFragment();
      for (let index = 0; index < BOARD_COLUMNS * BOARD_COLUMNS; index++) {
        const cell = this.doc.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.index = String(index);
        fragment.appendChild(cell);
        this.cells.push(cell);
      }
      this.el.board.replaceChildren(fragment);
    }

    /**
     * Desenha os cartões de escolha de estilo, cada um com uma miniatura do tabuleiro.
     * @param {string} selectedStyle
     */
    renderStyleOptions(selectedStyle) {
      this.el.styleOptions.innerHTML = Object.entries(STYLES)
        .map(([key, style]) => this.styleCardMarkup(key, style, key === selectedStyle))
        .join('');
    }

    /**
     * @param {string} key
     * @param {{label: string, desc: string}} style
     * @param {boolean} isSelected
     * @returns {string}
     */
    styleCardMarkup(key, style, isSelected) {
      const miniCells = PREVIEW_BOARD
        .map(player => `<span class="cell cell--mini">${markMarkup(player, key)}</span>`)
        .join('');
      return `
        <label class="style-card">
          <input type="radio" name="style" value="${key}" ${isSelected ? 'checked' : ''}>
          <span class="style-card__body">
            <span class="stage stage--mini" data-style="${key}" aria-hidden="true">
              <span class="board board--mini">${miniCells}</span>
            </span>
            <span class="style-card__title">${style.label}</span>
            <span class="style-card__desc">${style.desc}</span>
            <span class="style-card__check" aria-hidden="true">✓ Selecionado</span>
          </span>
        </label>`;
    }

    /**
     * Desenha as opções de dificuldade e a lista de níveis da ajuda.
     * @param {Object<string, {label: string, description: string}>} difficulties
     * @param {string} selectedLevel
     */
    renderDifficultyOptions(difficulties, selectedLevel) {
      this.el.difficultyOptions.innerHTML = Object.entries(difficulties)
        .map(([key, level], position) => this.difficultyOptionMarkup(key, level, position, key === selectedLevel))
        .join('');
      this.el.helpLevels.innerHTML = Object.values(difficulties)
        .map(level => `<dt>${level.label}</dt><dd>${level.description}</dd>`)
        .join('');
    }

    /**
     * @param {string} key
     * @param {{label: string, description: string}} level
     * @param {number} position Ordem do nível (0 = mais fácil).
     * @param {boolean} isSelected
     * @returns {string}
     */
    difficultyOptionMarkup(key, level, position, isSelected) {
      const filled = position + 1;
      const meter = '●'.repeat(filled) + '○'.repeat(DIFFICULTY_METER_SIZE - filled);
      return `
        <label class="choice choice--level">
          <input type="radio" name="difficulty" value="${key}" ${isSelected ? 'checked' : ''}>
          <span class="choice__body">
            <span class="level-meter" aria-hidden="true">${meter}</span>
            <span class="choice__title">${level.label}</span>
            <span class="choice__desc">${level.description}</span>
          </span>
        </label>`;
    }

    /* ------------------------ Tela de configuração ------------------------ */

    /** @returns {{style: string, mode: string, difficulty: string, humanMark: string}} */
    getSetupValues() {
      const checkedValue = name => {
        const input = this.el.setupForm.querySelector(`input[name="${name}"]:checked`);
        return input ? input.value : undefined;
      };
      return {
        style: checkedValue('style'),
        mode: checkedValue('mode'),
        difficulty: checkedValue('difficulty'),
        humanMark: checkedValue('humanMark')
      };
    }

    /** @param {Object<string, string>} values Marca as opções correspondentes no formulário. */
    setSetupValues(values) {
      Object.entries(values).forEach(([name, value]) => {
        const input = this.el.setupForm.querySelector(`input[name="${name}"][value="${value}"]`);
        if (input) input.checked = true;
      });
    }

    /** @param {boolean} enabled Ativa as opções que só valem contra o computador. */
    setCpuOptionsEnabled(enabled) {
      this.el.cpuOptions.disabled = !enabled;
      this.el.cpuHint.hidden = enabled;
    }

    /** @param {string} text */
    setSetupSummary(text) {
      this.el.setupSummary.textContent = text;
    }

    /** @param {'setup'|'game'} screen */
    showScreen(screen) {
      const isGame = screen === 'game';
      this.el.setupScreen.hidden = isGame;
      this.el.gameScreen.hidden = !isGame;
      const win = this.doc.defaultView;
      if (win && win.scrollTo) win.scrollTo(0, 0);
    }

    /** @param {string} style Aplica o estilo visual ao tabuleiro e ao placar. */
    applyStyle(style) {
      this.style = STYLES[style] ? style : DEFAULT_STYLE;
      this.el.gameScreen.dataset.style = this.style;
      this.el.stage.dataset.style = this.style;
      this.renderedCells.fill(undefined); // redesenha as marcas no novo estilo
    }

    /** @param {string} text */
    setConfigChip(text) {
      this.el.configChip.textContent = text;
    }

    /* ----------------------------- Tabuleiro ----------------------------- */

    /**
     * Desenha o tabuleiro inteiro.
     * @param {GameState} state
     * @param {{locked?: boolean, ghost?: 'X'|'O'|null, names?: {X: string, O: string}}} [options]
     *   locked: bloqueia jogadas (vez do computador);
     *   ghost: marca de prévia mostrada ao passar o mouse;
     *   names: nomes dos jogadores para os leitores de tela.
     */
    renderBoard(state, options = {}) {
      const locked = Boolean(options.locked);
      const ghost = !locked && !state.isOver ? options.ghost : null;
      const winningCells = new Set(state.winningLine || []);

      this.el.board.dataset.locked = String(locked || state.isOver);
      this.el.board.dataset.over = state.isOver ? (state.isDraw ? 'draw' : 'win') : 'no';
      this.el.board.setAttribute('aria-busy', String(locked && !state.isOver));

      this.cells.forEach((cell, index) => {
        const mark = state.board[index];
        const isWinning = winningCells.has(index);
        this.renderCellContent(cell, index, mark, ghost, state.lastMove);
        cell.classList.toggle('is-win', isWinning);
        cell.classList.toggle('is-dim', state.isOver && !state.isDraw && !isWinning);
        cell.setAttribute('aria-label', describeCell(index, mark, isWinning, options.names));
        // Casas indisponíveis continuam focáveis, mas são anunciadas como desativadas.
        cell.setAttribute('aria-disabled', String(Boolean(mark) || locked || state.isOver));
      });
    }

    /**
     * Atualiza o conteúdo de uma casa somente quando ele mudou.
     * @param {HTMLButtonElement} cell
     * @param {number} index
     * @param {'X'|'O'|null} mark
     * @param {'X'|'O'|null} ghost
     * @param {number|null} lastMove
     */
    renderCellContent(cell, index, mark, ghost, lastMove) {
      const version = `${mark || ''}|${mark ? '' : ghost || ''}|${this.style}`;
      if (this.renderedCells[index] === version) return;

      if (mark) {
        cell.innerHTML = markMarkup(mark, this.style);
        cell.dataset.mark = mark;
      } else {
        cell.innerHTML = ghost ? `<span class="ghost">${markMarkup(ghost, this.style)}</span>` : '';
        delete cell.dataset.mark;
      }
      cell.classList.toggle('is-new', Boolean(mark) && index === lastMove);
      this.renderedCells[index] = version;
    }

    /**
     * Alerta visual de jogada inválida: a casa e o status tremem (CT05).
     * @param {number} index
     */
    flashInvalid(index) {
      const targets = [this.cells[index], this.el.status].filter(Boolean);
      targets.forEach(target => restartAnimation(target, 'is-invalid'));
      clearTimeout(this.invalidTimer);
      this.invalidTimer = setTimeout(
        () => targets.forEach(target => target.classList.remove('is-invalid')),
        INVALID_FLASH_MS
      );
    }

    /** @param {number} index */
    focusCell(index) {
      if (this.cells[index]) this.cells[index].focus();
    }

    /** Coloca o foco na primeira casa vazia. */
    focusBoard() {
      const firstEmpty = this.cells.find(cell => !cell.dataset.mark) || this.cells[0];
      firstEmpty.focus();
    }

    /* --------------------------- Placar e status --------------------------- */

    /**
     * @param {Score} score
     * @param {{X: string, O: string}} names
     */
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

    /** @param {'X'|'O'|'draws'} key Anima o cartão do placar que mudou. */
    bumpScore(key) {
      const valueElement = { X: this.el.scoreX, O: this.el.scoreO, draws: this.el.scoreDraw }[key];
      if (valueElement) restartAnimation(valueElement.closest('.score'), 'is-bump');
    }

    /**
     * Atualiza a faixa de status, anunciada pelos leitores de tela (role="status").
     * @param {{tone: string, badge?: string, text: string}} status
     *   tone: 'turn' | 'win' | 'draw' | 'error' | 'busy'.
     */
    setStatus(status) {
      this.el.status.dataset.tone = status.tone;
      this.el.status.dataset.player = status.badge || '';
      this.el.statusBadge.textContent = status.badge || '';
      this.el.statusBadge.hidden = !status.badge;
      this.el.statusText.textContent = status.text;
    }

    /** @param {{canUndo: boolean}} actions */
    setActionsState(actions) {
      this.el.btnUndo.disabled = !actions.canUndo;
    }

    /** @param {boolean} isOn */
    setSoundState(isOn) {
      this.el.btnSound.setAttribute('aria-pressed', String(isOn));
      this.el.btnSound.querySelector('.btn__icon').textContent = isOn ? '🔊' : '🔇';
      this.el.btnSound.querySelector('.btn__label').textContent = isOn ? 'Som ligado' : 'Som desligado';
    }

    /* ------------------------------ Diálogos ------------------------------ */

    /**
     * Pede confirmação com o elemento nativo <dialog> (RF08, RN07).
     * O foco começa em "Cancelar", a opção segura.
     * @param {{title: string, message: string, confirmLabel?: string, cancelLabel?: string}} texts
     * @returns {Promise<boolean>} Verdadeiro se o usuário confirmou.
     */
    confirm({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }) {
      const dialog = this.el.confirmDialog;
      this.el.confirmTitle.textContent = title;
      this.el.confirmMessage.textContent = message;
      this.el.confirmOk.textContent = confirmLabel;
      this.el.confirmCancel.textContent = cancelLabel;
      const previousFocus = this.doc.activeElement;

      return new Promise(resolve => {
        const handleClose = () => {
          dialog.removeEventListener('close', handleClose);
          if (previousFocus && previousFocus.focus) previousFocus.focus();
          resolve(dialog.returnValue === 'confirm');
        };
        dialog.returnValue = 'cancel';
        dialog.addEventListener('close', handleClose);

        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
          this.el.confirmCancel.focus();
        } else {
          // Navegadores sem suporte a <dialog> usam a caixa de confirmação do sistema.
          dialog.returnValue = global.confirm(`${title}\n\n${message}`) ? 'confirm' : 'cancel';
          handleClose();
        }
      });
    }

    /** Abre a janela "Como jogar". */
    openHelp() {
      const dialog = this.el.helpDialog;
      if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    }

    /** @returns {boolean} */
    isDialogOpen() {
      return this.el.confirmDialog.open || this.el.helpDialog.open;
    }

    /* -------------------------------- Som -------------------------------- */

    /**
     * Toca um efeito sonoro depois que a tela é atualizada, para que a
     * preparação do áudio nunca atrase a resposta visual do clique (RNF03).
     * @param {keyof SOUND_NOTES} soundName
     */
    playSound(soundName) {
      setTimeout(() => this.playSoundNow(soundName), 0);
    }

    /**
     * Toca o efeito imediatamente. Falhas de áudio são ignoradas: o som é complementar.
     * @param {keyof SOUND_NOTES} soundName
     */
    playSoundNow(soundName) {
      const notes = SOUND_NOTES[soundName];
      const AudioContextClass = global.AudioContext || global.webkitAudioContext;
      if (!notes || !AudioContextClass) return;

      try {
        this.audioContext = this.audioContext || new AudioContextClass();
        const waveform = soundName === 'invalid' ? 'square' : 'sine';
        let startTime = this.audioContext.currentTime;
        notes.forEach(([frequency, duration]) => {
          this.playNote(frequency, duration, startTime, waveform);
          startTime += duration;
        });
      } catch (_error) {
        // Sem áudio disponível: o feedback visual já cobre a informação.
      }
    }

    /**
     * @param {number} frequency Hz.
     * @param {number} duration  Segundos.
     * @param {number} startTime Instante no relógio do AudioContext.
     * @param {OscillatorType} waveform
     */
    playNote(frequency, duration, startTime, waveform) {
      const context = this.audioContext;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(SOUND_SILENCE, startTime);
      gain.gain.exponentialRampToValueAtTime(SOUND_VOLUME, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(SOUND_SILENCE, startTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.02);
    }

    /* ------------------------ Ligação de eventos ------------------------ */

    /** @param {(index: number) => void} handler Chamado ao clicar ou ativar uma casa. */
    bindCellActivate(handler) {
      this.el.board.addEventListener('click', event => {
        const cell = event.target.closest('.cell');
        if (cell && this.el.board.contains(cell)) handler(Number(cell.dataset.index));
      });
    }

    /** Setas movem o foco entre as casas (comportamento de interface, sem regra de jogo). */
    bindBoardNavigation() {
      this.el.board.addEventListener('keydown', event => {
        const cell = event.target.closest('.cell');
        if (!cell || !(event.key in ARROW_OFFSETS)) return;
        event.preventDefault();
        this.focusCell(neighborCell(Number(cell.dataset.index), event.key));
      });
    }

    /** @param {() => void} handler */
    bindNewRound(handler) { this.el.btnNew.addEventListener('click', handler); }

    /** @param {() => void} handler */
    bindUndo(handler) { this.el.btnUndo.addEventListener('click', handler); }

    /** @param {() => void} handler */
    bindResetScore(handler) { this.el.btnReset.addEventListener('click', handler); }

    /** @param {() => void} handler */
    bindOpenSettings(handler) { this.el.btnSettings.addEventListener('click', handler); }

    /** @param {() => void} handler */
    bindToggleSound(handler) { this.el.btnSound.addEventListener('click', handler); }

    /** @param {() => void} handler */
    bindHelp(handler) { this.el.btnHelp.addEventListener('click', handler); }

    /** @param {(values: Object) => void} handler Chamado a cada mudança na configuração. */
    bindSetupChange(handler) {
      this.el.setupForm.addEventListener('change', () => handler(this.getSetupValues()));
    }

    /** @param {(values: Object) => void} handler Chamado ao clicar em "Começar partida". */
    bindStart(handler) {
      this.el.setupForm.addEventListener('submit', event => {
        event.preventDefault();
        handler(this.getSetupValues());
      });
    }

    /**
     * Traduz atalhos de teclado em ações para o Controller.
     * @param {(action: {type: string, index?: number}) => void} handler
     */
    bindShortcuts(handler) {
      this.doc.addEventListener('keydown', event => {
        if (!this.shouldHandleShortcut(event)) return;
        const action = this.shortcutAction(event);
        if (action) {
          event.preventDefault();
          handler(action);
        }
      });
    }

    /**
     * Ignora teclas já tratadas, com modificadores de sistema, com diálogo aberto
     * ou digitadas dentro de campos de formulário.
     * @param {KeyboardEvent} event
     * @returns {boolean}
     */
    shouldHandleShortcut(event) {
      if (event.defaultPrevented || event.altKey || event.metaKey || this.isDialogOpen()) return false;
      const tag = (event.target.tagName || '').toLowerCase();
      return !['input', 'textarea', 'select'].includes(tag);
    }

    /**
     * @param {KeyboardEvent} event
     * @returns {{type: string, index?: number}|null}
     */
    shortcutAction(event) {
      const key = event.key.toLowerCase();
      const inGame = !this.el.gameScreen.hidden;

      if (event.ctrlKey) return inGame && key === 'z' ? { type: 'undo' } : null;
      if (inGame && /^[1-9]$/.test(key)) return { type: 'play', index: Number(key) - 1 };
      if (inGame && GAME_SHORTCUTS[key]) return { type: GAME_SHORTCUTS[key] };
      if (GLOBAL_SHORTCUTS[key]) return { type: GLOBAL_SHORTCUTS[key] };
      return null;
    }
  }

  /* ======================================================================
     Exportação (navegador e Node)
     ====================================================================== */

  const publicApi = { GameView, STYLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicApi;
  else Object.assign(global, publicApi);
})(typeof window !== 'undefined' ? window : globalThis);
