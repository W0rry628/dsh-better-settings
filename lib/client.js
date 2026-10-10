/**
 * dsh-better-settings —— 浏览器半边。
 *
 * 目标：在侧边栏左下角「头像 / 账号栏」那一行的最右侧，加一个设置齿轮按钮，
 * 一键打开外壳的设置面板，而不必先点开账号菜单再点「设置」。
 *
 * 为什么要用 DOM 挂载而不是插槽：
 * 侧边栏底部由 ui-sidebar 的 `footArea` 组成，它是一个纵向列 ——
 * `sidebar.footer.action`（设置行上方独立的一行）在上、`sidebar.settings`
 * （账号栏所在的那一行）在下；设置按钮真正所在的行内部没有给第三方留插槽。
 * 那一行的内容是 ui-settings-general 的 `triggerRow`：
 *   [ settings.launcher（账号菜单，由 ui-settings-account 接管）]
 *   [ ConnectionIndicator ] [ DesktopUpdateIndicator ]
 * 所以这里按 dshmarket / dsh-ui-tweaks 在同样无插槽可用时的做法，
 * 把自己挂到该行的末尾，并跟随 DOM 变化重新落位。
 *
 * 打开设置的方式（按可靠性排序）：
 * 1. 从账号按钮的 React fiber 上取外壳注入的 `openSettings`
 *    （ui-settings-general 通过 `settings.launcher` 把它传给了账号菜单）；
 * 2. 若那一行本身就是内置设置按钮（账号插件没接管 launcher），直接点它；
 * 3. 兜底：点开账号菜单，再点其中的「设置」项。
 */
