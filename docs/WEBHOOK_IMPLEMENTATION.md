# Sistema de Webhook Z-API - Implementação

## 📦 O que foi implementado

Sistema completo de recebimento de mensagens via webhook do Z-API, permitindo que mensagens do WhatsApp sejam recebidas em tempo real e persistidas no banco de dados.

## 🗂️ Arquivos Criados

### 1. **Parser de Webhooks** - `src/lib/zapi/webhookParser.ts`
- Normaliza diferentes formatos de payload do Z-API
- Extrai informações essenciais: phone, name, messageText, instanceId, timestamp
- Trata mensagens de mídia (áudio, vídeo, imagem, etc)
- Valida se a mensagem deve ser processada (ignora mensagens enviadas por nós)

### 2. **Service de Inbox** - `src/lib/services/inboxService.ts`
- Lógica de negócio para processar mensagens recebidas
- **Upsert de conversação**: busca ou cria baseado em (clinic_id, patient_phone)
- **Insert de mensagem**: adiciona com sender='patient'
- **Update de metadata**: atualiza last_message_at, last_message_preview, last_patient_message_at
- **Reativação**: se status='done'|'canceled', volta para 'new'
- Log opcional de atividades (non-blocking)

### 3. **Admin Client** - `src/lib/supabase/admin.ts`
- Cliente Supabase com Service Role Key
- **⚠️ IMPORTANTE**: Bypassa RLS, use apenas server-side
- Necessário para webhooks que não têm usuário autenticado

### 4. **Endpoint Principal** - `src/app/api/webhooks/zapi/route.ts`
- `POST /api/webhooks/zapi`
- Valida header `x-webhook-secret`
- Identifica clínica via `instance_id`
- Processa e persiste mensagem
- Retorna resposta rápida

### 5. **Endpoint de Ping** - `src/app/api/webhooks/zapi/ping/route.ts`
- `GET/POST /api/webhooks/zapi/ping`
- Health check para testar conectividade
- Retorna 200 OK com timestamp

### 6. **Documentação** - `docs/WEBHOOK_ZAPI.md`
- Guia completo de configuração
- Instruções passo a passo para Z-API
- Troubleshooting
- Exemplos de teste

### 7. **Variáveis de Ambiente** - `.env.example`
- Adicionado `ZAPI_WEBHOOK_SECRET`
- Documentado `SUPABASE_SERVICE_ROLE_KEY`

## 🔄 Fluxo de Dados

```
WhatsApp (Paciente)
    ↓
Z-API (recebe mensagem)
    ↓
POST /api/webhooks/zapi
    ↓
Validação de segredo (x-webhook-secret)
    ↓
Parser (normaliza payload)
    ↓
Busca whatsapp_instances → obtém clinic_id
    ↓
InboxService.handleIncomingMessage()
    ├── Busca ou cria conversation
    ├── Insere message (sender='patient')
    └── Atualiza conversation metadata
    ↓
Retorna { ok: true }
    ↓
Dashboard (polling a cada 3s) detecta nova mensagem
    ↓
UI atualiza automaticamente
```

## 🔒 Segurança

- **Header Secret**: Valida `x-webhook-secret` em todas as requisições
- **Service Role**: Nunca exposta ao cliente, apenas server-side
- **Validação de Instância**: Apenas instâncias cadastradas são processadas
- **Ignore Self**: Mensagens enviadas por nós são ignoradas (fromMe=true)

## ✅ Checklist de Deploy

- [ ] Adicionar `ZAPI_WEBHOOK_SECRET` no `.env.local` (dev) e no painel do provedor (prod)
- [ ] Adicionar `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` (dev) e no painel do provedor (prod)
- [ ] Deploy da aplicação
- [ ] Configurar webhook no painel do Z-API com:
  - URL: `https://seu-dominio.com/api/webhooks/zapi`
  - Header: `x-webhook-secret: [seu-segredo]`
- [ ] Testar ping: `curl https://seu-dominio.com/api/webhooks/zapi/ping`
- [ ] Enviar mensagem de teste pelo WhatsApp
- [ ] Verificar se aparece no dashboard em até 3s

## 📊 Banco de Dados

### Tabelas Utilizadas

1. **whatsapp_instances**: Mapeamento instance_id → clinic_id
2. **conversations**: Conversas (clinic_id + patient_phone único)
3. **messages**: Mensagens individuais (conversation_id + sender + content)
4. **logs** (opcional): Registro de atividades do webhook

### RLS (Row Level Security)

- O webhook usa **Service Role Key** que bypassa RLS
- Políticas RLS continuam válidas para usuários normais
- Isso permite que o webhook escreva sem autenticação de usuário

## 🧪 Testes

### Teste Rápido de Ping

```bash
curl https://localhost:3000/api/webhooks/zapi/ping
# Deve retornar: { "ok": true, "message": "Z-API webhook is ready", ... }
```

### Teste de Webhook Simulado

```bash
curl -X POST http://localhost:3000/api/webhooks/zapi \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: SEU_SEGREDO" \
  -d '{
    "instanceId": "SEU_INSTANCE_ID",
    "phone": "5511999999999",
    "fromMe": false,
    "chatName": "Paciente Teste",
    "text": { "message": "Olá" },
    "moment": 1629465600000
  }'
```

### Verificar no Banco

```sql
-- Últimas conversações criadas
SELECT * FROM conversations 
ORDER BY created_at DESC 
LIMIT 5;

-- Últimas mensagens recebidas
SELECT m.*, c.patient_name, c.patient_phone
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE m.sender = 'patient'
ORDER BY m.created_at DESC
LIMIT 10;
```

## 🐛 Troubleshooting Comum

### "Unauthorized" (401)
- Verifique se `ZAPI_WEBHOOK_SECRET` está igual no .env e no painel do Z-API
- Não deve ter espaços ou caracteres extras

### "Instance not registered" (404)
- Instância não cadastrada na tabela `whatsapp_instances`
- Rode o INSERT manual do `WHATSAPP_CONFIG.md`

### Mensagens não aparecem no dashboard
- Webhook está funcionando mas polling pode ter problema
- Verifique console do navegador
- Confirme que há polling ativo (`useConversations` hook)

### Erro de Service Role Key
- Variável `SUPABASE_SERVICE_ROLE_KEY` não configurada ou incorreta
- Pegue a key correta no painel do Supabase → Settings → API

## 📚 Próximos Passos (Futuro)

- [ ] Adicionar suporte a mensagens de mídia (download e storage)
- [ ] Implementar fila de processamento para alta carga
- [ ] Adicionar webhook de status de mensagens (lida, entregue)
- [ ] Implementar retry automático em caso de falha
- [ ] Dashboard de health do webhook
- [ ] Métricas de latência e taxa de sucesso

## 🔗 Referências

- [Documentação Z-API](https://developer.z-api.io/)
- [Supabase Service Role](https://supabase.com/docs/guides/api/api-keys)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

---

**Status**: ✅ Implementado e testado
**Data**: 16 de fevereiro de 2026
