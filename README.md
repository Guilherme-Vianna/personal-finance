# Grana na Vida

Controle de dinheiro pessoal (baseado na planilha "Livro Folha"): quanto ainda dá pra gastar no mês, contas fixas e parcelas programadas, metas com barra de progresso e leitura de comprovantes por IA.

Irmão do [Horas na Vida](https://github.com/Guilherme-Vianna/personal-life-hours-tracker): mesma stack, mesma UX (quadro-negro, lançamento rápido, bottom sheets no celular, tudo em pt-BR), mas em azul para não confundir com o verde do app de horas.

- **Painel**: por mês. Quanto ainda dá pra gastar, quanto por dia nos dias que faltam, ritmo ideal × real, balanço do mês (renda − contas − investimentos − gastos), o que está programado no mês, gastos por categoria, por dia, por forma de pagamento e dia da semana, onde mais foi dinheiro e metas.
- **Gastos**: lançamentos agrupados por dia, com filtros de período, categoria, forma de pagamento e busca; criar/editar/apagar. Gastos e entradas extras.
- **Importar com IA**: envie fotos, PDFs (fatura, extrato, nota fiscal), planilhas `.xlsx`, CSV, OFX ou TXT, vários de uma vez, ou cole um texto (ex.: histórico do Google Pay). O Gemini pré-preenche os lançamentos (data, valor, forma de pagamento e categoria); o que ele não tem certeza fica em branco para você completar, e o que já está lançado no mesmo período (mesmo valor, até 2 dias) ou repetido entre os arquivos vem como "✓ Já adicionado" e desmarcado. Lançamentos que são contas, rendas ou investimentos do Orçamento vêm com a relação sugerida (🔗) para você confirmar; ao salvar, o item fica ✓ pago no mês (com o valor real, se diferente) em vez de virar gasto duplicado. Você ajusta (com ações em lote) e salva tudo de uma vez.
- **Conferência do mês** (no Orçamento): cada item programado aparece como ✓ relacionado (com data, valor e origem), ⏳ pendente, ⚠️ atrasado ou ⏭️ pulado.
- **Orçamento**: rendas, contas fixas e investimentos programados com início e fim (ou sem fim, ou parcelados). Qualquer mês pode ter um ajuste (outro valor ou "pular este mês"). Orçamento pessoal mensal e divisão ideal da renda (padrão 50/20/30).
- **Metas**: valor-alvo e prazo opcional; depósitos manuais e investimentos programados ligados à meta enchem a barra. Mostra média mensal, previsão e quanto guardar por mês para bater o prazo.
- **Análises**: janelas de 3, 6 ou 12 meses; gastos por mês contra o orçamento, tendência por categoria, maiores gastos, formas de pagamento, dias da semana e insights automáticos.
- **Empréstimos**: gastos e parcelas do cartão marcados como "emprestado" para alguém da família. São só registro (não entram no orçamento, no balanço nem na sobra, porque o dinheiro volta); aqui aparecem por pessoa: quanto foi emprestado, quanto voltou, saldo a receber e parcelas que ainda vão cair.
- **Categorias**: cor, tipo (gasto/entrada) e "fora do orçamento pessoal" (ex.: livros, compras de longo prazo). Apagar uma categoria em uso deixa os itens sem categoria (órfãos) e o app avisa para recategorizar.

## Stack

Next.js 16 (App Router, route handlers em `src/app/api`), React 19, Tailwind CSS v4, Drizzle ORM, Neon (Postgres), Zod, LangChain + Gemini.

## Rodando localmente

```bash
pnpm install
cp .env.example .env.local   # preencha DATABASE_URL e GEMINI_API_KEY
pnpm db:migrate
pnpm dev
```

Sem Neon? `docker compose up -d` sobe um Postgres em `localhost:5434` (`DATABASE_URL=postgres://postgres:postgres@localhost:5434/personal_finance`).

### Importar a planilha

```bash
pnpm db:import "/caminho/Livro Folha.xlsx" [--parcelas-ref=YYYY-MM]
```

Importa a aba **Orcamento** (contas fixas, rendas, investimento, orçamento pessoal e divisão), as abas mensais (`Gastos Mes MM-AAAA`) como gastos e as tabelas de livros ao lado como categoria "Livros" (fora do orçamento). O "Extra" de um mês vira uma entrada extra. Pode rodar de novo sem duplicar.

- Gastos sem data na planilha entram no dia 1 do mês, com a observação "Sem data na planilha".
- Parcelas como "Celular (3 / 21)" são contadas a partir do mês da última aba mensal; use `--parcelas-ref` se a parcela atual se refere a outro mês (ou ajuste "Já pagas" no app).

## Deploy (Vercel + Neon)

1. Rode `pnpm db:migrate` apontando `DATABASE_URL` para o Neon.
2. Na Vercel, configure `DATABASE_URL` e `GEMINI_API_KEY` (opcional: `GEMINI_MODEL`, `NEXT_PUBLIC_TIME_ZONE`).
3. O app não tem senha: qualquer pessoa com o link consegue ver e editar os dados.

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET / POST | `/api/transactions` | Lista (`from`, `to`, `categoryId`, `method`, `q`, `limit`) / cria lançamento |
| PUT / DELETE | `/api/transactions/:id` | Atualiza / apaga |
| POST | `/api/transactions/bulk` | Salva a importação: `{transactions, payments}` |
| GET / POST | `/api/categories` | Lista com totais / cria |
| PUT / DELETE | `/api/categories/:id` | Atualiza / apaga (itens que usavam ficam órfãos; retorna quantos) |
| GET / POST | `/api/recurring` | Rendas, contas fixas e investimentos programados / cria |
| PUT / DELETE | `/api/recurring/:id` | Atualiza / apaga |
| POST / DELETE | `/api/recurring/:id/payments` | Marca como pago/recebido no mês (`{date, amount}`; valor diferente vira ajuste) / desfaz (`?month=`) |
| PUT / DELETE | `/api/recurring/:id/overrides` | Ajusta um mês (`{month, amount}` ou `{month, skip: true}`) / remove ajuste (`?month=`) |
| GET / POST | `/api/goals` | Metas com progresso / cria |
| PUT / DELETE | `/api/goals/:id` | Atualiza / apaga |
| POST | `/api/goals/:id/deposits` | Depósito (valor negativo = retirada) |
| DELETE | `/api/deposits/:id` | Apaga depósito |
| GET | `/api/loans` | Empréstimos por pessoa (emprestado, devolvido, saldo, parcelas futuras) |
| GET | `/api/loans/people` | Nomes já usados |
| POST / DELETE | `/api/loans/repayments[/:id]` | Registra / apaga pagamento recebido |
| GET / PUT | `/api/settings` | Orçamento pessoal e divisão da renda |
| GET | `/api/stats` | Painel do mês (`month`, `includeOutside`) |
| GET | `/api/descriptions` | Sugestões de descrições já usadas |
| POST | `/api/ai/extract` | Lê um arquivo (`multipart`: `file`, `hint`) e devolve lançamentos sugeridos (campos incertos vêm `null`; `duplicateOf` indica possível duplicado) |

Erros de validação retornam 422 com `fieldErrors`.
