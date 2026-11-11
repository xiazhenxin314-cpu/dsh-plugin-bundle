/** Process and usage state for the one fixed system account. */
import { accountEnv } from "./accounts.js";
export function newSlot(layout) {
    return {
        layout, env: accountEnv(), preflight: undefined, preflightPromise: undefined,
        process: undefined, starting: undefined, state: 'idle', error: undefined, readyAt: 0,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
}
