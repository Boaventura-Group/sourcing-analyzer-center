# SDD — Sourcing Analyzer Center

## 1. Visão geral

Este documento descreve o design técnico para desenvolver um conector MCP de análise de oportunidades de compra a partir de uma planilha de fornecedor contendo ASINs, EANs, títulos, custo e preço de venda. O sistema será usado no Workspace do usuário pelo agente GPT via chat, sem frontend web próprio. O backend será implementado com Cloudflare Worker como orquestrador, integrando Amazon SP-API e Keepa API para validar Buy Box, estimar Amazon fees, enriquecer dados comerciais e retornar ao agente apenas produtos com lucro líquido positivo.

O fluxo será limitado a 100 ASINs por sessão/lote para manter o processamento controlado. A premissa operacional atual da conta Keepa Pro do grupo é: saldo inicial disponível de 300 tokens e renovação de 5 tokens por minuto. A implementação deve consultar `/token` antes e durante o job, e pausar/reagendar o processamento quando o saldo disponível não cobrir o próximo bloco planejado.

## 1.1 Hierarquia normativa e status das regras

Este SDD é uma especificação interna controlada do projeto, não uma fonte normativa absoluta.

- Documentação oficial atual prevalece sobre este SDD.
- Respostas reais autenticadas das APIs prevalecem sobre premissas internas.
- Decisões internas devem ser marcadas como `DECISAO_INTERNA`.
- Premissas operacionais de conta devem ser marcadas como `PREMISSA_OPERACIONAL`.
- Itens que exigem teste real devem ser marcados como `PENDENTE_SMOKE`.
- Itens que exigem portal autenticado devem ser marcados como `PENDENTE_PORTAL`.

Status usados neste documento:

- `OFICIAL`: regra baseada em documentação oficial atual ou comportamento autenticado confirmado.
- `DECISAO_INTERNA`: decisão arquitetural ou operacional do projeto.
- `PREMISSA_OPERACIONAL`: premissa de conta, ambiente ou operação que deve ser validada em runtime.
- `PENDENTE_SMOKE`: item bloqueado por teste real controlado.
- `PENDENTE_PORTAL`: item bloqueado por validação em portal autenticado.

## 2. Objetivos

### 2.1 Objetivo principal

Criar um conector MCP com backend em Cloudflare Workers capaz de receber do agente GPT dados de planilhas com até 100 ASINs por lote, consultar Amazon SP-API e Keepa API, consolidar os dados em um modelo único, calcular lucro líquido e ROI, e devolver ao agente uma saída estruturada em JSON/CSV/XLSX filtrada apenas por oportunidades com lucro líquido positivo.

### 2.2 Objetivos específicos

- Ler dados da planilha do fornecedor.
- Validar ASIN, EAN, título, custo e preço de venda.
- Buscar Buy Box / Featured Offer atual na Amazon SP-API.
- Buscar estimativas de Amazon fees por ASIN usando o preço validado.
- Buscar no Keepa: Buy Box, rating, review count, BSR, BSR médio 30/90 dias, sales rank drops 30/90 dias, offer count e sellers quando disponível.
- Comparar preço da planilha com Buy Box Amazon e Buy Box Keepa.
- Aplicar regra de Pack para ajustar custo.
- Aplicar prep fee fixa de £0.55.
- Calcular net profit e ROI.
- Retornar somente produtos com net profit positivo.
- Marcar divergências sensíveis de preço para revisão.
- Controlar rate limit da Amazon e tokens do Keepa.
- Expor as capacidades do backend como ferramentas MCP consumidas pelo agente GPT no Workspace.
- Manter o chat do agente GPT como frontend operacional do projeto.

## 3. Escopo

### 3.1 Incluído

- Upload/entrada de planilha em CSV ou XLSX.
- Conector MCP para uso pelo agente GPT no Workspace.
- Processamento de até 100 ASINs por job.
- Integração com Amazon Product Pricing API.
- Integração com Amazon Product Fees API.
- Integração com Keepa Product API.
- Rate limiter para Amazon SP-API.
- Token guard para Keepa.
- Detecção de Pack no título.
- Cálculo de ROI e lucro líquido.
- Exportação de resultados.
- Status de job.
- Logs estruturados por ASIN.

### 3.2 Fora do escopo inicial

- Processamento automático de milhares de ASINs em uma única execução.
- Scraping da Amazon.
- Gravação automática em Seller Central.
- Compra automática de stock.
- Criação automática de listings.
- Repricing.
- Forecast de demanda avançado.
- Cálculo de VAT completo.
- Integração direta com Xero.
- Interface web própria ou frontend separado.
- Dashboard, landing page, UI administrativa ou fluxo de upload fora do agente GPT.

## 4. Stack proposta

### 4.1 Runtime

- Cloudflare Workers com TypeScript.
- Cloudflare Queues para processamento assíncrono.
- Cloudflare D1 para jobs, itens e resultados normalizados.
- Cloudflare R2 para armazenar arquivos de entrada e saída, se necessário.
- Cloudflare Durable Objects para rate limit coordenado de Amazon e Keepa.

### 4.2 APIs externas

- Amazon SP-API Europe.
- Keepa API.

### 4.3 Superfície de uso

- O produto será consumido como conector MCP no Workspace do usuário.
- O agente GPT no chat será a interface de uso para enviar planilhas, pedir análises, acompanhar status e receber resultados.
- Não haverá frontend web próprio nesta fase.
- Endpoints HTTP internos existem para suportar o conector MCP, processamento assíncrono e auditoria operacional; eles não representam uma UI pública para usuários finais.

