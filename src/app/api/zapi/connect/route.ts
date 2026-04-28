import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMissingCredentials, validateCredentials } from '@/lib/zapi/client';
import { getQr } from '@/lib/whatsapp/sender';
import { getWhatsAppInstance } from '@/lib/whatsapp/instance';
import { assertSubscriptionActive } from '@/lib/services/subscriptionService';

/**
 * POST /api/zapi/connect
 * 
 * Obtém o QR Code da instância WhatsApp para conectar.
 * Atualiza o status para 'connecting' e retorna os dados do QR.
 */
export async function POST(request: NextRequest) {
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

    // 2. Obter clinic_id do usuário (admin para bypassar RLS)
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.clinic_id) {
      console.error('[Z-API Connect] Failed to get clinic_id:', profileError);
      return NextResponse.json(
        { error: 'Clínica não encontrada' },
        { status: 404 }
      );
    }

    const clinicId = profile.clinic_id;

    // 2.5 Check subscription status
    try {
      await assertSubscriptionActive(clinicId);
    } catch (error) {
      return NextResponse.json(
        { error: 'Assinatura inativa. Acesse /dashboard/billing para regularizar.' },
        { status: 402 }
      );
    }

    // 3. Buscar instância WhatsApp da clínica
    const whatsapp = await getWhatsAppInstance(clinicId);

    if (!whatsapp) {
      return NextResponse.json(
        {
          error: 'Instância não configurada',
          message: 'Configure sua instância WhatsApp antes de conectar.',
        },
        { status: 404 }
      );
    }

    const { credentials } = whatsapp;
    const instance = { id: whatsapp.id };

    // 4. Validar credenciais
    if (!validateCredentials(credentials)) {
      const missingCredentials = getMissingCredentials(credentials);
      return NextResponse.json(
        {
          error: 'Credenciais inválidas',
          message: `A instância está configurada incorretamente. Campos faltando: ${missingCredentials.join(', ')}`,
          missingCredentials,
        },
        { status: 400 }
      );
    }

    // 5. Obter QR Code
    let qrData;
    try {
      qrData = await getQr(credentials);
    } catch (error) {
      console.error('[Z-API Connect] Failed to get QR:', error);
      return NextResponse.json(
        {
          error: 'Falha ao gerar QR Code',
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        },
        { status: 500 }
      );
    }

    // 6. Atualizar status para 'connecting'
    const { error: updateError } = await supabase
      .from('whatsapp_instances')
      .update({
        status: 'connecting',
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance.id);

    if (updateError) {
      console.error('[Z-API Connect] Failed to update status:', updateError);
      // Não retornar erro, pois o QR foi gerado com sucesso
    }

    // 7. Retornar QR Code
    return NextResponse.json({
      ok: true,
      qr: qrData,
      status: 'connecting',
    });
  } catch (error) {
    console.error('[Z-API Connect] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Erro interno',
        message: 'Ocorreu um erro ao processar a solicitação.',
      },
      { status: 500 }
    );
  }
}
