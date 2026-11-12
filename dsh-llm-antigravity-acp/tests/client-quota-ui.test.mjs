// Source-only UI tests: fake remote services, no CLI, profile, or credentials.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const srcClientPath = join(root, 'src', 'client.js')
const sourceBundle = () => `;(() => {\n${readFileSync(join(root, 'src', 'model-selection.js'), 'utf8')}\n${readFileSync(srcClientPath, 'utf8')}\n})();\n`

const FIXED_NOW = Date.parse('2026-11-04T12:00:00.000Z')

function createMiniReact() {
  let active = null

  const flatten = (items, out = []) => {
    for (const item of items) {
      if (Array.isArray(item)) flatten(item, out)
      else if (item !== null && item !== undefined && typeof item !== 'boolean') out.push(item)
    }
    return out
  }

  const depsEqual = (a, b) => {
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false
    }
    return true
  }

  const React = {
    createElement(type, props, ...children) {
      const flat = flatten(children)
      const nextProps = { ...(props || {}) }
      if (flat.length > 0) nextProps.children = flat
      return { __vnode: true, type, props: nextProps, ref: props ? props.ref : undefined }
    },
    useState(initial) {
      const inst = active
      const idx = inst.hookIndex++
      if (!(idx in inst.hooks)) {
        inst.hooks[idx] = { value: typeof initial === 'function' ? initial() : initial }
      }
      const slot = inst.hooks[idx]
      const setState = (next) => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (!Object.is(value, slot.value)) {
          slot.value = value
          inst.root.render()
        }
      }
      return [slot.value, setState]
    },
    useRef(initial) {
      const inst = active
      const idx = inst.hookIndex++
      if (!(idx in inst.hooks)) inst.hooks[idx] = { current: initial }
      return inst.hooks[idx]
    },
    useCallback(fn, deps) {
      const inst = active
      const idx = inst.hookIndex++
      const prev = inst.hooks[idx]
      if (!prev || !depsEqual(prev.deps, deps)) inst.hooks[idx] = { fn, deps }
      return inst.hooks[idx].fn
    },
    useEffect(fn, deps) {
      const inst = active
      const idx = inst.hookIndex++
      const prev = inst.hooks[idx]
      if (!prev || !depsEqual(prev.deps, deps)) {
        const slot = { deps, cleanup: prev ? prev.cleanup : undefined }
        inst.hooks[idx] = slot
        inst.root.pendingEffects.push(() => {
          if (typeof slot.cleanup === 'function') slot.cleanup()
          slot.cleanup = fn()
        })
      }
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      React.useEffect(() => subscribe(() => activeRootRender()), [subscribe])
      const inst = active
      const activeRootRender = () => inst.root.render()
      return getSnapshot()
    },
  }

  function mount(Component, initialProps) {
    const root = {
      props: initialProps,
      instances: new Map(),
      pendingEffects: [],
      tree: null,
      render() {
        const seen = new Set()
        const renderVNode = (vnode, path) => {
          if (vnode === null || vnode === undefined || typeof vnode === 'boolean') return null
          if (typeof vnode === 'string' || typeof vnode === 'number') return String(vnode)
          if (!vnode.__vnode) return null

          if (typeof vnode.type === 'function') {
            seen.add(path)
            let inst = root.instances.get(path)
            if (!inst) {
              inst = { hooks: [], hookIndex: 0, root }
              root.instances.set(path, inst)
            }
            const prev = active
            active = inst
            inst.hookIndex = 0
            const rendered = vnode.type(vnode.props)
            active = prev
            return renderVNode(rendered, `${path}>f`)
          }

          const children = (vnode.props.children || [])
            .map((child, i) => renderVNode(child, `${path}/${i}`))
            .filter((child) => child !== null)
          const host = { tag: vnode.type, props: vnode.props, children }
          if (vnode.ref && typeof vnode.ref === 'object') {
            vnode.ref.current = {
              node: host,
              contains: (target) => Boolean(target && target.__insideRoot === vnode.ref),
            }
          }
          return host
        }

        root.tree = renderVNode(React.createElement(Component, root.props), 'root')
        for (const [key, inst] of root.instances.entries()) {
          if (!seen.has(key)) {
            for (const h of inst.hooks) {
              if (h && typeof h.cleanup === 'function') h.cleanup()
            }
            root.instances.delete(key)
          }
        }
        while (root.pendingEffects.length > 0) {
          const batch = root.pendingEffects.splice(0)
          for (const run of batch) run()
        }
        return root.tree
      },
      rerender(nextProps) {
        root.props = nextProps
        return root.render()
      },
      unmount() {
        for (const inst of root.instances.values()) {
          for (const h of inst.hooks) {
            if (h && typeof h.cleanup === 'function') h.cleanup()
          }
        }
        root.instances.clear()
        root.tree = null
      },
    }
    root.render()
    return root
  }

  return { React, mount }
}