### 4.4 Linguagem e bibliotecas

- TypeScript.
- Wrangler.
- Zod para validação de payloads.
- Papa Parse ou similar para CSV.
- Biblioteca XLSX para leitura/escrita de Excel, se necessário.

## 5. Arquitetura de alto nível

```text
Usuário no Workspace
        ↓
Agente GPT no chat
        ↓
Conector MCP do Sourcing Analyzer Center
        ↓
Ferramenta MCP recebe CSV/XLSX ou dados estruturados da planilha
        ↓
Cloudflare Worker valida entrada e cria job
        ↓
D1: jobs + job_items
        ↓
Cloudflare Queue: processar lote de até 100 ASINs
        ↓
Worker Consumer
        ↓
Durable Object RateLimiter
        ↓
Amazon SP-API + Keepa API
        ↓
Normalização + cálculo ROI
        ↓
D1: resultados
        ↓
Conector MCP retorna resultado estruturado ao agente GPT
```

## 6. Componentes

### 6.1 API Worker

Responsável por receber chamadas internas do conector MCP, validar payloads, criar jobs, consultar status e entregar resultados ao agente GPT.

Endpoints internos de suporte ao MCP:

```http
POST /jobs
GET /jobs/:jobId
GET /jobs/:jobId/results
GET /jobs/:jobId/errors
POST /jobs/:jobId/retry
```

### 6.2 Queue Consumer

Responsável por processar os itens de um job em batches controlados.

Funções principais:

- Carregar itens pendentes.
- Agrupar Amazon Pricing em batches de até 20 ASINs.
- Agrupar Amazon Fees Estimates em batches de até 20 itens.
- Consultar Keepa respeitando tokens disponíveis.
- Persistir resultados item a item.
- Atualizar status do job.

### 6.3 Durable Object RateLimiter

Responsável por centralizar limites de execução.

Rate limiters sugeridos:

```text
amazon-pricing-limiter
amazon-fees-limiter
keepa-token-limiter
```

### 6.4 D1 Database

Responsável por persistência transacional leve.

