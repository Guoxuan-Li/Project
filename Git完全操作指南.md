# Git 与 GitHub 完全操作指南

这份指南以 **Windows PowerShell + GitHub** 为例。命令中的用户名、仓库名、文件名需要换成你自己的内容。

> Git 负责记录电脑里的文件版本；GitHub 负责把 Git 仓库保存到网上。Git 中的“分支”英文是 **branch**。

## 1. 第一次使用前的准备

### 1.1 检查 Git

打开 PowerShell：

```powershell
git --version
```

如果显示版本号，说明已经安装。若提示找不到命令，需要先安装 [Git for Windows](https://git-scm.com/download/win)。

### 1.2 设置提交人信息

只需要在这台电脑上设置一次：

```powershell
git config --global user.name "你的名字或 GitHub 用户名"
git config --global user.email "你的 GitHub 邮箱"
```

检查设置：

```powershell
git config --global --list
```

## 2. 把一个全新的文件夹上传到 GitHub

假设电脑里有一个全新文件夹 `MyWebsite`。

### 第一步：进入文件夹

```powershell
cd "C:\你的路径\MyWebsite"
```

路径有空格时必须保留双引号。

### 第二步：初始化 Git

```powershell
git init -b main
```

这会创建隐藏的 `.git` 文件夹，并使用 `main` 作为主分支。

### 第三步：查看文件状态

```powershell
git status
```

正式加入文件前，建议先创建 `.gitignore`，排除不应该上传的内容。常见网站项目可以写：

```gitignore
node_modules/
.env
.DS_Store
Thumbs.db
_site/
dist/
```

实际项目需要哪些规则取决于使用的工具。`.env`、访问令牌和密码不应提交。

### 第四步：加入要提交的文件

加入全部文件：

```powershell
git add .
```

只加入一个文件：

```powershell
git add README.md
```

只加入一个文件夹：

```powershell
git add assets
```

### 第五步：创建第一次提交

```powershell
git commit -m "Initial commit"
```

`commit` 是一个可以回看的版本记录，`-m` 后面是这次修改的说明。

### 第六步：在 GitHub 创建空仓库

1. 登录 GitHub。
2. 点击右上角 `+`，选择 `New repository`。
3. 填写仓库名。
4. 第一次连接时不要勾选自动创建 README、`.gitignore` 或 License，保持空仓库最简单。
5. 点击 `Create repository`。

### 第七步：连接 GitHub 仓库

把地址换成自己的：

```powershell
git remote add origin https://github.com/你的用户名/仓库名.git
```

检查连接：

```powershell
git remote -v
```

### 第八步：第一次上传

```powershell
git push -u origin main
```

`-u` 会记住本地 `main` 对应 GitHub 的 `main`。以后在这个分支只需运行 `git push`。

第一次通过 HTTPS 推送时，Git 可能打开浏览器要求登录 GitHub。按浏览器提示授权即可。GitHub 不接受账户密码作为 Git 的 HTTPS 密码；需要使用浏览器授权、Git Credential Manager 或 Personal Access Token。

## 3. 下载一个已有的 GitHub 仓库

先进入准备存放项目的上一级目录，然后运行：

```powershell
git clone https://github.com/用户名/仓库名.git
cd 仓库名
```

不要在已经包含同名文件的文件夹里直接 `clone`。

## 4. 在已有仓库中添加全新的文件或文件夹

用编辑器或资源管理器创建文件后，在仓库目录运行：

```powershell
git status
git add 新文件.md
git commit -m "Add new document"
git push
```

添加整个新文件夹：

```powershell
git add 新文件夹
git commit -m "Add new folder"
git push
```

Git 不记录空文件夹。要保留空文件夹，可以在里面放一个 `.gitkeep` 文件。

## 5. 以后修改内容时的标准流程

每次修改都建议按这个顺序操作：

### 第一步：先同步 GitHub 的最新内容

```powershell
git pull --rebase
```

如果只有你自己修改仓库，这一步通常很顺利；多人编辑时，它可以减少推送被拒绝的情况。

### 第二步：修改文件

使用编辑器完成修改并保存。

### 第三步：检查变化

```powershell
git status
git diff
```

`git status` 显示哪些文件变了；`git diff` 显示具体改了哪些内容。

### 第四步：加入本次修改

加入全部变化：

```powershell
git add .
```

或只加入指定文件：

```powershell
git add assets/data/travel-cities.json
```

### 第五步：提交

```powershell
git commit -m "Add new travel cities"
```

提交说明应该简单描述这次做了什么。

### 第六步：上传

```powershell
git push
```

最常用的完整组合是：

```powershell
git pull --rebase
git status
git add .
git commit -m "说明这次修改"
git push
```

## 6. 删除文件或文件夹

### 6.1 从电脑和 Git 中一起删除文件

```powershell
git rm 文件名.md
git commit -m "Remove old document"
git push
```

删除文件夹：

```powershell
git rm -r 文件夹名
git commit -m "Remove old folder"
git push
```

也可以先在资源管理器中删除，再运行 `git add .`、`git commit` 和 `git push`。

### 6.2 GitHub 中删除，但电脑上保留

先把文件或文件夹写进 `.gitignore`，然后取消跟踪：

```powershell
git rm --cached 文件名
```

取消跟踪整个文件夹：

```powershell
git rm -r --cached 文件夹名
```

之后提交并上传：

```powershell
git add .gitignore
git commit -m "Stop tracking local files"
git push
```

不要把密码、访问令牌、`.env` 或私钥上传到 GitHub。仅在之后加入 `.gitignore` 不能消除旧提交中的秘密；若秘密已经上传，应立即撤销并更换。

## 7. 让一个文件夹不再是 Git 仓库

Git 的全部本地历史和设置都保存在项目根目录的 `.git` 文件夹中。删除它以后，普通项目文件仍会保留，但这个文件夹不再是 Git 仓库。

先确认当前路径和 `.git` 的实际位置：

```powershell
Get-Location
Resolve-Path .git
```

确认它确实属于当前项目，并且重要提交已经推送或备份后，再删除：

```powershell
Remove-Item -LiteralPath .git -Recurse -Force
```

这是不可通过 Git 撤销的本地操作。它不会自动删除 GitHub 上的仓库。

如果只想断开当前 GitHub 地址，不需要删除历史：

```powershell
git remote remove origin
```

## 8. 删除 GitHub 上的整个仓库

1. 打开 GitHub 仓库。
2. 进入 `Settings`。
3. 滚动到 `Danger Zone`。
4. 选择 `Delete this repository`。
5. 按 GitHub 的要求输入仓库名并确认。

这会删除网上的仓库、Issues、分支和 GitHub Pages。操作前先保留本地副本或下载备份。

## 9. 分支 branch 的完整用法

分支可以理解为同一个项目的不同修改路线。例如：

- `main`：稳定、公开的版本。
- `feature/map`：正在开发地图功能的版本。
- `fix/mobile`：正在修复手机显示的版本。

### 9.1 查看所有分支

```powershell
git branch
git branch -a
```

带 `*` 的是当前分支；`-a` 会同时显示 GitHub 上的远程分支。

### 9.2 从当前版本创建并进入新分支

```powershell
git switch -c feature/map
```

然后正常修改、提交：

```powershell
git add .
git commit -m "Improve travel map"
```

第一次把新分支上传到 GitHub：

```powershell
git push -u origin feature/map
```

以后在这个分支运行：

```powershell
git push
```

### 9.3 切换到已有的本地分支

```powershell
git switch main
```

切换前最好先提交当前修改。如果还不想提交，可以临时保存：

```powershell
git stash
git switch main
```

回到原分支后恢复：

```powershell
git switch feature/map
git stash pop
```

### 9.4 第一次使用 GitHub 上已有的分支

```powershell
git fetch origin
git switch --track origin/分支名
```

例如：

```powershell
git fetch origin
git switch --track origin/feature/map
```

### 9.5 把当前内容上传到一个不同名称的远程分支

如果当前本地分支叫 `work`，但希望上传到 GitHub 的 `feature/map`：

```powershell
git push -u origin work:feature/map
```

如果只是要把当前提交直接创建成一个新的远程分支：

```powershell
git push -u origin HEAD:新分支名
```

这条命令不会自动更改本地分支的名称。为了减少混淆，更推荐让本地和远程分支同名：

```powershell
git branch -m 新分支名
git push -u origin 新分支名
```

### 9.6 把分支合并进 main

小型个人项目可以在本地合并：

```powershell
git switch main
git pull --rebase
git merge feature/map
git push
```

更容易检查的方法是在 GitHub 上为该分支创建 Pull Request，确认变化后再点击合并。

### 9.7 删除分支

删除已经合并的本地分支：

```powershell
git branch -d feature/map
```

强制删除尚未合并的本地分支：

```powershell
git branch -D feature/map
```

删除 GitHub 上的远程分支：

```powershell
git push origin --delete feature/map
```

## 10. 常用撤销方法

### 10.1 文件改乱了，还没有 `git add`

恢复一个文件到最近一次提交：

```powershell
git restore 文件名
```

恢复全部已跟踪文件：

```powershell
git restore .
```

这会丢弃尚未提交的修改，执行前先确认不再需要这些内容。

### 10.2 已经 `git add`，但还没有提交

把文件移出暂存区，同时保留修改：

```powershell
git restore --staged 文件名
```

全部移出暂存区：

```powershell
git restore --staged .
```

### 10.3 已提交但还没推送，提交说明写错了

```powershell
git commit --amend -m "新的提交说明"
```

### 10.4 撤销一个已经推送的提交

先查看提交记录：

```powershell
git log --oneline
```

再创建一个反向提交：

```powershell
git revert 提交编号
git push
```

已经共享或推送的历史优先使用 `git revert`，因为它不会改写其他人已经下载的提交历史。

## 11. 推送被拒绝时怎么办

如果看到 `rejected`、`fetch first` 或 `non-fast-forward`，通常说明 GitHub 上有更新，而电脑上还没有。

先运行：

```powershell
git pull --rebase origin 当前分支名
```

例如：

```powershell
git pull --rebase origin main
git push
```

如果发生冲突：

1. 打开 Git 提示的冲突文件。
2. 找到 `<<<<<<<`、`=======`、`>>>>>>>` 标记。
3. 决定保留哪部分内容，并删除这些标记。
4. 保存文件。
5. 继续执行：

```powershell
git add 冲突文件
git rebase --continue
git push
```

如果想放弃这次 rebase：

```powershell
git rebase --abort
```

## 12. 查看历史和当前连接

```powershell
git status
git log --oneline --graph --decorate --all
git branch -vv
git remote -v
```

## 13. X_GX_H 网站的日常更新示例

先进入网站仓库：

```powershell
cd "你的 Project 仓库路径"
```

同步、修改并上传：

```powershell
git switch main
git pull --rebase
git status
git add .
git commit -m "Update travel content"
git push
```

推送到 `main` 后，GitHub Actions 会自动构建并发布 GitHub Pages。可以在仓库的 `Actions` 页面查看发布是否成功。

## 14. 最常用命令速查

| 目的 | 命令 |
| --- | --- |
| 查看状态 | `git status` |
| 查看具体修改 | `git diff` |
| 同步远程更新 | `git pull --rebase` |
| 加入全部修改 | `git add .` |
| 创建提交 | `git commit -m "说明"` |
| 上传当前分支 | `git push` |
| 查看分支 | `git branch -a` |
| 新建并切换分支 | `git switch -c 分支名` |
| 切换分支 | `git switch 分支名` |
| 第一次上传新分支 | `git push -u origin 分支名` |
| 删除已跟踪文件 | `git rm 文件名` |
| 查看简洁历史 | `git log --oneline --graph --all` |

每次操作前先运行 `git status`，每次推送前确认当前分支和提交内容，可以避免大部分误操作。
