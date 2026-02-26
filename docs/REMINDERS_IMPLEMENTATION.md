# Sistema de Notificações e Lembretes Automáticos

Sistema completo de lembretes via WhatsApp e notificações in-app para reduzir no-show e melhorar o engajamento.

## 🎯 Funcionalidades Implementadas

### 1. **Lembretes Automáticos via WhatsApp**
- ✅ **48h antes (2 dias)** - Pedido de confirmação
- ✅ **24h antes (1 dia)** - Lembrete principal
- ✅ **2h antes** - Lembrete final
- ✅ **1h antes** - Opcional (desabilitado por padrão)

### 2. **Notificações In-App**
- ✅ Nova conversa chegou
- ✅ Conversa aguardando resposta
- ✅ Sem resposta há 24h
- ✅ Consulta confirmada
- ✅ Consulta cancelada

### 3. **Templates Personalizáveis**
- ✅ Templates com variáveis dinâmicas
- ✅ Customização por clínica
- ✅ Teste e preview de mensagens

---

## 📋 Estrutura do Banco de Dados

### Tabelas Criadas

#### `reminders`
Armazena lembretes agendados que serão enviados via WhatsApp.

```sql
- id (UUID)
- clinic_id (UUID) -> clinics
- appointment_id (UUID) -> appointments
- type ('appointment_24h' | 'appointment_2h' | 'appointment_1h' | 'confirmation_request')
- scheduled_for (TIMESTAMPTZ) -- Quando enviar
- sent_at (TIMESTAMPTZ) -- Quando foi enviado
- status ('pending' | 'sent' | 'failed' | 'canceled')
- recipient_phone (TEXT)
- message_template (TEXT) -- Template com variáveis
- message_sent (TEXT) -- Mensagem final enviada
- response_received (BOOLEAN)
- response_content (TEXT) -- Resposta do paciente (SIM/NAO)
```

#### `notifications`
Notificações in-app para usuários do dashboard.

```sql
- id (UUID)
- clinic_id (UUID)
- user_id (UUID) -> auth.users (nullable)
- type ('new_conversation' | 'conversation_waiting' | 'no_response_24h' | etc)
- title (TEXT)
- message (TEXT)
- link (TEXT) -- URL para ação
- read (BOOLEAN)
- read_at (TIMESTAMPTZ)
```

#### `notification_settings`
Configurações e templates por clínica.

```sql
- clinic_id (UUID) UNIQUE
- reminder_24h_enabled (BOOLEAN)
- reminder_24h_template (TEXT)
- reminder_2h_enabled (BOOLEAN)
- reminder_2h_template (TEXT)
- reminder_1h_enabled (BOOLEAN)
- reminder_1h_template (TEXT)
- confirmation_enabled (BOOLEAN)
- confirmation_template (TEXT)
- confirmation_hours_before (INTEGER) -- Padrão: 48
```

---

## 🔄 Como Funciona

### Fluxo Completo

```
1. MÉDICO CRIA APPOINTMENT
   ↓
2. TRIGGER AUTOMÁTICO CRIA LEMBRETES
   - 48h antes: confirmation_request
   - 24h antes: appointment_24h
   - 2h antes: appointment_2h
   ↓
3. CRON JOB PROCESSA (a cada 10 min)
   - Busca lembretes cuja hora chegou
   - Preenche templates com dados reais
   - ENVIA VIA Z-API WHATSAPP
   - Marca como enviado
   ↓
4. PACIENTE RECEBE NO WHATSAPP
   ↓
5. PACIENTE RESPONDE (opcional)
   - "SIM" → Status vira 'confirmed'
   - "NÃO" → Status vira 'canceled'
```

### Exemplo Prático

**Cenário:** Consulta marcada para 19/02/2026 às 14:00

**Timeline:**
```
17/02/2026 14:00 (48h antes)
→ WhatsApp: "Olá João! Gostaria de confirmar sua consulta marcada para 19/02/2026 às 14:00?"

18/02/2026 14:00 (24h antes)
→ WhatsApp: "Olá João! Este é um lembrete de que você tem consulta agendada amanhã às 14:00."

19/02/2026 12:00 (2h antes)
→ WhatsApp: "Olá João! Lembrete: sua consulta é daqui a 2 horas (14:00). Chegue com 10 minutos de antecedência."
```

---

## 🚀 Setup e Configuração

### 1. Execute a Migration no Supabase

1. Acesse seu projeto no Supabase
2. Vá para SQL Editor
3. Execute o arquivo: `database/migrations/010_create_reminders_and_notifications.sql`

### 2. Configure o CRON_SECRET

No arquivo `.env.local`, o `CRON_SECRET` protege o endpoint de processamento:

```env
CRON_SECRET=dcb_2026_cron_xyz123abc456def789
```

**O que é?** Uma senha que impede que pessoas não autorizadas chamem seu endpoint e processem lembretes indevidamente.

**Como funciona?**
- O cron job envia o header: `Authorization: Bearer dcb_2026_cron_xyz123abc456def789`
- O endpoint valida: se não bater, retorna 401 Unauthorized