Tabelas sugeridas:

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  source_file_name TEXT,
  total_items INTEGER NOT NULL,
  processed_items INTEGER DEFAULT 0,
  profitable_items INTEGER DEFAULT 0,
  error_items INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  ean TEXT,
  asin TEXT NOT NULL,
  supplier_title TEXT,
  amazon_title TEXT,
  supplier_cost REAL NOT NULL,
  spreadsheet_sales_price REAL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE item_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  job_item_id TEXT NOT NULL,
  asin TEXT NOT NULL,
  ean TEXT,
  title TEXT,
  pack_qty INTEGER,
  supplier_cost REAL,
  adjusted_cost REAL,
  spreadsheet_sales_price REAL,
  amazon_buy_box REAL,
  keepa_buy_box REAL,
  validated_sales_price REAL,
  amazon_fees_estimate REAL,
  prep_fee REAL,
  net_profit REAL,
  roi_percent REAL,
  keepa_rating REAL,
  keepa_review_count INTEGER,
  keepa_bsr_current INTEGER,
  keepa_avg_bsr_30 INTEGER,
  keepa_avg_bsr_90 INTEGER,
  keepa_sales_rank_drops_30 INTEGER,
  keepa_sales_rank_drops_90 INTEGER,
  keepa_offer_count INTEGER,
  keepa_seller_count INTEGER,
  price_status TEXT,
  decision_status TEXT,
  notes TEXT,
  raw_amazon_pricing_json TEXT,
  raw_amazon_fees_estimate_json TEXT,
  raw_keepa_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (job_item_id) REFERENCES job_items(id)
);
```

## 7. Configuração de ambiente

Variáveis necessárias no Worker:

```text
AMAZON_LWA_CLIENT_ID
AMAZON_LWA_CLIENT_SECRET
AMAZON_REFRESH_TOKEN
AMAZON_REGION=eu-west-1
AMAZON_SPAPI_ENDPOINT=https://sellingpartnerapi-eu.amazon.com
AMAZON_MARKETPLACE_ID=A1F83G8C2ARO7P
KEEPA_API_KEY
KEEPA_DOMAIN=2
KEEPA_INITIAL_OPERATIONAL_TOKENS=300
KEEPA_REFILL_TOKENS_PER_MINUTE=5
PREP_FEE_GBP=0.55
MAX_ASINS_PER_JOB=100
PRICE_MISMATCH_THRESHOLD_PERCENT=2
```

## 8. Entrada de dados

### 8.1 Campos mínimos da planilha

```text
EAN
ASIN
Title ou Description
Cost Price
Sales Price
```

### 8.2 Normalização de entrada

- Remover espaços do ASIN.
- Converter ASIN para uppercase.
- Validar ASIN com regex: `^[A-Z0-9]{10}$`.
- Converter custo e preço para número decimal.
- Remover símbolo de moeda.
- Padronizar vírgula decimal para ponto.
- Limitar a 100 ASINs por job.
- Rejeitar linhas sem ASIN ou sem custo.

### 8.3 Regras de deduplicação

- Se o mesmo ASIN aparecer mais de uma vez, manter todas as linhas se tiverem custos diferentes.
- Se ASIN, EAN e custo forem idênticos, marcar duplicado e processar apenas uma vez.
- Reaproveitar resultados de API por ASIN dentro do mesmo job.

## 9. Endpoints Amazon SP-API

### 9.0 Autenticação Amazon SP-API

Status: `OFICIAL` para o uso de LWA access token nas chamadas SP-API; `DECISAO_INTERNA` para manter este projeto sem credenciais AWS.

- Implementar autenticação Amazon SP-API usando LWA access token.
- Renovar o access token a partir de `AMAZON_REFRESH_TOKEN`, `AMAZON_LWA_CLIENT_ID` e `AMAZON_LWA_CLIENT_SECRET`.
- Enviar somente headers e credenciais exigidos pela documentação oficial atual da SP-API para as operações usadas.
- Não implementar SigV4, IAM Role ou AWS credentials.
- Quando houver divergência entre este SDD, documentação oficial e comportamento autenticado real, prevalece a hierarquia normativa da seção 1.1.

### 9.1 Buy Box / Featured Offer

```http
POST /batches/products/pricing/2022-05-01/items/competitiveSummary
```

Uso:

- Validar Buy Box atual da Amazon.
- Obter Featured Offer / Featured Buying Options.
- Processar em batches de até 20 ASINs.

Payload conceitual:

```json
{
  "requests": [
    {
      "method": "GET",
      "uri": "/products/pricing/2022-05-01/items/competitiveSummary",
      "asin": "B000XXXXX",
      "marketplaceId": "A1F83G8C2ARO7P",
      "includedData": [
        "featuredBuyingOptions",
        "lowestPricedOffers",
        "referencePrices"
      ]
    }
  ]
}
```

### 9.2 Product Fees em lote

```http
POST /products/fees/v0/feesEstimate
```

Uso:

- Estimar Amazon fees por ASIN usando o preço validado.
- Tratar o retorno como estimativa operacional, não como fee final garantida pela Amazon.
- Processar em batches de até 20 itens.

Payload conceitual:

```json
[
  {
    "FeesEstimateRequest": {
      "MarketplaceId": "A1F83G8C2ARO7P",
      "IdType": "ASIN",
      "IdValue": "B000XXXXX",
      "IsAmazonFulfilled": true,
      "PriceToEstimateFees": {
        "ListingPrice": {
          "CurrencyCode": "GBP",
          "Amount": 9.99
        }
      },
      "Identifier": "B000XXXXX"
    }
  }
]
```

### 9.3 Fees por ASIN individual

```http
POST /products/fees/v0/items/{Asin}/feesEstimate
```

Uso:

- Apenas para teste, debug ou reprocessamento individual.
- Não usar como endpoint principal em produção para lotes.

## 10. Endpoints Keepa API

A integração Keepa deve seguir este SDD em conjunto com a referência interna versionada em `docs/reference/keepa-api-guide.md` e com evidências oficiais atuais da Keepa. Quando houver divergência entre exemplos humanizados e payload raw, o payload raw oficial prevalece.

### 10.1 Produto principal com Buy Box, rating, reviews, BSR e drops

Status: `OFICIAL` para parâmetros e shape confirmados na referência oficial; `PREMISSA_OPERACIONAL` para estimativa de tokens da conta do grupo.

```http
GET https://api.keepa.com/product
```

Parâmetros:

```text
key=KEEPA_API_KEY
domain=2
asin={ASIN}
stats=90
buybox=1
rating=1
history=0
```

Uso:

- Buy Box Keepa.
- Rating.
- Review count.
- BSR atual.
- BSR médio 30 dias.
- BSR médio 90 dias.
- Sales rank drops 30 dias.
- Sales rank drops 90 dias.
- Offer count.
- Seller count quando disponível.
- Esta chamada principal não deve enviar `offers`; sem `offers`, `/product` pode trabalhar com batches de até 100 ASINs.

Consumo esperado:

```text
Produto básico: ~1 token
buybox=1: +2 tokens
rating=1: até +1 token
Total esperado por ASIN com rating/reviews: ~4 tokens
100 ASINs com rating/reviews: ~400 tokens
```

Política de token:

```text
Status: PREMISSA_OPERACIONAL
Conta Keepa Pro do grupo:
saldo inicial operacional: 300 tokens
renovação: 5 tokens por minuto

O job de 100 ASINs continua permitido, mas não deve assumir execução imediata
quando o custo estimado exceder o saldo atual. O token guard deve consultar
/token e pausar/reagendar até existir saldo suficiente para o próximo bloco.

