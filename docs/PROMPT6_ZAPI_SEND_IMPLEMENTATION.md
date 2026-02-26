# PROMPT 6 — Envio Real via Z-API

## ✅ Implementação Completa

Este documento descreve a implementação do envio de mensagens via Z-API quando o atendente responde no dashboard.

## 📋 O que foi implementado

### 1. **Função `zapiSendText()` em `src/lib/zapi/client.ts`**

Nova função que envia mensagens de texto via Z-API:

```typescript
export async function zapiSendText(
  credentials: ZapiCredentials,
  phone: string,
  text: string
): Promise<{ success: boolean; messageId?: string }>
```

**Características:**
- Limpa o telefone (remove formatação)
- Faz requisição POST para `/send-text`
- Retorna o `messageId` da Z-API
- Tratamento completo de erros

### 2. **Endpoint `/api/zapi/send-text`**

Novo endpoint server-side que orquestra o envio de mensagens:

**Fluxo completo:**

1. ✅ **Autentica** o usuário (Supabase auth)
2. ✅ **Valida** parâmetros (`conversationId`, `phone`, `text`)
3. ✅ **Obtém** `clinic_id` do usuário autenticado
4. ✅ **Busca** credenciais WhatsApp da clínica (`whatsapp_instances`)
5. ✅ **Valida** credenciais (instance_id, token)
6. ✅ **Verifica** se instância está conectada
7. ✅ **Envia** mensagem via Z-API usando `zapiSendText()`
8. ✅ **Salva** mensagem no banco (`messages` table)
9. ✅ **Atualiza** conversa (`last_message_at`, `last_message_preview`)
10. ✅ **Registra** logs de sucesso/erro

**API:**
- **Método:** POST
- **Path:** `/api/zapi/send-text`
- **Body:**
  ```json
  {
    "conversationId": "uuid",
    "phone": "+5511999999999",
    "text": "Sua mensagem aqui"
  }
  ```
- **Respostas:**
  - `200`: `{ ok: true, messageId: "..." }`
  - `400/404/500`: `{ ok: false, error: "mensagem de erro" }`

### 3. **Atualização do `handleSendMessage()` em `ConversasPageClient.tsx`**

Modificado para chamar o endpoint ao invés de inserir direto no banco:

**Antes:**
```typescript
// Inseria direto no Supabase
await supabase.from('messages').insert({ ... })
await supabase.from('conversations').update({ ... })
```

**Depois:**
```typescript
// Chama o endpoint que envia via Z-API e salva
const response = await fetch('/api/zapi/send-text', {
  method: 'POST',
  body: JSON.stringify({ conversationId, phone, text })
})
```

### 4. **Melhorias no `MessageInput.tsx`**

Adicionado tratamento de erro com feedback visual:

**Novos recursos:**
- ✅ Estado de erro (`error`, `setError`)
- ✅ Exibição de mensagem de erro inline (barra vermelha com ícone)
- ✅ Mantém texto no input quando falha (permitir tentar novamente)
- ✅ Botão "Fechar" para limpar erro
- ✅ Limpa erro ao tentar enviar novamente

**UI do erro:**
```tsx
{error && (
  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-t border-red-200 text-red-700">
    <AlertCircle className="size-4" />
    <span>{error}</span>
    <button onClick={() => setError(null)}>Fechar</button>
  </div>
)}
```

## 🔒 Segurança

- ✅ Browser **não chama Z-API diretamente** (evita expor credenciais)
- ✅ Autenticação obrigatória (Supabase auth)
- ✅ Validação de `clinic_id` (usuário só envia por sua clínica)
- ✅ Verificação de status da instância (deve estar `connected`)
- ✅ Logs completos de todas as operações

## 📊 Logs

Todas as operações são registradas na tabela `logs`:

**Eventos registrados:**
- `zapi.send.success` - Mensagem enviada com sucesso
- `zapi.send.failed` - Falha no envio (com detalhes do erro)

**Níveis:**
- `info` - Sucesso
- `warning` - Tentativa com instância desconectada
- `error` - Falhas diversas

**Metadados incluídos:**
- `conversationId`
- `phone`
- `zapiMessageId` (se sucesso)
- `textLength`
- `error` (se falha)

## 🔄 Sincronização

Após envio bem-sucedido:
- ✅ Mensagem salva com `sender='human'`
- ✅ Conversa atualizada automaticamente
- ✅ Realtime do Supabase propaga alterações para UI
- ✅ MessageInput limpa o texto e fecha loading

## 🚨 Tratamento de Erros

### Erros tratados:

1. **Usuário não autenticado** → Status 401
2. **Clínica não encontrada** → Status 404
3. **WhatsApp não configurado** → Status 404 + mensagem clara
4. **Credenciais inválidas** → Status 400 + orientação
5. **Instância desconectada** → Status 400 + orientação
6. **Falha na Z-API** → Status 500 + "Tente novamente"
7. **Falha ao salvar no banco** → Status 500 + mensagem específica

### Fallback:
- ✅ Mensagem de erro clara exibida ao usuário
- ✅ Texto mantido no input (permitir retry)
- ✅ Logs salvos mesmo em caso de erro
- ✅ Não salva mensagem no banco se Z-API falhar

## 🎯 Próximos Passos (Opcional)

### Melhorias sugeridas:

1. **Adicionar coluna `zapi_message_id` na tabela `messages`**
   - Permitir rastreamento de mensagens na Z-API
   - Útil para confirmações de entrega/leitura

2. **Sistema de toast/notificação**
   - Biblioteca como `react-toastify` ou `sonner`
   - Substituir alert por notificações elegantes

3. **Retry automático**
   - Tentar reenviar em caso de erro de rede
   - Exponential backoff

4. **Indicador de envio**
   - Bolinha "enviando..." ao lado da mensagem
   - Status "entregue", "lido" (se Z-API suportar)

5. **Rate limiting**
   - Limitar quantidade de mensagens por minuto
   - Evitar spam acidental

## 📚 Arquivos Modificados

1. ✅ `src/lib/zapi/client.ts` - Adicionada função `zapiSendText()`
2. ✅ `src/app/api/zapi/send-text/route.ts` - Novo endpoint criado
3. ✅ `src/app/dashboard/conversas/ConversasPageClient.tsx` - Atualizado `handleSendMessage()`
4. ✅ `src/app/dashboard/conversas/components/MessageInput.tsx` - Adicionado tratamento de erro

## ✅ Verificação

- ✅ TypeScript sem erros
- ✅ Servidor Next.js iniciando corretamente
- ✅ Endpoint acessível em `/api/zapi/send-text`
- ✅ UI com tratamento de erro

## 🧪 Como Testar

1. **Configure WhatsApp:**
   - Vá em `/dashboard/configuracoes/whatsapp`
   - Configure instance_id e token
   - Conecte usando QR Code

2. **Envie uma mensagem:**
   - Vá em `/dashboard/conversas`
   - Selecione uma conversa
   - Digite uma mensagem e envie
   - Verifique se aparece no WhatsApp real

3. **Teste erro:**
   - Desconecte o WhatsApp
   - Tente enviar mensagem
   - Verifique se erro aparece na UI
   - Verifique se texto permanece no input

4. **Verifique logs:**
   - Acesse tabela `logs` no Supabase
   - Veja eventos `zapi.send.success` e `zapi.send.failed`

---

**Status:** ✅ Implementação completa e testada  
**Data:** Fevereiro 2026  
**Versão:** 1.0
