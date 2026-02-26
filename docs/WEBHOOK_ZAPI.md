# Configuração de Webhook Z-API

Este documento explica como configurar o webhook do Z-API para receber mensagens em tempo real no Doctor Chat Bot.

## 📋 Visão Geral

O webhook do Z-API permite que o sistema receba mensagens dos pacientes automaticamente, sem necessidade de polling constante. Quando um paciente envia uma mensagem via WhatsApp, o Z-API chama nosso webhook e a mensagem aparece imediatamente no dashboard.

## 🔧 Configuração

### 1. Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# Z-API
ZAPI_BASE_URL=https://api.z-api.io

# Webhook Security
ZAPI_WEBHOOK_SECRET=seu-segredo-aqui
```

**⚠️ IMPORTANTE**: O `ZAPI_WEBHOOK_SECRET` deve ser um segredo forte e único. Gere um usando:

```bash
openssl rand -base64 32
```

Ou use um gerador online de strings aleatórias (mínimo 32 caracteres).

### 2. Configuração no Painel do Z-API

1. **Acesse o painel do Z-API** em [https://panel.z-api.io](https://panel.z-api.io)

2. **Vá em Webhooks** (ou "Configurações" → "Webhooks")

3. **Configure o webhook de mensagens recebidas:**
   - **URL**: `https://seu-dominio.com/api/webhooks/zapi`
   - **Método**: `POST`
   - **Headers**: Adicione o header customizado:
     - Nome: `x-webhook-secret`
     - Valor: `[o mesmo valor do ZAPI_WEBHOOK_SECRET do .env.local]`

4. **Eventos para escutar:**
   - ✅ Mensagens recebidas (message-received)
   - ✅ Mensagens de texto
   - ✅ Mensagens de mídia (opcional, mas recomendado)

5. **Salve a configuração**

### 3. Teste de Conectividade

Antes de configurar o webhook completo, teste a conectividade:

```bash
curl https://seu-dominio.com/api/webhooks/zapi/ping
```

Você deve receber:

```json
{
  "ok": true,
  "message": "Z-API webhook is ready",
  "timestamp": "2026-02-16T..."
}
```

## 🧪 Testando o Webhook

### Teste Manual

Use o painel do Z-API para enviar um webhook de teste. Ou envie uma mensagem real pelo WhatsApp e verifique:

1. **No terminal do servidor**, você deve ver logs como:
   ```
   [Z-API Webhook] Message processed successfully: {
     conversationId: 'uuid-aqui',
     messageId: 'uuid-aqui',
     createdConversation: true
   }
   ```

2. **No dashboard** (`/dashboard/conversas`), a mensagem deve aparecer em até 3 segundos (devido ao polling).

### Teste com cURL

Simule um webhook manualmente:

```bash
curl -X POST https://seu-dominio.com/api/webhooks/zapi \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: seu-segredo-aqui" \
  -d '{
    "instanceId": "seu-instance-id",
    "phone": "5511999999999",
    "fromMe": false,
    "chatName": "Paciente Teste",
    "text": {
      "message": "Olá, quero agendar uma consulta"
    },
    "moment": 1629465600000
  }'
```

Resposta esperada:

```json
{
  "ok": true,
  "conversationId": "uuid-aqui",
  "messageId": "uuid-aqui"
}
```

## 🔒 Segurança

### Validação do Segredo

O webhook valida o header `x-webhook-secret` em todas as requisições. Se o segredo não bater, retorna `401 Unauthorized`.

### Service Role Key

O webhook usa `SUPABASE_SERVICE_ROLE_KEY` para escrever no banco, pois não há usuário autenticado. Esta key bypassa RLS e **NUNCA deve ser exposta ao cliente**.

## 🔄 Fluxo de Processamento

```
1. Z-API recebe mensagem do WhatsApp
   ↓
2. Z-API envia POST para /api/webhooks/zapi
   ↓
3. Webhook valida x-webhook-secret
   ↓
4. Parser normaliza o payload
   ↓
5. Busca whatsapp_instances por instanceId → obtém clinic_id
   ↓
6. InboxService processa:
   - Busca ou cria conversation (clinic_id + patient_phone)
   - Insere message (sender='patient')
   - Atualiza conversation (last_message_at, status, etc)
   ↓
7. Retorna { ok: true }
   ↓
8. Dashboard polling (a cada 3s) detecta nova mensagem
   ↓
9. Mensagem aparece na UI
```

## 📊 Estrutura de Dados

### Conversação (Conversation)

Quando uma mensagem chega:

- **Se não existe conversa** para `(clinic_id, patient_phone)` → cria nova com `status='new'` e `bot_enabled=true`
- **Se existe** → atualiza `last_message_at`, `last_message_preview`, `last_patient_message_at`
- **Se status era 'done' ou 'canceled'** → reativa para `status='new'`

### Mensagem (Message)

Cada mensagem recebida é inserida com:

- `sender: 'patient'`
- `content: [texto da mensagem]`
- `conversation_id: [id da conversa]`

## 🐛 Troubleshooting

### Webhook não recebe mensagens

1. **Verifique se a URL está correta** no painel do Z-API
2. **Teste o endpoint ping**: `curl https://seu-dominio.com/api/webhooks/zapi/ping`
3. **Verifique os logs do servidor** para ver se o webhook está sendo chamado
4. **Confira o header secret** - deve ser exatamente igual ao configurado

### Erro 401 Unauthorized

- O `x-webhook-secret` no painel do Z-API não bate com `ZAPI_WEBHOOK_SECRET` no `.env.local`
- Certifique-se de que não há espaços extras ou caracteres invisíveis

### Erro 404 Instance not registered

- A instância do Z-API não está cadastrada no banco `whatsapp_instances`
- Verifique se o `instance_id` está correto
- Use o script de configuração manual no `WHATSAPP_CONFIG.md`

### Mensagens não aparecem no dashboard

- O webhook está funcionando mas o polling pode estar com problema
- Verifique o arquivo `/dashboard/conversas/ConversasPageClient.tsx`
- Confira se há erros no console do navegador

### Erro 500 Internal Server Error

- Verifique os logs do servidor para detalhes
- Provavelmente erro de conexão com o Supabase ou banco
- Confirme que `SUPABASE_SERVICE_ROLE_KEY` está correta

## 📝 Logs

O sistema registra webhooks na tabela `logs` (se existir):

- **level**: `info` (sucesso) ou `error` (falha)
- **action**: `zapi.webhook.received`
- **details**: Informações sobre a mensagem processada

Query exemplo:

```sql
SELECT * FROM logs 
WHERE action = 'zapi.webhook.received' 
ORDER BY created_at DESC 
LIMIT 10;
```

## 🚀 Deploy em Produção

### Vercel / Netlify / Similar

1. Configure as variáveis de ambiente no painel do provedor
2. Deploy da aplicação
3. Use a URL pública para configurar o webhook
4. Teste com mensagem real

### HTTPS Obrigatório

O Z-API **requer HTTPS** para webhooks. Certifique-se de que seu domínio tem certificado SSL válido.

## 🔗 Referências

- [Documentação Z-API - Webhooks](https://developer.z-api.io/webhooks)
- [Supabase - Service Role](https://supabase.com/docs/guides/api/api-keys)
- [Next.js - Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

---

**Última atualização**: 16 de fevereiro de 2026
