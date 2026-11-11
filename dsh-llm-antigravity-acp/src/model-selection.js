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
      className: isCompact ? 'dsh-modelselection dsh-modelselection-compact' : 'dsh-modelselection',
      'aria-label': adapter.title || t('Models', '模型'),
    },
      h('div', { className: 'dsh-modelselection-head' },
        h('span', { className: 'dsh-modelselection-title' }, adapter.title || t('Models', '模型')),
        h('span', {
          className: customized ? 'dsh-modelselection-meta dsh-modelselection-meta-custom' : 'dsh-modelselection-meta',
        }, summary),
        adapter.subtitle === undefined ? null : h('span', { className: 'dsh-modelselection-name' }, adapter.subtitle),
        h('span', { className: 'dsh-modelselection-actions' },
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
      adapter.description ? h('p', { className: 'dsh-modelselection-desc' }, adapter.description) : null,
      candidates.length === 0
        ? h('p', { className: 'dsh-modelselection-empty' }, t('Use “Fetch models” to read this provider’s catalog.', '点击「获取可用模型」读取该提供商的实时模型目录'))
        : h('div', { className: 'dsh-modelselection-rows' },
          ...checked.map((id) => {
            const model = candidates.filter((candidate) => candidate.id === id)[0]
            return h('div', { key: id, className: 'dsh-modelselection-row' },
              h('code', { className: 'dsh-modelselection-id' }, id),
              h('span', { className: 'dsh-modelselection-name' }, model && model.name && model.name !== id ? model.name : ''),
              h('button', {
                type: 'button',
                className: 'dsh-modelselection-remove',
                'aria-label': t(`Remove ${id}`, `移除 ${id}`),
                title: checked.length <= 1
                  ? t('Keep at least one model enabled', '请至少保留一个启用的模型')
                  : t(`Remove ${id}`, `移除 ${id}`),
                disabled: !canRemoveRow,
                onClick: () => void removeInline(id),
              }, closeIcon()))
          }),
          unpicked.length > 0
            ? h('div', { className: 'dsh-modelselection-footer' },
              h('button', {
                type: 'button',
                className: 'dsh-modelselection-add-trigger',
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
                ? h('div', { className: 'dsh-modelselection-add-drawer' }, ...unpicked.map((candidate) =>
                  h('button', {
                    key: candidate.id,
                    type: 'button',
                    className: 'dsh-modelselection-add-option',
                    disabled: busy || externalDisabled,
                    onClick: () => void addInline(candidate.id),
                  },
                    plusIcon(),
                    h('code', { className: 'dsh-modelselection-id' }, candidate.id),
                    candidate.name && candidate.name !== candidate.id
                      ? h('span', { className: 'dsh-modelselection-name' }, candidate.name)
                      : null)))
                : null)
            : null),
      failure ? h('p', { role: 'alert', className: 'dsh-modelselection-error' }, failure) : null,
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
