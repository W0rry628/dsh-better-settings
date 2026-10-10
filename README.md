# dsh-better-settings

> 仓库：<https://github.com/W0rry628/dsh-better-settings> · 变更记录见 [CHANGELOG.md](./CHANGELOG.md)

DeepSeek Harness（DSH）插件：在侧边栏左下角**账号栏那一行的右侧**加一个设置齿轮按钮，
一键打开设置面板 —— 不必再「点开账号菜单 → 点设置」两步走。

```
┌─────────────────────────────┐
│  … 会话列表 …                │
│                             │
│  [头像] 账号名           ⚙  │   ← 这个齿轮是本插件加的
└─────────────────────────────┘
```

## 它做了什么

- 挂载后找到侧边栏底部的设置行（ui-settings-general 的 `triggerRow`），
  把齿轮按钮追加到该行最右侧，紧跟在连接状态、更新提示之后。
- 点击时优先复用外壳自己注入的 `openSettings`（`settings.launcher` 的注入物，
  账号菜单拿到的就是它），因此打开的是原生设置面板，不模拟点击、不闪菜单。
- 跟随界面语言切换 `设置 / Settings` 文案；tooltip 里带上当前生效的
  `settings.open` 快捷键（如 `Ctrl+,`）。
- 侧边栏收起成 56px 轨道时自动隐藏（那一行只有 36px 宽，放不下第二个按钮）。
- 如果所在部署里那一行**本来就有**内置设置按钮（没有账号插件接管
  `settings.launcher`），则不加重复按钮。

## 为什么用 DOM 挂载而不是 Slot

DSH 的插槽清单里，侧边栏底部只有两个口：

| Slot | 位置 | 说明 |
| --- | --- | --- |
| `sidebar.footer.action` | 设置行**上方**独立的一行 | 「Optional actions beside Settings at the sidebar foot」，`footArea` 是纵向列 |
| `sidebar.settings` | 账号栏所在的那一行 | `single`，占用者是 ui-settings-general 的整行；内部**没有**留给第三方按钮的插槽 |

那一行内部的结构是 `[settings.launcher（账号菜单）] [ConnectionIndicator] [DesktopUpdateIndicator]`，
想把自己的按钮放在账号栏**右侧**，只能挂到该行末尾。所以这里采用社区插件
（dshmarket、dsh-ui-tweaks）在同类无插槽场景下的做法：认领一个带自有标记的
DOM 节点、用 MutationObserver 跟随重排，并在卸载时完整回收。

如果只想放在「设置行上方那一行」，那把 `lib/client.js` 里的挂载逻辑换成注册
`sidebar.footer.action` 插槽即可，那是一条更稳定（但位置不同）的路。

## 安装

从 GitHub 安装：

```sh
dsh plugin --profile desktop add 'github:W0rry628/dsh-better-settings'
```

也可以直接在 DSH 的插件管理器 / 插件市场里装。

本地开发（把仓库克隆到本机任意目录）：

```sh
dsh plugin --profile desktop add file:/绝对路径/dsh-better-settings
```

手工等价操作：

1. 在 `$DSH_HOME/profiles/<profile>/package.json` 的 `dependencies` 里加：
   `"dsh-better-settings": "github:W0rry628/dsh-better-settings"`（本地开发写
   `"file:/绝对路径/dsh-better-settings"`）。
2. 把 `"dsh-better-settings"` 追加到同文件 `dsh.profile.bundles` 数组末尾
   （顺序即 patch 层应用顺序）。
3. 在 profile 目录执行 `pnpm install`。
4. 重启 DSH 桌面版（客户端半边是新的模块，热更新只在 `dev:web` 同时运行时生效）。


## 结构

| 文件 | 作用 |
| --- | --- |
| `package.json` | 包清单：`dsh.bundle.patch`（bundle 层）+ `dsh.client`（浏览器半边） |
| `cordis.patch.yml` | bundle patch：把 `dsh-better-settings` 这一行插进 profile 配置树 |
| `lib/index.js` | 服务端半边：不做任何事，只是为了这一行能被正常加载 |
| `lib/client.js` | 浏览器半边：全部功能都在这里 |
| `test/client-smoke.mjs` | 假 DOM 冒烟测试：验证落位、去重、轨道态隐藏与卸载回收 |
| `CHANGELOG.md` | 版本变更记录 |

## 测试

```sh
node test/client-smoke.mjs
```

## 已知限制

- 依赖 `triggerRow` 的 CSS Module 类名子串与 `aria-haspopup` 语义来定位行；
  DSH 若改掉这两个约定，需要同步更新 `findTriggerRow` / `findLauncher`。
- 打开设置时优先走 React fiber 上注入的 `openSettings`；React 内部结构若变化，
  会自动退回「点开账号菜单 → 点设置」的兜底路径。
- 收起轨道态不显示按钮。

## License

MIT
