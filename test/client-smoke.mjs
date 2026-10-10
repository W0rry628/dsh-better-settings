/**
 * dsh-better-settings —— 浏览器半边的冒烟测试（不需要浏览器）。
 *
 * 用一套极小的假 DOM 跑 lib/client.js 的安装逻辑，覆盖三条关键路径：
 *   1. 账号菜单接管 launcher 时，按钮挂到那一行最右侧，并走 fiber 注入的 openSettings；
 *   2. 那一行本来就有内置设置按钮时不重复添加；
 *   3. 收起成 56px 轨道时隐藏、展开后恢复，launcher 消失后自动撤下。
 *
 * 运行：node test/client-smoke.mjs
 */
import assert from 'node:assert/strict'

// --------------------------------------------------------------------------
// 假 DOM
// --------------------------------------------------------------------------

class FakeNode {
	constructor(tag) {
		this.tagName = String(tag).toUpperCase()
		this.children = []
		this.parentElement = null
		this.attrs = new Map()
		this.dataset = {}
		this.className = ''
		this.hidden = false
		this.textContent = ''
	}

	get isConnected() {
		let node = this
		while (node.parentElement !== null) node = node.parentElement
		return node === fakeDocument.body
	}

	get firstElementChild() {
		return this.children[0] ?? null
	}

	get lastElementChild() {
		return this.children[this.children.length - 1] ?? null
	}

	appendChild(child) {
		if (child.parentElement !== null) child.remove()
		child.parentElement = this
		this.children.push(child)
		return child
	}

	remove() {
		if (this.parentElement === null) return
		const siblings = this.parentElement.children
		const index = siblings.indexOf(this)
		if (index >= 0) siblings.splice(index, 1)
		this.parentElement = null
	}

	setAttribute(name, value) {
		this.attrs.set(name, String(value))
	}

	getAttribute(name) {
		return this.attrs.has(name) ? this.attrs.get(name) : null
	}

	hasAttribute(name) {
		return this.attrs.has(name)
	}

	matches(selector) {
		return matchesSelector(this, selector)
	}

	querySelector(selector) {
		for (const child of this.children) {
			if (matchesSelector(child, selector)) return child
			const nested = child.querySelector(selector)
			if (nested !== null) return nested
		}
		return null
	}
}

/** 只支持本插件用到的那几个选择器。 */
function matchesSelector(node, selector) {
	if (selector === '[class*="triggerRow"]') return node.className.includes('triggerRow')
	if (selector === 'button[aria-haspopup]') return node.tagName === 'BUTTON' && node.attrs.has('aria-haspopup')
	if (selector === 'button[aria-haspopup="menu"]') {
		return node.tagName === 'BUTTON' && node.getAttribute('aria-haspopup') === 'menu'
	}
	if (selector === 'button[aria-haspopup="dialog"]') {
		return node.tagName === 'BUTTON' && node.getAttribute('aria-haspopup') === 'dialog'
	}
	if (selector === 'button[aria-haspopup="menu"][data-collapsed]') {
		return node.tagName === 'BUTTON' && node.getAttribute('aria-haspopup') === 'menu' && node.hasAttribute('data-collapsed')
	}
	if (selector === 'button[aria-haspopup="dialog"][aria-keyshortcuts]') {
		return node.tagName === 'BUTTON' && node.getAttribute('aria-haspopup') === 'dialog' && node.hasAttribute('aria-keyshortcuts')
	}
	return false
}

const fakeDocument = {
	body: new FakeNode('body'),
	head: new FakeNode('head'),
	createElement(tag) { return new FakeNode(tag) },
	querySelector(selector) { return this.body.querySelector(selector) },
	querySelectorAll() { return [] },
}

let observers = []
class FakeMutationObserver {
	constructor(callback) { this.callback = callback }
	observe() { observers.push(this.callback) }
	disconnect() { observers = observers.filter(fn => fn !== this.callback) }
}

globalThis.document = fakeDocument
globalThis.window = { __ModuleLoader__: { load: definition => { globalThis.__loaded = definition } } }
globalThis.MutationObserver = FakeMutationObserver
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0)

// --------------------------------------------------------------------------
// 假模块
// --------------------------------------------------------------------------

const fakeReact = {
	createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
}
const fakeReactDom = {
	createRoot: container => ({
		render: element => { container.rendered = element },
		unmount: () => { container.unmounted = true },
	}),
}
const fakePrimitives = {
	Tooltip: function Tooltip() {},
	IconSettingsOutlineMedium: function IconSettingsOutlineMedium() {},
}
const moduleStub = name => {
	if (name === 'react') return fakeReact
	if (name === 'react-dom') return fakeReactDom
	if (name === '@deepseek-ai/dsh-client-ui-primitives') return fakePrimitives
	throw new Error(`unexpected require: ${name}`)
}

