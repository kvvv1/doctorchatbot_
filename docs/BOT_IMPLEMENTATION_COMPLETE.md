# Bot MVP Implementation Guide

## Overview

This document describes the automated bot implementation using a state machine (no AI). The bot responds automatically to patient messages via the Z-API webhook.

## Key Features

✅ **Simple & Secure**: No AI, pure state machine logic  
✅ **Deduplication**: Prevents processing the same message twice  
✅ **Context-Aware**: Maintains conversation state and context  
✅ **Professional**: Portuguese templates with clear, friendly tone  
✅ **Non-Blocking**: Bot runs asynchronously, doesn't slow down webhook  

## Architecture

### Components

1. **Intent Detection** (`src/lib/bot/intent.ts`)
   - Simple keyword matching (no AI)
   - Detects: schedule, reschedule, cancel, other
   - Yes/No detection for confirmations

2. **Templates** (`src/lib/bot/templates.ts`)
   - Professional Brazilian Portuguese messages
   - Contextual responses with patient name/date/time
   - Clear instructions and emojis

3. **Bot Engine** (`src/lib/bot/engine.ts`)
   - State machine with 8 states
   - Handles state transitions
   - Updates conversation status
   - Sends messages via Z-API

4. **Webhook Integration** (`src/app/api/webhooks/zapi/route.ts`)
   - Receives patient messages
   - Triggers bot if enabled
   - Non-blocking execution

5. **Inbox Service** (`src/lib/services/inboxService.ts`)
   - Deduplicates messages by zapi_message_id
   - Persists messages and updates conversations
   - Manages conversation metadata

## State Machine

### States

```
menu (default)
├── agendar_nome
│   ├── agendar_dia
│   │   └── agendar_hora → waiting_patient
├── reagendar_dia
│   └── reagendar_hora → reschedule
└── cancelar_confirmar
    └── cancelar_encaixe → waitlist | canceled
```

### State Descriptions

| State | Description | Next State | Status Update |
|-------|-------------|------------|---------------|
| `menu` | Initial state, detects intent | Various | - |
| `agendar_nome` | Collecting patient name | `agendar_dia` | - |
| `agendar_dia` | Collecting preferred day | `agendar_hora` | - |
| `agendar_hora` | Collecting preferred time | `menu` | `waiting_patient` |
| `reagendar_dia` | Collecting new day | `reagendar_hora` | - |
| `reagendar_hora` | Collecting new time | `menu` | `reschedule` |
| `cancelar_confirmar` | Confirming cancellation | `cancelar_encaixe` or `menu` | - |
| `cancelar_encaixe` | Ask about waitlist | `menu` | `waitlist` or `canceled` |

## Bot Context

Stored in `conversations.bot_context` (JSONB):

```typescript
{
  name?: string;    // Patient name
  day?: string;     // Preferred day
  time?: string;    // Preferred time
  intent?: string;  // Detected intent
}
```

Context is cleared when returning to menu after completing a flow.

## Message Flow

### Incoming Message

1. **Webhook receives message** from Z-API
2. **Parse and validate** payload
3. **Check deduplication** using `zapi_message_id`
4. **Save patient message** to database
5. **Trigger bot** (if `bot_enabled=true`)

### Bot Processing

```typescript
async function triggerBotResponse(
  conversationId,
  phone,
  messageText,
  clinicId
) {
  // 1. Get conversation (check bot_enabled)
  // 2. Load current state and context
  // 3. Process message through bot engine
  // 4. Send response via Z-API
  // 5. Save bot message and update state
}
```

### Bot Response

```typescript
async function handleBotTurn(
  conversationId,
  userMessage,
  currentState,
  currentContext
): Promise<BotResponse> {
  // Returns:
  // - message: text to send
  // - nextState: new bot state
  // - nextContext: updated context
  // - conversationStatus?: status update
}
```

## Intent Detection

### Keywords

- **Schedule**: agendar, marcar, consulta, 1
- **Reschedule**: remarcar, reagendar, trocar, 2
- **Cancel**: cancelar, desmarcar, 3
- **Yes**: sim, confirmo, ok, certeza
- **No**: não, nao, negativo

All matching is case-insensitive and uses `.includes()` for flexibility.

## Example Conversations

### Schedule Flow

