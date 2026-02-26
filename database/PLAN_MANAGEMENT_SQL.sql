-- ============================================================================
-- COMANDOS SQL ÚTEIS PARA GERENCIAR PLANOS
-- Execute estes comandos no Supabase SQL Editor
-- ============================================================================

-- 1. VER SEU CLINIC_ID
-- Execute primeiro para descobrir seu clinic_id
SELECT id, name FROM clinics;

-- 2. VER SUBSCRIPTION ATUAL
-- Substitua 'SEU_CLINIC_ID' pelo ID da sua clínica
SELECT 
  clinic_id,
  plan_key,
  status,
  current_period_end,
  stripe_customer_id,
  created_at
FROM subscriptions 
WHERE clinic_id = 'SEU_CLINIC_ID';

-- ============================================================================
-- ADICIONAR/ATUALIZAR PLANOS
-- ============================================================================

-- 3. ADICIONAR PLANO CLINIC PRO (mais completo)
INSERT INTO subscriptions (
  clinic_id,
  plan_key,
  status,
  current_period_end
) VALUES (
  'SEU_CLINIC_ID',
  'clinic_pro',
  'active',
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (clinic_id) 
DO UPDATE SET
  plan_key = 'clinic_pro',
  status = 'active',
  current_period_end = NOW() + INTERVAL '1 year',
  updated_at = NOW();

-- 4. ADICIONAR PLANO PROFISSIONAL
INSERT INTO subscriptions (
  clinic_id,
  plan_key,
  status,
  current_period_end
) VALUES (
  'SEU_CLINIC_ID',
  'profissional',
  'active',
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (clinic_id) 
DO UPDATE SET
  plan_key = 'profissional',
  status = 'active',
  current_period_end = NOW() + INTERVAL '1 year',
  updated_at = NOW();

-- 5. ADICIONAR PLANO ESSENCIAL
INSERT INTO subscriptions (
  clinic_id,
  plan_key,
  status,
  current_period_end
) VALUES (
  'SEU_CLINIC_ID',
  'essencial',
  'active',
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (clinic_id) 
DO UPDATE SET
  plan_key = 'essencial',
  status = 'active',
  current_period_end = NOW() + INTERVAL '1 year',
  updated_at = NOW();

-- 6. ADICIONAR PLANO FUNDADOR
INSERT INTO subscriptions (
  clinic_id,
  plan_key,
  status,
  current_period_end
) VALUES (
  'SEU_CLINIC_ID',
  'fundador',
  'active',
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (clinic_id) 
DO UPDATE SET
  plan_key = 'fundador',
  status = 'active',
  current_period_end = NOW() + INTERVAL '1 year',
  updated_at = NOW();

-- ============================================================================
-- ATUALIZAR PLANOS EXISTENTES
-- ============================================================================

-- 7. UPGRADE PARA CLINIC PRO (apenas muda o plano)
UPDATE subscriptions
SET 
  plan_key = 'clinic_pro',
  updated_at = NOW()
WHERE clinic_id = 'SEU_CLINIC_ID';

-- 8. ESTENDER PERÍODO DA ASSINATURA
UPDATE subscriptions
SET 
  current_period_end = NOW() + INTERVAL '1 year',
  updated_at = NOW()
WHERE clinic_id = 'SEU_CLINIC_ID';

-- 9. ATIVAR ASSINATURA INATIVA
UPDATE subscriptions
SET 
  status = 'active',
  current_period_end = NOW() + INTERVAL '1 month',
  updated_at = NOW()
WHERE clinic_id = 'SEU_CLINIC_ID';

-- ============================================================================
-- CONSULTAS ÚTEIS
-- ============================================================================

-- 10. VER TODAS AS ASSINATURAS ATIVAS
SELECT 
  s.clinic_id,
  c.name as clinic_name,
  s.plan_key,
  s.status,
  s.current_period_end,
  CASE 
    WHEN s.current_period_end > NOW() THEN 'Válido'
    ELSE 'Expirado'
  END as period_status
FROM subscriptions s
JOIN clinics c ON c.id = s.clinic_id
WHERE s.status = 'active'
ORDER BY s.current_period_end DESC;

-- 11. VER ASSINATURAS POR PLANO
SELECT 
  plan_key,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count
FROM subscriptions
GROUP BY plan_key;

-- 12. VER ASSINATURAS EXPIRANDO EM 30 DIAS
SELECT 
  s.clinic_id,
  c.name as clinic_name,
  s.plan_key,
  s.current_period_end,
  DATE_PART('day', s.current_period_end - NOW()) as days_remaining
FROM subscriptions s
JOIN clinics c ON c.id = s.clinic_id
WHERE s.status = 'active'
  AND s.current_period_end BETWEEN NOW() AND NOW() + INTERVAL '30 days'
ORDER BY s.current_period_end ASC;

-- ============================================================================
-- TESTES E DEBUGGING
-- ============================================================================

-- 13. CRIAR SUBSCRIPTION DE TESTE (trial)
INSERT INTO subscriptions (
  clinic_id,
  plan_key,
  status,
  current_period_end
) VALUES (
  'SEU_CLINIC_ID',
  'profissional',
  'trialing',
  NOW() + INTERVAL '14 days' -- trial de 14 dias
)
ON CONFLICT (clinic_id) 
DO UPDATE SET
  plan_key = 'profissional',
  status = 'trialing',
  current_period_end = NOW() + INTERVAL '14 days',
  updated_at = NOW();

-- 14. CANCELAR ASSINATURA
UPDATE subscriptions
SET 
  status = 'canceled',
  updated_at = NOW()
WHERE clinic_id = 'SEU_CLINIC_ID';

-- 15. SIMULAR PAGAMENTO ATRASADO
UPDATE subscriptions
SET 
  status = 'past_due',
  updated_at = NOW()
WHERE clinic_id = 'SEU_CLINIC_ID';

-- ============================================================================
-- LIMPEZA (USE COM CUIDADO!)
-- ============================================================================

-- 16. REMOVER ASSINATURA (CUIDADO!)
DELETE FROM subscriptions 
WHERE clinic_id = 'SEU_CLINIC_ID';

-- ============================================================================
-- EXEMPLOS PRÁTICOS
-- ============================================================================

-- Exemplo 1: Migrar do banco para o plano atual baseado em price_id
UPDATE subscriptions 
SET plan_key = CASE 
  WHEN stripe_price_id = 'price_1T1u6yJYiR3z852l0On1iDB8' THEN 'essencial'
  WHEN stripe_price_id = 'price_1T1u7NJYiR3z852l5i0HzOB1' THEN 'profissional'
  WHEN stripe_price_id = 'price_1T1u7gJYiR3z852lekEuaVn4' THEN 'clinic_pro'
  WHEN stripe_price_id = 'price_1T1u82JYiR3z852lxIG5dDj5' THEN 'fundador'
  ELSE plan_key
END
WHERE stripe_price_id IS NOT NULL;

-- Exemplo 2: Dar upgrade gratuito para todos os fundadores
UPDATE subscriptions
SET 
  plan_key = 'clinic_pro',
  status = 'active',
  current_period_end = NOW() + INTERVAL '100 years' -- lifetime
WHERE plan_key = 'fundador';

-- Exemplo 3: Ver clínicas sem assinatura
SELECT 
  c.id,
  c.name,
  c.created_at
FROM clinics c
LEFT JOIN subscriptions s ON s.clinic_id = c.id
WHERE s.id IS NULL;

-- Exemplo 4: Criar assinatura para clínicas sem subscription (com plano gratuito trial)
INSERT INTO subscriptions (clinic_id, plan_key, status, current_period_end)
SELECT 
  c.id,
  'essencial',
  'trialing',
  NOW() + INTERVAL '7 days'
FROM clinics c
LEFT JOIN subscriptions s ON s.clinic_id = c.id
WHERE s.id IS NULL
ON CONFLICT (clinic_id) DO NOTHING;