function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  return (node.children || []).map(textOf).join('')
}

function findAll(node, predicate, acc = []) {
  if (!node || typeof node === 'string') return acc
  if (predicate(node)) acc.push(node)
  for (const child of node.children || []) findAll(child, predicate, acc)
  return acc
}

function findOne(node, predicate) {
  return findAll(node, predicate)[0] || null
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function loadClientPlugin({ language = 'zh-CN', remoteService, sessions, uiWorkspace } = {}) {
  const { React, mount } = createMiniReact()
  const listeners = new Map()
  const document = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(fn)
    },
    removeEventListener(type, fn) {
      if (listeners.has(type)) listeners.get(type).delete(fn)
    },
    dispatch(type, event) {
      for (const fn of [...(listeners.get(type) || [])]) fn(event)
    },
  }

  let loadedSpec = null
  const window = {
    __ModuleLoader__: {
      load(spec) {
        loadedSpec = spec
      },
    },
  }

  class CustomDate extends Date {
    static now() {
      return FIXED_NOW
    }
  }

  const intervals = new Set()
  const sandbox = {
    window,
    document,
    navigator: { language },
    Date: CustomDate,
    console,
    TypeError,
    Error,
    Promise,
    Object,
    Array,
    Number,
    String,
    Math,
    RegExp,
    setTimeout,
    clearTimeout,
    setInterval(fn) {
      const token = { fn }
      intervals.add(token)
      return token
    },
    clearInterval(token) {
      intervals.delete(token)
    },
  }

  const code = sourceBundle()
  vm.runInNewContext(code, sandbox, { filename: srcClientPath })
  assert.ok(loadedSpec, 'window.__ModuleLoader__.load should receive module spec')
  assert.equal(loadedSpec.id, 'dsh-llm-antigravity-acp')

  const plugin = loadedSpec.factory((pkg) => {
    if (pkg === 'react') return React
    if (pkg === '@deepseek-ai/dsh-client-ui-primitives') {
      return {
        Modal(props) {
          if (props.open !== true) return null
          const footer = props.footer ? (Array.isArray(props.footer) ? props.footer : [props.footer]) : []
          return React.createElement('div', { 'aria-label': props.title, role: 'dialog' }, props.children, ...footer)
        },
        Button(props) {
          return React.createElement('button', {
            type: 'button',
            disabled: props.disabled,
            onClick: props.onClick,
            title: props.title,
          }, props.children)
        },
      }
    }
    throw new Error(`Unexpected require(${pkg})`)
  })

  const registered = new Map()
  let currentModel = { provider: 'antigravity', model: 'gemini-4-argon' }
  const storeSubscribers = new Set()
  const store = {
    getSnapshot: () => ({ current: currentModel }),
    subscribe: (cb) => {
      storeSubscribers.add(cb)
      return () => storeSubscribers.delete(cb)
    },
    setCurrent(next) {
      currentModel = next
      for (const cb of [...storeSubscribers]) cb()
    },
  }

  const defaultService = {
    status: async () => ({
      state: 'ready',
      version: '1.2.3',
      contextWindow: 1_048_576,
      configuredContextWindow: 0,
      defaultEffort: 'high',
      longDecodeContinuations: 3,
      unlock: { status: 'unlocked' },
    }),
    warmup: async () => ({ state: 'ready', version: '1.2.3', contextWindow: 1_048_576 }),
    configure: async (patch) => ({ state: 'ready', version: '1.2.3', contextWindow: 1_048_576, ...patch }),
  }
  // Overrides merge over the defaults, so a test that only fakes one verb
  // still answers every other call the card makes.
  const service = { ...defaultService, ...(remoteService || {}) }

  const slots = {
    inject(_slotName, registerFn) {
      return registerFn()
    },
    register(meta, Component) {
      registered.set(meta.name, { meta, Component })
      return () => registered.delete(meta.name)
    },
  }

  const descriptors = []
  const ctx = {
    remote: { $mount: (spec) => { descriptors.push(...spec.descriptors); return () => undefined } },
    slots,
    modelDirectories: { directoryFor: () => ({ store }) },
    sessions: sessions || {
      binding: () => undefined,
      list: { getSnapshot: () => ({ byId: {} }) },
      create: async () => 'child-session-default',
      fork: async () => 'child-session-forked',
      retain: () => ({ ready: Promise.resolve({ session: { beginSubmission: () => ({ requestId: 'r1', abandon: () => {} }), prompt: async () => ({ ok: true }) } }), release: () => {} }),
    },
    uiWorkspace: uiWorkspace || { openSession: () => {} },
    effect(fn) {
      fn()
    },
    get(key) {
      if (key === 'remote.antigravityAcp') return service
      return undefined
    },
    inject(_deps, cb) {
      cb(ctx)
    },
  }

  plugin.apply(ctx)
  return { registered, mount, document, store, intervals, descriptors }
}

