# Mery's Toys · Pedidos e conferência por área

Simulação da ME22N com conferência de NF passando pelas áreas da empresa.

## Quem entra e o que vê

| Quem | Como entra | O que vê |
|---|---|---|
| Gerente master: Matheus Fortunato, Eduarda Tomaz, Pedro Zanella | usuário `adm` + senha + escolhe o nome | Fluxo de áreas, todas as conferências, ME22N, resultados de todos |
| Gerente de área | `adm_ti`, `adm_producao`, `adm_pcp`, `adm_comunicacao`, `adm_logistica` + senha | Pedidos parados na área, ME22N para criar pedidos, resultados da área |
| Colaborador | escolhe a área e digita o nome (precisa estar na equipe da área) | Só os pedidos que estão na etapa dele, para aprovar ou rejeitar |

Pelo login de gerente ninguém aprova. Quem aprova entra como colaborador da área. Na TI, os gerentes master também aprovam: basta entrar como colaborador da TI.

## Limpar histórico

Só o login de gerente master do **Matheus Fortunato** (dono do sistema, `OWNER` em `public/flow.js`) tem a aba **Limpar histórico**. Ela apaga todos os pedidos e todas as conferências, de todas as áreas, para todo mundo; a numeração volta para OC-2026-0048. Para confirmar, é preciso digitar LIMPAR e a senha (`RESET_PASS`). O servidor confere de novo quem pediu e a senha.

## Fluxo

TI → Produção → PCP → Comunicação → Logística

- **TI:** aprovam Matheus Fortunato, Eduarda, Pedro Zanella ou Pietro. Para aprovar, eles entram como colaborador da TI.
- **Produção, PCP e Comunicação:** aprova qualquer colaborador da área.
- **Logística:** quatro etapas, nesta ordem: Jônatas → João → Rafael → Flávia.
- **Quem criou o pedido define o início:**
  - pedido de gerente master começa na TI;
  - pedido de gerente de área começa na área dele e segue as áreas seguintes.
- **Rejeição:** o pedido volta para quem criou, com o motivo e o nome de quem rejeitou. Quando reenviado, recomeça do início do trajeto.
- **Divergência proposital:** a cada 2 envios, a NF chega com uma diferença em relação ao pedido.

Equipes, aprovadores e ordem das áreas ficam em `public/flow.js`. Para mudar, altere só esse arquivo.

## Senhas (variáveis de ambiente no Render)

| Variável | Para quê | Padrão |
|---|---|---|
| `ADMIN_PASS` | senha do `adm` (gerentes master) | `adm` |
| `MANAGER_PASS` | senha de todos os `adm_área` | `adm` |
| `PASS_ADM_TI`, `PASS_ADM_PRODUCAO`, `PASS_ADM_PCP`, `PASS_ADM_COMUNICACAO`, `PASS_ADM_LOGISTICA` | senha própria de cada área (substitui a `MANAGER_PASS`) | — |
| `RESET_PASS` | senha para **Limpar histórico** (aba só do Matheus Fortunato). Defina uma senha só sua: sem ela, vale a do `adm`, que os outros gerentes master também sabem | — |
| `SESSION_SECRET` | assina as sessões; qualquer texto longo | gerado pelo Render |
| `DATABASE_URL` | Internal Database URL do Postgres | — |

## Publicar no Render

1. Envie a pasta para o GitHub.
2. Se o projeto estiver numa subpasta do repositório, preencha **Settings → Root Directory** com o nome da pasta.
3. Confira as variáveis acima no **Environment** e faça o deploy.
4. O deploy deu certo se o log terminar com `rodando na porta … (Postgres)`.

## Rodar no computador

```
npm install
npm start
```

Abra http://localhost:3000. Sem `DATABASE_URL`, os dados ficam em `data.json`.