window.__ModuleLoader__.load({
	id: 'dsh-better-settings',
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

		const React = require('react')
		const ReactDOM = require('react-dom')
		const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

		/** 自己的容器标记，用来在不依赖哈希类名的前提下认领节点。 */
		const ATTRIBUTE = 'data-dsh-better-settings'
		/** 样式表标识，与 DSH 其它插件的 `data-plugin-css` 约定一致。 */
		const STYLE_TAG_ID = 'dsh-better-settings/sidebar-shortcut'
		/** 打开设置的命令 id：ui-settings-general 注册的快捷键命令就是它。 */
		const SETTINGS_COMMAND_ID = 'settings.open'
		/** 账号菜单里「设置」一项在各语言下的文案，只用于最后一种兜底路径。 */
		const SETTINGS_WORDS = new Set(['设置', 'Settings', 'Preferences'])

		const CSS = [
			`[${ATTRIBUTE}] {`,
			'  flex: none;',
			'  display: flex;',
			'  align-items: center;',
			'}',
			`[${ATTRIBUTE}][hidden] {`,
			'  display: none;',
			'}',
			'.dsh-better-settings-button {',
			'  box-sizing: border-box;',
			'  display: inline-flex;',
			'  align-items: center;',
			'  justify-content: center;',
			'  width: 28px;',
			'  height: 28px;',
			'  margin: 0;',
			'  padding: 0;',
			'  border: none;',
			'  border-radius: var(--dsw-radius-sm, 6px);',
			'  background: transparent;',
			'  color: var(--dsw-alias-label-secondary);',
			'  cursor: pointer;',
			'  transition: background-color .15s ease, color .15s ease;',
			'}',
			'.dsh-better-settings-button:hover {',
			'  background: var(--dsw-alias-interactive-bg-hover);',
			'  color: var(--dsw-alias-label-primary);',
			'}',
			'.dsh-better-settings-button:focus-visible {',
			'  outline: 2px solid var(--dsw-alias-brand-primary);',
			'  outline-offset: 1px;',
			'}',
		].join('\n')

		/**
		 * 找到侧边栏底部那一行（ui-settings-general 的 `triggerRow`）。
		 *
		 * 它由 CSS Module 渲染，类名形如 `wCInkW_triggerRow`：导出名稳定、
		 * 哈希会变，所以按子串匹配；匹配不到再从账号按钮往上退两级
		 * （button → AccountMenu 根节点 → triggerRow）。
		 * @returns 那一行的元素，尚未渲染时返回 null。
		 */
		function findTriggerRow() {
			const byClass = document.querySelector('[class*="triggerRow"]')
			if (byClass !== null) return byClass
			const launcher = document.querySelector('button[aria-haspopup="menu"][data-collapsed]')
			return launcher === null ? null : launcher.parentElement?.parentElement ?? null
		}

		/**
		 * 取那一行里的 launcher 按钮 —— 也就是 `settings.launcher` 的占用者。
		 *
		 * launcher 永远是该行的第一个子节点（AccountMenu 会包一层 div，
		 * 内置设置按钮则直接是 button），而这一行后面还跟着连接状态与更新
		 * 提示两个控件，所以只看第一个子节点，避免误判。
		 * @param row - 底部那一行。
		 * @returns 触发按钮，或 null。
		 */
		function findLauncher(row) {
			const first = row.firstElementChild
			if (first === null) return null
			if (first.matches('button[aria-haspopup]')) return first
			return first.querySelector('button[aria-haspopup]')
		}

		/** 收起态（56px 轨道）下这一行只有 36px 宽，放不下第二个按钮。 */
		function isRail(row) {
			return String(row.className ?? '').includes('railRow')
		}

		/**
		 * 从 React fiber 上读外壳注入的 `openSettings`。
		 *
		 * ui-settings-general 用 `renderSlot('settings.launcher', { openSettings: actions.open, ... })`
		 * 把外壳的设置面板开关传给了 launcher 的占用者（账号菜单），
		 * 因此从账号按钮往上走一定能遇到带这个 prop 的 fiber。这是最干净的
		 * 打开方式：不模拟点击、不闪菜单。fiber 属于 React 内部结构，取不到
		 * 时静默返回 undefined，由调用方退回到点击路径。
		 * @param node - launcher 的 DOM 节点。
		 * @returns openSettings 回调，或 undefined。
		 */
		function readInjectedOpenSettings(node) {
			try {
				const key = Object.keys(node).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'))
				if (key === undefined) return undefined
				let fiber = node[key]
				let depth = 0
				while (fiber && depth < 80) {
					const props = fiber.memoizedProps
					if (props && typeof props.openSettings === 'function') return props.openSettings
					fiber = fiber.return
					depth += 1
				}
			} catch {
				/* React 内部结构变了就退回到点击路径，不影响按钮本身。 */
			}
			return undefined
		}

		/** 打开外壳的设置面板。 */
		function openSettings() {
			const row = findTriggerRow()
			if (row === null) return
			const launcher = findLauncher(row)
			if (launcher === null) return

			const injected = readInjectedOpenSettings(launcher)
			if (injected !== undefined) {
				injected()
				return
			}
			if (launcher.getAttribute('aria-haspopup') === 'dialog') {
				launcher.click()
				return
			}

			// 兜底：账号菜单仍在，但注入取不到 —— 先开菜单，再点其中的「设置」。
			launcher.click()
			let attempts = 0
			const pick = () => {
				const item = Array.from(document.querySelectorAll('[role="menuitem"]'))
					.find(element => SETTINGS_WORDS.has(String(element.textContent ?? '').trim()))
				if (item !== undefined) {
					item.click()
					return
				}
				attempts += 1
				if (attempts < 12) requestAnimationFrame(pick)
			}
			requestAnimationFrame(pick)
		}

		/**
		 * 当前语言标识。
		 * @param ctx - 客户端插件上下文。
		 * @returns 形如 `zh` / `en` 的标识。
		 */
		function localeId(ctx) {
			try {
				const snapshot = ctx.get('locale')?.getSnapshot?.()
				if (snapshot && typeof snapshot.active === 'string') return snapshot.active
			} catch {
				/* locale 服务可选：取不到就用浏览器语言。 */
			}
			return typeof navigator === 'undefined' ? '' : navigator.language
		}

		/** 按钮的无障碍名称，跟随界面语言。 */
		function labelFor(ctx) {
			return localeId(ctx).toLowerCase().startsWith('zh') ? '设置' : 'Settings'
		}

		/**
		 * 读取 `settings.open` 当前的按键，用于 tooltip 提示。
		 * @param ctx - 客户端插件上下文。
		 * @returns `{ keys, aria }`，没有绑定或服务缺失时为 undefined。
		 */
		function shortcutFor(ctx) {
			try {
				const rows = ctx.get('shortcuts')?.catalog?.getSnapshot?.()
				const row = Array.isArray(rows) ? rows.find(entry => entry && entry.id === SETTINGS_COMMAND_ID) : undefined
				if (!row || !Array.isArray(row.keys) || row.keys.length === 0) return undefined
				return { keys: row.keys, aria: row.aria }
			} catch {
				return undefined
			}
		}

		/** 齿轮按钮本体，尽量复用外壳自己的图标与 tooltip 组件。 */
		function ShortcutButton(props) {
			const { label, shortcut, onClick } = props
			const Icon = primitives.IconSettingsOutlineMedium ?? primitives.IconSettingsOutlineRegular
			const hasTooltip = typeof primitives.Tooltip === 'function'
			const button = React.createElement('button', {
				type: 'button',
				className: 'dsh-better-settings-button',
				'aria-label': label,
				'aria-haspopup': 'dialog',
				...(hasTooltip ? {} : { title: label }),
				onClick,
			}, Icon === undefined ? null : React.createElement(Icon, { size: 16 }))
			if (!hasTooltip) return button
			return React.createElement(primitives.Tooltip, {
				label,
				shortcutKeys: shortcut?.keys,
				delayMs: 500,
				side: 'top',
			}, button)
		}

		/**
		 * 安装按钮；返回清理函数。
		 * @param ctx - 客户端插件上下文。
		 * @returns 卸载函数。
		 */
		function install(ctx) {
			if (typeof document === 'undefined' || document.body === null) return () => {}

			const styleTag = document.createElement('style')
			styleTag.dataset.plugin = 'dsh-better-settings'
			styleTag.dataset.pluginCss = STYLE_TAG_ID
			styleTag.textContent = CSS
			document.head.appendChild(styleTag)

			const container = document.createElement('span')
			container.setAttribute(ATTRIBUTE, '')
			container.className = 'dsh-better-settings-slot'
			const root = ReactDOM.createRoot(container)

			let label = labelFor(ctx)
			let shortcut = shortcutFor(ctx)
			const paint = () => root.render(React.createElement(ShortcutButton, {
				label,
				shortcut,
				onClick: () => {
					openSettings()
				},
			}))
			paint()

			let disposed = false
			let scheduled = false
			/** 当前盯着的行；收起/展开只改这一行的 class，所以只对它开属性观察。 */
			let watchedRow = null

			/**
			 * 把按钮落位到账号栏那一行的最右侧。
			 *
			 * 那一行已经有设置按钮时（账号插件没接管 settings.launcher 的部署）
			 * 撤下自己，避免出现两个齿轮；收起到 56px 轨道时隐藏。
			 */
			const sync = () => {
				scheduled = false
				if (disposed) return
				const row = findTriggerRow()
				const launcher = row === null ? null : findLauncher(row)
				if (row !== watchedRow) {
					rowObserver.disconnect()
					if (row !== null) rowObserver.observe(row, { attributes: true, attributeFilter: ['class'] })
					watchedRow = row
				}
				if (row === null || launcher === null || launcher.getAttribute('aria-haspopup') === 'dialog') {
					if (container.isConnected) container.remove()
					return
				}
				if (container.parentElement !== row) row.appendChild(container)
				else if (row.lastElementChild !== container) row.appendChild(container)
				container.hidden = isRail(row)
			}

			const schedule = () => {
				if (scheduled || disposed) return
				scheduled = true
				queueMicrotask(sync)
			}

			// 结构变化看整棵文档的子节点（流式输出只改文本，命中的机会很少）；
			// 「收起 / 展开」只改那一行的 class，单独盯它，不对全文档开属性观察。
			const observer = new MutationObserver(schedule)
			const rowObserver = new MutationObserver(schedule)

			sync()
			observer.observe(document.body, { childList: true, subtree: true })

			const locale = ctx.get('locale')
			const offLocale = typeof locale?.subscribe === 'function'
				? locale.subscribe(() => {
					label = labelFor(ctx)
					shortcut = shortcutFor(ctx)
					paint()
				})
				: () => {}

			return () => {
				disposed = true
				observer.disconnect()
				rowObserver.disconnect()
				offLocale()
				root.unmount()
				container.remove()
				styleTag.remove()
			}
		}

		/** 插件入口：随 fiber 一起挂载与卸载。 */
		function apply(ctx) {
			ctx.effect(() => install(ctx), 'dsh-better-settings: sidebar settings shortcut')
		}

		exports.apply = apply
		/** 不硬依赖任何客户端服务：locale / shortcuts 都是取不到就降级的可选项。 */
		exports.inject = []
		return module.exports
	},
})