function recordingService(windowValue = 0, decodeValue = 3) {
  const patches = []
  const service = {
    status: async () => ({
      state: 'ready',
      version: '1.5.1',
      contextWindow: 1_048_576,
      configuredContextWindow: windowValue,
      defaultEffort: 'high',
      longDecodeContinuations: decodeValue,
      unlock: { status: 'unlocked' },
    }),
    quota: async () => ({ status: 'ok', updatedAt: new Date(FIXED_NOW).toISOString(), groups: [] }),
    warmup: async () => ({ state: 'ready', version: '1.5.1', contextWindow: 1_048_576 }),
    configure: async (patch) => {
      patches.push(patch)
      if ('contextWindow' in patch) windowValue = patch.contextWindow
      if ('longDecodeContinuations' in patch) decodeValue = patch.longDecodeContinuations
      return service.status()
    },
  }
  return { service, patches }
}

test('SettingsCard renders live settings as value rows that apply the chosen option', async () => {
  const { service, patches } = recordingService()
  const { registered, mount } = loadClientPlugin({ language: 'zh-CN', remoteService: service })
  const slot = registered.get('settings.section')
  const view = mount(slot.Component, slot.meta.inject())
  await flush()

  const rows = findAll(view.tree, (node) => node.props && node.props['aria-expanded'] !== undefined)
  assert.deepEqual(rows.map(textOf), [
    '上下文窗口自动 (1M)',
    '默认思考High',
    '超长续写3 段',
  ])
  assert.equal(rows.every((row) => row.props.disabled === false), true)

  // The row opens the choice list inline; the current value carries the check.
  rows[0].props.onClick()
  await flush()
  const options = findAll(view.tree, (node) => node.tag === 'button' && node.props['aria-checked'] !== undefined)
  assert.deepEqual(options.map(textOf), ['自动 (1M)', '900K', '512K', '256K'])
  assert.equal(options[0].props['aria-checked'], true)

  options[2].props.onClick()
  await flush()
  assert.deepEqual(JSON.parse(JSON.stringify(patches)), [{ contextWindow: 512000 }])
  assert.match(textOf(findAll(view.tree, (node) => node.props && node.props['aria-expanded'] !== undefined)[0]), /上下文窗口512K/)

  // The list collapses after a choice and the next row applies its own patch.
  assert.equal(findAll(view.tree, (node) => node.props['aria-checked'] !== undefined).length, 0)
  findAll(view.tree, (node) => node.props && node.props['aria-expanded'] !== undefined)[2].props.onClick()
  await flush()
  findAll(view.tree, (node) => node.tag === 'button' && node.props['aria-checked'] !== undefined)[2].props.onClick()
  await flush()
  assert.deepEqual(JSON.parse(JSON.stringify(patches)), [{ contextWindow: 512000 }, { longDecodeContinuations: 8 }])
  view.unmount()
})

test('composer parameter rows expose the same live settings for Antigravity only', async () => {
  const { service, patches } = recordingService()
  const { registered, mount, store } = loadClientPlugin({ language: 'zh-CN', remoteService: service })
  const slot = registered.get('conversation.input.model.parameters')
  assert.ok(slot, 'the plugin registers the composer parameter slot')
  const owner = { locked: false, dismiss() {}, reportFailure() {} }
  const view = mount(slot.Component, { ...slot.meta.inject('session-params'), ...owner })
  await flush()

  const rows = findAll(view.tree, (node) => node.props && node.props.role === 'menuitem')
  assert.deepEqual(rows.map(textOf), ['上下文自动 (1M)', '超长续写3 段'])

  rows[0].props.onClick()
  await flush()
  const options = findAll(view.tree, (node) => node.props.role === 'menuitemradio')
  assert.deepEqual(options.map(textOf), ['自动 (1M)', '900K', '512K', '256K'])
  assert.equal(options[0].props['aria-checked'], true)
  options[1].props.onClick()
  await flush()
  assert.deepEqual(JSON.parse(JSON.stringify(patches)), [{ contextWindow: 900000 }])
  assert.match(textOf(findAll(view.tree, (node) => node.props.role === 'menuitem')[0]), /900K/)

  // Locked rows refuse changes.
  view.unmount()
  const locked = mount(slot.Component, { ...slot.meta.inject('session-params'), ...owner, locked: true })
  await flush()
  const lockedRows = findAll(locked.tree, (node) => node.props && node.props.role === 'menuitem')
  assert.equal(lockedRows.every((row) => row.props.disabled === true), true)
  lockedRows[0].props.onClick()
  await flush()
  assert.equal(patches.length, 1, 'a locked row applies nothing')
  locked.unmount()

  // Another provider renders nothing.
  store.setCurrent({ provider: 'deepseek', model: 'deepseek-chat' })
  const other = mount(slot.Component, { ...slot.meta.inject('session-params'), ...owner })
  await flush()
  assert.equal(other.tree, null)
  other.unmount()
})

