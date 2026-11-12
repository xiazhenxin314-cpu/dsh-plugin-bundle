/**
 * Web settings facade for the fixed local system account. Only provider status,
 * catalog warmup, and live model/effort/context/continuation settings are remote.
 * Authentication remains owned by the locally signed-in official CLI.
 * @module dsh-llm-antigravity-acp/remote
 */

import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { InvocationDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol'
import { accountRemark } from './accounts.ts'
import { asEffort } from './config.ts'
import type { AntigravityRuntime, LiveOverrides, RuntimeStatus } from './runtime.ts'

/** Package name used for Typert descriptor identities. */
export const PACKAGE_NAME = 'dsh-llm-antigravity-acp'
/** Cordis service key and wire namespace. */
export const SERVICE_NAME = 'antigravityAcp'

declare module '@deepseek-ai/cordis' {
  interface Context {
    antigravityAcp: AntigravityRemote
  }
}

/**
 * Validate a model allowlist field: strings, trimmed, deduplicated, bounded.
 * An empty array is meaningful — it means "no restriction at this level".
 * @param value - candidate field, undefined when the caller omitted it.
 * @param label - dotted path used in the error message.
 * @returns the normalized ids.
 * @throws when the field is not an array of short non-empty strings.
 */
function parseVisibleModels(value: unknown, label: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 500) throw new TypeError(label)
  const ids: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0 || entry.length > 200) throw new TypeError(label)
    const id = entry.trim()
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

/** Longest accepted provider or model display name, in characters. */
const MAX_DISPLAY_NAME = 64

/**
 * Normalize one display name: trimmed, inner whitespace collapsed.
 * @param value - raw candidate.
 * @param label - dotted path used in the error message.
 * @returns the normalized name.
 * @throws when the value is not a non-empty string of bounded length.
 */
function parseDisplayName(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(label)
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length === 0 || [...name].length > MAX_DISPLAY_NAME) throw new TypeError(label)
  return name
}

/**
 * Validate a per-model display-name map. An empty name clears that override,
 * so the model falls back to the name the ACP server advertises.
 * @param value - candidate field, undefined when the caller omitted it.
 * @param label - dotted path used in the error message.
 * @returns id → name, overrides with a cleared name omitted.
 * @throws when the field is not a plain object of bounded keys and names.
 */
function parseModelNames(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label)
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > 500) throw new TypeError(label)
  const out: Record<string, string> = {}
  for (const [rawId, rawName] of entries) {
    const id = rawId.trim()
    if (id.length === 0 || id.length > 200) throw new TypeError(label)
    if (typeof rawName !== 'string') throw new TypeError(label)
    const name = rawName.trim().replace(/\s+/g, ' ')
    if ([...name].length > MAX_DISPLAY_NAME) throw new TypeError(label)
    if (name.length > 0) out[id] = name
  }
  return out
}

/**
 * Validate live settings. Unknown and retired account-management fields are
 * ignored rather than passed to the runtime or persisted into the profile.
 * @param value - request payload.
 * @returns the supported live overrides.
 */
