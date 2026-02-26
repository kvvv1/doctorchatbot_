# Billing & Subscription System (Stripe)

Sistema de assinatura recorrente com Stripe para o Doctor Chat Bot.

## Visão Geral

O sistema implementa cobrança mensal com bloqueio automático de funcionalidades quando a assinatura está inativa.

### Status de Assinatura

- **`inactive`** - Sem assinatura ativa (padrão)
- **`active`** - Assinatura ativa e paga
- **`trialing`** - Período de teste (tratado como ativo)
- **`past_due`** - Pagamento atrasado (funcionalidades bloqueadas)
- **`canceled`** - Assinatura cancelada (funcionalidades bloqueadas)

### Funcionalidades Bloqueadas

Quando a assinatura **NÃO** está ativa (status != `active` e != `trialing`):

1. **Roteamento do Dashboard**: Redireciona para `/dashboard/billing`
2. **Envio de mensagens**: `/api/zapi/send-text` retorna 402
3. **Conexão WhatsApp**: `/api/zapi/connect` retorna 402
4. **Reconexão WhatsApp**: `/api/zapi/reconnect` retorna 402
5. **Banner de aviso**: Exibido no topo do dashboard

---

## Estrutura do Banco de Dados

### Tabela `subscriptions`

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  clinic_id UUID UNIQUE NOT NULL REFERENCES clinics(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Migração**: `database/migrations/009_create_subscriptions.sql`

**RLS**: Clinics podem ver apenas sua própria assinatura. Webhooks usam service role.

---

## Configuração do Stripe

### 1. Criar Conta no Stripe

1. Acesse [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Crie uma conta
3. Ative o modo de teste durante o desenvolvimento

### 2. Obter Chaves da API

1. Acesse [https://dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
2. Copie:
   - **Publishable key** (começa com `pk_test_...`)
   - **Secret key** (começa com `sk_test_...`)

### 3. Criar Produto e Preço

1. Acesse [https://dashboard.stripe.com/products](https://dashboard.stripe.com/products)
2. Clique em **+ Add product**
3. Preencha:
   - **Name**: `Plano Starter`
   - **Description**: `Plano mensal para clínicas`
   - **Pricing model**: `Standard pricing`
   - **Price**: `97.00 BRL`
   - **Billing period**: `Monthly`
4. Salve e copie o **Price ID** (formato: `price_xxxxxxxxxxxx`)

### 4. Configurar Webhook

#### Desenvolvimento Local (Stripe CLI)

```powershell
# Instalar Stripe CLI
# Download: https://github.com/stripe/stripe-cli/releases

# Login
stripe login

# Forward webhooks para localhost
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copie o webhook signing secret (whsec_...)
```

#### Produção

1. Acesse [https://dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Clique em **+ Add endpoint**
3. **Endpoint URL**: `https://seu-dominio.com/api/webhooks/stripe`
4. **Events to send**:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copie o **Signing secret** (começa com `whsec_...`)

### 5. Configurar Variáveis de Ambiente

Adicione no `.env.local`:

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs
STRIPE_PRICE_ID_STARTER=price_...

# App URL
APP_URL=http://localhost:3000  # ou https://seu-dominio.com
```

---

## Fluxo de Assinatura

### 1. Usuário Assina

1. Usuário acessa `/pricing`
2. Clica em "Assinar agora"
3. É redirecionado para Stripe Checkout
4. Preenche dados do cartão
5. Stripe processa pagamento
6. Webhook `checkout.session.completed` é disparado
7. Webhook `customer.subscription.created` é disparado
8. Sistema atualiza `subscriptions.status = 'active'`
9. Usuário é redirecionado para `/dashboard?payment=success`

### 2. Renovação Automática

1. Stripe cobra automaticamente todo mês
2. Se pagamento suceder:
   - Webhook `invoice.payment_succeeded`
   - `subscriptions.status = 'active'`
3. Se pagamento falhar:
   - Webhook `invoice.payment_failed`
   - `subscriptions.status = 'past_due'`
   - Funcionalidades são bloqueadas

### 3. Cancelamento

1. Usuário acessa `/dashboard/billing`
2. Clica em "Gerenciar pagamento"
3. É redirecionado para Stripe Customer Portal
4. Cancela assinatura
5. Webhook `customer.subscription.deleted`
6. `subscriptions.status = 'canceled'`
7. Funcionalidades são bloqueadas imediatamente

---

## Endpoints da API

### POST `/api/stripe/create-checkout-session`

Cria sessão de checkout para assinatura.

**Response**:
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

---

### POST `/api/stripe/create-portal-session`

Cria sessão do portal do cliente para gerenciar assinatura.

**Response**:
```json
{
  "url": "https://billing.stripe.com/..."
}
```

---

### POST `/api/webhooks/stripe`

Recebe eventos do Stripe.

**Headers**:
- `stripe-signature`: Assinatura do webhook (validada automaticamente)

**Eventos Processados**:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

---

## Guards e Middleware

### `requireActiveSubscription()`

Guard para páginas do dashboard que requerem assinatura ativa.

**Uso**:
```typescript
import { requireActiveSubscription } from '@/lib/auth/requireActiveSubscription'

export default async function DashboardPage() {
  const session = await requireActiveSubscription()
  // ... resto do código
}
```

**Comportamento**:
- ✅ Se assinatura ativa: retorna session
- ❌ Se assinatura inativa: redireciona para `/dashboard/billing`

---

### `assertSubscriptionActive(clinicId)`

Assertion para endpoints de API.

**Uso**:
```typescript
import { assertSubscriptionActive } from '@/lib/services/subscriptionService'

export async function POST(request: Request) {
  // ... obter clinicId ...
  
  try {
    await assertSubscriptionActive(clinicId)
  } catch (error) {
    return NextResponse.json(
      { error: 'Assinatura inativa' },
      { status: 402 }
    )
  }
  
  // ... resto do código ...
}
```

**Comportamento**:
- ✅ Se assinatura ativa: continua execução
- ❌ Se assinatura inativa: lança erro

---

## Páginas

### `/pricing`

Página pública de preços.

- Mostra plano Starter (R$ 97/mês)
- Botão "Assinar agora" (redireciona para checkout)
- Se usuário já tem assinatura ativa: redireciona para `/dashboard`

---

### `/dashboard/billing`

Página de gerenciamento de assinatura.

- Mostra status atual
- Próxima data de cobrança
- Botão "Assinar agora" (se inativa)
- Botão "Gerenciar pagamento" (se ativa)

**Acessível mesmo sem assinatura ativa** (única exceção no dashboard).

---

## Testes

### Cartões de Teste

Use estes números de cartão no ambiente de teste:

| Cartão | Número | Resultado |
|--------|--------|-----------|
| Sucesso | `4242 4242 4242 4242` | Pagamento aprovado |
| Falha | `4000 0000 0000 0002` | Pagamento recusado |
| 3D Secure | `4000 0027 6000 3184` | Requer autenticação |

**CVV**: qualquer 3 dígitos  
**Data de validade**: qualquer data futura  
**CEP**: qualquer CEP válido

---

## Troubleshooting

### Webhook não está funcionando localmente

```powershell
# Verifique se o Stripe CLI está rodando
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Teste manualmente um evento
stripe trigger customer.subscription.created
```

---

### Status não está atualizando após pagamento

1. Verifique os logs do servidor (`npm run dev`)
2. Verifique eventos no [Dashboard do Stripe](https://dashboard.stripe.com/events)
3. Teste o webhook manualmente:
   ```powershell
   stripe trigger invoice.payment_succeeded
   ```

---

### Erro "STRIPE_WEBHOOK_SECRET not configured"

1. Execute `stripe listen --forward-to ...`
2. Copie o signing secret (`whsec_...`)
3. Adicione no `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. Reinicie o servidor

---

### Erro "No customer found"

O usuário ainda não tem uma assinatura criada. Siga o fluxo:
1. Acesse `/pricing`
2. Clique em "Assinar agora"
3. Complete o checkout

---

## Migração para Produção

### 1. Ativar Modo Produção no Stripe

1. Acesse [https://dashboard.stripe.com](https://dashboard.stripe.com)
2. Desative "Test mode" (canto superior direito)
3. Complete as informações da empresa
4. Configure método de pagamento para receber fundos

### 2. Obter Chaves de Produção

1. Acesse [https://dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
2. Copie as chaves de **produção** (começam com `sk_live_` e `pk_live_`)

### 3. Criar Webhook de Produção

1. Acesse [https://dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Adicione endpoint: `https://seu-dominio.com/api/webhooks/stripe`
3. Copie o signing secret

### 4. Atualizar Variáveis de Ambiente

No servidor de produção:

```bash
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_STARTER=price_...
APP_URL=https://seu-dominio.com
```

### 5. Testar em Produção

1. Crie uma conta de teste
2. Faça uma assinatura real (será cobrado)
3. Verifique se o status atualiza corretamente
4. Cancele a assinatura (será reembolsado se dentro do período de teste)

---

## Segurança

### ✅ Boas Práticas

- ✅ Validação de assinatura do webhook com `stripe.webhooks.constructEvent()`
- ✅ Service role key usado apenas em webhooks
- ✅ Checks server-side em todos os endpoints críticos
- ✅ RLS habilitado na tabela `subscriptions`
- ✅ Status 402 (Payment Required) para funcionalidades bloqueadas

### ⚠️ Nunca Faça

- ❌ Expor `STRIPE_SECRET_KEY` no client
- ❌ Confiar apenas em checks client-side
- ❌ Usar webhook sem validar assinatura
- ❌ Commit de chaves reais no Git

---

## Suporte

- **Documentação Stripe**: [https://stripe.com/docs](https://stripe.com/docs)
- **Dashboard Stripe**: [https://dashboard.stripe.com](https://dashboard.stripe.com)
- **Stripe CLI**: [https://stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli)

---

## Checklist de Implementação

- [x] Migração do banco de dados
- [x] Variáveis de ambiente configuradas
- [x] Página `/pricing` criada
- [x] Endpoint de checkout criado
- [x] Webhook configurado e testado
- [x] Guards aplicados nas páginas
- [x] Checks aplicados nos endpoints de API
- [x] Página `/dashboard/billing` criada
- [x] Portal de gerenciamento configurado
- [x] Banner de aviso adicionado
- [x] Documentação completa

---

**Implementação concluída em**: 2026-02-17
