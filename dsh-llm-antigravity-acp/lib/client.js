;(() => {
/**
 * Antigravity 供应商级模型选择模块（浏览器半）。
 *
 * 用法（各插件 build 会把本文件拼在 `src/client.js` 前面，因此这里**只能**定义
 * 工厂函数，不得引用宿主作用域的任何符号）：
 *
 * ```js
 * const { Modal, Button } = require('@deepseek-ai/dsh-client-ui-primitives')
 * const MS = createModelSelection({ React, h, t, Modal, Button })
 * // 供应商级
 * h(MS.ModelSelectionBlock, {
 *   adapter: MS.providerAdapter({ client, field: 'visibleModels' }),
 *   onStatus: (next) => setStatus(next),
 * })
 * ```
 *
 * 交互分两层：
 *   · 卡片行内直接操作：每行右侧带一键移除按钮（保留至少 1 个模型），卡片底部支持
 *     本地零网络展开/添加未选模型，日常删改无需先点「获取可用模型」弹窗；
 *   · 弹窗批量选择与远程同步：「获取可用模型」用于向端点同步目录并批量搜索勾选。
 *
 * 约束：插件测试沙箱是手写 mini-React，**没有 Set / Map / useMemo**，故一律用数组。
 */
function createModelSelection(deps) {
  const MODEL_SELECTION_VERSION = 1
  const { React, h, t, Modal, Button } = deps

  /** 区块与弹窗的样式，由宿主插件拼进自己的样式表。 */
  const CSS = `
.dsh-modelselection { display: flex; flex-direction: column; gap: 8px; padding: 0; min-width: 0; }
.dsh-modelselection-compact { gap: 6px; }
.dsh-modelselection-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 0 2px; min-height: 26px; }
.dsh-modelselection-title { font-size: 14px; font-weight: 500; color: var(--dsw-alias-label-primary, inherit); }
.dsh-modelselection-compact .dsh-modelselection-title { font-size: 13px; }
.dsh-modelselection-desc { margin: -2px 2px 2px; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-tertiary, currentColor); }
.dsh-modelselection-compact .dsh-modelselection-desc { font-size: 11.5px; line-height: 16px; margin: -2px 2px 0; }
.dsh-modelselection-meta { font-size: 11px; line-height: 18px; padding: 2px 9px; border-radius: 999px; background: var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 6%, transparent)); color: var(--dsw-alias-label-tertiary, currentColor); font-variant-numeric: tabular-nums; }
.dsh-modelselection-meta-custom { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 12%, transparent) !important; color: var(--dsw-alias-state-business-primary, #4176e6) !important; font-weight: 500; }
.dsh-modelselection-actions { margin-left: auto; display: flex; gap: 6px; align-items: center; }
.dsh-modelselection-rows { display: flex; flex-direction: column; padding: 2px 6px; border: 0.5px solid var(--dsw-alias-settings-card-stroke, color-mix(in srgb, currentColor 14%, transparent)); border-radius: var(--dsw-radius-lg, 16px); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, transparent)); max-height: 296px; overflow-y: auto; }
.dsh-modelselection-compact .dsh-modelselection-rows { max-height: 220px; border-radius: 12px; }
.dsh-modelselection-row { display: flex; align-items: center; gap: 10px; font-size: 13px; min-height: 36px; padding: 3px 6px 3px 10px; min-width: 0; }
.dsh-modelselection-row + .dsh-modelselection-row, .dsh-modelselection-footer { border-top: 0.5px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 9%, transparent)); }
.dsh-modelselection-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: var(--dsw-alias-label-primary, inherit); white-space: nowrap; flex-shrink: 0; }
.dsh-modelselection-name { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-tertiary, currentColor); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.dsh-modelselection-remove { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; flex: 0 0 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-tertiary, currentColor); opacity: .62; cursor: pointer; transition: background 120ms ease, color 120ms ease, opacity 120ms ease; }
@media (hover: hover) { .dsh-modelselection-remove:hover:not(:disabled) { opacity: 1; color: var(--dsw-alias-state-error-primary, #d9534f); background: var(--dsw-alias-interactive-bg-hover-danger, color-mix(in srgb, #d9534f 10%, transparent)); } }
.dsh-modelselection-remove:focus-visible { outline: none; opacity: 1; box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4176e6)); }
.dsh-modelselection-remove:disabled { opacity: .2; cursor: default; }
.dsh-modelselection-footer { display: flex; flex-direction: column; padding: 2px 0; }
.dsh-modelselection-add-trigger { box-sizing: border-box; display: flex; align-items: center; gap: 6px; width: 100%; min-height: 34px; padding: 4px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--dsw-alias-state-business-primary, #4176e6); font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; text-align: left; transition: background 120ms ease; }
@media (hover: hover) { .dsh-modelselection-add-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 5%, transparent)); } }
.dsh-modelselection-add-trigger:disabled { opacity: .45; cursor: default; }
.dsh-modelselection-add-drawer { display: flex; flex-direction: column; margin: 2px 4px 4px; padding: 4px; border-radius: 10px; background: var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 4%, transparent)); }
.dsh-modelselection-add-option { box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 2px 8px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary, inherit); font: inherit; font-size: 12.5px; cursor: pointer; text-align: left; }
@media (hover: hover) { .dsh-modelselection-add-option:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent)); } }
.dsh-modelselection-add-option:disabled { opacity: .45; cursor: default; }
.dsh-modelselection-empty { font-size: 12px; color: var(--dsw-alias-label-tertiary, currentColor); margin: 0; padding: 12px 14px; border-radius: var(--dsw-radius-lg, 14px); border: 0.5px dashed var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 18%, transparent)); }
.dsh-modelselection-error { color: var(--dsw-alias-state-error-primary, #d9534f); font-size: 12px; margin: 0; padding: 0 2px; }
.dsh-modelselection-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.dsh-modelselection-search { flex: 1; font: inherit; font-size: 13px; height: 34px; box-sizing: border-box; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l4, color-mix(in srgb, currentColor 20%, transparent)); background: var(--dsw-alias-bg-layer-3, transparent); color: inherit; outline: none; }
.dsh-modelselection-search:focus-visible { border-color: var(--dsw-alias-state-business-primary, #4176e6); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 18%, transparent); }
.dsh-modelselection-list { list-style: none; margin: 0; padding: 2px 0; max-height: 46vh; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.dsh-modelselection-item { display: flex; align-items: center; border-radius: 8px; font-size: 13px; }
@media (hover: hover) { .dsh-modelselection-item:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 5%, transparent)); } }
.dsh-modelselection-item-label { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; cursor: pointer; min-width: 0; box-sizing: border-box; }
.dsh-modelselection-item code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; white-space: nowrap; flex-shrink: 0; }
.dsh-modelselection-item .dsh-modelselection-name { margin-left: auto; }
.dsh-modelselection-nomatch { font-size: 13px; color: var(--dsw-alias-label-tertiary, currentColor); margin: 12px 0; }
`

  const INLINE_ADD_LIMIT = 8

  const closeIcon = () => h('svg', {
    viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', 'aria-hidden': 'true',
  }, h('path', {
    d: 'M6 6l12 12M18 6L6 18',
    stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round',
  }))

  const plusIcon = () => h('svg', {
    viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', 'aria-hidden': 'true', style: { flexShrink: 0 },
  }, h('path', {
    d: 'M12 5v14M5 12h14',
    stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round',
  }))

  // ── 选择代数（纯函数）────────────────────────────────────────────

  /** 候选列表：数据源没给就是空。 */
  function candidatesOf(adapter, status) {
    if (!adapter || typeof adapter.candidates !== 'function') return []
    const list = adapter.candidates(status)
    return Array.isArray(list) ? list : []
  }

  /** 基线勾选集合（数据源默认值，通常是「已启用」的 id）。 */
  function checkedOf(adapter, status, candidates) {
    if (adapter && typeof adapter.checked === 'function') {
      const list = adapter.checked(status)
      return Array.isArray(list) ? list : []
    }
    return candidates.filter((candidate) => candidate.enabled !== false).map((candidate) => candidate.id)
  }

  /** 当前是否勾选：基线 XOR 本次翻动。 */
  function isPicked(id, checked, flipped) {
    return (checked.indexOf(id) >= 0) !== (flipped.indexOf(id) >= 0)
  }

  /** 当前勾选的全部 id。 */
  function pickedIdsOf(candidates, checked, flipped) {
    return candidates.filter((candidate) => isPicked(candidate.id, checked, flipped)).map((candidate) => candidate.id)
  }

  /** 搜索匹配 id 或显示名（大小写无关的子串）。 */
  function matchesQuery(candidate, normalizedQuery) {
    if (normalizedQuery.length === 0) return true
    if (String(candidate.id).toLowerCase().indexOf(normalizedQuery) >= 0) return true
    return typeof candidate.name === 'string' && candidate.name.toLowerCase().indexOf(normalizedQuery) >= 0
  }

  /** 翻转一个 id。 */
  function toggleId(flipped, id) {
    return flipped.indexOf(id) >= 0 ? flipped.filter((item) => item !== id) : flipped.concat([id])
  }

  /** 全选 / 取消全选：只作用于可见项。 */
  function toggleVisible(flipped, visible, checked) {
    const allVisiblePicked = visible.length > 0 && visible.every((candidate) => isPicked(candidate.id, checked, flipped))
    const target = !allVisiblePicked
    let next = flipped.slice()
    for (const candidate of visible) {
      const has = next.indexOf(candidate.id) >= 0
      if ((checked.indexOf(candidate.id) >= 0) === target) {
        if (has) next = next.filter((item) => item !== candidate.id)
      } else if (!has) {
        next = next.concat([candidate.id])
      }
    }
    return next
  }

  // ── 数据源适配 ────────────────────────────────────────────────────────

  /**
   * 供应商级：读写插件自身的一个可见性字段。
   * @param options.client - 插件 remote 客户端（status / warmup / configure）。
   * @param options.field - 写入的配置字段（`visibleModels` 或 `enabledModels`）。
   * @param options.resetPatch - 「恢复默认」写入的补丁，缺省为 `{ [field]: [] }`。
   * @param options.title - 区块标题，缺省「模型」。
   * @param options.subtitle - 标题旁的补充说明。
   */
  function providerAdapter(options) {
    const client = options.client
    const field = options.field
    const candidates = (status) => (status && Array.isArray(status.availableModels) ? status.availableModels : [])
    return {
      title: options.title || t('Exposed models', '对外可用模型'),
      subtitle: options.subtitle,
      description: options.description !== undefined
        ? options.description
        : t(
          'Controls which models appear in the composer picker.',
          '控制对话模型菜单中展示的模型。',
        ),
      candidates,
      checked: (status) => candidates(status).filter((model) => model.enabled !== false).map((model) => model.id),
      load: () => client.status(),
      fetch: () => client.warmup(),
      apply: (ids) => client.configure({ [field]: ids }),
      reset: () => client.configure(options.resetPatch || { [field]: [] }),
    }
  }

  // ── 区块 ──────────────────────────────────────────────────────────────

  /**
   * 模型选择区块：
   *   1. 已启用模型直接在卡片内每行展示，右侧带一键移除按钮（无需弹窗）；
   *   2. 有未启用模型时，卡片底部提供本地零延迟「+ 添加模型」（候选较少时原地展开即点即加，候选较多时秒开搜索弹窗）；
   *   3. 顶部「获取可用模型」用于向服务端同步最新目录并打开批量选择弹窗。
   * @param props.adapter - 见 {@link providerAdapter}。
   * @param props.disabled - 额外禁用（父级写入中、只读部署等）。
   * @param props.compact - 可选的紧凑布局。
   * @param props.onStatus - 可选回调，状态更新后同步通知父组件。
   */
  function ModelSelectionBlock(props) {
    const adapter = props.adapter
    const adapterRef = React.useRef(adapter)
    adapterRef.current = adapter
    const seqRef = React.useRef(0)
    const [status, setStatus] = React.useState(null)
    const [busy, setBusy] = React.useState(false)
    const [failure, setFailure] = React.useState(null)
    const [open, setOpen] = React.useState(false)
    const [addingInline, setAddingInline] = React.useState(false)
    const [query, setQuery] = React.useState('')
    const [flipped, setFlipped] = React.useState([])
    const externalDisabled = props.disabled === true
    const isCompact = props.compact === true
    const isDraftControlled = Array.isArray(props.draftIds) && typeof props.onDraftChange === 'function'
    // On the Models page this block is drawn with the page's own class names
    // (the caller passes its resolver) so it reads as one panel with the page's
    // fields instead of introducing a second visual language. The Settings tab
    // keeps this package's own classes.
    const nativeClass = typeof props.nativeClass === 'function' ? props.nativeClass : null
    const NATIVE_CLASS = {
      '': 'modelCatalog',
      head: 'modelListHead',
      title: 'modelCatalogTitle',
      meta: 'advancedHint',
      desc: 'advancedHint',
      rows: 'modelList',
      row: 'modelEntry',
      id: 'candidateId',
      name: 'advancedHint',
      remove: 'iconButton',
      footer: null,
      'add-trigger': 'addModelButton',
      'add-drawer': null,
      'add-option': 'linkButton',
      empty: 'modelEmpty',
      error: 'error',
      actions: null,
    }
    const cls = (key) => {
      if (nativeClass === null) return 'dsh-modelselection' + (key === '' ? '' : '-' + key)
      const name = NATIVE_CLASS[key]
      return name === null || name === undefined ? undefined : nativeClass(name)
    }
    // A page-native model entry is a plain bordered box; the row inside it
    // needs the same flex line the Settings tab gets from its own stylesheet.
    const rowStyle = nativeClass === null ? undefined : { display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 4px' }
    const drawerStyle = nativeClass === null ? undefined : { display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '4px' }
    // On the Models settings page (`settings.models.provider-card`), stay
    // collapsed like every other provider row until the host says the row is
    // being edited. The seat's owner props are only
    // `provider/configured/keyConfigured`, so a missing `open` means
    // collapsed — an absent prop must not read as "expand".
    const collapsedOnModelsPage = props.provider !== undefined && props.open !== true

    const publishStatus = (next) => {
      setStatus(next)
      setFailure(next && next.error ? String(next.error) : null)
      if (typeof props.onStatus === 'function' && next !== null && typeof next === 'object') {
        props.onStatus(next)
      }
    }

    const run = async (kind) => {
      const target = adapterRef.current
      const seq = ++seqRef.current
      setBusy(true)
      try {
        const next = kind === 'fetch' ? await target.fetch() : await target.load()
        if (seq === seqRef.current) publishStatus(next)
        return next || null
      } catch (error) {
        if (seq === seqRef.current) setFailure(error instanceof Error ? error.message : String(error))
        return null
      } finally {
        if (seq === seqRef.current) setBusy(false)
      }
    }

    React.useEffect(() => {
      if (!collapsedOnModelsPage) void run('load')
    }, [collapsedOnModelsPage])

    const candidates = candidatesOf(adapter, status)
    const candidateIds = candidates.map((c) => c.id)
    const checked = isDraftControlled
      ? (props.draftIds.length === 0
        ? candidateIds
        : candidateIds.filter((id) => props.draftIds.indexOf(id) >= 0))
      : checkedOf(adapter, status, candidates)
    const picked = pickedIdsOf(candidates, checked, flipped)
    const unpicked = candidates.filter((candidate) => checked.indexOf(candidate.id) < 0)
    const customized = isDraftControlled
      ? (props.draftIds.length > 0 && checked.length < candidates.length)
      : ((adapter && typeof adapter.checked === 'function')
        ? checked.length !== candidates.length
        : candidates.some((model) => model.enabled === false))

    const close = () => { setOpen(false); setQuery(''); setFlipped([]) }

    const applyIds = async (nextIds) => {
      if (nextIds.length === 0) return null
      const target = adapterRef.current
      const seq = ++seqRef.current
      setBusy(true)
      try {
        const next = await target.apply(nextIds, status)
        if (seq === seqRef.current) publishStatus(next)
        return next
      } catch (error) {
        if (seq === seqRef.current) setFailure(error instanceof Error ? error.message : String(error))
        return null
      } finally {
        if (seq === seqRef.current) setBusy(false)
      }
    }

    const resetModels = async () => {
      if (isDraftControlled) {
        setAddingInline(false)
        props.onDraftChange([])
        return null
      }
      const target = adapterRef.current
      const seq = ++seqRef.current
      setBusy(true)
      try {
        const next = await target.reset(status)
        if (seq === seqRef.current) {
          setAddingInline(false)
          publishStatus(next)
        }
        return next
      } catch (error) {
        if (seq === seqRef.current) setFailure(error instanceof Error ? error.message : String(error))
        return null
      } finally {
        if (seq === seqRef.current) setBusy(false)
      }
    }

    /** 行内直接移除单个模型（保留至少 1 个启用项）。 */
    const removeInline = async (id) => {
      const nextIds = checked.filter((item) => item !== id)
      if (nextIds.length === 0) return
      if (isDraftControlled) {
        props.onDraftChange(nextIds)
        return
      }
      await applyIds(nextIds)
    }

    /** 行内直接加回单个模型，按原候选顺序排列。 */
    const addInline = async (id) => {
      if (checked.indexOf(id) >= 0) return
      const nextSet = checked.concat([id])
      const ordered = candidates.filter((candidate) => nextSet.indexOf(candidate.id) >= 0).map((candidate) => candidate.id)
      if (isDraftControlled) {
        props.onDraftChange(ordered.length >= candidates.length ? [] : ordered)
        if (ordered.length >= candidates.length) setAddingInline(false)
        return
      }
      const next = await applyIds(ordered)
      if (next !== null && ordered.length >= candidates.length) {
        setAddingInline(false)
      }
    }

    /** 本地零网络打开选择弹窗（用于候选较多时的批量增删）。 */
    const openLocalPicker = () => {
      setQuery('')
      setFlipped([])
      setOpen(true)
    }

    /** 同步远程端点目录并打开选择模型弹窗。 */
    const fetchModels = async () => {
      if (candidates.length > 0) {
        setQuery('')
        setFlipped([])
        setOpen(true)
        void run('fetch')
        return
      }
      const next = await run('fetch')
      if (next === null) return
      const list = candidatesOf(adapter, next)
      if (list.length === 0) {
        setFailure(t('This provider reported no models; try again later.', '该提供商没有上报任何模型，请稍后再试'))
        return
      }
      setQuery('')
      setFlipped([])
      setOpen(true)
    }

    const adopt = async () => {
      if (picked.length === 0) return
      if (isDraftControlled) {
        const ordered = candidateIds.filter((cid) => picked.indexOf(cid) >= 0)
        props.onDraftChange(ordered.length >= candidates.length ? [] : ordered)
        setAddingInline(false)
        close()
        return
      }
      if (await applyIds(picked) !== null) close()
    }

    const normalized = query.trim().toLowerCase()
    const visible = candidates.filter((candidate) => matchesQuery(candidate, normalized))
    const allVisiblePicked = visible.length > 0 && visible.every((candidate) => isPicked(candidate.id, checked, flipped))

    const summary = busy && !open
      ? t('Updating…', '正在更新…')
      : candidates.length === 0
        ? t('No catalog fetched yet', '尚未获取模型目录')
        : customized
          ? t(`${checked.length} of ${candidates.length} models selected`, `已选 ${checked.length} / ${candidates.length} 个模型`)
          : t(`All ${candidates.length} models`, `全部 ${candidates.length} 个模型`)

    const canRemoveRow = checked.length > 1 && !busy && !externalDisabled
    if (collapsedOnModelsPage) return null

    return h('section', {
      className: nativeClass === null ? (isCompact ? 'dsh-modelselection dsh-modelselection-compact' : 'dsh-modelselection') : cls(''),
      'aria-label': adapter.title || t('Models', '模型'),
    },
      h('div', { className: cls('head') },
        h('span', { className: cls('title') }, adapter.title || t('Models', '模型')),
        h('span', {
          className: nativeClass === null ? (customized ? 'dsh-modelselection-meta dsh-modelselection-meta-custom' : 'dsh-modelselection-meta') : cls('meta'),
        }, summary),
        adapter.subtitle === undefined ? null : h('span', { className: cls('name') }, adapter.subtitle),
        h('span', { className: cls('actions') },
          customized
            ? h(Button, {
              variant: 'ghost',
              size: 'sm',
              disabled: busy || externalDisabled,
              onClick: () => void resetModels(),
            }, t('Restore defaults', '恢复默认'))
            : null,
          h(Button, {
            variant: 'outline',
            size: 'sm',
            disabled: busy || externalDisabled,
            onClick: () => void fetchModels(),
          }, t('Fetch models', '获取可用模型')))),
      adapter.description ? h('p', { className: cls('desc') }, adapter.description) : null,
      candidates.length === 0
        ? h('p', { className: cls('empty') }, t('Use “Fetch models” to read this provider’s catalog.', '点击「获取可用模型」读取该提供商的实时模型目录'))
        : h('div', { className: cls('rows') },
          ...checked.map((id) => {
            const model = candidates.filter((candidate) => candidate.id === id)[0]
            return h('div', { key: id, className: cls('row'), style: rowStyle },
              h('code', { className: cls('id') }, id),
              h('span', { className: cls('name') }, model && model.name && model.name !== id ? model.name : ''),
              h('button', {
                type: 'button',
                className: cls('remove'),
                'aria-label': t(`Remove ${id}`, `移除 ${id}`),
                title: checked.length <= 1
                  ? t('Keep at least one model enabled', '请至少保留一个启用的模型')
                  : t(`Remove ${id}`, `移除 ${id}`),
                disabled: !canRemoveRow,
                onClick: () => void removeInline(id),
              }, closeIcon()))
          }),
          unpicked.length > 0
            ? h('div', { className: cls('footer') },
              h('button', {
                type: 'button',
                className: cls('add-trigger'),
                disabled: busy || externalDisabled,
                onClick: () => {
                  if (unpicked.length <= INLINE_ADD_LIMIT) setAddingInline(!addingInline)
                  else openLocalPicker()
                },
              },
                plusIcon(),
                unpicked.length <= INLINE_ADD_LIMIT && addingInline
                  ? t('Hide available models', '收起可添加模型')
                  : t(`Add model (${unpicked.length} available)`, `添加模型（还有 ${unpicked.length} 个可选）`)),
              addingInline && unpicked.length <= INLINE_ADD_LIMIT
                ? h('div', { className: cls('add-drawer'), style: drawerStyle }, ...unpicked.map((candidate) =>
                  h('button', {
                    key: candidate.id,
                    type: 'button',
                    className: cls('add-option'),
                    disabled: busy || externalDisabled,
                    onClick: () => void addInline(candidate.id),
                  },
                    plusIcon(),
                    h('code', { className: cls('id') }, candidate.id),
                    candidate.name && candidate.name !== candidate.id
                      ? h('span', { className: cls('name') }, candidate.name)
                      : null)))
                : null)
            : null),
      failure ? h('p', { role: 'alert', className: cls('error') }, failure) : null,
      h(Modal, {
        open,
        onClose: close,
        backdropBlur: !isCompact,
        title: t('Select models', '选择模型'),
        closeLabel: t('Close', '关闭'),
        description: t('These are the models this provider offers; the checked ones become the model list.', '以下是模型提供商的可用模型，勾选的模型即为模型列表。'),
        footer: [
          h(Button, { key: 'cancel', variant: 'outline', onClick: close }, t('Cancel', '取消')),
          h(Button, {
            key: 'adopt',
            variant: 'outline',
            disabled: picked.length === 0,
            title: picked.length === 0 ? t('Keep at least one model checked.', '请至少保留一个勾选的模型') : undefined,
            onClick: () => void adopt(),
          }, t('Update list', '更新列表')),
        ],
      },
      h('div', { className: 'dsh-modelselection-toolbar' },
        h('input', {
          className: 'dsh-modelselection-search',
          type: 'search',
          value: query,
          placeholder: t('Search models', '搜索模型'),
          'aria-label': t('Search models', '搜索模型'),
          'data-modal-autofocus': '',
          onChange: (event) => setQuery(event.target.value),
        }),
        h(Button, {
          variant: 'ghost',
          size: 'sm',
          disabled: visible.length === 0,
          onClick: () => setFlipped(toggleVisible(flipped, visible, checked)),
        }, allVisiblePicked ? t('Deselect all', '取消全选') : t('Select all', '全选'))),
      visible.length === 0
        ? h('p', { className: 'dsh-modelselection-nomatch', role: 'status' }, t('No matching models.', '没有匹配的模型'))
        : h('ul', { className: 'dsh-modelselection-list' }, ...visible.map((candidate) =>
          h('li', { key: candidate.id, className: 'dsh-modelselection-item' },
            h('label', { className: 'dsh-modelselection-item-label' },
              h('input', {
                type: 'checkbox',
                checked: isPicked(candidate.id, checked, flipped),
                'aria-label': candidate.id,
                onChange: () => setFlipped(toggleId(flipped, candidate.id)),
              }),
              h('code', { title: candidate.name || candidate.id }, candidate.id),
              candidate.name && candidate.name !== candidate.id
                ? h('span', { className: 'dsh-modelselection-name' }, candidate.name)
                : null)))))
    )
  }

  return {
    version: MODEL_SELECTION_VERSION,
    CSS,
    ModelSelectionBlock,
    providerAdapter,
    // 纯函数导出，供单元测试直接覆盖选择代数。
    algebra: { candidatesOf, checkedOf, isPicked, pickedIdsOf, matchesQuery, toggleId, toggleVisible },
  }
}

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
      '.dsh-agy-seat-body{display:flex;flex-direction:column;gap:10px;min-width:0}',
      '.dsh-agy-seat-body .dsh-agy-card > .dsh-agy-field{min-height:42px;padding:8px 10px;justify-content:center}',
      '.dsh-agy-field{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.antigravity-settings-card .dsh-agy-card > .dsh-agy-field{min-height:42px;padding:8px 10px;justify-content:center}',
      '.dsh-agy-field-error{font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary, #d9534f)}',
      '.dsh-agy-input-wide{flex:1 1 auto;max-width:340px;text-align:left}',
      '.dsh-agy-model-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary, currentColor);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0}',
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

    // ── The Models page's own visual language ────────────────────────────
    //
    // `settings.models.provider-card` gives this package a seat inside the
    // Antigravity card, but the page draws its editor from a hand-written
    // per-family table (`layoutOf`) that knows only `llm-deepseek` and
    // `llm-pi-ai`: an unknown namespace gets one tertiary hint line and a
    // commit button that is disabled by construction. Its stylesheet, though,
    // ships as plain prefixed class names inside a `<style data-plugin>` tag,
    // so this seat can draw the editor with the page's OWN classes instead of
    // imitating them - same header, same 「自定义设置」collapsible, same field
    // rows, same action row. No colour, size or radius is authored here; the
    // only thing copied from the page is class names, which the resolver below
    // reads at runtime so a rehashed prefix cannot silently break the look.
    const HOST_MODELS_PLUGIN = '@deepseek-ai/dsh-client-ui-settings-models'
    const HOST_PREFIX_FALLBACK = 'zGbnIq'
    const MAX_NAME_LENGTH = 64
    let hostPrefixCache = null

    /**
     * The CSS-module prefix the Models page shipped in this build.
     * @returns the prefix every page class name is built from.
     */
    function hostPrefix() {
      if (hostPrefixCache !== null) return hostPrefixCache
      let prefix = HOST_PREFIX_FALLBACK
      try {
        // The page tags its stylesheet with both `data-plugin` (the package)
        // and `data-plugin-css` (the module id); the latter is the one that
        // survives a package rename, so it is tried first.
        const selectors = [
          'style[data-plugin-css*="settings-models"]',
          'style[data-plugin="' + HOST_MODELS_PLUGIN + '"]',
        ]
        for (const selector of selectors) {
          const tag = typeof document === 'undefined' ? null : document.querySelector(selector)
          const text = tag === null || typeof tag.textContent !== 'string' ? '' : tag.textContent
          const found = /\.([A-Za-z0-9]+)_customizedBody\b/.exec(text)
          if (found !== null) {
            prefix = found[1]
            break
          }
        }
      } catch { /* an unreadable sheet keeps the known prefix */ }
      hostPrefixCache = prefix
      return prefix
    }

    /** One class name from the Models page's stylesheet. */
    const pc = (name) => hostPrefix() + '_' + name

    /** Trim and collapse the whitespace a name cannot keep. */
    const cleanName = (value) => String(value === undefined || value === null ? '' : value).trim().replace(/\s+/g, ' ')

    /**
     * Models the picker currently offers, so the rename rows never list a
     * family the allowlist hides. Falls back to the full catalog on a host
     * that reports no visibility flags.
     */
    function shownModels(status) {
      const available = Array.isArray(status.availableModels) ? status.availableModels.filter((m) => m.enabled !== false) : []
      if (available.length > 0) return available
      return Array.isArray(status.models) ? status.models : []
    }

    /** The names the panel edits from: the page's own effective values. */
    function draftFrom(status) {
      const models = shownModels(status)
      const displayName = typeof status.displayName === 'string' && status.displayName.length > 0 ? status.displayName : 'Antigravity'
      const names = {}
      for (const model of models) names[model.id] = typeof model.name === 'string' ? model.name : model.id
      const base = { displayName, names: { ...names } }
      return { displayName, names, base }
    }

    /** The provider line the page prints above every editor card. */
    function ProviderHeading(props) {
      return h('div', { className: pc('editorHeader') },
        h('span', { className: pc('editorTitle') }, props.displayName),
        props.route !== props.displayName ? h('span', { className: pc('editorRoute') }, props.route) : null)
    }

    /** One page-native label + input row (`field` / `fieldLabel` / `input`). */
    function FieldRow(props) {
      return h('div', { className: pc('field') },
        h('span', { className: pc('fieldLabel') }, props.label),
        h('input', {
          className: pc('input'),
          type: 'text',
          value: props.value,
          placeholder: props.placeholder || '',
          'aria-label': props.label,
          disabled: props.disabled === true,
          onChange: (event) => props.onChange(event.target.value),
        }),
        props.hint ? h('span', { className: pc('advancedHint') }, props.hint) : null)
    }

    /**
     * The page-native model catalog: a heading over one bordered row per
     * advertised model, the id read-only and the displayed name editable.
     * Clearing a name drops the override and the row falls back to the name
     * the ACP server advertises.
     */
    function ModelNameCatalog(props) {
      const models = Array.isArray(props.models) ? props.models : []
      if (models.length === 0) return null
      return h('div', { className: pc('modelCatalog') },
        h('div', { className: pc('modelCatalogHeading') },
          h('span', { className: pc('modelCatalogTitle') }, t('Model names', '模型名称')),
          h('span', { className: pc('advancedHint') }, t('Shown in the model picker; blank keeps the advertised name.', '显示在模型菜单；留空则用服务端名称。'))),
        h('div', { className: pc('modelList') },
          models.map((model) => h('div', { key: model.id, className: pc('modelEntry') },
            h('div', { className: pc('modelField') },
              h('span', { className: pc('modelFieldLabel') }, model.id),
              h('input', {
                className: pc('input'),
                type: 'text',
                value: typeof props.names[model.id] === 'string' ? props.names[model.id] : '',
                placeholder: typeof model.name === 'string' ? model.name : model.id,
                'aria-label': model.id + ' ' + t('display name', '显示名称'),
                disabled: props.disabled === true,
                onChange: (event) => props.onChange(model.id, event.target.value),
              }))))))
    }

    /**
     * The Models page card's editor, drawn with the page's own classes.
     *
     * The page never tells this seat whether the row is open (its owner props
     * are `provider/configured/keyConfigured`), so the seat watches its row:
     * the page appends its editor to the same `<li>` only while expanded. The
     * page's editor for an unknown namespace is one hint line plus a disabled
     * commit button, so it is hidden once this panel has a snapshot to draw,
     * and this panel supplies the same three parts the page's own editor
     * supplies - heading, fields, 取消/保存 - with the page's classes.
     * Fields are a draft until 保存, exactly like the shipped cards.
     */
    function ModelsCardFields(props) {
      const [status, setStatus] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [observed, setObserved] = React.useState(false)
      // The page never hands this seat an `open` prop; an explicit one is read
      // anyway so the component can be driven without a live DOM.
      const expanded = props.open === true || observed
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const seatRef = React.useRef(null)
      const commitRef = React.useRef(() => Promise.resolve(true))
      const closeRef = React.useRef(() => {})
      const statusRef = React.useRef(null)
      statusRef.current = status

      // The page's own close affordance: the row's 「编辑」 button toggles the
      // editor, so activating it again is exactly what 取消 and a finished
      // 保存 mean here. Fallbacks keep the panel reachable when the row shape
      // changes: leave the page's editor visible and let its own 取消 close.
      const closePanel = () => {
        const seat = seatRef.current
        const row = seat !== null && typeof seat.closest === 'function' ? seat.closest('li') : null
        if (row === null) return false
        const actions = row.querySelector('.' + pc('rowActions'))
        const toggle = actions === null ? null : actions.querySelector('button')
        if (toggle === null) return false
        toggle.click()
        return true
      }
      closeRef.current = closePanel

      // Load the snapshot the rows are drawn from, and start every open with
      // the page's committed values so a cancelled draft never survives.
      React.useEffect(() => {
        if (!expanded) return undefined
        let live = true
        props.client.statusNow().then((snapshot) => {
          if (!live || !snapshot) return
          setStatus(snapshot)
          setDraft(draftFrom(snapshot))
        }).catch(() => { /* the rows keep the last snapshot this session saw */ })
        return () => { live = false }
      }, [expanded, props.client])

      React.useEffect(() => {
        const seat = seatRef.current
        if (!seat) return undefined
        const row = typeof seat.closest === 'function' ? seat.closest('li') : null
        if (!row) return undefined
        // The page renders this seat through a wrapper element
        // (`div[data-slot="settings.models.provider-card"]`, display:contents)
        // and appends its provider editor to the same row only while the row is
        // expanded, always right after that wrapper.
        const wrapper = typeof seat.closest === 'function' ? seat.closest('[data-slot="settings.models.provider-card"]') : null
        let hidden = null
        const sync = () => {
          // Slot wrapper first (the page always appends its editor right after
          // it); the row's last child is the older anchor and stays as the
          // fallback for a build that stops tagging the wrapper.
          const last = wrapper !== null && wrapper !== undefined
            ? wrapper.nextElementSibling
            : row.lastElementChild
          const open = last !== null && last !== undefined && !last.contains(seat)
          setObserved(open)
          if (!open) return
          // Hide the page's own editor for this namespace only after this
          // panel can close the row itself; otherwise its hint and disabled
          // commit button stay as the fallback.
          if (hidden === last) return
          if (statusRef.current === null) return
          if (row.querySelector('.' + pc('rowActions') + ' button') === null) return
          hidden = last
          last.style.display = 'none'
        }
        sync()
        if (typeof MutationObserver === 'undefined') return undefined
        const observer = new MutationObserver(sync)
        observer.observe(row, { childList: true, subtree: true, characterData: true })
        return () => {
          observer.disconnect()
          if (hidden !== null) hidden.style.display = ''
        }
      }, [])

      const commit = async () => {
        const snapshot = statusRef.current
        if (snapshot === null || draft === null) return true
        const displayName = cleanName(draft.displayName)
        if (displayName.length === 0) {
          setError(t('The display name cannot be empty', '显示名称不能为空'))
          return false
        }
        if ([...displayName].length > MAX_NAME_LENGTH) {
          setError(t('Use at most ' + MAX_NAME_LENGTH + ' characters', '最多 ' + MAX_NAME_LENGTH + ' 个字符'))
          return false
        }
        const overrides = { ...(snapshot.modelNames && typeof snapshot.modelNames === 'object' ? snapshot.modelNames : {}) }
        let renamed = false
        for (const model of shownModels(snapshot)) {
          const value = cleanName(draft.names[model.id])
          const base = cleanName(draft.base.names[model.id])
          if (value === base) continue
          if ([...value].length > MAX_NAME_LENGTH) {
            setError(t('Use at most ' + MAX_NAME_LENGTH + ' characters', '最多 ' + MAX_NAME_LENGTH + ' 个字符'))
            return false
          }
          renamed = true
          if (value.length === 0) delete overrides[model.id]
          else overrides[model.id] = value
        }
        const patch = {}
        if (displayName !== cleanName(draft.base.displayName)) patch.displayName = displayName
        if (renamed) patch.modelNames = overrides
        if (Object.keys(patch).length === 0) return true
        setBusy(true)
        try {
          const next = await props.client.configure(patch)
          if (next && typeof next === 'object' && next.error) {
            setError(String(next.error))
            return false
          }
          if (next && typeof next === 'object') {
            setStatus(next)
            setDraft(draftFrom(next))
          }
          setError(null)
          return true
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
          return false
        } finally {
          setBusy(false)
        }
      }
      commitRef.current = commit

      const submit = async () => {
        const ok = await commitRef.current()
        if (ok) closeRef.current()
      }

      const seat = (children) => h('div', {
        ref: seatRef,
        className: 'dsh-agy-seat',
        // A seat with nothing to draw must leave the flow entirely: an empty
        // flex item still costs the card's 12px gap and would jump the row.
        style: expanded && status !== null && draft !== null ? undefined : { display: 'none' },
      }, children)

      // Wait for a snapshot before drawing, so the page's own editor keeps the
      // row until this panel can replace it.
      if (!expanded || status === null || draft === null) return seat(null)

      return seat(
        h('div', { className: pc('editor') },
          h(ProviderHeading, { displayName: draft.displayName || 'Antigravity', route: PROVIDER }),
          h('details', { className: pc('customized'), open: true },
            h('summary', { className: pc('customizedSummary') }, t('Custom settings', '自定义设置')),
            h('div', { className: pc('customizedBody') },
              h(FieldRow, {
                label: t('Display name', '显示名称'),
                value: draft.displayName,
                placeholder: 'Antigravity',
                hint: t('Shown in the model picker and the provider row.', '显示在模型菜单和 provider 行。'),
                disabled: busy,
                onChange: (next) => setDraft((current) => ({ ...current, displayName: next })),
              }),
              h(ModelNameCatalog, {
                models: shownModels(status),
                names: draft.names,
                disabled: busy,
                onChange: (id, next) => setDraft((current) => ({ ...current, names: { ...current.names, [id]: next } })),
              }),
              // The allowlist is this package's own feature, so it is the one
              // block the page cannot draw: it is handed the page's class
              // resolver so it renders as part of the same panel.
              h(MS.ModelSelectionBlock, {
                adapter: props.adapter,
                disabled: busy,
                nativeClass: pc,
                onStatus: (next) => { if (next && typeof next === 'object') setStatus(next) },
              }),
              h('p', { className: pc('advancedHint') },
                t('Context window, the patch script and the remaining switches stay in cordis.patch.yml.',
                  '上下文窗口、patch 脚本等其余字段仍由 cordis.patch.yml 管理。')))),
          error ? h('p', { role: 'alert', className: pc('error') }, error) : null,
          h('div', { className: pc('editorActions') },
            h('button', {
              type: 'button',
              className: pc('secondaryButton'),
              disabled: busy,
              onClick: () => { setError(null); closeRef.current() },
            }, t('Cancel', '取消')),
            h('button', {
              type: 'button',
              className: pc('primaryButton'),
              disabled: busy,
              onClick: () => { void submit() },
            }, busy ? t('Saving', '保存中') : t('Save', '保存')))))
    }

    /**
     * One editable text row: trims and collapses whitespace, commits on Enter
     * or blur, and leaves the stored value alone when the text is unchanged.
     */
    function TextField(props) {
      const [draft, setDraft] = React.useState(props.value)
      const [error, setError] = React.useState(null)
      React.useEffect(() => { setDraft(props.value) }, [props.value])
      const commit = () => {
        if (props.disabled) return
        const value = draft.trim().replace(/\s+/g, ' ')
        if (value.length === 0 && !props.allowEmpty) {
          setError(t('Cannot be empty', '不能为空'))
          return
        }
        if ([...value].length > 64) {
          setError(t('Use at most 64 characters', '最多 64 个字符'))
          return
        }
        setError(null)
        if (value !== props.value) void props.onSave(value)
      }
      return h('div', { className: 'dsh-agy-field' },
        props.hideLabel ? null : h('span', { className: 'dsh-agy-label' }, props.label),
        h('input', {
          className: props.wide ? 'dsh-agy-input dsh-agy-input-wide' : 'dsh-agy-input',
          'aria-label': props.label,
          value: draft,
          disabled: props.disabled,
          placeholder: props.placeholder || '',
          onChange: (event) => setDraft(event.target.value),
          onBlur: commit,
          onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault?.(); commit() } },
        }),
        error ? h('div', { role: 'alert', className: 'dsh-agy-field-error' }, error) : null)
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
            h(TextField, {
              label: t('Display name', '显示名称'),
              value: status.displayName || 'Antigravity',
              placeholder: 'Antigravity',
              disabled: busy,
              onSave: (displayName) => void applyPatch({ displayName }),
            }),
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
          inject: () => ({ adapter: antigravityModelAdapter(client), client }),
        }, ModelsCardFields)), 'antigravity-acp: model catalog card')
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

})();
