# Sistema de Restrição por Plano - Guia de Implementação

## ✅ O que foi implementado

### 1. Migration de Banco de Dados
- ✅ Arquivo: `database/migrations/010_add_plan_key_to_subscriptions.sql`
- ✅ Adicionada coluna `plan_key` na tabela `subscriptions`
- ✅ Constraint para validar valores: 'essencial', 'profissional', 'clinic_pro', 'fundador'
- ✅ Atualizado `all-migrations.sql`

### 2. Tipos TypeScript
- ✅ Arquivo: `src/lib/types/database.ts`
- ✅ Adicionado tipo `PlanKey`
- ✅ Atualizada interface `Subscription` com campo `plan_key`

### 3. Sistema de Features
- ✅ Arquivo: `src/lib/services/planFeatures.ts`
- ✅ Enum `PlanFeature` com todas as features disponíveis
- ✅ Configuração `PLAN_FEATURES` - quais features cada plano tem acesso
- ✅ Configuração `PLAN_LIMITS` - limites numéricos por plano
- ✅ Funções helpers para verificar acesso e limites

### 4. Subscription Service
- ✅ Arquivo: `src/lib/services/subscriptionService.ts`
- ✅ `checkSubscription()` agora retorna `planKey`
- ✅ `checkFeatureAccess()` - verifica se tem acesso a uma feature
- ✅ `assertFeatureAccess()` - throws error se não tiver acesso
- ✅ `checkPlanLimit()` - verifica se está dentro do limite

### 5. Webhook do Stripe
- ✅ Arquivo: `src/app/api/webhooks/stripe/route.ts`
- ✅ `handleCheckoutCompleted` salva `plan_key` do metadata
- ✅ `handleSubscriptionChange` salva `plan_key` do metadata

## 📦 Como usar

### 1. Rodar a Migration

No Supabase SQL Editor, execute:

```sql
-- Execute esta migration
ALTER TABLE subscriptions 
  ADD COLUMN IF NOT EXISTS plan_key TEXT;

ALTER TABLE subscriptions
  ADD CONSTRAINT check_plan_key 
  CHECK (plan_key IN ('essencial', 'profissional', 'clinic_pro', 'fundador') OR plan_key IS NULL);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_key ON subscriptions(plan_key);
```

### 2. Adicionar plano manualmente (para testes)

```sql
-- Exemplo: Dar o plano Clinic Pro para sua clínica
UPDATE subscriptions 
SET plan_key = 'clinic_pro',
    status = 'active',
    current_period_end = NOW() + INTERVAL '1 year'
WHERE clinic_id = 'SEU_CLINIC_ID';
```

### 3. Verificar feature em Server Components

```typescript
import { checkFeatureAccess } from '@/lib/services/subscriptionService'
import { PlanFeature } from '@/lib/services/planFeatures'

export default async function MyPage() {
  const session = await getSessionProfile()
  
  // Verificar se tem acesso
  const hasCalendar = await checkFeatureAccess(
    session.clinic.id, 
    PlanFeature.CALENDAR_INTEGRATION
  )
  
  return (
    <div>
      {hasCalendar ? (
        <CalendarWidget />
      ) : (
        <UpgradePrompt feature="Integração com Google Calendar" />
      )}
    </div>
  )
}
```

### 4. Verificar feature em API Routes

```typescript
import { assertFeatureAccess } from '@/lib/services/subscriptionService'
import { PlanFeature } from '@/lib/services/planFeatures'

export async function POST(request: Request) {
  const session = await getSessionProfile()
  
  // Throws error se não tiver acesso
  try {
    await assertFeatureAccess(
      session.clinic.id,
      PlanFeature.ADVANCED_REPORTS
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Esta feature requer upgrade de plano' },
      { status: 403 }
    )
  }
  
  // Continuar com a lógica...
}
```

### 5. Verificar limites

```typescript
import { checkPlanLimit, checkSubscription } from '@/lib/services/subscriptionService'

export default async function TeamPage() {
  const session = await getSessionProfile()
  
  // Buscar quantidade atual de atendentes
  const currentAttendants = await getCurrentAttendantsCount(session.clinic.id)
  
  // Verificar se pode adicionar mais
  const canAddMore = await checkPlanLimit(
    session.clinic.id,
    'maxAttendants',
    currentAttendants
  )
  
  // Ou pegar o plano e verificar diretamente
  const subscription = await checkSubscription(session.clinic.id)
  const limit = getPlanLimit(subscription.planKey, 'maxAttendants')
  
  return (
    <div>
      <p>Atendentes: {currentAttendants} / {limit === -1 ? '∞' : limit}</p>
      <button disabled={!canAddMore}>
        Adicionar Atendente
      </button>
    </div>
  )
}
```

