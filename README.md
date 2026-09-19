# X_GX_H · 个人小站

基于 [GeonasZ/Personal-Blog-Template](https://github.com/GeonasZ/Personal-Blog-Template) 改编。保留原模板的 Liquid/Jekyll 页面结构、旅行搜索、旅行卡片和行程汇总，并重新设计成城市级地图。网站现有首页、旅行地图、美食、小动物、手作物、亲友和关于我七个页面。

## 在 GitHub 上自己更新

这个仓库已经配置 GitHub Pages 自动发布。以后在 GitHub 网页里修改文件并点击 **Commit changes**，网站会自动重新构建。

- 旅行城市与地图坐标：`assets/data/travel-cities.json`
- 旅行文字和照片：`sample_data/content/_travels/notebook.md`
- 美食：`sample_data/content/_foods/`
- 小动物：`sample_data/content/_animals/`
- 手作物：`sample_data/content/_crafts/`
- 亲友链接：`sample_data/content/_friends/friends.md`
- 关于我：`sample_data/content/_about/about.md`

上传照片时，先把图片放进 `assets/images/uploads/`，再在对应 Markdown 文件中填写 `/assets/images/uploads/图片名.jpg`。每次提交后，可在仓库的 **Actions** 页面查看发布进度。

## 这一版

- 蓝、绿、青色主题，另有深绿夜间模式，可跟随系统或手动切换。
- 原创蓝白小猫 SVG 插画、小猫站标、点击小猫的文字回应。
- 境内 / 境外城市地图。只点亮去过的城市坐标，不填充整个国家。
- 美食与旅行城市双向跳转；小动物、手作物和美食页面支持图片与配字。
- 三个相册页面都可从浏览器上传本设备草稿，使用 IndexedDB 保存。
- 已准备 Cloudflare 云端相册：旅行、美食、小动物和手作页面可直接上传并让所有访客看到；完成账号部署后自动启用。
- 适配手机、平板与桌面。保留原作者 MIT 许可证。
- 示例记录已经清空，旅行地点按当前足迹保留，内容可从 GitHub 继续填写。

## 启动网站

已包含构建好的 `_site/`。装有 Node.js 20 或更高版本时，在本目录运行：

```sh
node scripts/preview.mjs
```

浏览器打开 http://127.0.0.1:4173 。不要直接双击 `_site/index.html`：地图需要 HTTP 环境加载本地地理数据。

修改源码后重新构建：

```sh
npm install
npm run build
npm run preview
```

本项目额外提供了 Node 构建脚本，使用 LiquidJS、Marked 和 Dart Sass 渲染当前模板，可在未安装 Ruby 时使用。`pnpm-lock.yaml` 记录本次使用的依赖版本，也可以用 `pnpm install --frozen-lockfile` 安装。无需批准可选的 `@parcel/watcher` 原生构建；本站只执行单次 Sass 编译。

原有 Jekyll 路线仍保留：安装 Ruby / Bundler 后执行 `bundle install` 和 `bundle exec jekyll build`。本次实际验证的是 Node 构建，没有在本机运行 Ruby/Jekyll。

## 换成你的内容

当前 `_config.yml` 使用 `backend.mode: demo`，原模板因此从 **`sample_data/content/`** 读取内容。保持这个模式也可以部署纯静态的个人网站；地图和搜索不需要数据库。

留言板位于 `/message/`，访客留言保存在 GitHub 仓库的 [专用 Issue #1](https://github.com/Guoxuan-Li/Project/issues/1)，网页通过 GitHub 的公开 API 展示留言。访客需要登录 GitHub 才能发表；删除或管理留言请在 Issue 页面操作。留言不会写入原模板的演示数据或浏览器本地存储。

云端相册部署说明位于 `workers/gallery-api/README.md`。网站本体继续放在 GitHub Pages，照片文件存入 Cloudflare R2，标题、地点和配字存入 D1；站主上传需要 Cloudflare Secret 中保存的密钥。

| 想修改的内容 | 文件 |
| --- | --- |
| 站名、简介、导航、域名、子路径 | `_config.yml` |
| 关于我正文 | `sample_data/content/_about/about.md` |
| 亲友链接 | `sample_data/content/_friends/friends.md` |
| 国家、城市、旅行笔记 | `sample_data/content/_travels/notebook.md` |
| 按年份整理的行程 | `sample_data/content/_travels/summary.md` |
| 地图城市、经纬度和境内 / 境外分类 | `assets/data/travel-cities.json` |
| 小动物图文 | `sample_data/content/_animals/` |
| 手作物图文 | `sample_data/content/_crafts/` |
| 美食图文与关联城市 | `sample_data/content/_foods/` |
| 首页标题和欢迎语 | `_layouts/home.html` |
| 颜色、页面样式、手机布局 | `assets/css/tide.css` |
| 小猫插画 | `assets/images/cat-window.svg` |
| 小猫点击回应 | `assets/js/tide.js` |

添加旅行笔记时，沿用以下格式；国家与城市标题保留英文名称有助于搜索和阅读：

```markdown
<div data-travel-continent="欧洲" hidden></div>

# 英国 United Kingdom

## 伦敦 London (3d)

这里写自己的旅行笔记，也可以插入照片。

![照片说明](/assets/images/uploads/london.jpg)
*这行文字会成为图片下方的配字。*
```

`(3d)` 是三天；没有可靠天数时可以不写。照片放在 `assets/images/uploads/`。地图光点需要在 `assets/data/travel-cities.json` 增加同一城市的经纬度，其中 `domestic: true` 表示境内；境外地点使用 `region: "europe"`、`"asia"` 或 `"americas"`。地图的旧 `note` 字段已经移除，悬停光点时只显示地点和国家。

小动物、手作物和美食使用相同的图文格式。例如在 `sample_data/content/_foods/` 新建 `chengdu-snack.md`：

```markdown
---
title: 成都的一碗小吃
date: 2026 · 春
location: 成都
image: /assets/images/uploads/chengdu-snack.jpg
alt: 一碗小吃的照片
caption: 图片下面显示的配字。
---

这里可以继续写这张照片背后的故事。
```

美食的 `location` 会生成“在旅行地图找到这里”链接；旅行城市卡片也会生成“看看这座城的味道”链接。

页面上的“添加照片与配字”现在可直接使用，但它保存的是**当前浏览器中的本设备草稿**。刷新后仍存在，同一台设备可以继续查看；其他访客无法看到。要公开发布给所有访客，请按上面的 Markdown 格式把图片和内容加入项目后重新构建。真正的多人云端上传还需要部署时配置图片存储与访问权限，本版本没有假装把本地草稿当成公开内容。

行程汇总的第一段 H1 是总标题，后续 H1 是地区，H2 是年份。每行最后的数字是该次行程天数，例如 `巴黎 里昂7`。可加 `&` 和同行人，例如 `巴黎 里昂7 & 朋友`；省略同行人则不展示同行信息。

不要仅把 `backend.mode` 切到 `cloudflare`：该操作会切换到另一棵 `content/` 内容目录；原模板的后端模块暂未启用。

## 发布

目前仅本地预览，尚未部署公网。

将构建输出 `_site/` 的内容上传到支持静态文件的托管服务即可。公开前把 `_config.yml` 的 `url` 换为最终域名。如果发布到 GitHub 项目子路径，例如 `https://your-name.github.io/my-site/`，设置：

```yaml
url: "https://your-name.github.io"
baseurl: "/my-site"
```

随后重新构建。Node 构建会应用这两个字段；地图本地数据路径也已适配子路径。发布纯静态版本时只上传 `_site/`，无需上传 `functions/`、`migrations/` 或源码目录。

其他原有栏目源码仍保留，当前配置不生成这些页面。原模板的完整文档见 `README-原模板.md`。不要直接运行其 Cloudflare 部署流程，除非之后明确需要那些后端功能。

## 验证

本次通过 Node 生成 6 个页面，并在 Chrome 中验证了境内 / 境外城市光点、城市筛选、旅行与美食双向跳转、三个图文相册、图片上传与配字的本地持久化、主题切换和内部链接。检查了 320px 手机、390px 手机、平板和桌面布局；未发现浏览器 JavaScript 错误。

另修正了旅行卡片缓存只按数量判断、导致正文更新不生效的问题。

字体使用 Google Fonts；字体网络请求不可用时，会使用系统中文字体。地图地理数据和小猫图形均随网站附带。