test('ModelParameterRows keeps the two panels mutually exclusive (accordion)', async () => {
  const { service } = recordingService()
  const { registered, mount } = loadClientPlugin({ language: 'zh-CN', remoteService: service })
  const slot = registered.get('conversation.input.model.parameters')
  const owner = { locked: false, dismiss() {}, reportFailure() {} }
  const view = mount(slot.Component, { ...slot.meta.inject('session-accordion'), ...owner })
  await flush()

  const menuRows = () => findAll(view.tree, (node) => node.props && node.props.role === 'menuitem')
  const radios = () => findAll(view.tree, (node) => node.props && node.props.role === 'menuitemradio')

  // Opening "上下文" renders its 4 choices and leaves "超长续写" collapsed.
  menuRows()[0].props.onClick()
  await flush()
  assert.equal(radios().length, 4)
  assert.equal(menuRows()[0].props['aria-expanded'], true)
  assert.equal(menuRows()[1].props['aria-expanded'], false)

  // Clicking "超长续写" folds "上下文" away; only the 3 decode choices remain.
  menuRows()[1].props.onClick()
  await flush()
  assert.equal(menuRows()[0].props['aria-expanded'], false)
  assert.equal(menuRows()[1].props['aria-expanded'], true)
  assert.equal(radios().length, 3)
  assert.deepEqual(radios().map(textOf), ['关闭', '3 段', '8 段'])

  view.unmount()
})

test('ModelParameterRows collapses on outside pointerdown and on the first Escape', async () => {
  const { service } = recordingService()
  const { registered, mount, document } = loadClientPlugin({ language: 'zh-CN', remoteService: service })
  const slot = registered.get('conversation.input.model.parameters')
  const owner = { locked: false, dismiss() {}, reportFailure() {} }
  const view = mount(slot.Component, { ...slot.meta.inject('session-collapse'), ...owner })
  await flush()

  const menuRows = () => findAll(view.tree, (node) => node.props && node.props.role === 'menuitem')
  const radios = () => findAll(view.tree, (node) => node.props && node.props.role === 'menuitemradio')

  // A pointerdown outside the list closes the expanded panel.
  menuRows()[0].props.onClick()
  await flush()
  assert.equal(radios().length, 4)
  document.dispatch('pointerdown', { target: {} })
  assert.equal(radios().length, 0)
  assert.equal(menuRows()[0].props['aria-expanded'], false)

  // The first Escape collapses the sub-list AND stops propagation so the
  // enclosing model menu stays open (it closes only on a second Escape).
  menuRows()[1].props.onClick()
  await flush()
  assert.equal(radios().length, 3)
  let prevented = 0
  let stopped = 0
  view.tree.props.onKeyDown({
    key: 'Escape',
    preventDefault() { prevented += 1 },
    stopPropagation() { stopped += 1 },
  })
  assert.equal(prevented, 1, 'first Escape calls preventDefault')
  assert.equal(stopped, 1, 'first Escape calls stopPropagation')
  assert.equal(radios().length, 0)
  assert.equal(menuRows()[1].props['aria-expanded'], false)

  // With no sub-list open, a second Escape no longer stops propagation: the
  // event is free to reach the model menu and close it.
  prevented = 0
  stopped = 0
  view.tree.props.onKeyDown({
    key: 'Escape',
    preventDefault() { prevented += 1 },
    stopPropagation() { stopped += 1 },
  })
  assert.equal(prevented, 0)
  assert.equal(stopped, 0)

  // Document-capture Escape also collapses the open sub-list even when focus
  // stayed on the outer ModelSelect trigger button.
  menuRows()[0].props.onClick()
  await flush()
  assert.equal(radios().length, 4)
  document.dispatch('keydown', {
    key: 'Escape',
    preventDefault() { prevented += 1 },
    stopPropagation() { stopped += 1 },
  })
  assert.equal(prevented, 1, 'document Escape calls preventDefault while expanded')
  assert.equal(stopped, 1, 'document Escape calls stopPropagation while expanded')
  assert.equal(radios().length, 0)
  assert.equal(menuRows()[0].props['aria-expanded'], false)

  view.unmount()
})

