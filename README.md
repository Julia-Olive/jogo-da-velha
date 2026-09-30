# Jogo da Velha: Requisitos e Solução MVC

Jogo da velha para navegador, organizado na arquitetura MVC, com seis estilos visuais, modo contra o computador em quatro níveis de dificuldade e recursos de acessibilidade (WCAG 2.1 AA).

## Como jogar

Abra o arquivo `index.html` no navegador (dois cliques). Não é preciso instalar nada nem estar conectado à internet.

1. Escolha o **estilo do tabuleiro**.
2. Escolha o **modo de jogo**: 2 jogadores no mesmo dispositivo, ou contra o computador.
3. Contra o computador, escolha a **dificuldade** e se você joga com **X** (começa) ou **O**.
4. Clique em **Começar partida**.

Navegadores compatíveis: Chrome, Firefox, Safari e Edge em versões atuais.

## Estrutura do projeto

```
index.html                  Estrutura da página, diálogos nativos e região de status acessível
css/styles.css              Interface e os 6 estilos de tabuleiro
js/model.js                 MODEL: estado, regras, placar e estratégia do computador
js/view.js                  VIEW: desenho da página, som, diálogos e captura de entradas
js/controller.js            CONTROLLER: liga View e Model, vez do computador e preferências
tests/model.test.js         Testes unitários do Model
tests/testes.html           Homologação dos casos CT01 a CT10 na interface real
tests/run-browser-tests.js  Executa a homologação no Chrome/Edge sem abrir janela
```

## Arquitetura MVC

| Camada | Classe | Responsabilidade | Não faz |
|---|---|---|---|
| Model | `GameModel`, `CpuPlayer` | Guarda tabuleiro, turno, resultado e placar. Valida jogadas. Escolhe a jogada do computador. | Não acessa a página (DOM). |
| View | `GameView` | Desenha tabuleiro, placar e status. Toca sons. Abre diálogos. Transforma cliques e teclas em chamadas de funções. | Não conhece as regras do jogo. |
| Controller | `GameController` | Recebe as ações do usuário, aciona o Model, escolhe os textos de status e agenda a jogada do computador. | Não desenha elementos diretamente. |

**Fluxo de uma jogada:** a View recebe o clique e chama `GameController.handleCellActivate`. O Controller chama `GameModel.play`. O Model valida a jogada, atualiza o estado e avisa seus observadores. O Controller recebe o aviso e pede à View que redesenhe a tela.

Os arquivos são carregados como scripts comuns (sem módulos ES), para funcionar abrindo o `index.html` direto do disco.

## Funcionalidades

| Recurso | Descrição |
|---|---|
| Estilos | Crochê, Lousa de professor, Terminal de computador, Papel e caneta, Mármore e pedra, Artesanato em aquarela. Cada um tem uma miniatura na tela inicial. |
| Dificuldade | **Fácil:** joga ao acaso. **Médio:** vence quando pode e bloqueia. **Difícil:** joga com a estratégia ótima, mas erra 20% das vezes. **Impossível:** estratégia ótima (minimax); nunca perde. |
| Desfazer | Volta a última jogada. Contra o computador, volta também a resposta dele. |
| Preferências | Estilo, modo, dificuldade e som ficam salvos no navegador. |
| Atalhos | `1` a `9` marcam casas, `N` inicia uma nova partida, `U` ou `Ctrl+Z` desfaz, `M` abre as configurações, `S` liga ou desliga o som, `?` abre a ajuda, e as setas movem o foco. |

## Rastreabilidade de requisitos

| Requisito | Implementação |
|---|---|
| RF01 | `GameView.createBoard` cria 9 `<button>` em grade 3x3 |
| RF02, RF03 | `GameModel.play` e `GameModel.applyResult` |
| RF04, RN02 | `GameModel.validateMove` recusa casa ocupada sem trocar a vez; `GameController.handleRejectedMove` exibe o aviso, a animação e o som |
| RF05, RN03, RN05 | `WIN_LINES` (8 combinações) e `evaluateBoard` |
| RF06, RN01, RN06 | `GameModel.newRound` limpa o tabuleiro, devolve a vez ao X e mantém o placar |
| RF07 | `GameModel.score` e `GameView.renderScore` |
| RF08, RN07 | `GameController.resetScore` pede confirmação em `<dialog>` nativo |
| RN04 | `GameModel.validateMove` recusa jogadas após o fim; as casas recebem `aria-disabled` |
| RNF01 | CSS Grid e Flexbox; sem rolagem horizontal de 360 px a 1440 px |
| RNF02 | JavaScript ES2020 e CSS3, sem ferramentas de compilação |
| RNF03 | A jogada aparece em menos de 1 ms; o computador decide em cerca de 20 ms (minimax com cache) |
| RNF04 | X e O diferem em cor **e** forma; prévia da jogada ao passar o mouse; faixa de status do turno |
| RNF05 | Botões nativos, `aria-label` dinâmico, `aria-live="polite"`, contraste mínimo de 4.5:1, suporte a alto contraste e a movimento reduzido |
| RNF06 | Separação MVC descrita acima |
| RNF07 | Nenhuma requisição externa; CSS, JavaScript e filtros SVG são locais |

## Heurísticas de Nielsen

1. **Visibilidade do status do sistema:** faixa de vez com o símbolo do jogador, aviso "Computador está pensando…", placar animado e destaque da trinca vencedora.
2. **Correspondência com o mundo real:** textos em português, expressões como "deu velha" e estilos que imitam materiais reais.
3. **Controle e liberdade do usuário:** desfazer jogada, nova partida, voltar às configurações e cancelar diálogos (inclusive com `Esc`).
4. **Consistência e padrões:** as mesmas cores de X e O no tabuleiro, no placar e no status; botões com aparência uniforme; controles nativos.
5. **Prevenção de erros:** confirmação antes de zerar o placar ou abandonar uma partida, com o foco inicial em "Cancelar"; tabuleiro bloqueado durante a vez do computador.
6. **Reconhecimento em vez de memorização:** miniaturas dos estilos, medidor de dificuldade com descrição e resumo da configuração antes de começar.
7. **Flexibilidade e eficiência de uso:** atalhos de teclado e preferências salvas.
8. **Design estético e minimalista:** duas telas objetivas; descrições secundárias ocultas em telas pequenas.
9. **Reconhecimento, diagnóstico e recuperação de erros:** mensagens que dizem o que houve e o que fazer, como "Jogada inválida: a casa 5 já tem X. Escolha uma casa vazia, continua a vez do Jogador O."
10. **Ajuda e documentação:** janela "Como jogar" com regras, níveis e atalhos; dicas nos botões.

## Testes

Execute os comandos no terminal, dentro da pasta do projeto (requer Node.js 22 ou superior):

```bash
node --test tests/model.test.js           # testes unitários do Model
node tests/run-browser-tests.js           # casos CT01 a CT10 e verificações extras no navegador
node tests/run-browser-tests.js --serve   # servidor local para abrir tests/testes.html
```

A página `tests/testes.html` precisa ser aberta pelo endereço exibido pelo `--serve`. Aberta direto do disco, o navegador impede que ela controle o jogo.