### 3. Configure o Cron Job

#### **Opção A: Vercel Cron** (Recomendado)

O arquivo `vercel.json` já está criado:

```json
{
  "crons": [{
    "path": "/api/reminders/process",
    "schedule": "*/10 * * * *"
  }]
}
```

**O que faz:** Chama `/api/reminders/process` a cada 10 minutos automaticamente.

**Como ativar:**
1. Faça deploy no Vercel: `vercel --prod`
2. O Vercel detecta o `vercel.json` automaticamente
3. Vá em Vercel Dashboard → Settings → Cron Jobs
4. Verifique que o cron está ativo

**⚠️ IMPORTANTE:** No Vercel Cron, o `Authorization` header é automaticamente injetado usando variáveis de ambiente. Adicione no Vercel Dashboard:
- Key: `CRON_SECRET`
- Value: `dcb_2026_cron_xyz123abc456def789`

#### **Opção B: GitHub Actions**

Crie `.github/workflows/cron-reminders.yml`:

```yaml
name: Process Reminders
on:
  schedule:
    - cron: '*/10 * * * *'  # A cada 10 minutos
  workflow_dispatch:  # Permite execução manual

jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - name: Call Reminders API
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/reminders/process \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Configure os Secrets no GitHub:
- `APP_URL`: https://seu-dominio.com
- `CRON_SECRET`: dcb_2026_cron_xyz123abc456def789

#### **Opção C: Serviço Externo (Cron-job.org)**

1. Acesse https://cron-job.org
2. Crie uma conta (grátis)
3. Add cronjob:
   - **Title:** Doctor Chat Bot Reminders
   - **URL:** https://seu-dominio.com/api/reminders/process
   - **Method:** POST
   - **Schedule:** Every 10 minutes
   - **Advanced → Headers:**
     ```
     Authorization: Bearer dcb_2026_cron_xyz123abc456def789
     ```

### 4. Teste o Sistema

#### Teste Manual do Endpoint

```bash
curl -X POST http://localhost:3000/api/reminders/process \
  -H "Authorization: Bearer dcb_2026_cron_xyz123abc456def789"
```

Resposta esperada:
```json
{
  "success": true,
  "processed": 0,
  "succeeded": 0,
  "failed": 0,
  "message": "Nenhum lembrete pendente"
}
```

#### Criar Appointment de Teste

No Supabase SQL Editor:

```sql
-- Cria um appointment para daqui a 2 horas (para testar lembrete de 2h antes)
INSERT INTO appointments (
  clinic_id,
  patient_phone,
  patient_name,
  starts_at,
  ends_at,
  status
) VALUES (
  'sua-clinic-id-aqui',
  '5511999999999',
  'Teste Paciente',
  NOW() + INTERVAL '2 hours 5 minutes',  -- Daqui 2h05min
  NOW() + INTERVAL '3 hours',
  'scheduled'
);
```

Aguarde 5 minutos e verifique:
```sql
SELECT * FROM reminders ORDER BY created_at DESC LIMIT 5;
```

Deve ter criado 4 lembretes (48h, 24h, 2h, confirmação).

Execute o cron manualmente e em 10 min o lembrete de 2h será enviado!

---

## 📱 Integração no Dashboard

### Adicionar NotificationBell no Topbar

Edite `src/app/dashboard/components/Topbar.tsx`:

```typescript
import NotificationBell from './NotificationBell'

export default function Topbar() {
  return (
    <div className="topbar">
      {/* ...outros elementos... */}
      
      {/* Adicione o sino de notificações */}
      <NotificationBell />
      
      {/* ...profile menu... */}
    </div>
  )
}
```

---

## 🎨 Customização de Templates

### Variáveis Disponíveis

Todos os templates suportam estas variáveis:

- `{name}` → Nome do paciente
- `{date}` → Data formatada (DD/MM/YYYY)
- `{time}` → Hora formatada (HH:MM)
- `{day}` → Dia da semana (segunda-feira, terça-feira, etc)

### Exemplos de Templates

#### Template de Confirmação (48h antes)
```
Olá {name}! 👋

Gostaria de CONFIRMAR sua consulta:
📅 {day}, {date}
🕐 {time}

Responda:
✅ SIM para confirmar
❌ NÃO para cancelar

Obrigado!
```

#### Template de Lembrete (24h antes)
```
Olá {name}! 📅

Lembrete: você tem consulta AMANHÃ às {time}.

Por favor, confirme sua presença respondendo SIM.

📍 Endereço: [seu endereço]
📞 Tel: [seu telefone]
```

#### Template Final (2h antes)
```
Olá {name}! ⏰

Sua consulta é DAQUI A 2 HORAS ({time}).

⚠️ Chegue com 10min de antecedência
📍 [seu endereço]

Estamos te esperando!
```

---

## 📊 Monitoramento e Estatísticas

### Ver Estatísticas no Supabase

```sql
-- Ver lembretes por tipo e status
SELECT * FROM reminder_stats WHERE clinic_id = 'sua-clinic-id';

