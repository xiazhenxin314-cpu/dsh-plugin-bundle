// Resolve host peers from an explicitly selected local installation without
// linking or modifying that installation, or inspecting any DSH profile.
import { registerHooks, createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

if (process.env.DSH_NODE_MODULES) {
  const hostRequire = createRequire(join(process.env.DSH_NODE_MODULES, '__dsh_peer_resolver.cjs'))
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@deepseek-ai/')) {
        try {
          return nextResolve(pathToFileURL(hostRequire.resolve(specifier)).href, context)
        } catch (error) {
          if (error.code !== 'MODULE_NOT_FOUND') throw error
        }
      }
      return nextResolve(specifier, context)
    },
  })
}