```
Patient: "Oi, quero agendar"
Bot: [menu detects 'schedule']
     "Ótimo! Vou agendar sua consulta. 😊
      Por favor, me informe seu nome completo:"

Patient: "Maria Silva"
Bot: [agendar_nome saves name]
     "Obrigado, Maria Silva! 👍
      Qual dia você prefere para a consulta?"

Patient: "segunda-feira"
Bot: [agendar_dia saves day]
     "Perfeito! Dia segunda-feira.
      Qual horário você prefere?"

Patient: "14h"
Bot: [agendar_hora saves time, updates status]
     "✅ Consulta agendada com sucesso!
      📋 Nome: Maria Silva
      📅 Dia: segunda-feira
      🕐 Hora: 14h
      Nossa equipe entrará em contato..."
     [Status: waiting_patient]
     [State: menu]
```

### Cancel Flow with Waitlist

```
Patient: "Preciso cancelar"
Bot: "Você deseja cancelar sua consulta?
      Digite *SIM* para confirmar..."

Patient: "Sim"
Bot: "Entendido. Quer entrar na lista de espera...?"

Patient: "Sim"
Bot: "✅ Consulta cancelada.
      Você foi adicionado à lista de espera..."
     [Status: waitlist]
```

## Database Schema

### Migration 006: zapi_message_id

Run `database/migrations/006_add_zapi_message_id_to_messages.sql`:

```sql
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS zapi_message_id TEXT;

CREATE UNIQUE INDEX idx_messages_zapi_message_id 
ON messages(zapi_message_id) 
WHERE zapi_message_id IS NOT NULL;
```

This ensures deduplication: if the same webhook is sent twice, the second message is skipped.

## Configuration

### Environment Variables

Already configured from previous implementations:
- `ZAPI_WEBHOOK_SECRET`: Webhook validation
- `NEXT_PUBLIC_SUPABASE_URL`: Database
- `SUPABASE_SERVICE_ROLE_KEY`: Admin access
- Z-API credentials in whatsapp_instances table

### Enable/Disable Bot

Per conversation:
```sql
UPDATE conversations 
SET bot_enabled = true 
WHERE id = 'conversation-id';
```

Default: `bot_enabled = true` for new conversations.

## Testing

### Manual Testing

1. **Run migrations** (especially 006)
2. **Start dev server**: `npm run dev`
3. **Send test webhook** with patient message
4. **Check logs** in terminal for bot processing
5. **Verify message** sent via Z-API
6. **Check database** for state/context updates

### Test Cases

- ✅ Menu → Schedule flow (full path)
- ✅ Menu → Reschedule flow
- ✅ Menu → Cancel → Waitlist
- ✅ Menu → Cancel → No waitlist
- ✅ Cancel → Abort (answer "não")
- ✅ Duplicate message (same zapi_message_id)
- ✅ Bot disabled (should not respond)
- ✅ Unknown intent (menu fallback)

## Security

1. **Webhook Secret**: Validates webhook authenticity
2. **Service Role Key**: Bot uses admin client for internal calls
3. **Internal Call Flag**: `/api/zapi/send-text` accepts internal calls with auth
4. **RLS Policies**: Conversations/messages have row-level security
5. **No User Input Execution**: All messages are text only, no code execution

## Performance

- **Non-blocking**: Bot runs async, doesn't slow webhook response
- **Indexed Queries**: Fast lookups by conversation_id, zapi_message_id
- **Deduplication**: Prevents duplicate processing
- **Error Handling**: Logs errors but doesn't crash webhook

## Logs

Check terminal output for:
```
[Bot] Processing message: { conversationId, state, text }
[Bot] Response sent successfully: { conversationId, nextState }
[Bot] Bot disabled for conversation: ...
[InboxService] Duplicate message detected, skipping: ...
```

## Future Enhancements

- AI-powered intent detection (GPT/Claude)
- Natural language date/time parsing
- Multi-language support
- Custom flows per clinic
- Analytics dashboard
- Appointment API integration

## Troubleshooting

### Bot Not Responding

1. Check `conversations.bot_enabled = true`
2. Verify webhook secret is correct
3. Check Z-API credentials in whatsapp_instances
4. Look for errors in terminal logs
5. Ensure migration 006 is applied

### Duplicate Messages

- Migration 006 adds unique constraint
- If still duplicating, check zapi_message_id in webhook payload
- Verify `handleIncomingMessage` receives zapiMessageId

### Wrong State

- Check `conversations.bot_state` in database
- Bot resets to menu after completing flows
- Can manually reset: `UPDATE conversations SET bot_state='menu', bot_context='{}'`

## Support

For issues or questions:
1. Check terminal logs for errors
2. Verify database schema matches migrations
3. Test webhook with curl/Postman
4. Check Z-API documentation for payload format

---

**Status**: ✅ Fully implemented and ready for testing
**Version**: 1.0.0
**Last Updated**: February 17, 2026
