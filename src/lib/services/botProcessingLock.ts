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

  if ((error as { code?: string }).code === '23505') {
    return false
  }

  console.error('[BotLock] Failed to acquire lock:', error)
  return false
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
