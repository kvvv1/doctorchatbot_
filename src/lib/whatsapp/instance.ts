/**
 * Helper para buscar a instância WhatsApp ativa de uma clínica.
 * Suporta ambos os providers: 'zapi' e 'evolution'.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { WhatsAppCredentials } from '@/lib/whatsapp/sender'
import { isValidProvider } from '@/lib/whatsapp/sender'

export interface WhatsAppInstance {
  id: string
  credentials: WhatsAppCredentials
  status: string
}

export async function getWhatsAppInstance(clinicId: string): Promise<WhatsAppInstance | null> {
  const supabase = createAdminClient()

  const { data: instance, error } = await supabase
    .from('whatsapp_instances')
    .select('id, instance_id, token, client_token, provider, status')
    .eq('clinic_id', clinicId)
    .in('provider', ['zapi', 'evolution'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !instance) return null

  const provider = isValidProvider(instance.provider) ? instance.provider : 'zapi'

  return {
    id: instance.id,
    status: instance.status,
    credentials: {
      provider,
      instanceId: instance.instance_id,
      token: instance.token,
      clientToken: instance.client_token || undefined,
    },
  }
}
