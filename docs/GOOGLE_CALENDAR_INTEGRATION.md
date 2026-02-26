# Integração Google Calendar - MVP Implementado

## Entrega Completa ✅

Esta implementação adiciona integração com Google Calendar para criar eventos automaticamente quando uma conversa for marcada como "scheduled".

---

## 📂 Arquivos Criados

### Backend & API
1. **`database/migrations/008_create_appointments_and_calendar_integrations.sql`**
   - Cria tabela `appointments` para armazenar agendamentos
   - Cria tabela `calendar_integrations` para credenciais Google (1 por clínica)
   - Inclui RLS policies e triggers
   
2. **`src/lib/calendar/googleCalendar.ts`**
   - Service para Google Calendar API
   - Funções: `createCalendarEvent()`, `deleteCalendarEvent()`, `updateCalendarEvent()`
   - OAuth helpers: `getAuthorizationUrl()`, `getTokensFromCode()`
   - Auto-refresh de tokens expirados

3. **`src/app/api/google/oauth/start/route.ts`**
   - Inicia fluxo OAuth Google
   - Redireciona para tela de consentimento

4. **`src/app/api/google/oauth/callback/route.ts`**
   - Recebe callback do Google OAuth
   - Salva tokens na tabela `calendar_integrations`

5. **`src/app/api/google/oauth/disconnect/route.ts`**
   - Desconecta integração Google Calendar

6. **`src/app/api/appointments/create/route.ts`**
   - Cria appointment no banco
   - Cria evento no Google Calendar (se integração ativa)
   - Atualiza conversa para status `scheduled`

### Frontend & UI
7. **`src/app/dashboard/configuracoes/agenda/page.tsx`**
   - Página de configurações da agenda

8. **`src/app/dashboard/configuracoes/agenda/AgendaConfigPageClient.tsx`**
   - UI de conexão/desconexão Google Calendar
   - Mostra status da integração
   - Instruções de uso

9. **`src/app/dashboard/conversas/components/ScheduleModal.tsx`**
   - Modal para agendar consulta
   - Campos: data, hora, duração
   - Valida data futura

10. **`src/app/dashboard/conversas/components/ChatPanel.tsx`** (modificado)
    - Adiciona botão "Agendar consulta" no menu de ações
    - Integra com ScheduleModal

11. **`src/app/dashboard/configuracoes/ConfiguracoesPageClient.tsx`** (modificado)
    - Adiciona card de integração Google Calendar
    - Link para página de configurações da agenda

### Types
12. **`src/lib/types/database.ts`** (modificado)
    - Tipos: `Appointment`, `CalendarIntegration`
    - Enums: `AppointmentStatus`, `AppointmentProvider`, `CalendarProvider`

---

## 🔧 Configuração Necessária

### 1. Instalar Dependência

```bash
npm install googleapis
```

### 2. Executar Migration SQL

Execute o arquivo `database/migrations/008_create_appointments_and_calendar_integrations.sql` no Supabase SQL Editor.

### 3. Configurar OAuth Google

#### 3.1. Google Cloud Console
1. Acesse: https://console.cloud.google.com/
2. Crie um novo projeto ou selecione um existente
3. Vá em **APIs & Services** > **Library**
4. Procure e habilite: **Google Calendar API**

#### 3.2. Criar Credenciais OAuth 2.0
1. Vá em **APIs & Services** > **Credentials**
2. Clique em **Create Credentials** > **OAuth client ID**
3. Tipo: **Web application**
4. Nome: `Doctor Chat Bot`
5. **Authorized JavaScript origins**: 
   - `http://localhost:3000` (dev)
   - `https://seu-dominio.com.br` (produção)
6. **Authorized redirect URIs**:
   - `http://localhost:3000/api/google/oauth/callback` (dev)
   - `https://seu-dominio.com.br/api/google/oauth/callback` (produção)
7. Clique em **Create**
8. Copie o **Client ID** e **Client Secret**

#### 3.3. Configurar Tela de Consentimento
1. Vá em **APIs & Services** > **OAuth consent screen**
2. Tipo: **External** (para testes) ou **Internal** (para domínio workspace)
3. Preencha:
   - App name: `Doctor Chat Bot`
   - User support email: seu-email
   - Developer contact: seu-email
4. Scopes: Adicione `.../auth/calendar.events`
5. Salvar e continuar

### 4. Variáveis de Ambiente

Adicione ao arquivo `.env.local`:

```bash
# Google Calendar OAuth
GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/oauth/callback
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Para produção, use a URL correta do seu domínio.

---

## 🚀 Como Usar

### Para o Administrador da Clínica

1. **Conectar Google Calendar**
   - Acesse: Dashboard > Configurações > Seção "Google Calendar"
   - Clique em "Gerenciar Google Calendar"
   - Clique em "Conectar Google Calendar"
   - Faça login com sua conta Google
   - Autorize o acesso ao calendário

2. **Verificar Conexão**
   - Status deve aparecer como "✓ Conectado"
   - Calendário padrão será "primary"

### Para Atendentes

1. **Na Página de Conversas**
   - Abra uma conversa com paciente
   - Clique no menu "⋮" (três pontos) no canto superior direito
   - Selecione "Agendar consulta"

2. **No Modal de Agendamento**
   - Selecione data e hora
   - Escolha duração (padrão: 30min)
   - Clique em "Confirmar"

3. **O que acontece automaticamente:**
   - ✅ Conversa marcada como "Agendado"
   - ✅ Appointment criado no banco de dados
   - ✅ Evento criado no Google Calendar (se conectado)
   - ⚠️ Se falhar criar evento: mostra aviso mas mantém appointment

---

## 🔄 Fluxo de Funcionamento

```
1. Atendente clica "Agendar consulta"
   ↓
