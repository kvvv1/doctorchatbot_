import { describe, expect, it } from 'vitest'

import {
  canHumanSendMessage,
  getConversationMode,
  needsHumanAttention,
} from './mode'

describe('conversation mode helpers', () => {
  it('treats waiting_human as a separate mode from manual human attendance', () => {
    expect(getConversationMode({ bot_enabled: false, status: 'waiting_human' })).toBe('waiting_human')
    expect(getConversationMode({ bot_enabled: false, status: 'in_progress' })).toBe('human')
  })

  it('only allows manual sending when a human has actually assumed the conversation', () => {
    expect(canHumanSendMessage({ bot_enabled: true, status: 'new' })).toBe(false)
    expect(canHumanSendMessage({ bot_enabled: false, status: 'waiting_human' })).toBe(false)
    expect(canHumanSendMessage({ bot_enabled: false, status: 'in_progress' })).toBe(true)
  })

  it('flags both waiting and active human modes as needing attention', () => {
    expect(needsHumanAttention({ bot_enabled: false, status: 'waiting_human' })).toBe(true)
    expect(needsHumanAttention({ bot_enabled: false, status: 'in_progress' })).toBe(true)
    expect(needsHumanAttention({ bot_enabled: true, status: 'new' })).toBe(false)
  })
})
