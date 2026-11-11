/**
 * Model catalog derived from the agent's session configuration options. The
 * ACP server advertises model families (`gemini-4-argon`, `claude-opus-5-5`)
 * and a separate `thought_level` option; DSH lists each family once with the
 * efforts that family actually offers. Fixed-effort families such as
 * `gpt-oss-120b-medium` carry their effort in the id and expose no selector.
 * @module dsh-llm-antigravity-acp/catalog
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { EFFORTS } from "./config.js";
/**
 * Whether one id is offered by an allowlist that may only narrow.
 * @param id - family id.
 * @param allow - configured ids; empty means "every id".
 * @returns true when the id survives the allowlist.
 */
export function isListedModel(id, allow) {
    return allow.length === 0 || allow.includes(id);
}
/**
 * Intersect two narrowing allowlists. An empty list means "everything", so the
 * empty side always defers to the other one.
 * @param provider - provider-level ids.
 * @param account - account-level ids.
 * @returns the ids the pair permits; empty when both are unrestricted.
 */
export function intersectVisible(provider, account) {
    if (provider.length === 0)
        return [...account];
    if (account.length === 0)
        return [...provider];
    return provider.filter(id => account.includes(id));
}
/** Display names of the efforts. */
export const EFFORT_NAMES = { low: 'Low', medium: 'Medium', high: 'High' };
/** An id that already names one fixed effort instead of a selectable family. */
const FIXED_EFFORT = /-(low|medium|high)$/;
/**
 * Pick the offered effort closest to the requested one.
 * @param wanted - requested effort.
 * @param offered - efforts the model exposes.
 * @returns one of `offered`, or `wanted` when nothing is offered.
 */
