/** Process and usage state for the one fixed system account. */
import { accountEnv, type AccountLayout } from './accounts.ts'
import type { AcpProcess } from './acp-process.ts'
import type { PreflightResult } from './preflight.ts'

export interface AccountSlot {
  layout: AccountLayout
  env: NodeJS.ProcessEnv
  preflight: PreflightResult | undefined
  preflightPromise: Promise<PreflightResult> | undefined
  process: AcpProcess | undefined
  starting: Promise<AcpProcess> | undefined
  state: 'idle' | 'starting' | 'ready' | 'error'
  error: string | undefined
  readyAt: number
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

export function newSlot(layout: AccountLayout): AccountSlot {
  return {
    layout, env: accountEnv(), preflight: undefined, preflightPromise: undefined,
    process: undefined, starting: undefined, state: 'idle', error: undefined, readyAt: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  }
}
