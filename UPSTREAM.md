# UPSTREAM — 这个 fork 与上游的关系

本仓库是 [lili-luo/dsh-plugin-bundle](https://github.com/lili-luo/dsh-plugin-bundle) 的 fork，作为本机 DSH
实例实际使用的版本。**上游代码不自动合并**，每次跟上游都是一次有意识的评审。

## 基线

| 项 | 值 |
| --- | --- |
| upstream | https://github.com/lili-luo/dsh-plugin-bundle.git |
| fork | git@github.com:xiazhenxin314-cpu/dsh-plugin-bundle.git |
| 分叉基点 | `0a90ec3`（2026-11-11「拦截 agy 网络异常与高负载告警文本并转为可重试错误」） |
| 基点 tag | `upstream-base` |
| 本机挂载 | 3181 / 3182 均以 `link:` 指向本仓库的 `dsh-llm-antigravity-acp` |

## 本地 delta

| 提交 | 内容 | 为什么 |
| --- | --- | --- |
| `fbf788c` | 裁剪为纯推理 ACP 桥（0.4.0-local.1），删除配额 / CloudCode / OAuth 邮箱 / token 拷贝 | **安全不变量**：原实现用 `curl` 把 `Authorization: Bearer` 和 refresh 表单放进 argv，而 `/proc/*/cmdline` 全局可读、本机所有 DSH 实例同 uid |
| `edf5a24` | 会话未上报库存时不再清空模型目录 | 通用 bug，可还回上游 |
| `47d157a` | Models 页 provider 卡片默认收起（缺 `open` 视为收起） | 通用 bug：该 slot 的 owner props 只有 `provider/configured/keyConfigured`，从不传 `open` |
| `0dd4b7f` | `displayName` / `modelNames` 成为可实时改的 live setting | 本机需求：设置页要能改 provider 与模型显示名 |

## 硬不变量与护栏

**本 fork 不处理任何凭据。** 具体地：不出现 `Authorization: Bearer`、不直连 Cloud Code Assist、
不读 refresh token、不把 token 写进子进程 argv，`accountEnv()` 永远返回空对象（继承宿主环境，
登录态留在官方 CLI 里）。

这条靠 `dsh-llm-antigravity-acp/tests/no-credential-handling.test.mjs` 守住 —— 它就是为
「某次跟上游时手滑把删掉的代码 merge 回来」准备的。**任何同步之后必须先跑测试，护栏挂了就说明合并有毒。**

## 跟上游的流程

```sh
git fetch upstream
git log --oneline main..upstream/main        # 上游多了什么
git log --oneline upstream/main..main        # 我们多了什么
git diff upstream-base..upstream/main -- dsh-llm-antigravity-acp/src   # 上游在源码层动了哪些
```

然后二选一：

- **cherry-pick 上游的个别修复**（首选，delta 最小）
- **merge upstream/main**（仅当上游改动大且与 delta 不重叠）

merge 之后一律：

```sh
cd dsh-llm-antigravity-acp
npm run typecheck && npm run build && npm test   # 护栏必须绿
```

**`lib/` 进版本控制**（上游就是跟踪预编译产物的）。改 `src/` 必须同时提交重新 build 的 `lib/`，
否则本机 link 挂载跑的是旧代码。

## 应该还回上游的

- `edf5a24`（空库存不清目录）
- `47d157a`（provider 卡片收起）

每还一件，delta 就薄一层。`fbf788c` 和 `0dd4b7f` 是本机决策，不提议上游。
