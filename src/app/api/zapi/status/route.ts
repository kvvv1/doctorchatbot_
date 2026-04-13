import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMissingCredentials, zapiGetStatus, validateCredentials, ZapiStatus } from '@/lib/zapi/client';

/**
 * GET /api/zapi/status
 * 
 * Consulta o status atual da instância WhatsApp na Z-API.
 * Atualiza o status no banco e retorna para o cliente.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Autenticar usuário
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // 2. Obter clinic_id do usuário
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.clinic_id) {
      console.error('[Z-API Status] Failed to get clinic_id:', profileError);
      return NextResponse.json(
        { error: 'Clínica não encontrada' },
        { status: 404 }
      );
    }

    const clinicId = profile.clinic_id;

    // 3. Buscar instância WhatsApp da clínica
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_id, token, client_token, status')
      .eq('clinic_id', clinicId)
      .eq('provider', 'zapi')
      .single();

    if (instanceError || !instance) {
      console.error('[Z-API Status] Instance not found:', instanceError);
      return NextResponse.json(
        {
          error: 'Instância não configurada',
          message: 'Configure sua instância WhatsApp antes de verificar o status.',
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
      const missingCredentials = getMissingCredentials(credentials);
      // Instância existe mas credenciais ainda não foram configuradas
      // Retornar status especial indicando "em preparação"
      return NextResponse.json({
        ok: true,
        status: 'disconnected',
        pending: true,
        missingCredentials,
        message:
          missingCredentials.includes('clientToken')
            ? 'Falta o Client Token da Z-API para gerar QR. Preencha em Configurações > WhatsApp.'
            : 'Instância em preparação. Aguarde até 2 horas para a liberação.',
      });
    }

    // 5. Consultar status na Z-API
    let status: ZapiStatus;
    try {
      console.log('[Z-API Status] Fetching status from Z-API for instance:', instance.instance_id);
      status = await zapiGetStatus(credentials);
      console.log('[Z-API Status] Status received from Z-API:', status);
    } catch (error) {
      console.error('[Z-API Status] Failed to get status:', error);
      // Em caso de erro, usar status atual do banco
      status = instance.status as ZapiStatus || 'disconnected';
    }

    // 6. Atualizar status no banco (se mudou)
    if (status !== instance.status) {
      console.log(`[Z-API Status] Status changed from '${instance.status}' to '${status}'. Updating database...`);
      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', instance.id);

      if (updateError) {
        console.error('[Z-API Status] Failed to update status:', updateError);
        // Não retornar erro, pois o status foi consultado com sucesso
      } else {
        console.log('[Z-API Status] Database updated successfully');
      }
    } else {
      console.log(`[Z-API Status] Status unchanged: '${status}'`);
    }

    // 7. Retornar status
    return NextResponse.json({
      ok: true,
      status,
      instanceId: instance.instance_id, // Útil para debug (sem expor token)
    });
  } catch (error) {
    console.error('[Z-API Status] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Erro interno',
        message: 'Ocorreu um erro ao processar a solicitação.',
      },
      { status: 500 }
    );
  }
}
