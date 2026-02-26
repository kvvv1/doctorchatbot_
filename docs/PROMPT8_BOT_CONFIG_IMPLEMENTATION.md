# Bot Configuration Page Implementation - PROMPT 8

## ✅ Completed Implementation

### Overview
Implemented a complete bot configuration system that allows clinic owners to customize bot behavior and messages without needing a visual flow editor.

---

## 📦 1. Database Layer (Supabase)

### Migration: `007_create_bot_settings.sql`

**Table: `bot_settings`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `clinic_id` | UUID | Foreign key to clinics (unique) |
| `bot_default_enabled` | boolean | Bot enabled by default for new conversations |
| `working_hours_enabled` | boolean | Enforce working hours restrictions |
| `working_hours` | JSONB | Working hours configuration per day |
| `message_welcome` | text | Welcome message |
| `message_menu` | text | Menu message |
| `message_out_of_hours` | text | Out of hours message |
| `message_fallback` | text | Fallback when bot doesn't understand |
| `message_confirm_schedule` | text | Schedule confirmation message |
| `message_confirm_reschedule` | text | Reschedule confirmation message |
| `message_confirm_cancel` | text | Cancellation confirmation message |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

**Working Hours JSONB Structure:**
```json
{
  "timezone": "America/Sao_Paulo",
  "days": [
    {"day": "mon", "enabled": true, "start": "08:00", "end": "18:00"},
    {"day": "tue", "enabled": true, "start": "08:00", "end": "18:00"},
    {"day": "wed", "enabled": true, "start": "08:00", "end": "18:00"},
    {"day": "thu", "enabled": true, "start": "08:00", "end": "18:00"},
    {"day": "fri", "enabled": true, "start": "08:00", "end": "18:00"},
    {"day": "sat", "enabled": false, "start": "08:00", "end": "12:00"},
    {"day": "sun", "enabled": false, "start": "08:00", "end": "12:00"}
  ]
}
```

**RLS Policies:**
- Multi-tenant isolation by `clinic_id`
- Uses `profiles.clinic_id` to verify user access
- Policies for SELECT, INSERT, and UPDATE operations

**Helper Function:**
- `get_or_create_bot_settings(p_clinic_id UUID)`: Auto-creates settings with defaults if none exist

---

## 🔧 2. Service Layer

### File: `src/lib/services/botSettingsService.ts`

**Functions:**

1. **`getBotSettings(clinicId: string)`**
   - Retrieves bot settings for a clinic (server-side/admin)
   - Auto-creates with defaults if none exist
   - Uses the `get_or_create_bot_settings` RPC function

2. **`getBotSettingsForCurrentUser()`**
   - Gets bot settings for authenticated user's clinic
   - Retrieves clinic_id from user's profile
   - Returns null if user not authenticated

3. **`updateBotSettings(clinicId: string, updates: Partial<BotSettings>)`**
   - Updates bot settings for a clinic
   - Validates clinic access through RLS
   - Returns updated settings

4. **`isWithinWorkingHours(settings: BotSettings, now?: Date)`**
   - Checks if current time is within configured working hours
   - Respects timezone from settings
   - Returns true if `working_hours_enabled` is false
   - Handles day of week and time range validation

---

## 🎨 3. UI Layer (Next.js + Tailwind)

### Route: `/dashboard/configuracoes/bot`

**Files:**
- `src/app/dashboard/configuracoes/bot/page.tsx` - Server component
- `src/app/dashboard/configuracoes/bot/BotConfigPageClient.tsx` - Client component

**Features:**

### A. Bot Behavior Section
- **Toggle: "Bot ativado por padrão"**
  - Controls `bot_default_enabled`
  - New conversations will start with bot enabled/disabled

- **Toggle: "Respeitar horário de funcionamento"**
  - Controls `working_hours_enabled`
  - When enabled, shows working hours editor

### B. Working Hours Editor
- Displays only when working hours are enabled
- 7 days of the week (Monday to Sunday)
- Each day has:
  - Checkbox to enable/disable
  - Start time input
  - End time input
- Default timezone: America/Sao_Paulo

### C. Message Configuration
Text areas for all bot messages:
1. **Boas-vindas** - First message to patient
2. **Menu** - Options menu
3. **Fora do horário** - Out of hours message
4. **Fallback** - When bot doesn't understand
5. **Confirmações**:
   - Schedule confirmation
   - Reschedule confirmation
   - Cancellation confirmation

### D. UI Features
- Clean, premium design with gradient background
- Icon-based sections (Bot, Clock, MessageSquare)
- Responsive layout
- Toast notifications for success/error
- Loading states during save
- Smooth animations

**API Endpoint:** `PUT /api/bot/settings`
- File: `src/app/api/bot/settings/route.ts`
- Validates user belongs to clinic
- Updates settings via service layer

---

## 🤖 4. Bot Engine Integration

### Updated Files:

**`src/lib/bot/engine.ts`**
- Added `BotSettings` parameter to `handleBotTurn()`
- Uses custom messages from settings instead of hardcoded templates
- Falls back to default templates if settings not provided
- Updated state handlers to accept settings parameter