-- Ver lembretes enviados hoje
SELECT 
  type,
  COUNT(*) as enviados,
  COUNT(*) FILTER (WHERE response_received = true) as confirmados
FROM reminders
WHERE sent_at::DATE = CURRENT_DATE
  AND clinic_id = 'sua-clinic-id'
GROUP BY type;

-- Ver taxa de confirmação
SELECT 
  COUNT(*) as total_enviados,
  COUNT(*) FILTER (WHERE response_received = true) as confirmados,
  ROUND(100.0 * COUNT(*) FILTER (WHERE response_received = true) / COUNT(*), 2) as taxa_confirmacao
FROM reminders
WHERE type = 'confirmation_request'
  AND status = 'sent'
  AND clinic_id = 'sua-clinic-id';
```

### Logs do Cron

Os logs aparecem no console quando o cron executa:

```
[Cron] 🚀 Iniciando processamento de lembretes...
[Cron] 📋 Processando 3 lembretes...
[Cron] 📬 Processando: appointment_2h para 5511999999999
[Cron] 📲 Enviando para 5511999999999...
[Cron] ✅ Enviado com sucesso: appointment_2h
[Cron] ✓ Concluído em 1250ms: 3 enviados, 0 falharam
```

---

## 🔧 Troubleshooting

### Lembretes não estão sendo enviados

1. **Verifique o cron job:**
   ```bash
   curl -X POST http://localhost:3000/api/reminders/process \
     -H "Authorization: Bearer seu-cron-secret"
   ```

2. **Verifique lembretes pendentes:**
   ```sql
   SELECT * FROM reminders 
   WHERE status = 'pending' 
     AND scheduled_for <= NOW()
   LIMIT 10;
   ```

3. **Verifique Z-API da clínica:**
   ```sql
   SELECT id, name, zapi_instance_id, zapi_token 
   FROM clinics 
   WHERE id = 'sua-clinic-id';
   ```

### Erro 401 Unauthorized no cron

O `CRON_SECRET` não está batendo. Verifique se:
- `.env.local` tem `CRON_SECRET=xyz123`
- O cron job envia `Authorization: Bearer xyz123`
- Ambos têm o mesmo valor exato

### Lembretes sendo criados mas não enviando

Verifique os logs de falha:
```sql
SELECT * FROM reminders 
WHERE status = 'failed' 
ORDER BY updated_at DESC 
LIMIT 10;
```

Causas comuns:
- Z-API não configurado
- Telefone inválido
- Token Z-API expirado

---

## 📚 API Endpoints

### POST /api/reminders/process
**Descrição:** Processa lembretes pendentes e envia via WhatsApp

**Headers:**
```
Authorization: Bearer {CRON_SECRET}
```

**Resposta:**
```json
{
  "success": true,
  "processed": 5,
  "succeeded": 5,
  "failed": 0,
  "duration": "1250ms",
  "timestamp": "2026-02-17T14:30:00Z"
}
```

### GET /api/notifications
**Descrição:** Busca notificações não lidas do usuário logado

**Resposta:**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "title": "Nova conversa",
      "message": "João Silva iniciou uma conversa",
      "link": "/dashboard/conversas?id=xyz",
      "created_at": "2026-02-17T14:00:00Z"
    }
  ]
}
```

### POST /api/notifications
**Descrição:** Marca notificação(ões) como lida(s)

**Body:**
```json
{ "notificationId": "uuid" }
// OU
{ "markAllAsRead": true }
```

### GET /api/notifications/settings
**Descrição:** Busca configurações de notificações da clínica

### POST /api/notifications/settings
**Descrição:** Atualiza configurações de notificações

**Body:**
```json
{
  "reminder_24h_enabled": true,
  "reminder_24h_template": "Template customizado com {name} e {time}",
  "confirmation_hours_before": 48
}
```

---

## ✅ Checklist de Implementação

- [x] Migration criada (010_create_reminders_and_notifications.sql)
- [x] Tipos TypeScript criados
- [x] Endpoint /api/reminders/process criado
- [x] Endpoints /api/notifications criados
- [x] Hook useNotifications criado
- [x] Componente NotificationBell criado
- [x] vercel.json configurado
- [x] CRON_SECRET configurado
- [ ] Migration executada no Supabase
- [ ] NotificationBell adicionado ao Topbar
- [ ] Cron job ativado (Vercel/GitHub/Cron-job.org)
- [ ] Testado com appointment real

---

## 🎯 Próximos Passos

1. Execute a migration no Supabase
2. Adicione o NotificationBell no Topbar
3. Configure o cron job (Vercel Cron recomendado)
4. Crie um appointment de teste
5. Aguarde o cron executar
6. Verifique o WhatsApp do paciente teste

---

## 📞 Suporte

Se tiver dúvidas ou problemas:
1. Verifique os logs no console
2. Consulte a tabela `reminders` para ver status
3. Teste manualmente o endpoint `/api/reminders/process`