test('SettingsCard keeps its three choice rows mutually exclusive', async () => {
  const { service } = recordingService()
  const { registered, mount } = loadClientPlugin({ language: 'zh-CN', remoteService: service })
  const slot = registered.get('settings.section')
  const view = mount(slot.Component, slot.meta.inject())
  await flush()

  const expandedRows = () => findAll(view.tree, (node) => node.props && node.props['aria-expanded'] !== undefined)
  const choices = () => findAll(view.tree, (node) => node.tag === 'button' && node.props['aria-checked'] !== undefined)

  // Open "上下文窗口" -> its 4 window choices are shown.
  expandedRows()[0].props.onClick()
  await flush()
  assert.equal(choices().length, 4)
  assert.equal(expandedRows()[0].props['aria-expanded'], true)

  // Click "默认思考" -> the window panel folds away, only the 3 efforts show.
  expandedRows()[1].props.onClick()
  await flush()
  assert.equal(expandedRows()[0].props['aria-expanded'], false)
  assert.equal(expandedRows()[1].props['aria-expanded'], true)
  assert.equal(choices().length, 3)
  assert.deepEqual(choices().map(textOf), ['Low', 'Medium', 'High'])

  // Click "超长续写" -> the effort panel folds away, only the 3 decodes show.
  expandedRows()[2].props.onClick()
  await flush()
  assert.equal(expandedRows()[1].props['aria-expanded'], false)
  assert.equal(expandedRows()[2].props['aria-expanded'], true)
  assert.equal(choices().length, 3)
  assert.deepEqual(choices().map(textOf), ['关闭', '3 段', '8 段'])

  view.unmount()
})

const catalogStatus = (visibleModels) => ({
  state: 'ready',
  version: '1.2.3',
  contextWindow: 1_048_576,
  configuredContextWindow: 0,
  defaultEffort: 'high',
  longDecodeContinuations: 3,
  models: [{ id: 'gemini-4-argon', name: 'Gemini 4 Argon' }, { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }],
  availableModels: [
    { id: 'gemini-4-argon', name: 'Gemini 4 Argon', enabled: visibleModels.length === 0 || visibleModels.includes('gemini-4-argon') },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', enabled: visibleModels.length === 0 || visibleModels.includes('claude-opus-5-5') },
  ],
  visibleModels,

})

test('the Antigravity card lists every advertised model with its exposure state', async () => {
  const { registered, mount } = loadClientPlugin({
    language: 'zh-CN',
    remoteService: { status: async () => catalogStatus(['claude-opus-5-5']) },
  })
  const slot = registered.get('settings.models.provider-card')
  assert.ok(slot, 'the card registers on settings.models.provider-card')
  assert.equal(slot.meta.key, 'llm-antigravity-acp')
  const view = mount(slot.Component, { ...slot.meta.inject(), open: true })
  await flush()
  // One catalog row per advertised model, including the family the allowlist
  // currently hides, so a hidden model can be turned back on from the panel.
  const ids = findAll(view.tree, (n) => n.tag === 'input' && n.props.readOnly === true).map((n) => n.props.value)
  assert.deepEqual(ids, ['gemini-4-argon', 'claude-opus-5-5'])
  assert.match(textOf(view.tree), /1 \/ 2 个模型对外/)
  const switches = findAll(view.tree, (n) => n.props.role === 'switch')
  assert.deepEqual(switches.map((n) => n.props['aria-checked']), ['false', 'true'])
  view.unmount()
})

test('turning a model off and saving writes the provider allowlist through configure', async () => {
  const patches = []
  const { registered, mount } = loadClientPlugin({
    language: 'zh-CN',
    remoteService: {
      status: async () => catalogStatus([]),
      configure: async (patch) => {
        patches.push(JSON.parse(JSON.stringify(patch)))
        return catalogStatus(patch.visibleModels || [])
      },
    },
  })
  const slot = registered.get('settings.models.provider-card')
  const view = mount(slot.Component, { ...slot.meta.inject(), open: true })
  await flush()
  const switches = findAll(view.tree, (n) => n.props.role === 'switch')
  assert.equal(switches.length, 2)
  switches[1].props.onClick()
  await flush()
  assert.deepEqual(patches, [], 'the switch is a draft until 保存')
  findOne(view.tree, (n) => n.tag === 'button' && textOf(n) === '保存').props.onClick()
  await flush()
  assert.deepEqual(patches.at(-1), { visibleModels: ['gemini-4-argon'] })
  view.unmount()
})


