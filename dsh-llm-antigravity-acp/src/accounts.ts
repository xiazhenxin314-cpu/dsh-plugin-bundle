/**
 * The single SYSTEM account's non-secret layout and local display remark.
 * Authentication stays entirely inside the official CLI. This module does not
 * inspect credentials, provision login stores, or schedule alternate accounts.
 * @module dsh-llm-antigravity-acp/accounts
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { defaultHome, prepareHome } from './preflight.ts'

/** Stable key used by session and quota bookkeeping for the only account. */
export const SYSTEM_ACCOUNT_ID = 'default'
/** Display fallback; deliberately not inferred from a signed-in identity. */
export const SYSTEM_ACCOUNT_LABEL = 'SYSTEM'
/** Maximum length of the optional local display remark, in Unicode code points. */
export const MAX_ACCOUNT_REMARK = 64

/** Non-secret launch paths of the one SYSTEM account. */
export interface AccountLayout {
  id: typeof SYSTEM_ACCOUNT_ID
  label: string
  system: true
  /** No sandboxed OS home or per-account root is created. */
  root: undefined
  /** The actual OS home remains inherited by the official CLI. */
  homeDir: string
  /** Isolated configuration root, not a credential source. */
  geminiDir: string
  appDir: string
  workspace: string
  logFile: string
}

/** The only account-specific setting is its local display remark. */
export interface SystemLayoutOptions {
  /** Isolated plugin home; empty uses the default cache directory. */
  home: string
  remark?: string
}

/** Normalize a local display remark without reading any signed-in identity. */
export function accountRemark(value: string): string {
  const remark = value.trim().replace(/\s+/g, ' ')
  if ([...remark].length > MAX_ACCOUNT_REMARK) {
    throw new Error('antigravity-acp: an account remark must be at most ' + String(MAX_ACCOUNT_REMARK) + ' characters')
  }
  return remark
}

/** Resolve the configured plugin cache root without creating directories. */
export function pluginHome(home: string): string {
  return home.length > 0 ? home : defaultHome()
}

/** Build the fixed SYSTEM layout; there is no configurable account list. */
export function buildSystemLayout(options: SystemLayoutOptions): AccountLayout {
  const base = pluginHome(options.home)
  const remark = accountRemark(options.remark ?? '')
  return {
    id: SYSTEM_ACCOUNT_ID,
    label: remark.length > 0 ? remark : SYSTEM_ACCOUNT_LABEL,
    system: true,
    root: undefined,
    homeDir: homedir(),
    geminiDir: base,
    appDir: join(base, 'agy'),
    workspace: join(base, 'workspace'),
    logFile: join(base, 'acp.log'),
  }
}

/** Keep the actual host environment, including HOME and official CLI auth. */
export function accountEnv(): NodeJS.ProcessEnv {
  return {}
}

/** Prepare only isolated bridge settings; never create or unlock a keychain. */
export function ensureLayout(layout: AccountLayout): string {
  return prepareHome(layout.geminiDir)
}