Se a execução precisar caber imediatamente em 300 tokens, o modo sem rating=1
pode ser usado como fallback explícito, aceitando que rating/review count não
serão preenchidos nessa primeira passagem.
```

### 10.2 Produto com offers como fallback

Status: `DECISAO_INTERNA` para usar offers apenas como fallback controlado; `PENDENTE_SMOKE` para custo real de tokens em execução autenticada.

```http
GET https://api.keepa.com/product
```

Parâmetros:

```text
key=KEEPA_API_KEY
domain=2
asin={ASIN}
stats=90
offers=20
rating=1
history=0
```

Uso:

- Apenas quando Buy Box vier null.
- Apenas quando houver divergência sensível de preço.
- Apenas quando for necessário auditar sellers/ofertas.
- `offers` é um inteiro que define a quantidade de ofertas solicitadas.
- A faixa operacional documentada para este projeto é `20–100`.
- Quando `offers` está presente, o batch máximo do `/product` cai para 20 ASINs por request.
- Quando `offers` está presente, `buybox` é ignorado/redundante; não enviar `buybox=1` no fallback de ofertas.

Consumo esperado:

```text
offers aumenta o custo de tokens e deve ser medido com logs reais da conta.
Não assumir multiplicador fixo sem evidência operacional.
```

### 10.3 Token status

Status: `OFICIAL` para uso do endpoint /token; `PREMISSA_OPERACIONAL` para valores de saldo e renovação da conta do grupo.

```http
GET https://api.keepa.com/token?key=KEEPA_API_KEY
```

Uso:

- Consultar saldo de tokens antes de iniciar lote.
- Evitar iniciar fallback offers sem token suficiente.
- Aguardar próxima renovação quando necessário.
- Usar a resposta real da conta Keepa como autoridade de execução; os valores
  `300 tokens` e `5 tokens/minuto` são a premissa operacional atual da conta
  Pro do grupo, mas o job deve continuar guiado pelo saldo retornado por
  `/token`.

### 10.4 Shape raw de `csv`

Status: `OFICIAL`.

O payload raw de produto da Keepa representa `csv` como array bidimensional indexado por `CsvType`, não como objeto com chaves textuais.

```ts
const newSeries = product.csv[CsvType.NEW.index];
const salesRankSeries = product.csv[CsvType.SALES.index];
```

Cada série alterna pares no formato:

```text
[keepaTime, value, keepaTime, value, ...]
```

Regras:

- Não modelar o raw `csv` como `{ "AMAZON": [...], "SALES": [...] }`.
- Exemplos humanizados podem existir apenas na camada normalizada ou em wrappers internos.
- Persistir o raw JSON completo para permitir reprocessamento quando `CsvType` ou semânticas históricas mudarem.

### 10.5 Confirmações oficiais obtidas e pendentes

Status: `OFICIAL` para confirmações obtidas em fontes oficiais; `PENDENTE_PORTAL` para preços de planos Keepa; `PENDENTE_SMOKE` para evidências que dependam de chamada real controlada.

Confirmado no `Product.java` oficial atual da Keepa:

- `reviews.ratingCount` / histórico de rating count não é atualizado desde `April 9th 2025`, porque esse dado foi removido pela Amazon.
- `CsvType.NEW` não inclui custos de shipping em coletas anteriores a `Feb 16th 2026`.
- `csv` raw é `int[][]`, indexado por `CsvType`.

Confirmado no `Request.java` oficial atual da Keepa:

- Webhook de tracking é confirmado com resposta HTTP `200`.
- Se a entrega falhar, a Keepa faz uma segunda tentativa após `15 seconds`.

Pendente:

- Confirmar preços de planos Keepa diretamente no portal autenticado antes de qualquer decisão comercial.
- Não usar tabela de preços de fontes secundárias como fonte de verdade do projeto.
- Se a página oficial de tracking não estiver acessível estaticamente, registrar `Request.java` como evidência oficial recuperável e marcar a página como não recuperável.

### 10.6 Smoke obrigatório para `/search` com `asins-only`

Status: `PENDENTE_SMOKE`.

Antes de assumir `/search` com `asins-only` em código produtivo:

```text
1. Executar um SMOKE real controlado contra /search.
2. Confirmar que o retorno contém somente lista de ASINs.
3. Confirmar que o payload não voltou completo com dados de produto.
4. Registrar tokens antes/depois para validar custo real.
```

Aviso: se o parâmetro estiver errado ou deixar de ser aceito, a busca pode retornar payload completo e quebrar silenciosamente o orçamento de tokens.

## 11. Fluxo completo de processamento

### 11.1 Criação do job

```text
1. Receber do conector MCP CSV/XLSX ou JSON com itens enviados pelo agente GPT.
2. Validar campos obrigatórios.
3. Rejeitar se houver mais de 100 ASINs.
4. Criar registro em jobs.
5. Criar registros em job_items.
6. Enviar mensagem para Cloudflare Queue.
7. Retornar jobId ao conector MCP para o agente GPT acompanhar o processamento.
```

### 11.2 Processamento do job

```text
1. Carregar itens pendentes.
2. Consultar Keepa token status.
3. Consultar Keepa principal para cada ASIN:
   stats=90 + buybox=1 + rating=1 + history=0.
   Se tokens disponíveis não cobrirem o próximo bloco, pausar/reagendar.
4. Agrupar Amazon getCompetitiveSummary em batches de 20.
5. Comparar Sales Price da planilha, Amazon Buy Box e Keepa Buy Box.
6. Definir preço validado.
7. Agrupar Amazon getMyFeesEstimates em batches de 20 usando preço validado.
8. Aplicar regra de Pack e calcular custo ajustado.
9. Aplicar prep fee de £0.55.
10. Calcular net profit e ROI.
11. Se net profit > 0, persistir como oportunidade.
12. Se net profit <= 0, persistir como não lucrativo ou omitir do resultado final conforme configuração.
13. Para casos com Buy Box null ou divergência, enfileirar fallback Keepa offers=20 se houver token suficiente, em batch máximo de 20 ASINs e sem enviar buybox=1.
14. Atualizar status do job.
```

## 12. Regras de negócio

### 12.1 Regra de Pack

Detectar quantidade de pack a partir do título Amazon preferencialmente. Se o título Amazon não estiver disponível, usar título da planilha.

Padrões mínimos:

```text
Pack of 4
Pack Of 4
4 Pack
4-Pack
Pack x 4
x4
Case of 6
Case 6
Multipack 12
12 Count
12ct
```

Regra:

```text
adjustedCost = supplierCost * packQty
```

Exemplo:

```text
Título: Al'Fez Pearl Couscous 200 g (Pack of 4)
Custo fornecedor: £1.67
Pack Qty: 4
Adjusted Cost: £6.68
```

Se nenhum pack for detectado:

```text
packQty = 1
adjustedCost = supplierCost
```

### 12.2 Preço validado

Fonte principal: Amazon Buy Box.

Regra sugerida:

```text
Se Amazon Buy Box existir:
    validatedSalesPrice = Amazon Buy Box

