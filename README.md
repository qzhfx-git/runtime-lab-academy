# Runtime Lab · 免费云实验室试用

公网课程网站使用 GitHub Pages；真实 C++ 编译、类型分析、调试和验收在自己的 GitHub Codespaces 中运行。课程网站不依赖本机服务器。个人云实验室也不依赖自己的电脑保持开机，但它不是全天候公共评测服务。

## 第一次使用

1. 将部署包中的内容放入自己的 GitHub 仓库。使用 GitHub Free 发布 Pages 时，仓库需要公开；只上传部署包，不上传 `.data`、`.runtime`、密钥和个人学习记录。
2. 仓库 Settings → Pages → Build and deployment 选择 GitHub Actions。`Publish course website` 工作流成功后提供公网地址。
3. 在仓库 Code → Codespaces → Create codespace on main，选择 2 核。首次构建会下载 Linux 与 C++ 工具链；初始化需要几分钟。
4. 打开 Ports 面板中 **3210** 的浏览器地址。端口保持 **Private**。这就是完整学习站，包含 GCC、clangd、CMake/Ninja 和 GDB。若没有自动启动，在终端运行 `node scripts/start-codespaces.mjs`。
5. 在云终端执行 `npm run test:cloud` 验证评测、clangd 和工程调试。测试真实运行，不跳过失败；GitHub Actions 也提供 Linux 验证工作流。Actions 验证不能代替转发网站的浏览器实测。

## 保存在哪里

- 公网课程页：草稿、笔记、自测、项目自评保存在当前浏览器的 IndexedDB。清理站点数据会删除它们，使用顶部「导出学习数据」备份。
- 云实验室：学习数据保存在 Codespace 的 `.data/learning.sqlite`；运行目录在 `.runtime`。停止 Codespace 后数据仍保留，删除 Codespace 会删除未备份的数据。
- 两处不自动同步。建议在个人云实验室完成代码练习；工作台的 JSON 导出／导入可以转移工程源文件。学习数据导出目前是备份文件，不是自动导入同步服务。
- API 密钥只在当前页面内存中使用，刷新后清除。不要提交到 GitHub 仓库。

## 免费额度与使用边界

截至 2026-10-27，GitHub Free 个人账号含每月 120 核小时与 15 GB-month 存储；2 核机器约相当于 60 小时运行时间。免费额度受 GitHub 当前政策和账号资格影响。没有有效付款方式的账号用尽额度后无法继续使用；已有付款方式的账号应先在 GitHub 的 Billing 中确认 Codespaces 预算和停止使用设置，避免超额付费。

本方案不会自动开通付款、增加预算或切换付费机器。用完停止 Codespace；停止只停止计算计费，仍占用存储。删除前先导出学习数据与工程。

执行器限制时间、输出以及简单练习的地址空间。工程构建和 sanitizer 使用容器自身内存限制。它不是文件、网络隔离沙箱，只供云工作区所有者运行可信代码。不得把 3210 端口改成 Public 作为公共评测站。

GitHub 官方说明：[计费与免费额度](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)、[端口转发](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)、[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。
