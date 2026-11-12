/**
 * DeepSeek Harness primary-model provider for Google Antigravity.
 *
 * The plugin drives the locally installed, signed-in official CLI through its
 * Agent Client Protocol server (`agy acp`), exposes DSH tools to the agent
 * through a loopback MCP bridge, and registers the `antigravity` route with
 * the LLM service so Gemini and Claude models appear in the model picker
 * beside every other provider.
 * @module dsh-llm-antigravity-acp
 */
import { homedir } from 'node:os';
import { AntigravityAdapter } from "./adapter.js";
import { AntigravityRemote, registerRemote } from "./remote.js";
import { AntigravityRuntime } from "./runtime.js";
export { Config } from "./config.js";
export const name = 'llm-antigravity-acp';
export const inject = ['llm', 'subprocess'];
const REQUEST_IMAGE_MAX_BYTES = 7 * 1024 * 1024;
/**
 * Plugin entry.
 * @param ctx - plugin context.
 * @param config - validated configuration.
 */
export function apply(ctx, config) {
    const subprocess = ctx.get('subprocess');
    const attachments = () => ctx.get('attachments');
    // Every process uses the existing system login. Plugin cache configuration
    // never changes the CLI account or writes a settings profile during boot.
    const systemEnv = { HOME: homedir() };
    const spawnAcp = (argv, cwd, env) => {
        const handle = subprocess.spawn({
            argv,
            cwd,
            stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: 64 * 1024 } },
            graceMs: 5_000,
            env: env ?? systemEnv,
        });
        if (handle.stdin === undefined || handle.stdout === undefined)
            throw new Error('antigravity-acp: ACP process has no stdio pipes');
        return {
            stdin: handle.stdin,
            stdout: handle.stdout,
            exited: handle.done.then(outcome => ({ code: outcome.exitCode, signal: outcome.signal }), (error) => ({ code: null, signal: error instanceof Error ? error.message : String(error) })),
            terminate: () => handle.terminate(),
            stderrTail: () => handle.collected.stderr?.readFrom(0).text ?? '',
        };
    };
    const runCommand = async (argv, timeoutMs, env) => {
        const handle = subprocess.spawn({
            argv,
            cwd: homedir(),
            stdio: { stdin: 'ignore', stdout: { maxBytes: 8 * 1024 * 1024 }, stderr: { maxBytes: 256 * 1024 } },
            graceMs: 3_000,
            signal: AbortSignal.timeout(timeoutMs),
            env: { ...(env ?? systemEnv), PYTHONUTF8: '1' },
        });
        const outcome = await handle.done;
        return {
            code: outcome.exitCode,
            stdout: handle.collected.stdout?.readFrom(0).text ?? '',
            stderr: handle.collected.stderr?.readFrom(0).text ?? '',
        };
    };
    const readImage = async (block) => {
        const store = attachments();
        if (store === undefined)
            return undefined;
        const ref = block.attachment;
        const image = await store.readImageRequest(ref, { width: ref.width, height: ref.height, maxBytes: REQUEST_IMAGE_MAX_BYTES });
        return { data: Buffer.from(image.data).toString('base64'), mimeType: image.mediaType };
    };
    // Held so a live rename can republish the directory row without reactivating.
    const host = {
        config,
        spawnAcp,
        runCommand,
        readImage,
        canReadImages: () => attachments() !== undefined,
        log: {
            info: message => ctx.logger.info(message),
            warn: message => ctx.logger.warn(message),
        },
        onModelsChanged: () => ctx.emit('llm/models-updated', config.provider),
    };
    const runtime = new AntigravityRuntime(host);
    const fiberEntry = ctx.fiber.entry;
    const settingsNs = fiberEntry?.options?.id ?? name;
    const adapter = new AntigravityAdapter(runtime, () => attachments() !== undefined);
    const directoryEntry = {
        provider: config.provider,
        displayName: runtime.displayName(),
        settingsNs,
        settingsPath: [],
        nativeAuth: { env: [], oauth: true },
    };
    const directory = ctx.llm.registerConfigurableProviders([directoryEntry]);
    // A rename swaps the held entry, which republishes the Models page row. A
    // disposed registration (plugin reloading) keeps the old label until the
    // next activation instead of failing the configure call.
    host.onDisplayNameChanged = () => {
        try {
            directory.replace([{ ...directoryEntry, displayName: runtime.displayName() }]);
        }
        catch { /* REGISTRATION_DISPOSED during reload */ }
    };
    ctx.llm.registerAdapter([config.provider], adapter);
    ctx.effect(() => () => {
        void runtime.dispose();
    }, 'antigravity-acp: runtime');
    ctx.inject(['settings'], (settingsCtx) => {
        const settings = settingsCtx.get('settings');
        if (typeof settings?.configure === 'function') {
            settingsCtx.effect(() => settings.configure({ auto: false }, ctx.fiber), 'antigravity-acp: custom settings card');
        }
    });
    registerRemote(ctx);
    ctx.plugin(AntigravityRemote, { runtime, settingsNs });
    if (config.warmup) {
        void runtime.warmup().catch((error) => {
            ctx.logger.warn(`antigravity-acp: warmup failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    }
}
