'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/client';
import { FiMessageCircle } from 'react-icons/fi';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

interface QRData {
  type: 'base64' | 'json';
  value: string;
}

const STATUS_COLORS = {
  connected: 'bg-green-100 text-green-800 border-green-200',
  disconnected: 'bg-red-100 text-red-800 border-red-200',
  connecting: 'bg-amber-100 text-amber-800 border-amber-200',
};

const STATUS_LABELS = {
  connected: 'Conectado',
  disconnected: 'Desconectado',
  connecting: 'Conectando...',
};

interface WhatsAppConnectionTabProps {
  clinicId: string;
}

export default function WhatsAppConnectionTab({ clinicId }: WhatsAppConnectionTabProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [qrCode, setQrCode] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInstance, setHasInstance] = useState(true); // Assume true inicialmente
  const [isPending, setIsPending] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [instanceId, setInstanceId] = useState<string | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Função para buscar o status
  const fetchStatus = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/zapi/status');
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          setHasInstance(false);
          setStatus('disconnected');
          return;
        }
        throw new Error(data.error || 'Erro ao buscar status');
      }

      if (data.isPending) {
        setIsPending(true);
        setHasInstance(true);
        setStatus('disconnected');
        return;
      }

      setHasInstance(true);
      setIsPending(false);
      setInstanceId(data.instanceId);

      const newStatus: ConnectionStatus =
        data.connected === true ? 'connected' :
        data.connected === 'connecting' || data.connected === 'qrReadSuccess' ? 'connecting' :
        'disconnected';

      setStatus(newStatus);

      // Se estava conectando e agora conectou, para o polling
      if (newStatus === 'connected' && isPolling) {
        stopPolling();
      }
    } catch (err) {
      console.error('Erro ao buscar status:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [isPolling]);

  // Função para gerar QR code
  const generateQr = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/zapi/connect', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar QR code');
      }

      if (data.qrcode && data.qrcode.qrcode) {
        setQrCode({ type: 'base64', value: data.qrcode.qrcode });
        setStatus('connecting');
        startPolling();
      } else if (data.value) {
        setQrCode({ type: 'json', value: data.value });
        setStatus('connecting');
        startPolling();
      } else if (data.error && data.error.includes('already connected')) {
        await fetchStatus();
      } else {
        throw new Error('QR code não retornado pela API');
      }
    } catch (err) {
      console.error('Erro ao gerar QR code:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Função para reconectar
  const reconnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/zapi/reconnect', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao reconectar');
      }

      if (data.qrcode && data.qrcode.qrcode) {
        setQrCode({ type: 'base64', value: data.qrcode.qrcode });
        setStatus('connecting');
        startPolling();
      } else if (data.value) {
        setQrCode({ type: 'json', value: data.value });
        setStatus('connecting');
        startPolling();
      } else {
        await fetchStatus();
      }
    } catch (err) {
      console.error('Erro ao reconectar:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Polling
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    setIsPolling(true);
    pollingIntervalRef.current = setInterval(() => {
      fetchStatus(false);
    }, 2000);
  }, [fetchStatus]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Renderizar QR code no canvas
  useEffect(() => {
    if (qrCode && qrCode.type === 'json' && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, qrCode.value, { width: 240 }, (err) => {
        if (err) console.error('Erro ao renderizar QR Code:', err);
      });
    }
  }, [qrCode]);

  // Fetch inicial
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Supabase Realtime
  useEffect(() => {
    if (!instanceId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`whatsapp-status-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clinics',
          filter: `id=eq.${clinicId}`,
        },
        (payload) => {
          const newData = payload.new as { whatsapp_connected?: boolean };
          if (newData.whatsapp_connected === true) {
            setStatus('connected');
            stopPolling();
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [instanceId, clinicId, stopPolling]);

  // Cleanup polling
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // ESTADO: Sem instância configurada
  if (!hasInstance) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1 text-sm">Instância ainda não configurada</h3>
              <p className="text-blue-800 text-sm mb-4">
                Após o pagamento, sua instância WhatsApp será criada automaticamente e aparecerá aqui em até 2 horas.
              </p>
              <a
                href="https://wa.me/5511999999999?text=Preciso%20de%20ajuda%20com%20minha%20inst%C3%A2ncia%20WhatsApp"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <FiMessageCircle className="w-4 h-4" />
                Falar com suporte
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ESTADO: Instância em preparação
  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="relative w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg 
                    className="w-5 h-5 text-blue-600 animate-pulse" 
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
                <h3 className="text-base font-semibold text-gray-900">Instância em preparação</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 mt-1">
                  <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Prazo médio: até 2 horas
                </span>
              </div>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="p-5 space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-gray-700 leading-relaxed text-sm">
                Recebemos seu pagamento. Sua instância do WhatsApp está sendo criada e ficará disponível em até 2 horas.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2 text-sm">
                Assim que estiver pronta, o QR Code aparecerá automaticamente aqui.
              </p>
            </div>

            {/* Etapas */}
            <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
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

            {/* Botões */}
            <div className="flex gap-2">
              <button
                onClick={() => fetchStatus(false)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verificando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Atualizar status
                  </>
                )}
              </button>
              
              <a
                href="https://wa.me/5511999999999?text=Minha%20inst%C3%A2ncia%20WhatsApp%20est%C3%A1%20demorando"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-gray-700 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
              >
                <FiMessageCircle className="w-4 h-4" />
                Suporte
              </a>
            </div>

            <p className="text-xs text-center text-gray-500">
              Esta página será atualizada automaticamente quando a instância estiver pronta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ESTADO PRINCIPAL: Conexão WhatsApp
  return (
    <div className="space-y-4">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* COLUNA ESQUERDA: Status */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Status da Conexão</h3>
          
          {/* Badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${STATUS_COLORS[status]}`}>
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

          {/* Alerta se desconectado */}
          {status === 'disconnected' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
              <p className="text-sm text-amber-900">
                O WhatsApp não está conectado. Gere um QR Code e escaneie no celular.
              </p>
            </div>
          )}

          {/* Mensagem de sucesso */}
          {status === 'connected' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
              <p className="text-sm text-green-900">
                Tudo certo! Sua clínica já pode enviar e receber mensagens.
              </p>
            </div>
          )}

          {/* Botão de suporte */}
          <a
            href="https://wa.me/5511999999999?text=Preciso%20de%20ajuda%20com%20WhatsApp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <FiMessageCircle className="w-4 h-4" />
            Falar com suporte
          </a>
        </div>

        {/* COLUNA DIREITA: QR Code / Conectado */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {status === 'connected' ? 'Conexão Ativa' : 'Conectar Número'}
          </h3>

          {status === 'connected' ? (
            <div className="flex items-center justify-center py-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-3">
                  <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">Conectado!</h4>
                <p className="text-xs text-gray-600 mb-4">
                  WhatsApp funcionando normalmente
                </p>
                
                <div className="space-y-2">
                  <button
                    onClick={() => fetchStatus()}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {loading ? 'Atualizando...' : 'Atualizar status'}
                  </button>
                  <button
                    onClick={reconnect}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-white border border-neutral-300 hover:bg-neutral-50 text-gray-700 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {loading ? 'Reconectando...' : 'Reconectar'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* QR Code */}
              <div className="mb-4">
                <div className="bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-xl p-4 flex items-center justify-center">
                  {qrCode ? (
                    <div className="relative">
                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        {qrCode.type === 'base64' ? (
                          <img
                            src={`data:image/png;base64,${qrCode.value}`}
                            alt="QR Code WhatsApp"
                            className="w-[200px] h-[200px]"
                          />
                        ) : (
                          <canvas
                            ref={qrCanvasRef}
                            className="w-[200px] h-[200px]"
                          />
                        )}
                      </div>
                      
                      {status === 'connecting' && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center">
                          <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-900 mb-1"></div>
                            <p className="text-xs text-gray-600">Aguardando...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <svg className="w-12 h-12 text-neutral-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      <p className="text-xs text-gray-600 font-medium">Clique em Gerar QR Code</p>
                    </div>
                  )}
                </div>
                
                {qrCode && (
                  <p className="text-xs text-center text-gray-500 mt-2">
                    Escaneie com WhatsApp → Aparelhos conectados
                  </p>
                )}
              </div>

              {/* Botões */}
              <div className="space-y-2">
                <button
                  onClick={qrCode ? reconnect : generateQr}
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="w-full px-4 py-2 bg-white border border-neutral-300 hover:bg-neutral-50 text-gray-700 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {loading ? 'Verificando...' : 'Verificar conexão'}
                </button>
              </div>

              {/* Indicador de polling */}
              {isPolling && status === 'connecting' && (
                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-2">
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
  );
}
