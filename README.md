# Jogo da Velha — Requisitos e Solução MVC

Para jogar, abra o `index.html` com dois cliques. O jogo funciona 100% offline, não precisa de instalação e não usa bibliotecas externas.

## Estrutura (RNF06 — MVC)

```
index.html            marcação semântica, <dialog> nativo, região role="status"
css/styles.css        interface neutra (WCAG AA) + 6 estilos de tabuleiro
js/model.js           GameModel  → estado, regras (RN01–RN07), placar, IA (AIPlayer)
js/view.js            GameView   → DOM, renderização, som, diálogos, captura de entradas
js/controller.js      GameController → liga View ↔ Model, turno do computador, preferências
tests/model.test.js   testes unitários do Model (Node)
tests/testes.html     homologação CT01–CT10 + extras na interface real
tests/run-browser-tests.js  executa a homologação no Chrome/Edge headless, com teclado real
```

O Model não acessa o DOM. A View não contém regras de jogo. O Controller recebe as ações da View, chama o Model e depois atualiza a View.

## Novidades pedidas

| Recurso | Implementação |
|---|---|
| **Escolha de estilo** (imagem *Tictactoe_style*) | Crochê, Lousa de professor, Terminal de computador, Papel e caneta, Mármore e pedra, Artesanato em aquarela. Cada estilo tem uma prévia ao vivo na tela inicial. |
| **Níveis de dificuldade** | **Fácil**: joga aleatoriamente. **Médio**: vence quando pode e bloqueia. **Difícil**: joga com minimax, mas erra 20% das vezes. **Impossível**: minimax perfeito, comprovado por busca exaustiva que nunca perde. |
| Modo | 2 jogadores ou contra o computador. Contra o computador, você pode jogar de X ou de O. |

## Rastreabilidade de requisitos

| Req. | Onde |
|---|---|
| RF01 | `GameView._createBoard` cria 9 `<button>` em uma grade 3×3 |
| RF02, RF03 | `GameModel.play` |
| RF04, RN02 | `play` recusa a casa ocupada sem trocar o turno; a View mostra um tremor e a mensagem de erro, e o som toca |
| RF05, RN03, RN05 | `WIN_LINES` (8 combinações) e `evaluateBoard` |
| RF06, RN01, RN06 | `GameModel.newRound` |
| RF07 | `score` no Model; a View usa `renderScore` e `bumpScore` |
| RF08, RN07 | `GameController.resetScore` pede confirmação num `<dialog>` nativo |
| RN04 | `play` retorna `game-over`; as casas ficam com `aria-disabled` |
| RNF01 | CSS Grid/Flexbox; testado em 360, 768, 1200 e 1440 px sem rolagem horizontal |
| RNF02 | ES2020 + CSS3, sem transpilador |
| RNF03 | Jogada em menos de 1 ms. A IA leva no máximo ~14 ms graças ao minimax com memoização |
| RNF04 | X e O têm cor **e** forma diferentes; prévia da jogada ao passar o mouse ou focar; banner de turno |
| RNF05 | `<button>`, `aria-label` dinâmico, `aria-live="polite"`, contraste ≥ 4.5:1 (verificado), suporte a `forced-colors` e `prefers-reduced-motion` |
| RNF07 | Nenhuma requisição externa (CSS, JS e filtros SVG são locais) |

## As 10 heurísticas de Nielsen

1. **Visibilidade do status do sistema:** banner de vez com o selo do jogador, aviso "Computador está pensando…", placar animado, resumo da configuração e destaque da trinca.
2. **Correspondência com o mundo real:** texto em português, termos como "deu velha", estilos que imitam materiais reais e nomes de linha e coluna nos avisos.
3. **Controle e liberdade do usuário:** *Desfazer jogada*, *Nova partida*, *Alterar configurações*, *Cancelar* nos diálogos e `Esc` para fechar.
4. **Consistência e padrões:** as mesmas cores de X e O no tabuleiro, no placar e no status, botões com o mesmo visual e controles nativos (`radio`, `dialog`).
5. **Prevenção de erros:** confirmação antes de zerar o placar ou de sair no meio de uma partida. Com o diálogo aberto, o foco começa em "Cancelar". Casas ocupadas e o tabuleiro são bloqueados na vez do computador.
6. **Reconhecimento em vez de memorização:** prévias visuais dos estilos, medidor ●○○○ com a descrição de cada nível, resumo antes de começar e preferências lembradas.
7. **Flexibilidade e eficiência:** atalhos `1–9`, `N`, `U`/`Ctrl+Z`, `M`, `S`, `?` e as setas. A última configuração fica salva.
8. **Design estético e minimalista:** duas telas enxutas; descrições ocultas no celular.
9. **Ajudar a reconhecer e corrigir erros:** mensagens como "Jogada inválida: a casa 5 já tem X. Escolha uma casa vazia — continua a vez do Jogador O."
10. **Ajuda e documentação:** o diálogo "Como jogar" traz as regras, os níveis e todos os atalhos. As dicas aparecem também nos `title` dos botões.

## Testes

Rode os comandos num terminal aberto na pasta do projeto:

```bash
node --test tests/model.test.js           # 21 testes do Model e da IA
node tests/run-browser-tests.js           # 23 verificações de interface (CT01–CT10 + extras) + capturas
node tests/run-browser-tests.js --serve   # servidor local; depois abra o endereço .../tests/testes.html
```

A página `tests/testes.html` **não funciona com dois cliques** (`file://`), porque o navegador bloqueia o acesso da página de testes ao jogo. Ela precisa do servidor iniciado pelo `--serve`.

Os casos CT01 a CT10 passam. As capturas de tela ficam em `tests/screenshots/`.
