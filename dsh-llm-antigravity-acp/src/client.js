/** Browser UI for the local system Antigravity provider: models and generation settings. */
window.__ModuleLoader__.load({
  id: 'dsh-llm-antigravity-acp',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const PROVIDER = 'antigravity'
    const PACKAGE = 'dsh-llm-antigravity-acp'
    const SERVICE = 'antigravityAcp'

    const isZh = () => typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')
    const t = (en, cn) => (isZh() ? cn : en)

    // Shared selection UI (bundle-concatenated ahead of this file by the build).
    const { Modal, Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const MS = createModelSelection({ React, h, t, Modal, Button })

    /** Provider-level allowlist adapter: reads/writes `visibleModels`. */
    const antigravityModelAdapter = (client) => MS.providerAdapter({ client, field: 'visibleModels' })

    function codec(symbol, parse) {
      return { mode: 'strict', typeSymbol: `${PACKAGE}#${symbol}`, create: () => ({ parse }) }
    }
    const anyObject = (value) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid antigravity payload')
      return value
    }
    const DESCRIPTORS = [
      { id: `${PACKAGE}#${SERVICE}/status`, service: SERVICE, namespace: SERVICE, method: 'status', invocation: { kind: 'direct' }, parameters: [], result: codec('Status', anyObject) },
      { id: `${PACKAGE}#${SERVICE}/warmup`, service: SERVICE, namespace: SERVICE, method: 'warmup', invocation: { kind: 'direct' }, parameters: [], result: codec('Status', anyObject) },
      { id: `${PACKAGE}#${SERVICE}/configure`, service: SERVICE, namespace: SERVICE, method: 'configure', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', acceptsUndefined: false, codec: codec('ConfigureRequest', anyObject) }], result: codec('Status', anyObject) },
    ]

    // Unwrap Typert transport results; direct status payloads are accepted too.
    const isEnvelope = (result) => result !== null && typeof result === 'object' && 'ok' in result
      && (result.ok === true ? 'value' in result : result.error !== null && typeof result.error === 'object')

    function unwrap(result) {
      if (isEnvelope(result)) {
        if (result.ok) return result.value
        throw new Error((result.error && result.error.message) || 'unknown error')
      }
      return result
    }

    function makeClient(scope) {
      const call = async (method, ...args) => {
        const deadline = Date.now() + 20_000
        for (;;) {
          const service = scope.get(`remote.${SERVICE}`)
          if (service && typeof service[method] === 'function') return unwrap(await service[method](...args))
          if (Date.now() >= deadline) throw new Error(t('Antigravity service is not ready', 'Antigravity 服务尚未就绪'))
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
      }
      return {
        status: () => call('status'),
        /**
         * Status that never waits for the remote service. Background reads
         * (row warm-up, live settings) use this so a page that has not mounted
         * the service yet costs nothing instead of parking a retry loop.
         * @returns the status, or undefined when the service is not mounted.
         */
        statusNow: () => {
          const service = scope.get(`remote.${SERVICE}`)
          if (!service || typeof service.status !== 'function') return Promise.resolve(undefined)
          return Promise.resolve(service.status()).then(unwrap)
        },
        configure: (patch) => call('configure', patch),
        warmup: () => call('warmup'),
      }
    }

    const tokens = (n) => {
      const scaled = (value) => (value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10))
      if (n < 1000) return String(Math.round(n))
      if (n < 1_000_000) return `${scaled(n / 1000)}K`
      return `${scaled(n / 1_000_000)}M`
    }
    function useStore(store) {
      return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    }

    // One scoped stylesheet for every control this package draws: the shipped
    // model-menu cell geometry, so a provider row inside the composer menu and
    // a row inside the Settings section read as the same component. Colors are
    // --dsw-alias-* tokens so every theme keeps working.
    const ROW_CSS = [
      '.dsh-agy-list{display:flex;flex-direction:column}',
      '.dsh-agy-row{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;min-height:34px;padding:0 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left}',
      'button.dsh-agy-row{cursor:pointer;outline:none}',
      // A disabled row must stay readable: only the pointer and a light fade
      // change, never the label color (the dimmed token washes out on white).
      'button.dsh-agy-row:disabled{cursor:default;opacity:.55}',
      'button.dsh-agy-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-agy-row[aria-expanded="true"]{background:color-mix(in srgb, currentColor 4%, transparent)}',
      '@media(hover:hover){button.dsh-agy-row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}',
      '.dsh-agy-label{flex:0 0 auto;white-space:nowrap;color:var(--dsw-alias-label-primary);font-weight:500}',
      '.dsh-agy-value{flex:1 1 auto;min-width:0;text-align:right;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}',
      '.dsh-agy-row[data-interactive="true"] .dsh-agy-value{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-agy-chevron{flex:0 0 auto;width:12px;height:12px;color:var(--dsw-alias-menu-icon);transition:transform 120ms ease}',
      '.dsh-agy-options{display:flex;flex-direction:column;margin:2px 0 4px 10px;padding-left:6px;border-left:1.5px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 14%, transparent))}',
      '.dsh-agy-option{min-height:30px;padding-left:10px}',
      '.dsh-agy-option .dsh-agy-value{display:inline-flex;justify-content:flex-end;align-items:center}',
      '.dsh-agy-check{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--dsw-alias-label-primary)}',
      '.dsh-agy-stack{display:flex;flex-wrap:wrap;gap:10px 14px;justify-content:flex-end}',
      // Settings section: a calm card surface that matches the native DSH
      // settings page rather than the dense geometry of the composer menu.
      '.antigravity-settings-card{box-sizing:border-box;max-width:680px;display:flex;flex-direction:column;gap:16px;padding:4px 0 12px;color:var(--dsw-alias-label-primary)}',
      '.dsh-agy-header{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.dsh-agy-header h3{font-size:16px;font-weight:600;line-height:24px;margin:0;color:var(--dsw-alias-label-primary)}',
      '.dsh-agy-settings-body{display:flex;flex-direction:column;gap:18px;min-width:0}',
      '.dsh-agy-card{display:flex;flex-direction:column;padding:2px 6px;border:0.5px solid var(--dsw-alias-settings-card-stroke, color-mix(in srgb, currentColor 14%, transparent));border-radius:var(--dsw-radius-xl, 20px);background:var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, transparent))}',
      '.antigravity-settings-card .dsh-agy-card > .dsh-agy-row{min-height:42px;padding:8px 10px;border-radius:0}',
      '.antigravity-settings-card .dsh-agy-card > .dsh-agy-list{padding:2px 0}',
      '.antigravity-settings-card .dsh-agy-card > .dsh-agy-list > .dsh-agy-row{min-height:38px;padding:6px 10px;border-radius:var(--dsw-radius-md, 12px)}',
      '.antigravity-settings-card .dsh-agy-card > * + *{border-top:0.5px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 10%, transparent))}',
      '.antigravity-settings-card .dsh-agy-options{margin:2px 4px 6px 10px;padding:4px;border-left:0;border-radius:var(--dsw-radius-md, 12px);background:var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 4%, transparent))}',
      '.antigravity-settings-card .dsh-agy-options .dsh-agy-option{min-height:32px;padding:0 10px;border-radius:var(--dsw-radius-sm, 8px)}',
      '.antigravity-settings-card .dsh-agy-options .dsh-agy-option[aria-checked="true"]{background:var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 7%, transparent))}',
      // Buttons and inputs: one shared surface driven by DSH theme tokens.
      '.dsh-agy-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:5px;font:inherit;font-size:11px;line-height:18px;padding:1px 8px;border-radius:6px;white-space:nowrap;border:0.5px solid var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 16%, transparent));background:transparent;color:var(--dsw-alias-label-primary);outline:none;cursor:pointer;transition:background 120ms ease,border-color 120ms ease,box-shadow 120ms ease}',
      '.dsh-agy-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent))}',
      '.dsh-agy-btn:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4176e6))}',
      '.dsh-agy-btn:disabled{opacity:.45;cursor:default}',
      '.dsh-agy-input{box-sizing:border-box;font:inherit;font-size:12px;line-height:20px;min-width:0;padding:2px 8px;border-radius:6px;border:0.5px solid var(--dsw-alias-border-l4, color-mix(in srgb, currentColor 18%, transparent));background:var(--dsw-alias-bg-layer-3, transparent);color:var(--dsw-alias-label-primary);outline:none;transition:border-color 120ms ease,box-shadow 120ms ease}',
      '.dsh-agy-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.dsh-agy-input:hover:not(:disabled){border-color:var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 32%, transparent))}',
      '.dsh-agy-input:focus-visible{border-color:var(--dsw-alias-state-business-primary, #4176e6);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 18%, transparent)}',
      '.dsh-agy-dot{display:inline-block;width:7px;height:7px;border-radius:999px;flex:0 0 auto}',
      '.dsh-agy-badge{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:11px;line-height:18px;font-weight:500;white-space:nowrap;background:var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 6%, transparent));color:var(--dsw-alias-label-primary)}',
      '.dsh-agy-tag{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;line-height:18px;white-space:nowrap;font-variant-numeric:tabular-nums;background:var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 5%, transparent));color:var(--dsw-alias-label-secondary, var(--dsw-alias-label-tertiary, currentColor))}',
      '.dsh-agy-btn-settings{padding:3px 12px}',
    ].join('\n') + '\n' + MS.CSS
    const STYLE_ID = 'antigravity-acp-rows-style'
    function ensureStyles() {
      const doc = typeof document === 'undefined' ? undefined : document
      if (!doc || !doc.createElement || !doc.head || !doc.head.appendChild) return
      const existing = doc.getElementById ? doc.getElementById(STYLE_ID) : null
      if (existing) {
        existing.textContent = ROW_CSS
        return
      }
      const style = doc.createElement('style')
      style.id = STYLE_ID
      style.textContent = ROW_CSS
      doc.head.appendChild(style)
    }

    const chevron = (open) => h('svg', {
      className: 'dsh-agy-chevron',
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': 'true',
      style: open ? { transform: 'rotate(90deg)' } : undefined,
    }, h('path', {
      d: 'M9 6l6 6-6 6', stroke: 'currentColor', 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }))

    const checkMark = () => h('span', { className: 'dsh-agy-check', 'aria-hidden': 'true' },
      h('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none' },
        h('path', {
          d: 'M5 13l4 4L19 7', stroke: 'currentColor', 'stroke-width': 2,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        })))

    /** Semantic dot color for the provider status badge. */
    const stateDotColor = (state) => ({
      ready: '#2e9e6a',
      starting: '#e0a800',
      error: '#d9534f',
      idle: 'var(--dsw-alias-label-tertiary, currentColor)',
    }[state] || 'var(--dsw-alias-label-tertiary, currentColor)')

    // Text-free decorative glyphs. `aria-hidden` keeps them out of the
    // accessibility tree and, importantly, out of any textOf() reading.
    const refreshIcon = () => h('svg', {
      viewBox: '0 0 24 24', width: 13, height: 13, fill: 'none',
      'aria-hidden': 'true', style: { flexShrink: 0 },
    }, h('path', {
      d: 'M20 11a8 8 0 1 0-2.4 5.7M20 5v6h-6',
      stroke: 'currentColor', 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }))
    /**
     * One setting as a row: label on the left, the current value and a chevron
     * on the right, and the available values as a check-marked list that opens
     * inline. The composer menu needs `menuitem`/`menuitemradio` roles so DSH's
     * arrow-key routing reaches the rows; a Settings section uses plain buttons.
     */
    function ChoiceRow(props) {
      // Controlled when the parent passes `open` (mutually-exclusive accordion);
      // otherwise keep the historical self-managed state for standalone uses.
      const [innerOpen, setInnerOpen] = React.useState(false)
      const isControlled = typeof props.open === 'boolean'
      const isOpen = isControlled ? props.open : innerOpen
      const toggle = (next) => {
        if (isControlled) {
          if (typeof props.onToggle === 'function') props.onToggle(next)
        } else {
          setInnerOpen(next)
        }
      }
      const current = props.options.find((option) => option.value === props.value)
      const menu = props.menu === true
      return h('div', { className: 'dsh-agy-list' },
        h('button', {
          type: 'button',
          ref: props.buttonRef || undefined,
          ...(menu ? { role: 'menuitem' } : {}),
          'aria-expanded': isOpen,
          'aria-label': `${props.label} ${current ? current.label : ''}`.trim(),
          disabled: props.disabled,
          'data-interactive': 'true',
          className: 'dsh-agy-row',
          onClick: () => { if (!props.disabled) toggle(!isOpen) },
        },
          h('span', { className: 'dsh-agy-label' }, props.label),
          h('span', { className: 'dsh-agy-value' }, current ? current.label : '—'),
          chevron(isOpen)),
        isOpen ? h('div', { className: 'dsh-agy-options' },
          ...props.options.map((option) => h('button', {
            key: String(option.value),
            type: 'button',
            ...(menu ? { role: 'menuitemradio' } : {}),
            'aria-checked': option.value === props.value,
            disabled: props.disabled,
            className: 'dsh-agy-row dsh-agy-option',
            onClick: () => {
              if (props.disabled) return
              toggle(false)
              props.onChange(option.value)
            },
          },
            h('span', { className: 'dsh-agy-label' }, option.label),
            h('span', { className: 'dsh-agy-value' }, option.value === props.value ? checkMark() : null)))) : null)
    }

    /**
     * A read-only row: same geometry as {@link ChoiceRow} without hover, focus,
     * chevron, or expansion.
     */
    function InfoRow(props) {
      return h('div', { className: 'dsh-agy-row' },
        h('span', { className: 'dsh-agy-label' }, props.label),
        h('span', { className: 'dsh-agy-value' }, props.children ?? props.value))
    }

    /** A local remark only: never creates, selects, or changes an account. */
    function LocalLabel(props) {
      const [draft, setDraft] = React.useState(props.value)
      const [error, setError] = React.useState(null)
      React.useEffect(() => { setDraft(props.value) }, [props.value])
      const save = () => {
        if (props.busy) return
        const value = draft.trim().replace(/\s+/g, ' ')
        if ([...value].length > 64) {
          setError(t('Use at most 64 characters', '备注最多 64 个字符'))
          return
        }
        setError(null)
        if (value !== props.value) void props.onSave(value)
      }
      return h('div', { className: 'dsh-agy-card' },
        h(InfoRow, { label: t('System account', '系统账号'), value: props.value || t('This machine', '本机') }),
        h('label', { className: 'dsh-agy-row' },
          h('span', { className: 'dsh-agy-label' }, t('Local label', '本地备注')),
          h('input', {
            className: 'dsh-agy-input',
            'aria-label': t('Local label', '本地备注'),
            value: draft,
            disabled: props.busy,
            placeholder: t('This machine', '本机'),
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault?.(); save() } },
          })),
        h('button', { type: 'button', className: 'dsh-agy-btn dsh-agy-btn-settings', disabled: props.busy || draft === props.value, onClick: save }, t('Save label', '保存备注')),
        error ? h('div', { role: 'alert' }, error) : null)
    }

    const EFFORT_OPTIONS = [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ]

    /** Context-window choices, shared by the Settings row and the menu row. */
    const windowOptions = () => [
      { value: 0, label: t('Auto (1M)', '自动 (1M)') },
      { value: 900000, label: '900K' },
      { value: 512000, label: '512K' },
      { value: 256000, label: '256K' },
    ]

    /** Long-decode choices: Antigravity's control over how far one reply may run. */
    const decodeOptions = () => [
      { value: 0, label: t('Off', '关闭') },
      { value: 3, label: t('3x', '3 段') },
      { value: 8, label: t('8x', '8 段') },
    ]

    // Live settings last reported by the Host, mirrored into localStorage: the
    // menu rows mount before any round-trip finishes, and a slow or failed
    // status call must not leave the rows blank.
    const SETTINGS_STORAGE_KEY = 'dsh.antigravity.settings.v1'
    const readStoredSettings = () => {
      try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SETTINGS_STORAGE_KEY)
        const parsed = raw === null ? null : JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
      } catch { return null }
    }
    const stored = readStoredSettings()
    let cachedSettings = stored === null ? null : {
      configuredContextWindow: Number(stored.configuredContextWindow) || 0,
      longDecodeContinuations: Number.isFinite(stored.longDecodeContinuations) ? stored.longDecodeContinuations : 3,
    }
    /** Remember the settings-bearing half of a status snapshot. */
    const rememberSettings = (status) => {
      if (!status || typeof status !== 'object') return
      cachedSettings = {
        ...cachedSettings,
        ...(Number.isFinite(status.configuredContextWindow) ? { configuredContextWindow: status.configuredContextWindow } : {}),
        ...(Number.isFinite(status.longDecodeContinuations) ? { longDecodeContinuations: status.longDecodeContinuations } : {}),
      }
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(cachedSettings))
      } catch { /* storage may be unavailable; the in-memory copy still serves */ }
    }

    function SettingsCard(props) {
      const [status, setStatus] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [refreshing, setRefreshing] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      // Accordion: at most one choice row is expanded at a time.
      const [openKey, setOpenKey] = React.useState(null)
      const rootRef = React.useRef(null)
      const load = React.useCallback(async (warm) => {
        setRefreshing(true)
        try {
          const s = warm ? await props.client.warmup() : await props.client.status()
          setStatus(s)
          rememberSettings(s)
          setError(s.error || null)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setRefreshing(false)
        }
      }, [props.client])
      const applyPatch = React.useCallback(async (patch) => {
        if (busy) return
        setBusy(true)
        try {
          const s = await props.client.configure(patch)
          setStatus(s)
          rememberSettings(s)
          setError(s.error || null)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }, [props.client, busy])
      // Model selection reports the updated provider status.
      const adoptStatus = React.useCallback((s) => {
        if (s === null || typeof s !== 'object') return
        setStatus(s)
        rememberSettings(s)
        setError(s.error || null)
      }, [])
      React.useEffect(() => { void load(false) }, [load])
      // Outside pointerdown or Escape collapses the open settings sub-list.
      React.useEffect(() => {
        if (openKey === null) return undefined
        const onPointerDown = (e) => {
          const root = rootRef.current
          if (!root) return
          const inside = typeof root.contains === 'function' ? root.contains(e.target) : root === e.target
          if (!inside) setOpenKey(null)
        }
        const onDocKeyDown = (e) => {
          if (e.key === 'Escape') {
            e.preventDefault?.()
            e.stopPropagation?.()
            setOpenKey(null)
          }
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onDocKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onDocKeyDown, true)
        }
      }, [openKey])
      const stateText = status ? { idle: t('Idle', '待命'), starting: t('Starting', '启动中'), ready: t('Connected', '已连接'), error: t('Error', '异常') }[status.state] : '…'
      // Status row: a semantic-color dot badge plus version / context / unlock
      // tags. All decoration is text-free so textOf() stays readable.
      const statusBadges = h('span', { className: 'dsh-agy-stack', style: { justifyContent: 'flex-end', alignItems: 'center', gap: 8 } },
        status && status.state === 'idle' ? null : h('span', { className: 'dsh-agy-badge' },
          h('span', { className: 'dsh-agy-dot', style: { background: stateDotColor(status && status.state) } }),
          stateText),
        h('span', { className: 'dsh-agy-tag' }, `v${(status && status.version) || '—'}`),
        h('span', { className: 'dsh-agy-tag' }, tokens((status && status.contextWindow) || 0)),
        status && status.unlock && status.unlock.status === 'unlocked' ? h('span', { className: 'dsh-agy-tag' }, t('Unlocked', '已解锁')) : null)
      return h('section', { className: 'antigravity-settings-card' },
        h('div', { className: 'dsh-agy-header' },
          h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600, lineHeight: '24px' } }, 'Antigravity'),
          h('button', {
            type: 'button',
            className: 'dsh-agy-btn dsh-agy-btn-settings',
            disabled: refreshing || busy,
            onClick: () => void load(true),
          }, refreshIcon(), refreshing || busy ? '…' : t('Refresh', '刷新'))),
        h('div', { className: 'dsh-agy-settings-body', ref: rootRef },
          status ? h('div', { className: 'dsh-agy-card' },
            h(InfoRow, { label: t('Status', '状态') }, statusBadges),
            h(ChoiceRow, {
              label: t('Window', '上下文窗口'),
              options: windowOptions(),
              value: status.configuredContextWindow ?? 0,
              disabled: busy,
              open: openKey === 'window',
              onToggle: (next) => setOpenKey(next ? 'window' : null),
              onChange: (v) => void applyPatch({ contextWindow: v }),
            }),
            h(ChoiceRow, {
              label: t('Default effort', '默认思考'),
              options: EFFORT_OPTIONS,
              value: status.defaultEffort || 'high',
              disabled: busy,
              open: openKey === 'effort',
              onToggle: (next) => setOpenKey(next ? 'effort' : null),
              onChange: (v) => void applyPatch({ defaultEffort: v }),
            }),
            h(ChoiceRow, {
              label: t('Long decode', '超长续写'),
              options: decodeOptions(),
              value: status.longDecodeContinuations ?? 3,
              disabled: busy,
              open: openKey === 'decode',
              onToggle: (next) => setOpenKey(next ? 'decode' : null),
              onChange: (v) => void applyPatch({ longDecodeContinuations: v }),
            }))
            : null,
          // Provider-level allowlist: the same block the Models page card renders.
          status ? h(MS.ModelSelectionBlock, {
            adapter: antigravityModelAdapter(props.client),
            disabled: busy,
            onStatus: adoptStatus,
          }) : null,
          status ? h(LocalLabel, { value: status.accountLabel || '', busy, onSave: (accountLabel) => applyPatch({ accountLabel }) }) : null),
        error ? h('div', { role: 'alert', style: { color: '#d9534f', fontSize: 12 } }, error) : null)
    }

    /**
     * Provider parameter rows in the composer's model menu: the same two live
     * settings as the Settings section, at the moment a model is being chosen.
     * Everything is applied through `configure`, so the next request reads the
     * new value and the menu stays open.
     */
    function ModelParameterRows(props) {
      const state = useStore(props.directory.store)
      const selection = state && state.current
      const active = !!selection && selection.provider === PROVIDER
      const [status, setStatus] = React.useState(cachedSettings)
      const [busy, setBusy] = React.useState(false)
      // Accordion: at most one parameter panel is open at a time.
      const [openKey, setOpenKey] = React.useState(null)
      const rootRef = React.useRef(null)
      const contextButtonRef = React.useRef(null)
      const decodeButtonRef = React.useRef(null)
      React.useEffect(() => {
        if (!active) return undefined
        let live = true
        props.client.statusNow().then((s) => { if (live && s) { rememberSettings(s); setStatus({ ...s }) } }).catch(() => { /* keep the last observation */ })
        return () => { live = false }
      }, [active, props.client])
      // Leaving the menu or locking the rows collapses any open panel.
      React.useEffect(() => {
        if (!active || props.locked) setOpenKey(null)
      }, [active, props.locked])
      // Outside pointerdown or document-capture Escape collapses the open
      // sub-list first — even when ModelSelect kept DOM focus on its trigger
      // button via mousedown preventDefault().
      React.useEffect(() => {
        if (openKey === null) return undefined
        const buttonRefsByKey = { context: contextButtonRef, decode: decodeButtonRef }
        const onPointerDown = (e) => {
          const root = rootRef.current
          if (!root) return
          const inside = typeof root.contains === 'function' ? root.contains(e.target) : root === e.target
          if (!inside) setOpenKey(null)
        }
        const onDocKeyDown = (e) => {
          if (e.key === 'Escape') {
            e.preventDefault?.()
            e.stopPropagation?.()
            const root = rootRef.current
            const activeEl = typeof document !== 'undefined' ? document.activeElement : null
            if (root && activeEl && typeof root.contains === 'function' && root.contains(activeEl)) {
              buttonRefsByKey[openKey]?.current?.focus?.()
            }
            setOpenKey(null)
          }
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onDocKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onDocKeyDown, true)
        }
      }, [openKey])
      if (!active) return null
      const buttonRefs = { context: contextButtonRef, decode: decodeButtonRef }
      // First Escape collapses the open sub-list (and stops the menu-level
      // handler); a second Escape, with no sub-list open, lets the menu close.
      const onKeyDown = (e) => {
        if (openKey !== null && e.key === 'Escape') {
          e.preventDefault?.()
          e.stopPropagation?.()
          const ref = buttonRefs[openKey]
          ref?.current?.focus?.()
          setOpenKey(null)
        }
      }
      const fail = (message) => { if (typeof props.reportFailure === 'function') props.reportFailure(message) }
      const apply = (patch) => {
        if (props.locked || busy) return
        setBusy(true)
        props.client.configure(patch).then((s) => {
          rememberSettings(s)
          setStatus({ ...cachedSettings, ...s })
        }, (error) => {
          fail(error instanceof Error ? error.message : String(error))
        }).finally(() => setBusy(false))
      }
      return h('div', { className: 'dsh-agy-list', ref: rootRef, onKeyDown },
        h(ChoiceRow, {
          menu: true,
          label: t('Context', '上下文'),
          options: windowOptions(),
          value: status ? status.configuredContextWindow ?? 0 : 0,
          disabled: props.locked || busy,
          open: openKey === 'context',
          onToggle: (next) => setOpenKey(next ? 'context' : null),
          buttonRef: contextButtonRef,
          onChange: (v) => apply({ contextWindow: v }),
        }),
        h(ChoiceRow, {
          menu: true,
          label: t('Long decode', '超长续写'),
          options: decodeOptions(),
          value: status ? status.longDecodeContinuations ?? 3 : 3,
          disabled: props.locked || busy,
          open: openKey === 'decode',
          onToggle: (next) => setOpenKey(next ? 'decode' : null),
          buttonRef: decodeButtonRef,
          onChange: (v) => apply({ longDecodeContinuations: v }),
        }))
    }

    return {
      name: PACKAGE,
      inject: ['slots', 'remote'],
      apply(ctx) {
        try {
          const mounted = ctx.remote.$mount({ package: PACKAGE, descriptors: DESCRIPTORS })
          ctx.effect(() => mounted, 'antigravity-acp: mount remote')
        } catch (error) {
          console.error('[dsh-llm-antigravity-acp] remote mount failed:', error)
        }
        const client = makeClient(ctx)
        ctx.effect(() => {
          ensureStyles()
          // Warm the live settings once per page load so the menu rows paint
          // from the cached copy instead of waiting on a round-trip.
          let live = true
          client.statusNow().then((s) => { if (live) rememberSettings(s) }).catch(() => { /* the rows fall back to the last stored copy */ })
          return () => { live = false }
        }, 'antigravity-acp: row styles and live settings')
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'antigravity-acp',
          order: 41,
          label: () => 'Antigravity',
          inject: () => ({ client }),
        }, SettingsCard)), 'antigravity-acp: settings section')
        // Second entry point: the Models page's Antigravity card. Both write
        // `visibleModels` through one remote.
        ctx.effect(() => ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
          name: 'settings.models.provider-card',
          key: 'llm-antigravity-acp',
          inject: () => ({ adapter: antigravityModelAdapter(client) }),
        }, MS.ModelSelectionBlock)), 'antigravity-acp: model catalog card')
        ctx.inject(['slots', 'modelDirectories'], (scope) => {
          scope.effect(() => scope.slots.inject('conversation.input.model.parameters', () => scope.slots.register({
            name: 'conversation.input.model.parameters',
            id: 'antigravity-acp-parameters',
            order: 100,
            inject: (sessionId) => ({ directory: scope.modelDirectories.directoryFor(sessionId), client, sessionId }),
          }, ModelParameterRows)), 'antigravity-acp: model parameter rows')
        })
      },
    }
  },
})
