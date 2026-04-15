import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { zapiSendChoices, zapiSendText, validateCredentials } from '@/lib/zapi/client';
import { assertSubscriptionActive } from '@/lib/services/subscriptionService';

/**
 * POST /api/zapi/send-text
 * 
 * Envia uma mensagem de texto via WhatsApp usando Z-API.
 * 
 * Body:
 * {
 *   conversationId: string,
 *   phone: string,
 *   text: string
 * }
 * 
 * Flow:
 * 1. Valida autenticação
 * 2. Obtém clinic_id do usuário
 * 3. Busca credenciais do WhatsApp
 * 4. Envia mensagem via Z-API
 * 5. Se sucesso: salva no banco e atualiza conversa
 * 6. Se erro: retorna erro sem salvar
 */
export async function POST(request: NextRequest) {
  try {
    // Parse body first to check if this is an internal call
    const body = await request.json();
    const { conversationId, phone, text, internalCall, choices, choicesTitle, clientMessageId } = body;

    let clinicId: string;
    let supabase;

    // Handle internal calls from bot (with service key)
    if (internalCall) {
      const authHeader = request.headers.get('authorization');
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!authHeader || !serviceKey || !authHeader.includes(serviceKey)) {
        return NextResponse.json(
          { ok: false, error: 'Unauthorized internal call' },
          { status: 401 }
        );
      }

      // For internal calls, clinicId should be passed or retrieved from conversation
      const { createAdminClient } = await import('@/lib/supabase/admin');
      supabase = createAdminClient();

      // Get clinicId from conversation
      const { data: conversation } = await supabase
        .from('conversations')
        .select('clinic_id')
        .eq('id', conversationId)
        .single();

      if (!conversation) {
        return NextResponse.json(
          { ok: false, error: 'Conversation not found' },
          { status: 404 }
        );
      }

      clinicId = conversation.clinic_id;
    } else {
      // Normal user call - authenticate
      supabase = await createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { ok: false, error: 'Não autenticado' },
          { status: 401 }
        );
      }

      // Get clinic_id from profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('clinic_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.clinic_id) {
        console.error('[Send Text] Failed to get clinic_id:', profileError);
        
        supabase.from('logs').insert({
          clinic_id: null,
          level: 'error',
          action: 'zapi.send.failed',
          message: 'Clínica não encontrada para o usuário',
          metadata: { userId: user.id },
        });

        return NextResponse.json(
          { ok: false, error: 'Clínica não encontrada' },
          { status: 404 }
        );
      }

      clinicId = profile.clinic_id;
    }

    // 1.5 Check subscription status
    try {
      await assertSubscriptionActive(clinicId);
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: 'Assinatura inativa. Acesse /dashboard/billing para regularizar.' },
        { status: 402 }
      );
    }

    // 2. Validate parameters

    // 2. Validate parameters
    if (!conversationId || !phone || !text) {
      return NextResponse.json(
        { 
          ok: false, 
          error: 'Parâmetros faltando: conversationId, phone, text são obrigatórios' 
        },
        { status: 400 }
      );
    }

    if (!internalCall && typeof clientMessageId === 'string' && clientMessageId.trim()) {
      const { data: existingMessage, error: existingMessageError } = await supabase
        .from('messages')
        .select('id, client_message_id, delivery_status')
        .eq('conversation_id', conversationId)
        .eq('client_message_id', clientMessageId.trim())
        .maybeSingle();

      if (existingMessageError) {
        console.error('[Send Text] Failed to check idempotent message:', existingMessageError);
      }

      if (existingMessage) {
        return NextResponse.json({
          ok: true,
          messageId: existingMessage.id,
          clientMessageId: existingMessage.client_message_id,
          deliveryStatus: existingMessage.delivery_status,
          duplicate: true,
        });
      }
    }

    // 3. Buscar instância WhatsApp da clínica
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_id, token, client_token, status')
      .eq('clinic_id', clinicId)
      .eq('provider', 'zapi')
      .single();

    if (instanceError || !instance) {
      console.error('[Send Text] Instance not found:', instanceError);
      
      supabase.from('logs').insert({
        clinic_id: clinicId,
        level: 'error',
        action: 'zapi.send.failed',
        message: 'Instância WhatsApp não configurada',
        metadata: { conversationId },
      });

      return NextResponse.json(
        { 
          ok: false, 
          error: 'WhatsApp não configurado. Configure a integração na página de Configurações.' 
        },
        { status: 404 }
      );
    }

    // 4. Validar credenciais
    const credentials = {
      instanceId: instance.instance_id,
      token: instance.token,
      clientToken: instance.client_token || undefined,
    };

    if (!validateCredentials(credentials)) {
      supabase.from('logs').insert({
        clinic_id: clinicId,
        level: 'error',
        action: 'zapi.send.failed',
        message: 'Credenciais do WhatsApp inválidas ou incompletas',
        metadata: { conversationId },
      });

      return NextResponse.json(
        { 
          ok: false, 
          error: 'WhatsApp não está conectado. Reconecte na página de Configurações.' 
        },
        { status: 400 }
      );
    }

    // 5. Enviar mensagem via Z-API
    let zapiResult;
    try {
      const normalizedChoices = Array.isArray(choices)
        ? choices
            .map((choice: unknown, index: number) => {
              if (typeof choice === 'string') {
                const label = choice.trim();
                return label ? { id: String(index + 1), label } : null;
              }

              if (choice && typeof choice === 'object') {
                const source = choice as { id?: unknown; label?: unknown; title?: unknown };
                const labelRaw = source.label ?? source.title;
                const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
                if (!label) return null;
                const id = source.id != null ? String(source.id) : String(index + 1);
                return { id, label };
              }

              return null;
            })
            .filter((item): item is { id: string; label: string } => item !== null)
        : [];

      if (normalizedChoices.length >= 2) {
        zapiResult = await zapiSendChoices(
          credentials,
          phone,
          text,
          normalizedChoices,
          typeof choicesTitle === 'string' && choicesTitle.trim().length > 0
            ? choicesTitle.trim()
            : 'Opções disponíveis'
        );
      } else {
        zapiResult = await zapiSendText(credentials, phone, text);
      }
    } catch (error) {
      console.error('[Send Text] Z-API send failed:', error);
      
      supabase.from('logs').insert({
        clinic_id: clinicId,
        level: 'error',
        action: 'zapi.send.failed',
        message: 'Falha ao enviar mensagem via Z-API',
        metadata: { 
          conversationId, 
          phone, 
          error: error instanceof Error ? error.message : String(error) 
        },
      });

      return NextResponse.json(
        { 
          ok: false, 
          error: 'Falha ao enviar mensagem pelo WhatsApp. Tente novamente.' 
        },
        { status: 500 }
      );
    }

    // 7. Salvar mensagem no banco (only for non-internal calls, bot saves its own messages)
    if (!internalCall) {
      const { error: messageError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender: 'human',
        content: text,
        client_message_id: typeof clientMessageId === 'string' ? clientMessageId.trim() || null : null,
        message_type: 'text',
        delivery_status: 'sent',
        metadata: {
          provider: 'zapi',
          direction: 'outbound',
          choicesCount: Array.isArray(choices) ? choices.length : 0,
        },
      });

      if (messageError) {
        console.error('[Send Text] Failed to save message:', messageError);

        if ((messageError as { code?: string }).code === '23505' && typeof clientMessageId === 'string' && clientMessageId.trim()) {
          const { data: existingMessage } = await supabase
            .from('messages')
            .select('id, client_message_id, delivery_status')
            .eq('conversation_id', conversationId)
            .eq('client_message_id', clientMessageId.trim())
            .maybeSingle();

          if (existingMessage) {
            return NextResponse.json({
              ok: true,
              messageId: existingMessage.id,
              clientMessageId: existingMessage.client_message_id,
              deliveryStatus: existingMessage.delivery_status,
              duplicate: true,
            });
          }
        }
        
        supabase.from('logs').insert({
          clinic_id: clinicId,
          level: 'error',
          action: 'zapi.send.failed',
          message: 'Mensagem enviada mas falhou ao salvar no banco',
          metadata: { 
            conversationId, 
            phone,
            zapiMessageId: zapiResult.messageId,
            error: messageError.message 
          },
        });

        return NextResponse.json(
          { 
            ok: false, 
            error: 'Mensagem enviada mas não foi salva. Recarregue a página.' 
          },
          { status: 500 }
        );
      }
    }

    // 8. Atualizar conversa (only for non-internal calls, bot updates conversation)
    if (!internalCall) {
      const truncatedPreview = text.length > 80 ? text.slice(0, 80) + '...' : text;
      const { error: conversationError } = await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: truncatedPreview,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (conversationError) {
        console.error('[Send Text] Failed to update conversation:', conversationError);
        // Não é crítico, a mensagem já foi enviada e salva
      }
    }

    // 9. Log de sucesso
    supabase.from('logs').insert({
      clinic_id: clinicId,
      level: 'info',
      action: 'zapi.send.success',
      message: 'Mensagem enviada com sucesso',
      metadata: { 
        conversationId, 
        phone,
        zapiMessageId: zapiResult.messageId,
        textLength: text.length 
      },
    });

    return NextResponse.json({
      ok: true,
      messageId: zapiResult.messageId,
      clientMessageId: typeof clientMessageId === 'string' ? clientMessageId.trim() || null : null,
      deliveryStatus: 'sent',
    });

  } catch (error) {
    console.error('[Send Text] Unexpected error:', error);
    
    return NextResponse.json(
      { 
        ok: false, 
        error: 'Erro inesperado ao enviar mensagem. Tente novamente.' 
      },
      { status: 500 }
    );
  }
}
