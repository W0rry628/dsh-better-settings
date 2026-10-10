/**
 * dsh-better-settings —— 服务端半边。
 *
 * 这个插件不碰 Host：它不加工具、不加 Remote、不占设置命名空间，唯一的产物是
 * 浏览器半边（`lib/client.js`，由 package.json 的 `dsh.client` 声明）。挂载这一行
 * 只是为了让 profile 的插件清单里有一个可开关的入口，也让 `dsh plugin` 能把它
 * 当成一个正常的 bundle 管理。
 *
 * 之所以仍然需要一个真正的 Host 半边：profile 的 `cordis.patch.yml` 里 insert 的
 * 每一行都会按 `name` 加载这个包的 `main`，缺了 `apply` 会直接报加载失败。
 * @module dsh-better-settings
 */

/** 挂载时不做任何事；浏览器半边通过 `dsh.client` 单独加载。 */
export function apply() {}
