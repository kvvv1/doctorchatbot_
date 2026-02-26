/**
 * Bot Engine - State Machine for automated responses
 */

import { createClient } from '@supabase/supabase-js';
import { detectIntent, detectYesNo } from './intent';
import { templates } from './templates';
import type { BotSettings } from '@/lib/types/database';

export type BotState =
  | 'menu'
  | 'agendar_nome'
  | 'agendar_dia'
  | 'agendar_hora'
  | 'reagendar_dia'
  | 'reagendar_hora'
  | 'cancelar_confirmar'
  | 'cancelar_encaixe';

export type BotContext = {
  name?: string;
  day?: string;
  time?: string;
  intent?: string;
};

type BotResponse = {
  message: string;
  nextState: BotState;
  nextContext: BotContext;
  conversationStatus?: string;
  appointmentCreated?: boolean;
  appointmentId?: string;
};

/**
 * Main bot engine - processes user message and returns response
 */
export async function handleBotTurn(
  conversationId: string,
  userMessage: string,
  currentState: BotState = 'menu',
  currentContext: BotContext = {},
  botSettings?: BotSettings | null
): Promise<BotResponse> {
  const state = currentState || 'menu';

  switch (state) {
    case 'menu':
      return handleMenuState(userMessage, currentContext, botSettings);

    case 'agendar_nome':
      return handleAgendarNomeState(userMessage, currentContext);

    case 'agendar_dia':
      return handleAgendarDiaState(userMessage, currentContext);

    case 'agendar_hora':
      return await handleAgendarHoraState(conversationId, userMessage, currentContext, botSettings);

    case 'reagendar_dia':
      return handleReagendarDiaState(userMessage, currentContext);

    case 'reagendar_hora':
      return handleReagendarHoraState(userMessage, currentContext, botSettings);

    case 'cancelar_confirmar':
      return handleCancelarConfirmarState(userMessage, currentContext);

    case 'cancelar_encaixe':
      return handleCancelarEncaixeState(userMessage, currentContext);

    default:
      return {
        message: botSettings?.message_menu || templates.menu,
        nextState: 'menu',
        nextContext: {},
      };
  }
}

/**
 * Handle menu state - detect intent and route
 */
function handleMenuState(userMessage: string, context: BotContext, botSettings?: BotSettings | null): BotResponse {
  const intent = detectIntent(userMessage);

  switch (intent) {
    case 'schedule':
      return {
        message: templates.scheduleAskName,
        nextState: 'agendar_nome',
        nextContext: { intent: 'schedule' },
      };

    case 'reschedule':
      return {
        message: templates.rescheduleAskDay,
        nextState: 'reagendar_dia',
        nextContext: { intent: 'reschedule' },
      };

    case 'cancel':
      return {
        message: templates.cancelConfirm,
        nextState: 'cancelar_confirmar',
        nextContext: { intent: 'cancel' },
      };

    default:
      return {
        message: botSettings?.message_fallback || templates.notUnderstood,
        nextState: 'menu',
        nextContext: {},
      };
  }
}

/**
 * Scheduling flow - collect name
 */
function handleAgendarNomeState(userMessage: string, context: BotContext): BotResponse {
  const name = userMessage.trim();

  return {
    message: templates.scheduleAskDay(name),
    nextState: 'agendar_dia',
    nextContext: { ...context, name },
  };
}

/**
 * Scheduling flow - collect day
 */
function handleAgendarDiaState(userMessage: string, context: BotContext): BotResponse {
  const day = userMessage.trim();

  return {
    message: templates.scheduleAskTime(day),
    nextState: 'agendar_hora',
    nextContext: { ...context, day },
  };
}

/**
 * Scheduling flow - collect time and finish
 */
async function handleAgendarHoraState(
  conversationId: string,
  userMessage: string,
  context: BotContext,
  botSettings?: BotSettings | null
): Promise<BotResponse> {
  const time = userMessage.trim();
  const name = context.name || 'Paciente';
  const day = context.day || 'a definir';

  // Tentar criar o appointment real
  try {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/bot/create-appointment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        dayText: day,
        timeText: time,
      }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Appointment criado com sucesso!
      return {
        message: data.message,
        nextState: 'menu',
        nextContext: {},
        conversationStatus: 'scheduled',
        appointmentCreated: true,
        appointmentId: data.appointmentId,
      };
    } else {
      // Erro ao criar (conflito, horário inválido, etc.)
      return {
        message: data.message || 'Não consegui confirmar o agendamento. Pode tentar outro horário?',
        nextState: 'agendar_hora', // Manter no estado para tentar novamente
        nextContext: context,
      };
    }
  } catch (error) {
    console.error('Error creating appointment from bot:', error);
    
    // Fallback: apenas confirmar sem criar no sistema
    return {
      message: botSettings?.message_confirm_schedule || templates.scheduleConfirm(name, day, time),
      nextState: 'menu',
      nextContext: {},
      conversationStatus: 'waiting_patient',
    };
  }
}