### 6. Client Component com feature check

```typescript
'use client'

import { hasFeatureAccess, PlanFeature, type PlanKey } from '@/lib/services/planFeatures'

interface Props {
  planKey: PlanKey | null
}

export function FeatureButton({ planKey }: Props) {
  const hasAccess = hasFeatureAccess(planKey, PlanFeature.CUSTOM_API)
  
  if (!hasAccess) {
    return (
      <div className="opacity-50">
        <button disabled>API Personalizada</button>
        <p className="text-sm">Disponível no plano Clinic Pro</p>
      </div>
    )
  }
  
  return <button>Acessar API</button>
}
```

## 🎯 Features Disponíveis

```typescript
enum PlanFeature {
  BOT_ENABLED = 'bot_enabled',
  BOT_CUSTOM_FLOWS = 'bot_custom_flows',
  CALENDAR_INTEGRATION = 'calendar_integration',
  CALENDAR_AUTO_CONFIRMATION = 'calendar_auto_confirmation',
  MULTIPLE_ATTENDANTS = 'multiple_attendants',
  UNLIMITED_ATTENDANTS = 'unlimited_attendants',
  ADVANCED_REPORTS = 'advanced_reports',
  NO_SHOW_AUTOMATION = 'no_show_automation',
  CUSTOM_API = 'custom_api',
  WHITELABEL = 'whitelabel',
  PRIORITY_SUPPORT = 'priority_support',
  DEDICATED_SUPPORT = 'dedicated_support',
}
```

## 📊 Planos e Features

### Essencial (R$ 397)
- ✅ `BOT_ENABLED`
- Limite: 1 atendente, 500 conversas/mês, 20 respostas rápidas

### Profissional (R$ 597)
- ✅ `BOT_ENABLED`
- ✅ `BOT_CUSTOM_FLOWS`
- ✅ `CALENDAR_INTEGRATION`
- ✅ `CALENDAR_AUTO_CONFIRMATION`
- ✅ `MULTIPLE_ATTENDANTS`
- ✅ `ADVANCED_REPORTS`
- ✅ `PRIORITY_SUPPORT`
- Limite: 5 atendentes, 2000 conversas/mês, 50 respostas rápidas

### Clinic Pro (R$ 997)
- ✅ Todas as features acima
- ✅ `UNLIMITED_ATTENDANTS`
- ✅ `NO_SHOW_AUTOMATION`
- ✅ `CUSTOM_API`
- ✅ `WHITELABEL`
- ✅ `DEDICATED_SUPPORT`
- Limite: Ilimitado

### Fundador (R$ 297)
- ✅ `BOT_ENABLED`
- ✅ `PRIORITY_SUPPORT`
- Limite: 1 atendente, 500 conversas/mês, 20 respostas rápidas

## 🔧 Funções Úteis

```typescript
// Verificar uma feature
hasFeatureAccess(planKey, feature): boolean

// Verificar múltiplas features (todas)
hasAllFeatures(planKey, [feature1, feature2]): boolean

// Verificar múltiplas features (pelo menos uma)
hasAnyFeature(planKey, [feature1, feature2]): boolean

// Verificar limite
isWithinLimit(planKey, 'maxAttendants', currentValue): boolean

// Obter valor do limite
getPlanLimit(planKey, 'maxAttendants'): number

// Obter todas as features de um plano
getPlanFeatures(planKey): Set<PlanFeature>

// Obter nome legível da feature
getFeatureName(PlanFeature.CALENDAR_INTEGRATION): string
```

## 🚀 Próximos Passos

1. **Aplicar restrições nas páginas existentes:**
   - Dashboard de conversas
   - Configurações de bot
   - Página de agenda
   - Configurações de equipe

2. **Criar componentes de upgrade:**
   - `<UpgradePrompt />` - Banner para fazer upgrade
   - `<FeatureGate />` - Wrapper que bloqueia features
   - `<PlanBadge />` - Mostra o plano atual

3. **Adicionar analytics:**
   - Tracking de features bloqueadas
   - Conversão de upgrade por feature

4. **Melhorias futuras:**
   - Trial periods automáticos
   - Downgrade flow
   - Usage-based billing

## ⚠️ Importante

- O `plan_key` é salvo automaticamente via webhook do Stripe quando o checkout é concluído
- Para testes locais, insira manualmente via SQL
- Sempre verifique se `planKey` não é `null` antes de usar
- Features não implementadas fisicamente ainda podem ser verificadas (preparação futura)