Se Amazon Buy Box não existir e Keepa Buy Box existir:
    validatedSalesPrice = Keepa Buy Box
    price_status = AMAZON_BUYBOX_MISSING_USING_KEEPA

Se Amazon Buy Box e Keepa Buy Box existirem:
    calcular diferença percentual
    se diferença > 2%:
        price_status = BUYBOX_MISMATCH_REVIEW
    caso contrário:
        price_status = BUYBOX_MATCHED

Se ambas estiverem ausentes:
    decision_status = SKIPPED_NO_BUYBOX
    não calcular ROI
```

### 12.3 Comparação com preço da planilha

Calcular:

```text
spreadsheet_vs_amazon_pct = (spreadsheetSalesPrice - amazonBuyBox) / amazonBuyBox * 100
spreadsheet_vs_keepa_pct = (spreadsheetSalesPrice - keepaBuyBox) / keepaBuyBox * 100
```

Marcar divergência se diferença absoluta for maior que 2%.

### 12.4 Cálculo de lucro líquido

```text
netProfit = validatedSalesPrice - adjustedCost - amazonFeesEstimate - prepFee
```

Com prep fee fixa:

```text
prepFee = 0.55
```

### 12.5 Cálculo de ROI

```text
roiPercent = (netProfit / adjustedCost) * 100
```

Se `adjustedCost <= 0`, marcar erro e não calcular.

### 12.6 Filtro final

Resultado final deve incluir somente:

```text
netProfit > 0
```

Mesmo lucro baixo deve ser mantido.

## 13. Campos finais de saída

```text
EAN
ASIN
Title
Supplier Cost
Pack Qty
Adjusted Cost
Spreadsheet Sales Price
Amazon Buy Box
Keepa Buy Box
Validated Sales Price
Amazon Fees Estimate
Prep Fee
Net Profit
ROI %
Keepa Rating
Keepa Review Count
Keepa BSR Current
Keepa Avg BSR 30
Keepa Avg BSR 90
Keepa Sales Rank Drops 30
Keepa Sales Rank Drops 90
Keepa Offer Count
Keepa Seller Count
Price Status
Decision Status
Notes
```

## 14. Modelo TypeScript principal

```ts
export interface SupplierItemInput {
  rowNumber: number;
  ean?: string;
  asin: string;
  supplierTitle?: string;
  supplierCost: number;
  spreadsheetSalesPrice?: number;
}

export interface KeepaMetrics {
  asin: string;
  title?: string;
  buyBoxPrice?: number;
  rating?: number;
  reviewCount?: number;
  bsrCurrent?: number;
  avgBsr30?: number;
  avgBsr90?: number;
  salesRankDrops30?: number;
  salesRankDrops90?: number;
  offerCount?: number;
  sellerCount?: number;
  raw?: unknown;
}

export interface AmazonPricingMetrics {
  asin: string;
  buyBoxPrice?: number;
  currency?: 'GBP';
  raw?: unknown;
}

export interface AmazonFeesMetrics {
  asin: string;
  totalFeesEstimate?: number;
  currency?: 'GBP';
  raw?: unknown;
}

export interface SourcingResult {
  ean?: string;
  asin: string;
  title?: string;
  supplierCost: number;
  packQty: number;
  adjustedCost: number;
  spreadsheetSalesPrice?: number;
  amazonBuyBox?: number;
  keepaBuyBox?: number;
  validatedSalesPrice?: number;
  amazonFeesEstimate?: number;
  prepFee: number;
  netProfit?: number;
  roiPercent?: number;
  keepaRating?: number;
  keepaReviewCount?: number;
  keepaBsrCurrent?: number;
  keepaAvgBsr30?: number;
  keepaAvgBsr90?: number;
  keepaSalesRankDrops30?: number;
  keepaSalesRankDrops90?: number;
  keepaOfferCount?: number;
  keepaSellerCount?: number;
  priceStatus: PriceStatus;
  decisionStatus: DecisionStatus;
  notes?: string[];
}

export type PriceStatus =
  | 'BUYBOX_MATCHED'
  | 'BUYBOX_MISMATCH_REVIEW'
  | 'AMAZON_BUYBOX_MISSING_USING_KEEPA'
  | 'KEEPA_BUYBOX_MISSING_USING_AMAZON'
  | 'NO_BUYBOX';

export type DecisionStatus =
  | 'PROFIT_POSITIVE'
  | 'NOT_PROFITABLE'
  | 'SKIPPED_NO_BUYBOX'
  | 'SKIPPED_NO_FEES'
  | 'ERROR';
```

## 15. Módulos sugeridos para o repositório

```text
/src
  /routes
    jobs.ts
    results.ts

  /jobs
    createJob.ts
    processJob.ts
    processBatch.ts
    retryJob.ts

  /amazon
    lwa.ts
    spapiClient.ts
    competitiveSummary.ts
    fees.ts
    types.ts

  /keepa
    keepaClient.ts
    product.ts
    offersFallback.ts
    token.ts
    types.ts

  /pricing
    validateBuyBox.ts
    selectValidatedPrice.ts
    comparePrices.ts

  /profit
    detectPackQty.ts
    calculateRoi.ts
    calculateNetProfit.ts

  /storage
    d1.ts
    r2.ts
    schema.sql

  /rateLimit
    AmazonRateLimiterDO.ts
    KeepaTokenLimiterDO.ts

  /export
    toCsv.ts
    toXlsx.ts

  /utils
    money.ts
    dates.ts
    logger.ts
    errors.ts