test('the settings tab renders the same provider block as the Models card', async () => {
  const { registered, mount } = loadClientPlugin({
    language: 'zh-CN',
    remoteService: { status: async () => catalogStatus([]) },
  })
  const slot = registered.get('settings.section')
  const view = mount(slot.Component, slot.meta.inject())
  await flush()
  assert.match(textOf(view.tree), /全部 2 个模型/, 'the tab shows the provider allowlist too')
  view.unmount()
})

test('settings.models.provider-card stays collapsed when open is false and expands when open is true', async () => {
  let statusCalls = 0
  const { registered, mount } = loadClientPlugin({
    language: 'zh-CN',
    remoteService: {
      status: async () => {
        statusCalls += 1
        return catalogStatus([])
      },
    },
  })
  const slot = registered.get('settings.models.provider-card')
  await flush()
  statusCalls = 0
  const collapsed = mount(slot.Component, {
    ...slot.meta.inject(),
    provider: { provider: 'antigravity', displayName: 'Antigravity', settingsNs: 'llm-antigravity-acp', settingsPath: [] },
    configured: true,
    keyConfigured: false,
    open: false,
  })
  await flush()
  assert.equal(collapsed.tree.props.style.display, 'none', 'collapsed row card keeps its seat hidden')
  assert.equal(textOf(collapsed.tree), '', 'collapsed row card renders no fields')
  assert.equal(statusCalls, 0, 'collapsed row card avoids eager status RPCs')
  collapsed.unmount()

  const expanded = mount(slot.Component, {
    ...slot.meta.inject(),
    provider: { provider: 'antigravity', displayName: 'Antigravity', settingsNs: 'llm-antigravity-acp', settingsPath: [] },
    configured: true,
    keyConfigured: false,
    open: true,
  })
  await flush()
  assert.match(textOf(expanded.tree), /全部 2 个模型对外/)
  // One catalog: the panel reads the snapshot once for every row it draws.
  assert.equal(statusCalls, 1)
  expanded.unmount()
})

test('the seat passes no open prop, so the Models page card stays collapsed', async () => {
  let statusCalls = 0
  const { registered, mount } = loadClientPlugin({
    language: 'zh-CN',
    remoteService: {
      status: async () => {
        statusCalls += 1
        return catalogStatus([])
      },
    },
  })
  const slot = registered.get('settings.models.provider-card')
  await flush()
  statusCalls = 0
  // The host's real owner props for this seat: provider/configured/keyConfigured
  // and no `open` key at all. A missing prop must read as collapsed.
  const view = mount(slot.Component, {
    ...slot.meta.inject(),
    provider: { provider: 'antigravity', displayName: 'Antigravity', settingsNs: 'llm-antigravity-acp', settingsPath: [] },
    configured: true,
    keyConfigured: false,
  })
  await flush()
  assert.equal(view.tree.props.style.display, 'none', 'an absent open prop keeps the provider row collapsed')
  assert.equal(textOf(view.tree), '', 'a collapsed provider row renders no fields')
  assert.equal(statusCalls, 0, 'a collapsed provider row never calls status')
  view.unmount()
})
test('registers only settings and model controls, without quota or account services', async () => {
  const forbiddenCalls = []
  const remoteService = Object.fromEntries(['quota', 'accounts', 'login', 'loginCode', 'cancelLogin'].map((method) => [method, () => { forbiddenCalls.push(method); throw new Error('Unexpected ' + method) }]))
  const { registered, mount, descriptors, intervals } = loadClientPlugin({ remoteService })
  assert.deepEqual([...registered.keys()].sort(), ['conversation.input.model.parameters', 'settings.models.provider-card', 'settings.section'])
  assert.deepEqual(descriptors.map((d) => d.method).sort(), ['configure', 'status', 'warmup'])
  const slot = registered.get('settings.section')
  const view = mount(slot.Component, slot.meta.inject())
  await flush()
  assert.doesNotMatch(textOf(view.tree), /额度|添加账号|登录|套餐|quota|sign in/i)
  assert.equal(intervals.size, 0)
  assert.deepEqual(forbiddenCalls, [])
  view.unmount()
})

