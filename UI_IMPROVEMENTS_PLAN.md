# Plano de Melhorias UI — Readiness Today Page

Baseado na análise com Chrome DevTools (Lighthouse 100/100 em Accessibility, Best Practices e SEO).

---

## Fase 1 — Quick Wins (1-2h total)

| # | Melhoria | Ficheiro | Esforço | Impacto |
|---|---|---|---|---|
| 1.1 | **Formatar data** — `20260427` → `27 Apr 2026` | `today/page.tsx` | ~2 linhas | Alto — visual imediato |
| 1.2 | **Desactivar botões não-funcionais** — START PLAN e REGENERATE INSIGHT com `disabled` + tooltip "Coming soon" | `today/page.tsx` | ~10 linhas | Médio — evita confusão |
| 1.3 | **HRV sem contexto** — mostrar "No data" em vez de "—" quando valor é null | `driver-tile.tsx` | ~5 linhas | Baixo — clareza |
| 1.4 | **Unificar freshness indicators** — remover duplicação "UPDATED 2H AGO" vs "LAST SYNC 13m ago" | `today/page.tsx` | ~10 linhas | Médio — clareza |

## Fase 2 — Robustez (2-3h total)

| # | Melhoria | Ficheiro(s) | Esforço | Impacto |
|---|---|---|---|---|
| 2.1 | **Loading skeleton** — criar `today/loading.tsx` com placeholders animados (ring, bars, cards) | `today/loading.tsx` (novo) | ~30 linhas | Alto — UX percepcionada |
| 2.2 | **FTP Test card vazio** — fallback quando não há métricas: mostrar tipo de treino + "Details after workout" | `today/page.tsx` (PlannedCard) | ~15 linhas | Médio — cards não parecem broken |
| 2.3 | **Error boundaries granulares** — wrap `DecisionSupportSection`, `PlannedCard`, `DriverTile` com error boundaries | `today/error.tsx` (novo) + wrappers | ~40 linhas | Alto — resiliência |

## Fase 3 — UX Polish (3-4h total)

| # | Melhoria | Ficheiro(s) | Esforço | Impacto |
|---|---|---|---|---|
| 3.1 | **Planned vs Done progress bar** — barra visual `doneCount/totalCount` no header | `today/page.tsx` | ~20 linhas | Alto — feedback do dia |
| 3.2 | **Expandir descrição do workout** — toggle para ver detalhes completos do plano | `today/page.tsx` (PlannedCard) | ~15 linhas | Médio — info truncada |
| 3.3 | **Link para Intervals.icu no card** — botão/icon que abre o evento no source | `today/page.tsx` (PlannedCard) | ~5 linhas | Baixo — acesso rápido |
| 3.4 | **Tempo relativo no planned** — "in 2h" em vez de hora absoluta | `today/page.tsx` | ~10 linhas | Baixo — contexto temporal |

## Fase 4 — Mobile & Infra (backlog)

| # | Melhoria | Esforço | Impacto |
|---|---|---|---|
| 4.1 | **Mobile bottom nav** — redesign sidebar para mobile | Médio | Alto |
| 4.2 | **Pull-to-refresh** — padrão mobile esperado | Médio | Médio |
| 4.3 | **Dark/light mode toggle** — CSS vars já existem, falta toggle | Médio | Médio |
| 4.4 | **Color coding contraste WCAG** nos driver tiles | Baixo | Baixo |

---

## Resumo

| Fase | Items | Esforço estimado | Prioridade |
|---|---|---|---|
| **1 — Quick Wins** | 4 | 1-2h | Imediata |
| **2 — Robustez** | 3 | 2-3h | Esta semana |
| **3 — UX Polish** | 4 | 3-4h | Próxima semana |
| **4 — Mobile & Infra** | 4 | Backlog | Quando prioritário |

## Dependências

- Fase 1 não tem dependências — pode começar já
- Fase 2.1 (skeleton) deve ser feita antes de 2.3 (error boundaries)
- Fase 3 assume Fase 2 completa (cards com dados correctos)
- Fase 4 é independente mas beneficia de Fase 1-3 estáveis

---

## Problemas Identificados (Detalhe)

### 1. FTP Test card está vazio (sem métricas)
O card "FTP Test" mostra apenas o nome e o badge "PLANNED" — sem duração, distância, zona, intensidade ou load. Isto acontece porque o `rawJson` desse evento no Intervals.icu não tem `moving_time`, `distance`, `icu_training_load`, ou `icu_intensity` preenchidos.

**Sugestão:** Quando não há métricas, mostrar uma mensagem contextual tipo "Details available after sync" ou mostrar o tipo de treino para o card não parecer quebrado.

### 2. Data mostra "20260427" em vez de formato legível
No hero section aparece `Today · 20260427`. O `summary.date` vem no formato ISO compacto sem formatação.

**Sugestão:** Formatar para `27 Apr 2026` ou `2026-04-27` usando `Intl.DateTimeFormat`.

### 3. HRV mostra "—" sem contexto
O driver tile HRV mostra apenas um dash sem explicação. O utilizador não sabe se é falta de dados, se o sensor não sincronizou, ou se é um erro.

**Sugestão:** Mostrar "No data" ou "Sync watch" no hint quando o valor é null.

### 4. Botões START PLAN e REGENERATE INSIGHT não fazem nada
São `<button>` com `type="button"` mas sem `onClick` handler.

**Sugestão:** Desactivar com `disabled` + tooltip "Coming soon", ou remover.

### 5. Inconsistência no "UPDATED 2H AGO" vs "LAST SYNC 13m ago"
O header mostra dois indicadores de freshness que parecem contradizer-se.

**Sugestão:** Unificar num único indicador, ou clarificar com labels distintas.

### 6. Falta de loading/skeleton states
O page é server-rendered (`force-dynamic`), o que significa que se a DB demorar, o utilizador vê uma página em branco.

**Sugestão:** Adicionar um `loading.tsx` com skeleton placeholders.

### 7. Sem error boundary granular
Se um componente falhar, todo o page crasha.

**Sugestão:** Wrapping sections individuais com error boundaries.

---

## Melhorias de UX (Nice-to-have)

| Melhoria | Impacto | Esforço |
|---|---|---|
| Dark/light mode toggle | Médio | Médio |
| Planned vs Done progress bar | Alto | Baixo |
| Expandir descrição do workout | Médio | Baixo |
| Link para Intervals.icu no card | Baixo | Baixo |
| Mobile bottom nav | Alto | Médio |
| Pull-to-refresh | Médio | Médio |
| Relative time no planned | Baixo | Baixo |
| Color coding nos driver tiles | Parcial | Verificar contraste WCAG |