```

## 16. Pseudocódigo do processamento

```ts
async function processJob(jobId: string, env: Env) {
  const items = await db.getPendingItems(jobId, 100);

  await keepaTokenGuard.ensureTokensAvailable({
    expectedTokens: items.length * 4,
    refillRatePerMinute: 5,
  });

  const keepaResults = await fetchKeepaMainMetrics(items);

  const amazonPricingResults = await fetchAmazonCompetitiveSummaryInBatches({
    items,
    batchSize: 20,
  });

  const preliminary = items.map((item) => {
    const keepa = keepaResults[item.asin];
    const amazonPricing = amazonPricingResults[item.asin];
    const title = amazonPricing?.title ?? keepa?.title ?? item.supplierTitle;
    const packQty = detectPackQty(title);
    const adjustedCost = item.supplierCost * packQty;
    const priceDecision = selectValidatedPrice({
      spreadsheetPrice: item.spreadsheetSalesPrice,
      amazonBuyBox: amazonPricing?.buyBoxPrice,
      keepaBuyBox: keepa?.buyBoxPrice,
    });

    return {
      item,
      keepa,
      amazonPricing,
      title,
      packQty,
      adjustedCost,
      priceDecision,
    };
  });

  const feeInputs = preliminary
    .filter((x) => x.priceDecision.validatedSalesPrice)
    .map((x) => ({
      asin: x.item.asin,
      price: x.priceDecision.validatedSalesPrice!,
    }));

  const feeResults = await fetchAmazonFeesInBatches({
    feeInputs,
    batchSize: 20,
  });

  for (const row of preliminary) {
    const feesEstimate = feeResults[row.item.asin];
    const result = calculateFinalResult(row, feesEstimate, { prepFee: 0.55 });
    await db.saveItemResult(jobId, result);
  }

  await enqueueOffersFallbackIfNeeded(jobId);
  await db.markJobCompletedIfDone(jobId);
}
```

## 17. Tratamento de erros

### 17.1 Erros Amazon

- `429`: aplicar exponential backoff e respeitar `x-amzn-RateLimit-Limit` quando disponível.
- `403`: verificar permissões Pricing/Product Listing, autorização da aplicação SP-API e credenciais LWA.
- `400`: logar payload sanitizado e marcar item como erro.
- `5xx`: retry com backoff até limite configurado.

### 17.2 Erros Keepa

- Tokens insuficientes: pausar job e reagendar após renovação.
- Produto não encontrado: marcar `KEEPA_NOT_FOUND`.
- Buy Box null: seguir com Amazon se disponível; opcionalmente enfileirar offers fallback.
- Rate/timeout: retry limitado.

### 17.3 Erros de cálculo

- Custo inválido: `ERROR_INVALID_COST`.
- Sem preço validado: `SKIPPED_NO_BUYBOX`.
- Sem fees: `SKIPPED_NO_FEES`, salvo se configuração permitir estimativa parcial.

## 18. Estratégia de fallback Keepa offers

Critérios para rodar `offers=20`:

```text
1. Keepa Buy Box null e Amazon Buy Box existe.
2. Amazon Buy Box null e Keepa Buy Box null.
3. Diferença Amazon vs Keepa > 2%.
4. Diferença planilha vs Amazon > 2%.
5. offerCount/sellerCount ausente no retorno principal.
```

Antes do fallback:

```text
Consultar /token.
Estimar tokens necessários para o próximo bloco de fallback.
Se tokens disponíveis < tokens necessários, adiar fallback.
Enviar offers como inteiro entre 20 e 100.
Não enviar buybox junto com offers.
Limitar cada request com offers a no máximo 20 ASINs.
```

## 19. Segurança

- Nunca expor API keys no frontend.
- Guardar credenciais como Cloudflare Secrets.
- Sanitizar raw logs.
- Não salvar LWA refresh token em D1.
- Não logar `Authorization`, `x-amz-access-token`, `KEEPA_API_KEY`.
- Adicionar autenticação no Worker para endpoints de job.
- Limitar upload por tamanho.
- Validar MIME type.

## 20. Observabilidade

Logs estruturados:

```json
{
  "jobId": "job_123",
  "asin": "B000XXXXX",
  "stage": "AMAZON_FEES",
  "status": "SUCCESS",
  "durationMs": 823
}
```

Métricas sugeridas:

```text
jobs_created
jobs_completed
jobs_failed
items_processed
items_profitable
keepa_tokens_used
keepa_fallback_offers_count
amazon_pricing_calls
amazon_fees_estimate_calls
api_errors_by_provider
average_processing_time_per_100_asins
```

## 21. Performance esperada para 100 ASINs

### 21.1 Keepa principal

```text
100 ASINs x ~4 tokens = ~400 tokens quando rating=1 for usado
```

Com a conta Keepa Pro atual do grupo, o saldo inicial operacional é 300 tokens
e a renovação é de 5 tokens por minuto. Portanto, um job de 100 ASINs com
rating/reviews pode precisar pausar/reagendar até acumular o saldo faltante.
O modo sem `rating=1` custa ~3 tokens por ASIN e cabe em 300 tokens, mas não
deve ser usado quando rating/review count forem obrigatórios no resultado.

### 21.2 Amazon Pricing

```text
100 ASINs / 20 por batch = 5 chamadas
```

O número de chamadas não representa tempo total. O rate limiter deve respeitar
os limites retornados/documentados pela SP-API, incluindo headers de rate limit
quando disponíveis, e aplicar backoff em `429`.

### 21.3 Amazon Fees Estimates

```text
100 ASINs / 20 por batch = 5 chamadas
```

### 21.4 Fallback offers

Executar somente em exceções. Exemplo:

```text
10 ASINs x 6–12 tokens = 60–120 tokens extras
```

## 22. Critérios de aceite

### 22.1 Funcional

- O sistema aceita arquivo com até 100 ASINs.
- O sistema rejeita arquivo com mais de 100 ASINs.
- O sistema expõe ferramentas MCP para o agente GPT iniciar análise, consultar status e obter resultados.
- O sistema consulta Keepa para reviews, rating, BSR e drops.
- O sistema consulta Amazon para Buy Box e estimativas de fees.
- O sistema calcula Pack corretamente.
- O sistema calcula net profit e ROI corretamente.
- O resultado final mostra apenas itens com net profit positivo.
- O sistema marca divergência de preço entre planilha, Amazon e Keepa.
- O sistema registra erros por ASIN sem interromper todo o job.

### 22.2 Técnico

- Nenhuma API key aparece no frontend ou logs.
- Chamadas Amazon respeitam batches de 20.
- Keepa não roda fallback offers sem token suficiente.
- Jobs podem ser consultados por status.
- Resultados podem ser exportados.

## 23. Governança de implementação, Git e auditoria

Toda nova implementação ou edição de código deve seguir obrigatoriamente este fluxo:

```text
1. Trabalhar em um repositório Git local válido.
2. Criar ou usar uma branch de trabalho fora da branch principal.
3. Implementar somente o escopo aprovado para a fase.
4. Executar testes e validações aplicáveis.
5. Revisar o diff antes de fechar a tarefa.
6. Criar commit local com mensagem clara e escopo pequeno.
7. Fazer push da branch com o commit.
8. Abrir Pull Request para auditoria.
9. Registrar no PR os comandos de validação executados e o resultado.
```

Regras:

- Nenhuma implementação de código deve ficar apenas no workspace local sem commit.
- Nenhuma implementação de código deve ser considerada entregue sem push.
- Nenhuma implementação de código deve ser considerada pronta para auditoria sem Pull Request aberto.
- O PR deve ser pequeno, rastreável e focado no escopo da fase.
- Mudanças de documentação podem ser feitas separadamente, mas qualquer alteração de código produtivo, teste, schema, configuração, workflow, script ou infraestrutura entra nessa regra.
- Se o workspace não estiver em um repositório Git válido, a implementação de código deve parar até o repositório local ser inicializado ou configurado.
- Se não houver remoto configurado, a implementação de código deve parar antes do push/PR e registrar o bloqueio.
- Não fazer merge direto na branch principal.

## 24. Regras de teste e validação

Toda implementação deve incluir testes proporcionais ao risco e ao escopo alterado. A validação mínima antes de commit/push/PR é:

```text
1. Instalar dependências conforme lockfile do projeto.
2. Rodar typecheck TypeScript.
3. Rodar lint.
4. Rodar testes unitários.
5. Rodar testes de integração locais quando a fase tocar rotas, D1, Queue, Durable Objects ou clients externos.
6. Rodar validação Wrangler quando a fase tocar Worker, bindings, configuração Cloudflare ou código de runtime.
7. Revisar diff final.
```

Comandos esperados, ajustáveis ao `package.json` real do projeto:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm wrangler deploy --dry-run
```

