# Runtime Lab · 免费云实验室试用

公网课程网站使用 GitHub Pages；真实 C++ 编译、类型分析、调试和验收在自己的 GitHub Codespaces 中运行。课程网站不依赖本机服务器。个人云实验室也不依赖自己的电脑保持开机，但它不是全天候公共评测服务。

## 第一次使用

1. 将部署包中的内容放入自己的 GitHub 仓库。使用 GitHub Free 发布 Pages 时，仓库需要公开；只上传部署包，不上传 `.data`、`.runtime`、密钥和个人学习记录。
2. 仓库 Settings → Pages → Build and deployment 选择 GitHub Actions。`Publish course website` 工作流成功后提供公网地址。
3. 在仓库 Code → Codespaces → Create codespace on main，选择 2 核。首次构建会下载 Linux 与 C++ 工具链；初始化需要几分钟。
4. 回到课程网站，点击顶部「启动 / 继续云实验室」。首次使用可在「更换 / 绑定实验室」填入 Codespace 名称或完整地址；以后只需点「启动并进入」。GitHub 启动入口在新标签页打开，课程页检测到学习服务就绪后进入原来的课程或工程。若已启动，可点「进入学习界面」直接打开，不必找端口。端口始终保持 **Private**；若服务没有自动启动，可在云终端运行 `node scripts/start-codespaces.mjs`。
5. 在云终端执行 `npm run test:cloud` 验证评测、clangd 和工程调试。测试真实运行，不跳过失败；GitHub Actions 也提供 Linux 验证工作流。Actions 验证不能代替转发网站的浏览器实测。

## 保存在哪里

启动面板只记住实验室地址，不保存 GitHub 密钥，也不会在打开课程页时启动云实例。就绪检测最多持续两分钟，只请求一个不含学习数据的图片；GitHub 登录失效、跨站 Cookie 限制或网络问题可能阻止检测，这时完成登录后点「进入学习界面」。不会自动创建第二个 Codespace。代码与笔记不会随页面跳转自动转移。

- 公网课程页：草稿、笔记、自测、项目自评保存在当前浏览器的 IndexedDB。清理站点数据会删除它们，使用顶部「导出学习数据」备份。
- 云实验室：学习数据保存在 Codespace 的 `.data/learning.sqlite`；运行目录在 `.runtime`。停止 Codespace 后数据仍保留，删除 Codespace 会删除未备份的数据。
- 两处不自动同步。建议在个人云实验室完成代码练习；工作台的 JSON 导出／导入可以转移工程源文件。学习数据导出目前是备份文件，不是自动导入同步服务。
- API 密钥只在当前页面内存中使用，刷新后清除。不要提交到 GitHub 仓库。

## 免费额度与使用边界

截至 2026-10-27，GitHub Free 个人账号含每月 120 核小时与 15 GB-month 存储；2 核机器约相当于 60 小时运行时间。免费额度受 GitHub 当前政策和账号资格影响。没有有效付款方式的账号用尽额度后无法继续使用；已有付款方式的账号应先在 GitHub 的 Billing 中确认 Codespaces 预算和停止使用设置，避免超额付费。

本方案不会自动开通付款、增加预算或切换付费机器。用完停止 Codespace；停止只停止计算计费，仍占用存储。删除前先导出学习数据与工程。

执行器限制时间、输出以及简单练习的地址空间。工程构建和 sanitizer 使用容器自身内存限制。它不是文件、网络隔离沙箱，只供云工作区所有者运行可信代码。不得把 3210 端口改成 Public 作为公共评测站。

GitHub 官方说明：[计费与免费额度](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)、[端口转发](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)、[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。
