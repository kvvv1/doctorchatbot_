import { createAdminClient } from '@/lib/supabase/admin'
import { assertSubscriptionActive } from '@/lib/services/subscriptionService'
import {
  validateCredentials,
  zapiSendChoices,
  zapiSendText,
  type ZapiChoiceOption,
} from '@/lib/zapi/client'

type SendInternalZapiMessageParams = {
  clinicId: string
  conversationId: string
  phone: string
  text: string
  choices?: ZapiChoiceOption[]
  choicesTitle?: string
}

type SendInternalZapiMessageResult = {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendInternalZapiMessage(
  params: SendInternalZapiMessageParams
): Promise<SendInternalZapiMessageResult> {
  const supabase = createAdminClient()

  try {
    await assertSubscriptionActive(params.clinicId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logInternalSendFailure(supabase, params, message)
    return { success: false, error: message }
  }

  const { data: instance, error: instanceError } = await supabase
    .from('whatsapp_instances')
    .select('instance_id, token, client_token')
    .eq('clinic_id', params.clinicId)
    .eq('provider', 'zapi')
    .single()

  if (instanceError || !instance) {
    const message = 'Instância WhatsApp não configurada'
    await logInternalSendFailure(supabase, params, message)
    return { success: false, error: message }
  }

  const credentials = {
    instanceId: instance.instance_id,
    token: instance.token,
    clientToken: instance.client_token || undefined,
  }

  if (!validateCredentials(credentials)) {
    const message = 'Credenciais do WhatsApp inválidas ou incompletas'
    await logInternalSendFailure(supabase, params, message)
    return { success: false, error: message }
  }

  try {
    const result =
      params.choices && params.choices.length >= 1
        ? await zapiSendChoices(
            credentials,
            params.phone,
            params.text,
            params.choices,
            params.choicesTitle || 'Opções disponíveis'
          )
        : await zapiSendText(credentials, params.phone, params.text)

    await supabase.from('logs').insert({
      clinic_id: params.clinicId,
      level: 'info',
      action: 'zapi.send.success',
      message: 'Mensagem enviada com sucesso',
      metadata: {
        conversationId: params.conversationId,
        phone: params.phone,
        zapiMessageId: result.messageId,
        textLength: params.text.length,
        internalCall: true,
      },
    })

    return {
      success: true,
      messageId: result.messageId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logInternalSendFailure(supabase, params, message)
    return { success: false, error: message }
  }
}

async function logInternalSendFailure(
  supabase: ReturnType<typeof createAdminClient>,
  params: SendInternalZapiMessageParams,
  error: string
) {
  try {
    await supabase.from('logs').insert({
      clinic_id: params.clinicId,
      level: 'error',
      action: 'zapi.send.failed',
      message: 'Falha ao enviar mensagem via Z-API',
      metadata: {
        conversationId: params.conversationId,
        phone: params.phone,
        error,
        internalCall: true,
      },
    })
  } catch {
    // Ignore logging failures for internal send telemetry.
  }
}
