# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的结构，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-10-10

首个版本。

### 新增

- 在侧边栏底部账号栏那一行的最右侧加一个设置齿轮按钮，点击直接打开外壳的设置面板。
- 打开方式优先复用外壳通过 `settings.launcher` 注入的 `openSettings`，并带两级回退
  （点击内置设置按钮 → 打开账号菜单再选「设置」）。
- 按钮文案跟随界面语言（设置 / Settings），tooltip 展示当前生效的 `settings.open`
  快捷键。
- 侧边栏收起成 56px 轨道时隐藏按钮。
- 该行本来就有内置设置按钮的部署下不重复添加。
- 卸载时完整回收样式表、React root 与 DOM 观察器。

### 说明

- 位置依赖 ui-settings-general 的 `triggerRow`（CSS Module 类名子串）、
  账号按钮的 `aria-haspopup` 与 React fiber 上的 `openSettings`；DSH 结构变化时
  按钮会自行撤下而不是报错。