export function parseConfigureRequest(value: unknown): LiveOverrides {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid antigravity configure request')
  const record = value as Record<string, unknown>
  const out: LiveOverrides = {}
  if (record.accountLabel !== undefined) {
    if (typeof record.accountLabel !== 'string') throw new TypeError('Invalid antigravity accountLabel')
    try {
      out.accountLabel = accountRemark(record.accountLabel)
    } catch (_invalidRemark) {
      throw new TypeError('Invalid antigravity accountLabel')
    }
  }
  if (record.contextWindow !== undefined) {
    if (typeof record.contextWindow !== 'number' || !Number.isInteger(record.contextWindow) || record.contextWindow < 0 || record.contextWindow > 1_048_576) {
      throw new TypeError('Invalid antigravity contextWindow')
    }
    out.contextWindow = record.contextWindow
  }
  if (record.defaultEffort !== undefined) {
    const effort = typeof record.defaultEffort === 'string' ? asEffort(record.defaultEffort) : undefined
    if (effort === undefined) throw new TypeError('Invalid antigravity defaultEffort')
    out.defaultEffort = effort
  }
  if (record.longDecodeContinuations !== undefined) {
    if (typeof record.longDecodeContinuations !== 'number' || !Number.isInteger(record.longDecodeContinuations) || record.longDecodeContinuations < 0 || record.longDecodeContinuations > 16) {
      throw new TypeError('Invalid antigravity longDecodeContinuations')
    }
    out.longDecodeContinuations = record.longDecodeContinuations
  }
  if (record.visibleModels !== undefined) out.visibleModels = parseVisibleModels(record.visibleModels, 'Invalid antigravity configure request.visibleModels')
  if (record.displayName !== undefined) out.displayName = parseDisplayName(record.displayName, 'Invalid antigravity displayName')
  if (record.modelNames !== undefined) out.modelNames = parseModelNames(record.modelNames, 'Invalid antigravity modelNames')
  return out
}

function parseStatus(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid antigravity status')
  return value
}

function codec(typeSymbol: string, parse: (value: unknown) => unknown): TypertCodec {
  return { mode: 'strict', typeSymbol, create: () => ({ parse }) } as TypertCodec
}

const statusCodec = codec(PACKAGE_NAME + '#Status', parseStatus)
const configureCodec = codec(PACKAGE_NAME + '#ConfigureRequest', parseConfigureRequest)

/** Invocation descriptors registered with the Host Gateway. */
export const INVOCATIONS: readonly InvocationDescriptor[] = [
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
]

interface SettingsWriter {
  writable?: boolean
  update?(ns: string, values: Record<string, unknown>): Promise<void>
}

/** Remote facade over the single-account runtime. */
export class AntigravityRemote extends TypertRemoteService {
  /** @param ctx - owning context. @param options - runtime and settings namespace. */
  constructor(
    ctx: Context,
    private readonly options: { runtime: AntigravityRuntime; settingsNs: string },
  ) {
    super(ctx, SERVICE_NAME)
  }

  /** @returns the provider status snapshot. */
  status(): RuntimeStatus {
    return this.options.runtime.status()
  }

  /** @returns provider status after refreshing the discovered model catalog. */
  async warmup(): Promise<RuntimeStatus> {
    try {
      await this.options.runtime.warmup()
    } catch (_warmupFailure) {
      // The runtime reports catalog/preflight failure in the returned status.
    }
    return this.options.runtime.status()
  }

  /**
   * Apply supported live settings and persist an explicit save when writable.
   * @param request - updated settings (never authentication or account routing).
   * @returns updated provider status.
   */
  async configure(request: LiveOverrides): Promise<RuntimeStatus> {
    const patch = parseConfigureRequest(request)
    if (Object.keys(patch).length === 0) return this.options.runtime.status()
    const status = this.options.runtime.configure(patch)
    const settings = this.ctx.get('settings') as SettingsWriter | undefined
    if (settings?.writable === true && typeof settings.update === 'function') {
      try {
        await settings.update(this.options.settingsNs, { ...patch })
      } catch (_persistSkipped) {
        // Overlay/read-only profiles may reject a patch; the live override still applies.
      }
    }
    return status
  }
}

interface TypertRegistrar {
  register(contribution: unknown): () => void | Promise<void>
}

/**
 * Register the invocation descriptors with the Host Gateway when present.
 * @param ctx - plugin context.
 */
export function registerRemote(ctx: Context): void {
  ctx.inject(['typert'], (scope) => {
    scope.effect(() => {
      const registrar = scope.get('typert') as unknown as TypertRegistrar | undefined
      if (registrar === undefined || typeof registrar.register !== 'function') return () => undefined
      return registrar.register({
        package: PACKAGE_NAME,
        face: 'host',
        schemas: [],
        model: { services: [], events: [], objects: [] },
        invocations: INVOCATIONS,
      })
    }, 'antigravity-acp: remote descriptors')
  })
}