test('the single system local label saves and clears only accountLabel', async () => {
  const patches = []
  let label = ''
  const status = () => ({ ...catalogStatus([]), accountLabel: label })
  const { registered, mount } = loadClientPlugin({ language: 'en-US', remoteService: {
    status: async () => status(),
    configure: async (patch) => { patches.push(JSON.parse(JSON.stringify(patch))); label = patch.accountLabel; return status() },
  } })
  const slot = registered.get('settings.section')
  const view = mount(slot.Component, slot.meta.inject())
  await flush()
  const input = () => findOne(view.tree, (n) => n.tag === 'input' && n.props['aria-label'] === 'Local label')
  const save = () => findOne(view.tree, (n) => n.tag === 'button' && textOf(n) === 'Save label')
  assert.match(textOf(view.tree), /System accountThis machine/)
  assert.equal(findAll(view.tree, (n) => n.tag === 'input' && n.props['aria-label'] === 'Local label').length, 1)
  input().props.onChange({ target: { value: '  Work   machine  ' } })
  save().props.onClick()
  await flush()
  assert.deepEqual(patches, [{ accountLabel: 'Work machine' }])
  assert.match(textOf(view.tree), /System accountWork machine/)
  input().props.onChange({ target: { value: '' } })
  input().props.onKeyDown({ key: 'Enter', preventDefault() {} })
  await flush()
  assert.deepEqual(patches, [{ accountLabel: 'Work machine' }, { accountLabel: '' }])
  assert.match(textOf(view.tree), /System accountThis machine/)
  input().props.onChange({ target: { value: '界'.repeat(65) } })
  save().props.onClick()
  await flush()
  assert.match(textOf(view.tree), /Use at most 64 characters/)
  assert.equal(patches.length, 2)
  view.unmount()
})

test('label save failure preserves the label draft and exposes a retryable error', async () => {
  let attempts = 0
  const { registered, mount } = loadClientPlugin({ language: 'en-US', remoteService: {
    status: async () => ({ ...catalogStatus([]), accountLabel: '' }),
    configure: async () => { attempts++; throw new Error('Configuration unavailable') },
  } })
  const slot = registered.get('settings.section')
  const view = mount(slot.Component, slot.meta.inject())
  await flush()
  findOne(view.tree, (n) => n.tag === 'input' && n.props['aria-label'] === 'Local label').props.onChange({ target: { value: 'Work' } })
  findOne(view.tree, (n) => n.tag === 'button' && textOf(n) === 'Save label').props.onClick()
  await flush()
  assert.equal(attempts, 1)
  assert.match(textOf(view.tree), /Configuration unavailable/)
  assert.equal(findOne(view.tree, (n) => n.tag === 'input' && n.props['aria-label'] === 'Local label').props.value, 'Work')
  assert.equal(findOne(view.tree, (n) => n.tag === 'button' && textOf(n) === 'Save label').props.disabled, false)
  view.unmount()
})

test('default effort saves a flat setting without account mutation', async () => {
  const patches = []
  const { registered, mount } = loadClientPlugin({ language: 'en-US', remoteService: {
    status: async () => catalogStatus([]),
    configure: async (patch) => { patches.push(JSON.parse(JSON.stringify(patch))); return { ...catalogStatus([]), ...patch } },
  } })
  const slot = registered.get('settings.section')
  const view = mount(slot.Component, slot.meta.inject())
  await flush()
  findOne(view.tree, (n) => n.tag === 'button' && n.props['aria-label'] === 'Default effort High').props.onClick()
  findOne(view.tree, (n) => n.tag === 'button' && textOf(n) === 'Low').props.onClick()
  await flush()
  assert.deepEqual(patches, [{ defaultEffort: 'low' }])
  assert.ok(findOne(view.tree, (n) => n.props['aria-label'] === 'Default effort Low'))
  view.unmount()
})

test('source bundle stays isolated when loaded beside another copy', () => {
  const loaded = []
  const bundle = sourceBundle()
  vm.runInNewContext(bundle + '\n' + bundle, { window: { __ModuleLoader__: { load(spec) { loaded.push(spec.id) } } } })
  assert.deepEqual(loaded, ['dsh-llm-antigravity-acp', 'dsh-llm-antigravity-acp'])
})

test('the settings page renames the provider group but leaves model names to the Models card', async () => {
  const patches = []
  const models = [{ id: 'gemini-4-argon', name: 'Gemini 4 Argon' }, { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }]
  let displayName = 'Antigravity'
  let modelNames = {}
  const snapshot = () => ({
    ...catalogStatus([]),
    displayName,
    modelNames,
    models: models.map((model) => ({ ...model, name: modelNames[model.id] || model.name })),
  })
  const { registered, mount } = loadClientPlugin({
    language: 'en-US',
    remoteService: {
      status: async () => snapshot(),
      configure: async (patch) => {
        patches.push(JSON.parse(JSON.stringify(patch)))
        if (patch.displayName !== undefined) displayName = patch.displayName
        if (patch.modelNames !== undefined) modelNames = patch.modelNames
        return snapshot()
      },
    },
  })
  const slot = registered.get('settings.section')
  const view = mount(slot.Component, slot.meta.inject())
  await flush()
  const field = (label) => findOne(view.tree, (n) => n.tag === 'input' && n.props['aria-label'] === label)
  field('Display name').props.onChange({ target: { value: '  小臻   Antigravity ' } })
  field('Display name').props.onKeyDown({ key: 'Enter', preventDefault() {} })
  await flush()
  assert.deepEqual(patches[0], { displayName: '小臻 Antigravity' })
  // Model display names are edited on the Models page card now, next to the
  // page's own model catalog; the Antigravity tab no longer carries a second
  // rename list.
  assert.doesNotMatch(textOf(view.tree), /Model names/)
  assert.equal(field('gemini-4-argon name'), null)
  assert.equal(patches.length, 1)
  view.unmount()
})