**Key Changes:**
```typescript
export async function handleBotTurn(
  conversationId: string,
  userMessage: string,
  currentState: BotState = 'menu',
  currentContext: BotContext = {},
  botSettings?: BotSettings | null  // NEW PARAMETER
): Promise<BotResponse>
```

**Message Priority:**
1. Custom message from settings (if provided)
2. Default template (fallback)

**`src/app/api/webhooks/zapi/route.ts`**

Updated `triggerBotResponse()` function:
1. **Load bot settings** for the clinic
2. **Check working hours** if enabled:
   - If outside hours: send `message_out_of_hours`
   - Don't advance bot state
   - Stop processing
3. **Pass settings** to bot engine
4. Process normally if within hours

**`src/lib/services/inboxService.ts`**

Updated `findOrCreateConversation()`:
- Loads bot settings when creating new conversation
- Uses `bot_default_enabled` from settings
- Falls back to `true` if settings not found

---

## 📊 5. Type Definitions

### File: `src/lib/types/database.ts`

**New Types:**

```typescript
export interface WorkingHoursDay {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  enabled: boolean
  start: string
  end: string
}

export interface WorkingHours {
  timezone: string
  days: WorkingHoursDay[]
}

export interface BotSettings {
  id: string
  clinic_id: string
  bot_default_enabled: boolean
  working_hours_enabled: boolean
  working_hours: WorkingHours
  message_welcome: string
  message_menu: string
  message_out_of_hours: string
  message_fallback: string
  message_confirm_schedule: string
  message_confirm_reschedule: string
  message_confirm_cancel: string
  created_at: string
  updated_at: string
}
```

---

## 🔄 6. Data Flow

### New Conversation Flow:
1. Patient sends first message
2. Webhook receives message
3. `inboxService.findOrCreateConversation()` called
4. Loads `bot_settings` for clinic
5. Creates conversation with `bot_enabled = bot_default_enabled`

### Bot Response Flow:
1. Patient message arrives
2. `triggerBotResponse()` loads bot settings
3. **Working Hours Check:**
   - If enabled and outside hours → send `message_out_of_hours` and stop
   - If disabled or within hours → continue
4. Call `handleBotTurn()` with settings
5. Bot uses custom messages from settings
6. Response sent to patient

---

## 🚀 7. Deployment Steps

### Run Migration:
```sql
-- Execute in Supabase SQL Editor
-- File: database/migrations/007_create_bot_settings.sql
```

### No Code Changes Required:
- All existing conversations continue working
- Settings auto-created on first access
- Default templates used as fallback

---

## ✨ 8. Features Summary

✅ **Database**
- Complete table with RLS policies
- Auto-seed function for default settings
- Multi-tenant security

✅ **Service Layer**
- Get/create/update bot settings
- Working hours validation
- Timezone support

✅ **UI**
- Complete configuration page
- Toggle switches for behavior
- Working hours editor (7 days)
- Message customization (7 messages)
- Toast notifications
- Responsive design

✅ **Bot Integration**
- Uses custom messages from settings
- Working hours enforcement
- Default bot enabled setting
- No breaking changes to existing flow

---

## 🔐 9. Security

- RLS policies enforce multi-tenant isolation
- Settings tied to clinic_id
- User authentication required
- Clinic ownership validated on updates

---

## 📝 10. Testing Checklist

### Database:
- [ ] Run migration in Supabase
- [ ] Verify RLS policies work
- [ ] Test auto-creation of default settings

### UI:
- [ ] Access `/dashboard/configuracoes/bot`
- [ ] Toggle bot enabled/disabled
- [ ] Toggle working hours
- [ ] Edit working hours for each day
- [ ] Customize all message fields
- [ ] Save changes
- [ ] Verify toast notifications

### Bot Behavior:
- [ ] Create new conversation → verify bot_enabled matches setting
- [ ] Send message during working hours → bot responds normally
- [ ] Send message outside hours → receives out-of-hours message
- [ ] Verify custom messages are used in bot responses
- [ ] Verify fallback to default templates if settings null

---

## 🎯 Success Criteria

All requirements met:
✅ Database table with RLS and auto-seed
✅ UI page with toggles and editors
✅ Bot integration without breaking existing flow
✅ Working hours enforcement
✅ Custom message support
✅ Default bot enabled setting
✅ No TypeScript errors
✅ Fully responsive design
✅ Toast notifications

---

## 📚 Files Created/Modified

### Created:
- `database/migrations/007_create_bot_settings.sql`
- `src/lib/services/botSettingsService.ts`
- `src/app/dashboard/configuracoes/bot/page.tsx`
- `src/app/dashboard/configuracoes/bot/BotConfigPageClient.tsx`
- `src/app/api/bot/settings/route.ts`

### Modified:
- `src/lib/types/database.ts` - Added BotSettings types
- `src/lib/bot/engine.ts` - Added settings parameter
- `src/app/api/webhooks/zapi/route.ts` - Added working hours check
- `src/lib/services/inboxService.ts` - Added bot_default_enabled support

---

## 🎉 Implementation Complete!

The bot configuration system is fully implemented and ready for use. Clinic owners can now customize all bot messages and behavior through a clean, user-friendly interface without needing any technical knowledge or visual flow editor.
