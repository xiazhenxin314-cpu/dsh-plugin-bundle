/**
 * The single SYSTEM account's non-secret layout and local display remark.
 * Authentication stays entirely inside the official CLI. This module does not
 * inspect credentials, provision login stores, or schedule alternate accounts.
 * @module dsh-llm-antigravity-acp/accounts
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defaultHome, prepareHome } from "./preflight.js";
/** Stable key used by session and quota bookkeeping for the only account. */
export const SYSTEM_ACCOUNT_ID = 'default';
/** Display fallback; deliberately not inferred from a signed-in identity. */
export const SYSTEM_ACCOUNT_LABEL = 'SYSTEM';
/** Maximum length of the optional local display remark, in Unicode code points. */
export const MAX_ACCOUNT_REMARK = 64;
/** Normalize a local display remark without reading any signed-in identity. */
export function accountRemark(value) {
    const remark = value.trim().replace(/\s+/g, ' ');
    if ([...remark].length > MAX_ACCOUNT_REMARK) {
        throw new Error('antigravity-acp: an account remark must be at most ' + String(MAX_ACCOUNT_REMARK) + ' characters');
    }
    return remark;
}
/** Resolve the configured plugin cache root without creating directories. */
export function pluginHome(home) {
    return home.length > 0 ? home : defaultHome();
}
/** Build the fixed SYSTEM layout; there is no configurable account list. */
export function buildSystemLayout(options) {
    const base = pluginHome(options.home);
    const remark = accountRemark(options.remark ?? '');
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
    };
}
/** Keep the actual host environment, including HOME and official CLI auth. */
export function accountEnv() {
    return {};
}
/** Prepare only isolated bridge settings; never create or unlock a keychain. */
export function ensureLayout(layout) {
    return prepareHome(layout.geminiDir);
}