Regras específicas:

- Testes automatizados não devem chamar Amazon SP-API real nem Keepa real; usar mocks/fakes determinísticos.
- Clients Amazon devem ter testes de autorização LWA, payload, batch de até 20, retry/backoff, erro `429`, erro `403`, erro `400` sanitizado e erro `5xx`.
- Product Fees deve ser tratado e testado como estimativa, não como fee final garantida.
- Client Keepa deve ter testes para `/token`, cálculo de tokens esperados, `rating=1`, `buybox=1`, `offers` inteiro `20–100`, batch máximo de 20 ASINs com `offers`, ausência de `buybox` quando `offers` estiver presente, saldo insuficiente e reagendamento.
- Parser Keepa deve ter testes para `csv` raw como `int[][]` indexado por `CsvType`, sem assumir chaves textuais como `AMAZON` ou `SALES` no payload raw.
- `/search` com `asins-only` exige SMOKE real controlado antes de uso produtivo; validar shape enxuto de ASINs, payload retornado e impacto de tokens.
- Datas e quebras semânticas Keepa devem ser cobertas por testes ou fixtures: `April 9th 2025` para `ratingCount` e `Feb 16th 2026` para `CsvType.NEW` sem shipping histórico.
- Preços de planos Keepa não devem entrar em testes, documentação operacional ou decisões comerciais sem confirmação no portal autenticado.
- Parser de planilha deve ter testes para CSV, XLSX quando implementado, ASIN inválido, custo inválido, duplicidade e limite de 100 ASINs.
- Cálculos devem ter testes para Pack, custo ajustado, preço validado, divergência de preço, prep fee, net profit e ROI.
- Exportação deve ter testes para JSON/CSV/XLSX quando implementado.
- Segurança deve ter testes ou verificações para garantir que `Authorization`, `x-amz-access-token`, `KEEPA_API_KEY` e segredos LWA não aparecem em logs, mensagens de erro ou payloads persistidos.
- Migrações D1 devem ser validadas localmente antes de PR quando houver mudança de schema.
- Qualquer correção de bug deve incluir teste de regressão cobrindo o comportamento corrigido.
- Se algum comando não puder ser executado, o motivo deve ser registrado no PR e no relatório final da tarefa.

Critério de conclusão:

```text
Uma fase só é considerada concluída quando:
1. O escopo implementado corresponde ao SDD.
2. Os testes e validações aplicáveis foram executados.
3. O diff foi revisado.
4. O commit local existe.
5. O commit foi enviado para o remoto.
6. O PR de auditoria foi aberto.
```