/**
 * Rescheduling flow - collect new day
 */
function handleReagendarDiaState(userMessage: string, context: BotContext): BotResponse {
  const day = userMessage.trim();

  return {
    message: templates.rescheduleAskTime(day),
    nextState: 'reagendar_hora',
    nextContext: { ...context, day },
  };
}

/**
 * Rescheduling flow - collect new time and finish
 */
function handleReagendarHoraState(userMessage: string, context: BotContext, botSettings?: BotSettings | null): BotResponse {
  const time = userMessage.trim();
  const day = context.day || 'a definir';

  return {
    message: botSettings?.message_confirm_reschedule || templates.rescheduleConfirm(day, time),
    nextState: 'menu',
    nextContext: {},
    conversationStatus: 'reschedule',
  };
}

/**
 * Cancellation flow - confirm cancellation
 */
function handleCancelarConfirmarState(userMessage: string, context: BotContext): BotResponse {
  const response = detectYesNo(userMessage);

  if (response === 'yes') {
    return {
      message: templates.cancelAskWaitlist,
      nextState: 'cancelar_encaixe',
      nextContext: context,
    };
  }

  if (response === 'no') {
    return {
      message: templates.cancelAborted,
      nextState: 'menu',
      nextContext: {},
    };
  }

  // Ask again if unclear
  return {
    message: templates.cancelConfirm,
    nextState: 'cancelar_confirmar',
    nextContext: context,
  };
}

/**
 * Cancellation flow - ask about waitlist
 */
function handleCancelarEncaixeState(userMessage: string, context: BotContext): BotResponse {
  const response = detectYesNo(userMessage);

  if (response === 'yes') {
    return {
      message: templates.cancelWithWaitlist,
      nextState: 'menu',
      nextContext: {},
      conversationStatus: 'waitlist',
    };
  }

  if (response === 'no') {
    return {
      message: templates.cancelWithoutWaitlist,
      nextState: 'menu',
      nextContext: {},
      conversationStatus: 'canceled',
    };
  }

  // Ask again if unclear
  return {
    message: templates.cancelAskWaitlist,
    nextState: 'cancelar_encaixe',
    nextContext: context,
  };
}

/**
 * Send bot message and update conversation
 */
export async function sendBotResponse(
  conversationId: string,
  phone: string,
  response: BotResponse,
  clinicId: string
): Promise<boolean> {
  // Get Supabase admin client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Send message via Z-API
    const sendResult = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/zapi/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Use service key for internal calls
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          conversationId,
          phone,
          text: response.message,
          internalCall: true, // Flag to bypass auth check
        }),
      }
    );

    if (!sendResult.ok) {
      console.error('[Bot] Failed to send message via Z-API:', await sendResult.text());
      return false;
    }

    // 2. Save bot message in database
    const { error: messageError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'bot',
      content: response.message,
      created_at: new Date().toISOString(),
    });

    if (messageError) {
      console.error('[Bot] Failed to save bot message:', messageError);
      return false;
    }

    // 3. Update conversation
    const updateData: any = {
      last_message_at: new Date().toISOString(),
      last_message_preview: response.message.substring(0, 100),
      bot_state: response.nextState,
      bot_context: response.nextContext,
    };

    // Update status if provided
    if (response.conversationStatus) {
      updateData.status = response.conversationStatus;
    }

    const { error: conversationError } = await supabase
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId);

    if (conversationError) {
      console.error('[Bot] Failed to update conversation:', conversationError);
      return false;
    }

    // 4. Log success
    await supabase.from('logs').insert({
      clinic_id: clinicId,
      event: 'bot.response.sent',
      level: 'info',
      metadata: {
        conversationId,
        state: response.nextState,
        statusChange: response.conversationStatus,
      },
    });

    return true;
  } catch (error) {
    console.error('[Bot] Error in sendBotResponse:', error);
    
    // Log error
    await supabase.from('logs').insert({
      clinic_id: clinicId,
      event: 'bot.response.failed',
      level: 'error',
      metadata: {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return false;
  }
}