// 载入真正的 client.js（它会自己调用 window.__ModuleLoader__.load）
await import(new URL('../lib/client.js', import.meta.url).href)
const definition = globalThis.__loaded
assert.equal(definition.id, 'dsh-better-settings', 'module id')

const plugin = definition.factory(moduleStub)
assert.equal(typeof plugin.apply, 'function', 'apply export')
assert.deepEqual(plugin.inject, [], 'inject export')

// --------------------------------------------------------------------------
// 假界面
// --------------------------------------------------------------------------

/**
 * 造一行 triggerRow：`[launcher] [连接状态] [更新提示]`。
 * @param launcher - launcher 的形态：标签、aria-haspopup、是否包一层 div、是否有 fiber 注入。
 * @param rail - 是否处于 56px 收起轨道。
 */
function buildRow({ launcher, rail = false }) {
	fakeDocument.body.children = []
	fakeDocument.head.children = []
	observers = []

	const sidebar = new FakeNode('div')
	const footArea = new FakeNode('div')
	const row = new FakeNode('div')
	row.className = rail ? 'hash_triggerRow hash_railRow' : 'hash_triggerRow'

	const button = new FakeNode(launcher.tag)
	if (launcher.haspopup !== undefined) button.setAttribute('aria-haspopup', launcher.haspopup)
	for (const name of launcher.attrs ?? []) button.setAttribute(name, '')

	let launcherNode = button
	if (launcher.nested === true) {
		launcherNode = new FakeNode('div')
		launcherNode.className = 'hash_root'
		launcherNode.appendChild(button)
	}

	row.appendChild(launcherNode)
	row.appendChild(new FakeNode('div'))
	row.appendChild(new FakeNode('div'))
	footArea.appendChild(row)
	sidebar.appendChild(footArea)
	fakeDocument.body.appendChild(sidebar)

	if (launcher.openSettings !== undefined) {
		button.__reactFiber$test = { memoizedProps: { openSettings: launcher.openSettings }, return: null }
	}
	return row
}

/** 每次用例都重新安装一次，返回清理函数。 */
function applyPlugin() {
	let cleanup = null
	const ctx = { get: () => undefined, effect: callback => { cleanup = callback() } }
	plugin.apply(ctx)
	return () => cleanup?.()
}

/** 等一次 queueMicrotask + 一次 rAF。 */
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

const notify = () => { for (const callback of [...observers]) callback() }

// —— 用例 1：账号菜单接管 launcher → 按钮挂在最右侧，并能打开设置 ——
{
	const calls = []
	const row = buildRow({
		launcher: { tag: 'button', haspopup: 'menu', nested: true, attrs: ['data-collapsed'], openSettings: () => calls.push('open') },
	})

	const cleanup = applyPlugin()
	const container = row.lastElementChild
	assert.ok(container.hasAttribute('data-dsh-better-settings'), '按钮已挂到行尾')
	assert.equal(container.parentElement, row, '父节点是 triggerRow')
	assert.equal(container.hidden, false, '展开态可见')
	assert.equal(fakeDocument.head.children.length, 1, '样式表已插入')
	assert.ok(container.rendered !== undefined, 'React root 已渲染')

	container.rendered.props.onClick()
	assert.deepEqual(calls, ['open'], 'openSettings 被调用')

	cleanup()
	assert.equal(container.parentElement, null, '卸载后容器被移除')
	assert.equal(fakeDocument.head.children.length, 0, '卸载后样式表被移除')
	console.log('用例 1 通过：账号栏那一行右侧新增设置按钮，点击直接打开设置')
}

// —— 用例 2：那一行本来就有内置设置按钮 → 不重复添加 ——
{
	const row = buildRow({ launcher: { tag: 'button', haspopup: 'dialog', attrs: ['aria-keyshortcuts'] } })
	const cleanup = applyPlugin()
	assert.equal(row.children.length, 3, '没有新增按钮')
	console.log('用例 2 通过：行内已有设置按钮时不重复添加')
	cleanup()
}

// —— 用例 3：轨道态隐藏、展开恢复，launcher 消失后自动撤下 ——
{
	const row = buildRow({ launcher: { tag: 'button', haspopup: 'menu', nested: true, attrs: ['data-collapsed'] } })
	const cleanup = applyPlugin()
	const container = row.lastElementChild

	row.className = 'hash_triggerRow hash_railRow'
	notify()
	await settle()
	assert.equal(container.hidden, true, '轨道态隐藏')

	row.className = 'hash_triggerRow'
	notify()
	await settle()
	assert.equal(container.hidden, false, '重新展开后恢复显示')

	row.firstElementChild.remove()
	notify()
	await settle()
	assert.equal(container.parentElement, null, 'launcher 消失后按钮自动撤下')

	cleanup()
	console.log('用例 3 通过：轨道态隐藏、展开恢复，launcher 消失后自动撤下')
}

console.log('\ndsh-better-settings 浏览器半边冒烟测试全部通过。')