## 25. Roadmap de implementação para Codex

### Fase 1 — Setup

- Criar projeto Cloudflare Worker TypeScript.
- Configurar Wrangler.
- Criar bindings D1, R2, Queue e Durable Objects.
- Criar schema SQL.
- Criar rota healthcheck.
- Criar scaffold MCP para expor ferramentas ao agente GPT no Workspace.

### Fase 2 — Parser de planilha

- Implementar parser CSV.
- Implementar parser XLSX se necessário.
- Normalizar campos.
- Validar limite de 100 ASINs.
- Criar job e job_items.

### Fase 3 — Keepa

- Implementar `/token`.
- Implementar `/product` com `stats=90&buybox=1&rating=1&history=0`.
- Mapear rating, review count, BSR, drops, Buy Box e `csv` raw como `int[][]` indexado por `CsvType`.
- Implementar fallback `offers=20` sem `buybox`, com batch máximo de 20 ASINs.
- Implementar SMOKE obrigatório para `/search` com `asins-only` antes de usar busca em produção.

### Fase 4 – Amazon SP-API

- Implementar LWA token refresh.
- Implementar autenticação Amazon SP-API usando LWA access token.
- Não implementar SigV4, IAM Role ou AWS credentials.
- Implementar `getCompetitiveSummary`.
- Implementar `getMyFeesEstimates`.
- Adicionar retries e backoff.

### Fase 5 — Cálculos

- Implementar detecção de Pack.
- Implementar validação de preço.
- Implementar net profit.
- Implementar ROI.
- Implementar filtros de lucro positivo.

### Fase 6 — Exportação

- Implementar JSON results.
- Implementar CSV export.
- Implementar XLSX export, se necessário.

### Fase 7 — Observabilidade e hardening

- Logs estruturados.
- Métricas.
- Testes unitários.
- Testes com 5, 20 e 100 ASINs.
- Teste de saldo Keepa insuficiente.
- Teste de divergência Amazon vs Keepa.

## 26. Prompt inicial sugerido para Codex

```text
Build a Cloudflare Workers TypeScript backend and MCP connector for a sourcing analyzer.

Use this SDD as internal project specification. Official documentation and authenticated API behavior override this document when they conflict.

Implement the project in phases:
1. Project scaffold with Wrangler, D1 schema, Queue and Durable Object bindings.
2. MCP connector tools for the GPT agent to submit spreadsheet data, check job status, and retrieve results.
3. Internal Job API with POST /jobs, GET /jobs/:id and GET /jobs/:id/results to support the MCP connector.
4. CSV input parser with max 100 ASIN validation.
5. Keepa client for /token and /product with domain=2, stats=90, buybox=1, rating=1, history=0.
6. Amazon SP-API client with LWA refresh token, getCompetitiveSummary and getMyFeesEstimates.
7. Pack detection, price validation, fee estimates, prep fee, net profit and ROI calculation.
8. CSV result export.

The GPT agent chat is the operational frontend. Do not build a separate web UI, dashboard, or upload interface in this phase.

Keep credentials in Cloudflare secrets only. Do not expose secrets in logs. Use TypeScript types and unit tests for pack detection, price validation and ROI calculation.

Use docs/reference/keepa-api-guide.md as the internal Keepa reference. Treat Keepa raw product csv as int[][] indexed by CsvType. Send offers as an integer 20-100 only in fallback requests, never together with buybox, and limit offers requests to 20 ASINs. Do not treat Keepa plan prices as confirmed until verified in the authenticated Keepa portal. Run a controlled smoke test before relying on /search with asins-only.

Every code implementation or code edit must be committed locally, pushed to the remote branch, and submitted through a Pull Request for audit. Run and report the applicable validation commands before opening the PR.
```

## 27. Decisões finais consolidadas

- Cloudflare Worker será o orquestrador.
- O projeto será usado como conector MCP no Workspace do usuário.
- O agente GPT no chat será a interface operacional; não haverá frontend web próprio nesta fase.
- Lote máximo inicial: 100 ASINs por job.
- Amazon SP-API será fonte principal para Buy Box atual e estimativas de fees.
- Amazon SP-API deve usar apenas LWA access token neste projeto.
- Keepa será fonte para reviews, rating, BSR, drops, seller/offer count e validação secundária da Buy Box.
- Keepa principal: `stats=90&buybox=1&rating=1&history=0`.
- Keepa offers: fallback controlado, não primeira chamada em massa, `offers` inteiro entre `20–100`, batch máximo de 20 ASINs e sem `buybox`.
- Keepa raw `csv`: array bidimensional `int[][]` indexado por `CsvType`, não objeto com chaves textuais.
- Datas Keepa confirmadas: `ratingCount` sem atualização desde `April 9th 2025`; `CsvType.NEW` sem shipping em coletas anteriores a `Feb 16th 2026`.
- Webhook Keepa confirmado em `Request.java`: resposta HTTP `200`; retry único após `15 seconds` se a entrega falhar.
- Preços dos planos Keepa permanecem pendentes até confirmação no portal autenticado.
- `/search` com `asins-only` exige SMOKE real controlado antes de uso produtivo.
- Resultado final: apenas net profit positivo.
- Prep fee fixa: £0.55.
- Pack no título multiplica o custo do fornecedor.
- Toda implementação ou edição de código deve terminar com commit local, push e Pull Request aberto para auditoria.
- Toda implementação deve executar e registrar testes/validações aplicáveis antes do PR.
