/**
 * Web settings facade for the fixed local system account. Only provider status,
 * catalog warmup, and live model/effort/context/continuation settings are remote.
 * Authentication remains owned by the locally signed-in official CLI.
 * @module dsh-llm-antigravity-acp/remote
 */
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { accountRemark } from "./accounts.js";
import { asEffort } from "./config.js";
/** Package name used for Typert descriptor identities. */
export const PACKAGE_NAME = 'dsh-llm-antigravity-acp';
/** Cordis service key and wire namespace. */
export const SERVICE_NAME = 'antigravityAcp';
/**
 * Validate a model allowlist field: strings, trimmed, deduplicated, bounded.
 * An empty array is meaningful — it means "no restriction at this level".
 * @param value - candidate field, undefined when the caller omitted it.
 * @param label - dotted path used in the error message.
 * @returns the normalized ids.
 * @throws when the field is not an array of short non-empty strings.
 */
function parseVisibleModels(value, label) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.length > 500)
        throw new TypeError(label);
    const ids = [];
    for (const entry of value) {
        if (typeof entry !== 'string' || entry.trim().length === 0 || entry.length > 200)
            throw new TypeError(label);
        const id = entry.trim();
        if (!ids.includes(id))
            ids.push(id);
    }
    return ids;
}
/**
 * Validate live settings. Unknown and retired account-management fields are
 * ignored rather than passed to the runtime or persisted into the profile.
 * @param value - request payload.
 * @returns the supported live overrides.
 */
export function parseConfigureRequest(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('Invalid antigravity configure request');
    const record = value;
    const out = {};
    if (record.accountLabel !== undefined) {
        if (typeof record.accountLabel !== 'string')
            throw new TypeError('Invalid antigravity accountLabel');
        try {
            out.accountLabel = accountRemark(record.accountLabel);
        }
        catch (_invalidRemark) {
            throw new TypeError('Invalid antigravity accountLabel');
        }
    }
    if (record.contextWindow !== undefined) {
        if (typeof record.contextWindow !== 'number' || !Number.isInteger(record.contextWindow) || record.contextWindow < 0 || record.contextWindow > 1_048_576) {
            throw new TypeError('Invalid antigravity contextWindow');
        }
        out.contextWindow = record.contextWindow;
    }
    if (record.defaultEffort !== undefined) {
        const effort = typeof record.defaultEffort === 'string' ? asEffort(record.defaultEffort) : undefined;
        if (effort === undefined)
            throw new TypeError('Invalid antigravity defaultEffort');
        out.defaultEffort = effort;
    }
    if (record.longDecodeContinuations !== undefined) {
        if (typeof record.longDecodeContinuations !== 'number' || !Number.isInteger(record.longDecodeContinuations) || record.longDecodeContinuations < 0 || record.longDecodeContinuations > 16) {
            throw new TypeError('Invalid antigravity longDecodeContinuations');
        }
        out.longDecodeContinuations = record.longDecodeContinuations;
    }
    if (record.visibleModels !== undefined)
        out.visibleModels = parseVisibleModels(record.visibleModels, 'Invalid antigravity configure request.visibleModels');
    return out;
}
function parseStatus(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('Invalid antigravity status');
    return value;
}
function codec(typeSymbol, parse) {
    return { mode: 'strict', typeSymbol, create: () => ({ parse }) };
}
const statusCodec = codec(PACKAGE_NAME + '#Status', parseStatus);
const configureCodec = codec(PACKAGE_NAME + '#ConfigureRequest', parseConfigureRequest);
/** Invocation descriptors registered with the Host Gateway. */
export const INVOCATIONS = [
    {
        id: PACKAGE_NAME + '#' + SERVICE_NAME + '/status',
        service: SERVICE_NAME,
        namespace: SERVICE_NAME,
        method: 'status',
        invocation: { kind: 'direct' },
        parameters: [],
        result: statusCodec,
    },
    {
        id: PACKAGE_NAME + '#' + SERVICE_NAME + '/warmup',
        service: SERVICE_NAME,
        namespace: SERVICE_NAME,
        method: 'warmup',
        invocation: { kind: 'direct' },
        parameters: [],
        result: statusCodec,
    },
    {
        id: PACKAGE_NAME + '#' + SERVICE_NAME + '/configure',
        service: SERVICE_NAME,
        namespace: SERVICE_NAME,
        method: 'configure',
        invocation: { kind: 'direct' },
        parameters: [{ name: 'request', wire: 'request', source: 'json', codec: configureCodec }],
        result: statusCodec,
    },
];
/** Remote facade over the single-account runtime. */
export class AntigravityRemote extends TypertRemoteService {
    options;
    /** @param ctx - owning context. @param options - runtime and settings namespace. */
    constructor(ctx, options) {
        super(ctx, SERVICE_NAME);
        this.options = options;
    }
    /** @returns the provider status snapshot. */
    status() {
        return this.options.runtime.status();
    }
    /** @returns provider status after refreshing the discovered model catalog. */
    async warmup() {
        try {
            await this.options.runtime.warmup();
        }
        catch (_warmupFailure) {
            // The runtime reports catalog/preflight failure in the returned status.
        }
        return this.options.runtime.status();
    }
    /**
     * Apply supported live settings and persist an explicit save when writable.
     * @param request - updated settings (never authentication or account routing).
     * @returns updated provider status.
     */
    async configure(request) {
        const patch = parseConfigureRequest(request);
        if (Object.keys(patch).length === 0)
            return this.options.runtime.status();
        const status = this.options.runtime.configure(patch);
        const settings = this.ctx.get('settings');
        if (settings?.writable === true && typeof settings.update === 'function') {
            try {
                await settings.update(this.options.settingsNs, { ...patch });
            }
            catch (_persistSkipped) {
                // Overlay/read-only profiles may reject a patch; the live override still applies.
            }
        }
        return status;
    }
}
/**
 * Register the invocation descriptors with the Host Gateway when present.
 * @param ctx - plugin context.
 */
export function registerRemote(ctx) {
    ctx.inject(['typert'], (scope) => {
        scope.effect(() => {
            const registrar = scope.get('typert');
            if (registrar === undefined || typeof registrar.register !== 'function')
                return () => undefined;
            return registrar.register({
                package: PACKAGE_NAME,
                face: 'host',
                schemas: [],
                model: { services: [], events: [], objects: [] },
                invocations: INVOCATIONS,
            });
        }, 'antigravity-acp: remote descriptors');
    });
}
