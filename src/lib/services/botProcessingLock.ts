import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_LOCK_MS = 10_000

export async function acquireBotProcessingLock(
  conversationId: string,
  ttlMs = DEFAULT_LOCK_MS,
): Promise<boolean> {
  const supabase = createAdminClient()
  const now = new Date()
  const lockedUntil = new Date(now.getTime() + ttlMs).toISOString()

  await supabase
    .from('bot_processing_locks')
    .delete()
    .eq('conversation_id', conversationId)
    .lt('locked_until', now.toISOString())

  const { error } = await supabase
    .from('bot_processing_locks')
    .insert({
      conversation_id: conversationId,
      locked_until: lockedUntil,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })

  if (!error) return true

  const code = (error as { code?: string }).code

  // 23505 = unique violation → another callback already holds the lock
  if (code === '23505') return false

  // 42P01 = table does not exist (migration not yet applied) → fail open so the bot still runs
  if (code === '42P01') {
    console.warn('[BotLock] bot_processing_locks table missing — run migration 049. Proceeding without lock.')
    return true
  }

  console.error('[BotLock] Failed to acquire lock:', error)
  return true // fail open on unexpected errors — better to risk a double response than silence the bot
}

export async function releaseBotProcessingLock(conversationId: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('bot_processing_locks')
    .delete()
    .eq('conversation_id', conversationId)

  if (error) {
    console.error('[BotLock] Failed to release lock:', error)
  }
}