test('the Models card draws its editor with the Models page own classes', async () => {
  const { registered, mount } = loadClientPlugin({
    language: 'zh-CN',
    remoteService: { status: async () => catalogStatus(['claude-opus-5-5']) },
  })
  const slot = registered.get('settings.models.provider-card')
  const view = mount(slot.Component, { ...slot.meta.inject(), open: true })
  await flush()
  const byClass = (name) => findOne(view.tree, (n) => typeof n.props.className === 'string' && n.props.className.split(' ').includes(name))
  // The panel is the page's own editor shell, its own collapsible, its own
  // field rows and its own action row - no bespoke markup of ours.
  assert.ok(byClass('zGbnIq_editor'), 'the panel mounts inside the page editor shell')
  assert.ok(byClass('zGbnIq_customized'), 'the fields sit in the page collapsible')
  assert.equal(textOf(byClass('zGbnIq_customizedSummary')), '自定义设置')
  assert.equal(textOf(byClass('zGbnIq_editorTitle')), 'Antigravity')
  assert.equal(textOf(byClass('zGbnIq_editorRoute')), 'antigravity')
  assert.deepEqual(findAll(view.tree, (n) => n.props.className === 'zGbnIq_fieldLabel').map(textOf), ['显示名称'])
  assert.equal(findAll(view.tree, (n) => n.props.className === 'zGbnIq_modelField').length, 4, 'each of the two model rows carries an id cell and a name cell')
  assert.equal(textOf(byClass('zGbnIq_editorActions')).replace(/\s/g, ''), '取消保存')
  // The allowlist is this package's own feature, but it is drawn with the
  // page's classes too: no second visual language inside the panel.
  assert.equal(findAll(view.tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('dsh-modelselection-')).length, 0)
  view.unmount()
})

test('the Models card holds edits in a draft, saves them through configure and drops them on cancel', async () => {
  const patches = []
  let displayName = 'Antigravity'
  let modelNames = {}
  const advertised = [{ id: 'gemini-4-argon', name: 'Gemini 4 Argon' }, { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }]
  const snapshot = () => ({
    ...catalogStatus([]),
    displayName,
    modelNames,
    models: advertised.map((model) => ({ ...model, name: modelNames[model.id] || model.name })),
  })
  const { registered, mount } = loadClientPlugin({
    language: 'zh-CN',
    remoteService: {
      status: async () => snapshot(),
      configure: async (patch) => {
        patches.push(JSON.parse(JSON.stringify(patch)))
        if (patch.displayName !== undefined) displayName = patch.displayName
        if (patch.modelNames !== undefined) modelNames = patch.modelNames
        return snapshot()
      },
    },
  })
  const slot = registered.get('settings.models.provider-card')
  const view = mount(slot.Component, { ...slot.meta.inject(), open: true })
  await flush()
  const field = (label) => findOne(view.tree, (n) => n.tag === 'input' && n.props['aria-label'] === label)
  field('显示名称').props.onChange({ target: { value: '  小臻   Antigravity ' } })
  field('gemini-4-argon 显示名称').props.onChange({ target: { value: ' Argon   高速 ' } })
  await flush()
  assert.deepEqual(patches, [], 'a draft never writes on change')
  findOne(view.tree, (n) => n.tag === 'button' && textOf(n) === '保存').props.onClick()
  await flush()
  assert.deepEqual(patches.at(-1), { displayName: '小臻 Antigravity', modelNames: { 'gemini-4-argon': 'Argon 高速' } })
  // A cancelled draft is discarded, and clearing a name drops its override.
  field('gemini-4-argon 显示名称').props.onChange({ target: { value: '' } })
  await flush()
  const before = patches.length
  findOne(view.tree, (n) => n.tag === 'button' && textOf(n) === '取消').props.onClick()
  await flush()
  assert.equal(patches.length, before, '取消 writes nothing')
})
