'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Tipos
type WhatsAppStatus = 'connected' | 'disconnected' | 'connecting';

interface QrCodeData {
  type: 'base64' | 'text';
  value: string;
}

interface StatusInfo {
  status: WhatsAppStatus;
  instanceId?: string;
}

type WhatsAppRealtimeRow = {
  status?: string;
  instance_id?: string | null;
};

const STATUS_LABELS: Record<WhatsAppStatus, string> = {
  connected: 'Conectado',
  disconnected: 'Desconectado',
  connecting: 'Conectando',
};

const STATUS_COLORS: Record<WhatsAppStatus, string> = {
  connected: 'bg-green-100 text-green-800 border-green-200',
  disconnected: 'bg-red-100 text-red-800 border-red-200',
  connecting: 'bg-amber-100 text-amber-800 border-amber-200',
};

const STATUS_TOOLTIPS: Record<WhatsAppStatus, string> = {
  connected: 'WhatsApp pronto para receber e enviar mensagens.',
  disconnected: 'Clique em Gerar QR e escaneie no WhatsApp.',
  connecting: 'Aguardando leitura do QR Code.',
};

const POLLING_INTERVAL = 5000; // 5 segundos

export default function WhatsAppConfigPageClient() {
  const router = useRouter();
  
  // Estado
  const [status, setStatus] = useState<WhatsAppStatus>('disconnected');
  const [qrCode, setQrCode] = useState<QrCodeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInstance, setHasInstance] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [syncConfigured, setSyncConfigured] = useState(false);
  const [configuringSync, setConfiguringSync] = useState(false);
  
  // Referências
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Buscar status inicial
  const fetchStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const response = await fetch('/api/zapi/status');
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setHasInstance(false);
          return;
        }
        throw new Error(data.message || 'Erro ao buscar status');
      }

      // Verificar se a instância está pendente (credenciais não configuradas)
      if (data.pending) {
        setIsPending(true);
        setStatus('disconnected');
        setHasInstance(true);
        return;
      }

      setIsPending(false);
      setStatus(data.status);
      setHasInstance(true);
      
      // Salvar instanceId para o Realtime
      if (data.instanceId) {
        setInstanceId(data.instanceId);
      }

      // Se status mudou para connected, parar de mostrar QR
      if (data.status === 'connected' && qrCode) {
        setQrCode(null);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar status');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [qrCode]);

  // Gerar QR Code
  const generateQr = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/zapi/connect', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao gerar QR Code');
      }

      setQrCode(data.qr);
      setStatus('connecting');
      
      // Iniciar polling após gerar QR
      startPolling();
    } catch (err) {
      console.error('Failed to generate QR:', err);
      setError(err instanceof Error ? err.message : 'Erro ao gerar QR Code');
    } finally {
      setLoading(false);
    }
  };

  // Reconectar
  const reconnect = async () => {
    try {
      setLoading(true);
      setError(null);
      setQrCode(null);

      const response = await fetch('/api/zapi/reconnect', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao reconectar');
      }

      setQrCode(data.qr);
      setStatus('connecting');
      
      // Iniciar polling após reconectar
      startPolling();
    } catch (err) {
      console.error('Failed to reconnect:', err);
      setError(err instanceof Error ? err.message : 'Erro ao reconectar');
    } finally {
      setLoading(false);
    }
  };

  // Polling
  const startPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
    }

    setIsPolling(true);

    pollingTimerRef.current = setInterval(() => {
      fetchStatus(true); // silent = true para não mostrar loading
    }, POLLING_INTERVAL);
  }, [fetchStatus]);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const configureSync = useCallback(async (silent = false) => {
    try {
      if (!silent) setConfiguringSync(true);
      const response = await fetch('/api/zapi/configure-sync', { method: 'POST' });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao configurar sincronização');
      }

      setSyncConfigured(true);
    } catch (err) {
      console.error('Failed to configure sync:', err);
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Erro ao configurar sincronização');
      }
    } finally {
      if (!silent) setConfiguringSync(false);
    }
  }, []);

  // Renderizar QR Code (se tipo 'text')
  useEffect(() => {
    if (qrCode?.type === 'text' && qrCanvasRef.current) {
      // Usando dynamic import para evitar erro SSR
      import('qrcode').then((QRCode) => {
        if (qrCanvasRef.current) {
          QRCode.toCanvas(qrCanvasRef.current, qrCode.value, {
            width: 280,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
        }
      }).catch((err) => {
        console.error('Failed to render QR code:', err);
        setError('Erro ao renderizar QR Code');
      });
    }
  }, [qrCode]);

  // Gerenciar polling baseado no status
  useEffect(() => {
    if (status === 'connecting' || status === 'disconnected') {
      if (qrCode) {
        startPolling();
      }
    } else if (status === 'connected') {
      stopPolling();
      if (!syncConfigured) {
        void configureSync(true);
      }
    }

    return () => {
      stopPolling();
    };
  }, [configureSync, qrCode, startPolling, status, stopPolling, syncConfigured]);

  // Buscar status ao montar
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Setup Supabase Realtime para atualização instantânea
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      try {
        // Obter user atual
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('[Realtime] User not authenticated');
          return;
        }

        // Obter clinic_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('clinic_id')
          .eq('id', user.id)
          .single();

        if (!profile?.clinic_id) {
          console.log('[Realtime] Clinic not found');
          return;
        }

        // Inscrever no canal de mudanças da instância WhatsApp
        channel = supabase
          .channel('whatsapp-status-changes')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'whatsapp_instances',
              filter: `clinic_id=eq.${profile.clinic_id}`,
            },
            (payload: { new: WhatsAppRealtimeRow }) => {
              console.log('[Realtime] Status changed:', payload);
              const newStatus = payload.new.status as WhatsAppStatus;
              
              // Atualizar status imediatamente
              setStatus(newStatus);
              
              // Se conectou, limpar QR Code
              if (newStatus === 'connected') {
                setQrCode(null);
                stopPolling();
              }
            }
          )
          .subscribe((status: string) => {
            console.log('[Realtime] Subscription status:', status);
          });
      } catch (error) {
        console.error('[Realtime] Setup error:', error);
      }
    };

    setupRealtime();

    // Cleanup
    return () => {
      if (channel) {
        console.log('[Realtime] Unsubscribing');
        supabase.removeChannel(channel);
      }
    };
  }, [stopPolling]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  if (!hasInstance) {
    return (
      <div className="px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
            <p className="text-sm text-gray-600 mt-1">
              Conecte o número da sua clínica para enviar e receber mensagens no Doctor Chat.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1 text-sm">Instância ainda não configurada</h3>
                <p className="text-blue-800 text-sm mb-4">
                  Após o pagamento, sua instância WhatsApp será criada automaticamente e aparecerá aqui.
                </p>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  onClick={() => {
                    alert('Entre em contato com o suporte para contratar uma instância.');
                  }}
                >
                  Solicitar configuração
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Estado: Instância em preparação (credenciais ainda não liberadas)
  if (isPending) {
    return (
      <div className="px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
            <p className="text-sm text-gray-600 mt-1">
              Conecte o número da sua clínica para enviar e receber mensagens no Doctor Chat.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
            {/* Header com gradiente sutil */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 border-b border-gray-200">
              <div className="flex items-center gap-3">
                {/* Ícone de relógio animado */}
                <div className="flex-shrink-0">
                  <div className="relative w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg 
                      className="w-6 h-6 text-blue-600 animate-pulse" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" 
                      />
                    </svg>
                  </div>
                </div>
                
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Instância em preparação</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Prazo médio: até 2 horas
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Conteúdo */}
            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-gray-700 leading-relaxed text-sm">
                    Recebemos seu pagamento. Sua instância do WhatsApp está sendo criada e ficará disponível em até 2 horas.
                  </p>
                  <p className="text-gray-700 leading-relaxed mt-2 text-sm">
                    Assim que estiver pronta, o QR Code aparecerá automaticamente aqui.
                  </p>
                </div>

                {/* Etapas visuais */}
                <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Próximas etapas:</h4>
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                        <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-700">Pagamento confirmado</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                      </div>
                      <p className="text-sm text-gray-700">Criando instância (em andamento)</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center mt-0.5">
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      </div>
                      <p className="text-sm text-gray-500">Liberação do QR Code</p>
                    </div>
                  </div>
                </div>

                {/* Botão de atualizar */}
                <button
                  onClick={() => fetchStatus(false)}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Verificando...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Atualizar status
                    </>
                  )}
                </button>

                {/* Nota informativa */}
                <div className="text-center pt-2">
                  <p className="text-xs text-gray-500">
                    Esta página será atualizada automaticamente quando a instância estiver pronta.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
          <p className="text-sm text-gray-600 mt-1">
            Conecte o número da sua clínica para enviar e receber mensagens no Doctor Chat.
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Grid principal: 2 colunas desktop, 1 mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* COLUNA ESQUERDA */}
          <div className="space-y-6">
            {/* Card Status compacto */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Status</h2>
              
              {/* Badge com dot */}
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${STATUS_COLORS[status]}`}
                >
                  <span className="relative flex h-2 w-2 mr-2">
                    {status === 'connecting' && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      status === 'connected' ? 'bg-green-500' :
                      status === 'connecting' ? 'bg-amber-500' :
                      'bg-red-500'
                    }`}></span>
                  </span>
                  {STATUS_LABELS[status]}
                </span>
              </div>

              {/* Informações de status */}
              <div className="space-y-1.5 text-sm text-gray-600">
                <p>Última verificação: há poucos segundos</p>
                {status === 'connected' && (
                  <p>Última conexão: hoje às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                )}
              </div>

              {/* Alerta se desconectado */}
              {status === 'disconnected' && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-900">
                    O WhatsApp não está conectado. Gere um QR Code e escaneie no celular. Leva menos de 1 minuto.
                  </p>
                </div>
              )}

              {/* Mensagem de sucesso se conectado */}
              {status === 'connected' && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-900">
                    Tudo certo! Sua clínica já pode enviar e receber mensagens pelo painel.
                  </p>
                  <p className="mt-1 text-xs text-green-700">
                    {syncConfigured
                      ? 'Webhook e notifySentByMe configurados.'
                      : 'Ajustando webhook e sincronização com mensagens enviadas pelo celular...'}
                  </p>
                </div>
              )}
            </div>

            {/* Card Ajuda rápida */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Ajuda rápida</h2>
              
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                A conexão é feita via WhatsApp Web. Você escaneia o QR Code uma única vez.
              </p>

              {/* Mini ilustração */}
              <div className="aspect-video rounded-xl bg-gradient-to-br from-neutral-50 to-neutral-100 border border-neutral-200 flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-2 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-neutral-500">Tutorial em breve</p>
                </div>
              </div>

              <button className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
                Ver tutorial →
              </button>
            </div>
          </div>

          {/* COLUNA DIREITA */}
          <div>
            {/* Card Conectar número */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-5">
                {status === 'connected' ? 'Conexão Ativa' : 'Conectar número'}
              </h2>

              {status === 'connected' ? (
                <div className="flex items-center justify-center py-10">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                      <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">Conectado!</h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Tudo certo! Sua clínica já pode enviar e receber mensagens pelo painel.
                    </p>
                    
                    {/* Botões quando conectado */}
                    <div className="space-y-2">
                      <button
                        onClick={() => configureSync(false)}
                        disabled={configuringSync}
                        className="w-full px-4 py-2.5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {configuringSync ? 'Configurando sincronização...' : 'Configurar sincronização'}
                      </button>
                      <button
                        onClick={() => fetchStatus()}
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {loading ? 'Atualizando...' : 'Atualizar status'}
                      </button>
                      <button
                        onClick={reconnect}
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-gray-700 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {loading ? 'Reconectando...' : 'Reconectar'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Container QR Code premium */}
                  <div className="mb-5">
                    <div className="bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-2xl p-6 flex items-center justify-center">
                      {qrCode ? (
                        <div className="relative">
                          <div className="bg-white p-4 rounded-xl shadow-sm">
                            {qrCode.type === 'base64' ? (
                              <img
                                src={`data:image/png;base64,${qrCode.value}`}
                                alt="QR Code WhatsApp"
                                className="w-[240px] h-[240px]"
                              />
                            ) : (
                              <canvas
                                ref={qrCanvasRef}
                                className="w-[240px] h-[240px]"
                              />
                            )}
                          </div>
                          
                          {/* Overlay conectando */}
                          {status === 'connecting' && (
                            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center">
                              <div className="text-center">
                                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-gray-900 mb-2"></div>
                                <p className="text-sm text-gray-600">Aguardando...</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <svg className="w-16 h-16 text-neutral-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                          </svg>
                          <p className="text-sm text-gray-600 font-medium">Clique em Gerar QR Code</p>
                          <p className="text-xs text-gray-500 mt-1">O código expira em alguns segundos.</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Microcopy */}
                    {qrCode && (
                      <p className="text-xs text-center text-gray-500 mt-2">
                        Escaneie com o WhatsApp do número que será usado na clínica.
                      </p>
                    )}
                  </div>

                  {/* Steps com ícones */}
                  <div className="mb-5 bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Como conectar:</h4>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">
                          1
                        </div>
                        <p className="text-sm text-gray-700 pt-0.5">Abra o WhatsApp</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">
                          2
                        </div>
                        <p className="text-sm text-gray-700 pt-0.5">Vá em Aparelhos conectados</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">
                          3
                        </div>
                        <p className="text-sm text-gray-700 pt-0.5">Escaneie o QR Code</p>
                      </div>
                    </div>
                  </div>

                  {/* Botões de ação */}
                  <div className="space-y-2">
                    <button
                      onClick={qrCode ? reconnect : generateQr}
                      disabled={loading}
                      className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          {qrCode ? 'Regerando...' : 'Gerando...'}
                        </span>
                      ) : (
                        qrCode ? 'Reconectar' : 'Gerar QR Code'
                      )}
                    </button>

                    <button
                      onClick={() => fetchStatus()}
                      disabled={loading}
                      className="w-full px-4 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-gray-700 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {loading ? 'Verificando...' : 'Verificar conexão'}
                    </button>
                  </div>

                  {/* Indicador de polling */}
                  {isPolling && status === 'connecting' && (
                    <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <p className="text-xs text-blue-700 text-center flex items-center justify-center gap-2">
                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Verificando conexão automaticamente
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