2. Preenche data/hora/duração no modal
   ↓
3. Sistema cria appointment no banco
   ↓
4. Sistema atualiza status da conversa → "scheduled"
   ↓
5. Sistema busca calendar_integration da clínica
   ↓
6a. Se conectado: cria evento no Google Calendar
6b. Se não conectado: apenas cria appointment local
   ↓
7. Modal fecha e conversa atualiza
```

---

## 🔐 Segurança

### Tokens
- Access tokens e refresh tokens armazenados no Supabase
- RLS policies: apenas usuários da mesma clínica podem acessar
- Tokens **não** criptografados no MVP (server-only)
- Produção: considere criptografar com Supabase Vault ou similar

### OAuth
- Fluxo OAuth 2.0 server-side
- `access_type: 'offline'` para obter refresh token
- `prompt: 'consent'` garante refresh token sempre
- Auto-refresh em caso de token expirado (401)

---

## 📊 Estrutura do Banco

### Tabela: `appointments`
```sql
- id: uuid (PK)
- clinic_id: uuid (FK → clinics)
- conversation_id: uuid (FK → conversations, nullable)
- patient_phone: text
- patient_name: text
- starts_at: timestamptz
- ends_at: timestamptz
- status: 'scheduled' | 'confirmed' | 'canceled' | 'completed' | 'no_show'
- description: text (nullable)
- provider: 'google' | 'manual'
- provider_reference_id: text (eventId do Google)
- created_at, updated_at
```

### Tabela: `calendar_integrations`
```sql
- id: uuid (PK)
- clinic_id: uuid (FK → clinics, UNIQUE)
- provider: 'google' (fixo no MVP)
- is_connected: boolean
- google_access_token: text
- google_refresh_token: text
- google_calendar_id: text (default 'primary')
- created_at, updated_at
```

---

## 🧪 Testando

1. **Verificar se migration rodou:**
   ```sql
   SELECT * FROM calendar_integrations;
   SELECT * FROM appointments;
   ```

2. **Conectar Google Calendar:**
   - Deve redirecionar para Google
   - Após autorização, redireciona de volta com ?success=connected

3. **Criar Agendamento:**
   - Agendar uma consulta pelo chat
   - Verificar se evento aparece no Google Calendar
   - Verificar no banco: `SELECT * FROM appointments ORDER BY created_at DESC LIMIT 1;`

4. **Simular Token Expirado:**
   - Update manual: `UPDATE calendar_integrations SET google_access_token = 'invalid' WHERE clinic_id = 'xxx';`
   - Tentar criar evento
   - Deve fazer refresh automático

---

## ⚠️ Tratamento de Erros

### Cenários e Fallbacks

| Cenário | O que acontece |
|---------|----------------|
| Google Calendar não conectado | Cria appointment + atualiza status, sem criar evento |
| Token expirado | Auto-refresh e retry automático |
| Falha ao criar evento | Cria appointment + mostra aviso na UI |
| Data no passado | Modal bloqueia e mostra erro |
| Campos vazios | Modal não permite submissão |

### Logs
- Console logs em todos os erros
- Mensagens de erro retornadas para UI quando relevante
- `console.log()` em sucessos (para depuração)

---

## 🔮 Próximas Melhorias (Fora do MVP)

- [ ] Criptografar tokens no banco (Supabase Vault)
- [ ] Suporte a múltiplos calendários (não só primary)
- [ ] Cancelar/reagendar consultas (com sync Google)
- [ ] Integração com GestãoDS
- [ ] Notificações automáticas para paciente
- [ ] Lembretes de consulta via WhatsApp
- [ ] Dashboard de agenda (visualização)
- [ ] Sincronização bidirecional (Google → Sistema)

---

## 📝 Checklist de Deploy

- [ ] `npm install googleapis`
- [ ] Executar migration 008 no Supabase
- [ ] Criar projeto no Google Cloud
- [ ] Habilitar Google Calendar API
- [ ] Criar OAuth credentials
- [ ] Configurar consent screen
- [ ] Adicionar variáveis de ambiente
- [ ] Testar fluxo OAuth
- [ ] Testar criação de appointment
- [ ] Testar criação de evento no Google Calendar
- [ ] Testar desconexão
- [ ] Deploy!

---

## 🎓 Documentação Técnica

### Stack
- **Next.js 16.1.6** (App Router)
- **React 19.2.3** (Server/Client Components)
- **Supabase** (Auth + Database)
- **Google Calendar API v3**
- **TypeScript 5**

### Padrões
- Server Components para páginas protegidas
- Client Components para interatividade
- Route Handlers para API routes
- RLS policies para segurança
- Optimistic UI updates

---

Implementação completa! 🎉

Para dúvidas ou problemas, verifique:
1. Console do navegador (erros frontend)
2. Terminal do Next.js (erros backend)
3. Supabase Dashboard > Logs (erros de database)
4. Google Cloud Console > Logs (erros OAuth)