export function nearestEffort(wanted, offered) {
    if (offered.includes(wanted))
        return wanted;
    const distance = (effort) => Math.abs(EFFORTS.indexOf(effort) - EFFORTS.indexOf(wanted));
    let best;
    for (const effort of offered) {
        if (best === undefined || distance(effort) < distance(best))
            best = effort;
    }
    return best ?? wanted;
}
/** Observed catalog with a disk cache. */
export class ModelCatalog {
    cachePath;
    models;
    /**
     * Every family the CLI advertises on `session/new`. Visibility is derived
     * from this through `visibleModels`, so widening the allowlist after an
     * observation never needs another ACP session.
     */
    advertised;
    /** Current allowlist; empty offers every advertised family. */
    visible = [];
    efforts = [...EFFORTS];
    /** Efforts per model family; an empty array marks a fixed-effort model. */
    byModel = new Map();
    /** Upstream max input tokens per model family, when discovered. */
    maxTokens = new Map();
    /** Latest `availableModels` snapshot, kept for later option updates. */
    available;
    /** Whether a live ACP session has reported the catalog. */
    observed = false;
    /** @param cachePath - JSON cache file. */
    constructor(cachePath) {
        this.cachePath = cachePath;
        this.advertised = this.load() ?? [];
        this.models = this.advertised;
    }
    /** Current families (the advertised set narrowed by the allowlist). */
    list() {
        return this.models;
    }
    /**
     * Advertised families with their current visibility, for the model picker.
     * @returns one row per advertised family, in CLI order.
     */
    availableModels() {
        return this.advertised.map(model => ({
            id: model.id,
            name: model.name,
            enabled: isListedModel(model.id, this.visible),
        }));
    }
    /** Current allowlist; empty means every advertised family. */
    visibleModels() {
        return this.visible;
    }
    /**
     * Narrow the offered families without a new observation.
     * @param visible - configured ids; empty restores every advertised family.
     * @returns whether the offered list changed.
     */
    applyVisibility(visible) {
        const before = JSON.stringify(this.models);
        this.visible = [...visible];
        this.models = this.advertised.filter(model => isListedModel(model.id, this.visible));
        return before !== JSON.stringify(this.models);
    }
    /** Efforts the account offers globally, in escalation order. */
    effortList() {
        return this.efforts;
    }
    /**
     * Efforts one family actually offers. Empty means the family is a single
     * fixed variant (for example `gpt-oss-120b-medium`).
     * @param id - family id.
     * @returns offered efforts.
     */
    effortsFor(id) {
        const observed = this.byModel.get(id);
        if (observed !== undefined)
            return observed;
        return this.fixedEffort(id) === undefined ? this.efforts : [];
    }
    /**
     * Effort baked into a fixed-variant id.
     * @param id - family id.
     * @returns the effort, or undefined for a selectable family.
     */
    fixedEffort(id) {
        const match = FIXED_EFFORT.exec(id);
        return match === null ? undefined : match[1];
    }
    /**
     * Find one family.
     * @param id - family id.
     * @returns the catalog entry.
     */
    find(id) {
        return this.models.find(model => model.id === id) ?? this.advertised.find(model => model.id === id);
    }
    /**
     * Upstream context window reported for one family, if discovered.
     * @param id - family id.
     * @returns max input tokens, or undefined when unknown.
     */
    maxTokensFor(id) {
        return this.maxTokens.get(id);
    }
    /**
     * Fold session configuration options and the session's model inventory into
     * the catalog.
     * @param options - options from `session/new` or `config_option_update`.
     * @param available - `models.availableModels` from `session/new`.
     * @param visible - allowlist to apply; omitted keeps the current one.
     * @returns whether the family list changed.
     */
    observe(options, available, visible) {
        if (visible !== undefined)
            this.visible = [...visible];
        if (available !== undefined)
            this.available = available;
        const modelOption = options?.find(o => o.id === 'model' || o.category === 'model');
        const levelOption = options?.find(o => o.id === 'thought_level' || o.category === 'thought_level');
        const beforeEfforts = JSON.stringify(this.efforts);
        if (levelOption?.options !== undefined) {
            const offered = levelOption.options.map(o => o.value).filter((v) => EFFORTS.includes(v));
            if (offered.length > 0)
                this.efforts = EFFORTS.filter(e => offered.includes(e));
        }
        const fromOptions = modelOption?.options?.map(o => ({ id: o.value, name: o.name ?? o.value }));
        const fromAvailable = available?.map(o => ({ id: o.modelId, name: o.name ?? o.modelId }));
        // An empty list is not a claim that the CLI offers nothing: it is a session
        // that reported no inventory this round. Falling through keeps the last
        // observed catalog instead of blanking the picker.
        const advertised = fromOptions !== undefined && fromOptions.length > 0
            ? fromOptions
            : fromAvailable !== undefined && fromAvailable.length > 0 ? fromAvailable : undefined;
        if (advertised === undefined)
            return false;
        this.observed = true;
        const changed = JSON.stringify(advertised) !== JSON.stringify(this.advertised);
        if (changed)
            this.advertised = advertised;
        const narrowed = this.applyVisibility(this.visible);
        const effortsChanged = this.deriveEfforts() || beforeEfforts !== JSON.stringify(this.efforts);
        if (changed || narrowed || effortsChanged)
            this.save();
        return changed || narrowed;
    }
    /** Recompute per-family efforts from the latest inventory across all advertised models. */
    deriveEfforts() {
        if (this.available === undefined)
            return false;
        let changed = false;
        for (const model of this.advertised) {
            const offered = EFFORTS.filter(effort => this.available.some(entry => entry.modelId === `${model.id}-${effort}`));
            if (offered.length > 0) {
                if (JSON.stringify(this.byModel.get(model.id)) !== JSON.stringify(offered)) {
                    this.byModel.set(model.id, offered);
                    changed = true;
                }
                continue;
            }
            const present = this.available.some(entry => entry.modelId === model.id || entry.modelId.startsWith(`${model.id}-`));
            if (!present)
                continue;
            if ((this.byModel.get(model.id) ?? []).length !== 0) {
                this.byModel.set(model.id, []);
                changed = true;
            }
        }
        return changed;
    }
    save() {
        try {
            writeFileSync(this.cachePath, `${JSON.stringify({
                // Persist the advertised set, not the narrowed one: a later widen of
                // the allowlist must be able to restore families the CLI reported.
                source: 'acp',
                models: this.advertised,
                efforts: this.efforts,
                byModel: Object.fromEntries(this.byModel),
                maxTokens: Object.fromEntries(this.maxTokens),
            }, null, 2)}\n`);
        }
        catch (_cacheWrite) {
            // The cache only speeds up the next cold start.
        }
    }
    load() {
        if (!existsSync(this.cachePath))
            return undefined;
        try {
            const parsed = JSON.parse(readFileSync(this.cachePath, 'utf8'));
            if (parsed.source !== 'acp')
                return undefined;
            if (Array.isArray(parsed.efforts)) {
                const efforts = parsed.efforts.filter((v) => EFFORTS.includes(v));
                if (efforts.length > 0)
                    this.efforts = efforts;
            }
            if (parsed.byModel !== null && typeof parsed.byModel === 'object') {
                for (const [id, values] of Object.entries(parsed.byModel)) {
                    if (!Array.isArray(values))
                        continue;
                    const efforts = values.filter((v) => EFFORTS.includes(v));
                    this.byModel.set(id, efforts);
                }
            }
            if (parsed.maxTokens !== null && typeof parsed.maxTokens === 'object') {
                for (const [id, tokens] of Object.entries(parsed.maxTokens)) {
                    if (typeof tokens === 'number' && tokens > 0)
                        this.maxTokens.set(id, tokens);
                }
            }
            const models = Array.isArray(parsed.models)
                ? parsed.models.filter(m => typeof m?.id === 'string' && typeof m?.name === 'string')
                : [];
            return models.length > 0 ? models : undefined;
        }
        catch (_cacheRead) {
            // A corrupt or legacy cache never invents an available catalog.
            return undefined;
        }
    }
}
