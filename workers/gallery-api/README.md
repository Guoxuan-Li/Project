# X_GX_H 云端相册

网站仍由 GitHub Pages 发布。这个 Cloudflare Worker 提供公开图片列表，使用 Workers KV 保存图片、D1 保存标题、地点和配字。上传和删除需要站主密钥。密钥只放在 Cloudflare Secret 和站主上传时填写，**不要提交到 GitHub**。

## 首次开通

需要自己的 Cloudflare 账号，先在此目录运行 `npx wrangler login`。

```sh
npx wrangler kv namespace create GALLERY_IMAGES
npx wrangler d1 create x-gx-h-gallery
```

将两个命令返回的 KV `id` 和 D1 `database_id` 填入 `wrangler.toml`。然后初始化数据库：

```sh
npx wrangler d1 execute x-gx-h-gallery --remote --file=./schema.sql
```

先部署 Worker，再设置一串随机且足够长的上传密钥：

```sh
npx wrangler deploy
npx wrangler secret put UPLOAD_KEY
```

`secret put` 会在终端询问密钥，不要把密钥写进命令行、代码、GitHub Variable 或聊天消息。

部署成功后，得到类似 `https://x-gx-h-gallery-api.你的子域.workers.dev` 的地址。在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 新增：

| 名称 | 值 |
| --- | --- |
| `CLOUDFLARE_GALLERY_API` | 完整 Worker 地址，不带末尾 `/` |

在 GitHub 仓库 **Actions → 发布 X_GX_H 网站 → Run workflow** 重新发布。打开 `/travels/`、`/food/`、`/animals/` 或 `/crafts/`，输入图片、配字和站主密钥即可上传。其他人刷新网页会看到相同内容。以前保存在浏览器的草稿仍是本地草稿，不会自动迁移；源代码中的 Markdown 照片也会继续显示。

## 维护

- 更换密钥：在此目录重新执行 `npx wrangler secret put UPLOAD_KEY`。
- 更新 Worker：修改代码后执行 `npx wrangler deploy`。
- 修改数据库结构：先备份，再按新迁移脚本执行 `npx wrangler d1 execute ... --remote --file=...`。
- 图片大小上限 8 MB；支持 JPG、PNG、WebP、AVIF、GIF。
- 公开 API 只允许指定来源的网页跨域调用。密钥才是写入权限的凭证，请妥善保管。
