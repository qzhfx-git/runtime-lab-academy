# Runtime Lab 本机连接器（Windows）

用途：让私人学习网站使用正在访问网站的这台电脑运行 C++20。无需云服务器。网站的 Judge0 与 AI 模式均不需要启动本连接器。

## 准备环境

1. 从 https://nodejs.org/ 安装 Node.js 22 或更新版本，重新打开终端，执行 `node --version`。
2. 从 https://www.msys2.org/ 安装 MSYS2。在 **MSYS2 UCRT64** 终端运行 `pacman -Syu`，按提示关闭并重开终端后继续更新，然后运行 `pacman -S --needed mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-ninja`。
3. 默认编译器为 `C:\msys64\ucrt64\bin\g++.exe`。不同路径请在 PowerShell 设置 `$env:CPP_COMPILER = '你的路径\g++.exe'`。推荐 GCC 14+。

## 启动与配对

解压整个 ZIP，在该目录打开 PowerShell，检查脚本内容后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-bridge.ps1
```

该参数只作用于这一次 PowerShell 进程，不修改系统执行策略。脚本不安装软件，不修改系统设置；它检测 Node、编译并运行 C++20 线程示例，然后启动连接器。

网站「评测设置」输入终端显示的配对码。配对码只能使用一次；刷新网站后请关闭连接器，重新启动以获取新码。出现本地网络权限提示时，允许本网站连接。内嵌浏览器不支持时使用 Chrome 或 Edge 打开私人网站。

默认只允许 https://runtime-lab-academy-personal.dainty-ridge-8852.chatgpt.site 。自行部署到另一来源时，可在启动前设置 `$env:LAB_SITE_ORIGIN = 'https://你的准确站点域名'`（不要带末尾斜杠）。不会接受任意来源、局域网 IP 或公网连接；只监听 127.0.0.1:3211。

## 执行约束

使用与学习站相同的真实 g++ 编译器及 Windows Job Object 资源限制。代码以当前账户权限执行，**不是文件系统或网络隔离沙箱**。仅提交你编写或信任的练习代码。源码只送到本机连接器；测试结果和提交记录由网站保存至私人云端账户。

只允许课程内的实验 ID，不能通过接口修改命令或选择任意可执行文件。连接器只串行处理一个任务。关闭窗口或 Ctrl+C 会终止活动任务并关闭服务。没有系统服务、开机启动或端口转发。

## 故障排查

- 环境检查失败：核对 `CPP_COMPILER` 指向 UCRT64 的 g++，勿混用 MSYS 与 MinGW 工具链。
- 3211 端口占用：关闭以前启动的连接器；不要修改或终止不认识的进程。
- 配对失败：检查网址来源完全一致；使用新启动显示的新配对码。
- 版本不匹配：从网站重新下载最新连接器，解压至新目录。
- macOS / Linux：本连接器使用 Windows Job Object，暂不支持；可用 Judge0，或下载课程 CMake 包并使用 C++20 编译器执行 README 中的命令。

本程序不读取或发送你的 LLM 密钥。所有源文件随包提供，可审查和修改。
# C++ 类型分析（clangd）

在连接器目录运行 `powershell -ExecutionPolicy Bypass -File ./install-language-tools.ps1`。
脚本从 clangd 官方 GitHub 发布页下载固定版本 23.1.0，校验 SHA256，并解压到
当前目录 `.runtime/tools`；不需要管理员权限，也不会修改系统 PATH。
已有 clangd 时可设置 `LAB_CLANGD` 为可执行文件的完整路径。

连接器启动时的网站来源必须与地址栏完全一致，例如：
`powershell -ExecutionPolicy Bypass -File ./start-bridge.ps1 -SiteOrigin "https://qzhfx.dainty-ridge-8852.chatgpt.site"`。
只允许此来源配对并发送请求。配对后，编辑器会在本机 clangd 中分析代码，提供
按类型的成员补全、函数重载参数提示、悬停类型和实时错误/警告。评测仍可选择
Judge0 或 AI；类型分析本身不运行程序。关闭连接器后，网页会显示语言服务离线，
保留编辑、格式化与其他评测方式。重新连接后点击编辑器「重连」。

语言服务使用与评测一致的 C++20、GCC 标准库、题目预置类型和头文件。
它不包含其他本地项目的私有头文件，也不能代替运行测试、链接检查或并发验证。

# 工程工作台、GDB 调试与工程验收

## 开源架构研修与游戏运行时

「架构研修」包含 spdlog、Eigen、Asio、RocksDB、Qt、Abseil/LLVM、gRPC 的阅读单元，以及 EnTT / Godot / Filament 三个游戏案例。每个单元有固定版本源码链接、设计推导、故障假设、渐进提示和四阶段工程。训练代码为独立编写的缩减模型，不启动或替代这些上游框架。

更新连接器后可执行 44 个阶段快照，并调用「跨工具链检查」。程序只运行当前机器实际具备的 GCC、Clang 或 MSVC 环境，缺失项为未完成。可以用 `LAB_CLANGXX` / `LAB_MSVC` 指定对应编译器路径；MSVC 还需要已初始化 SDK 的开发环境。GDB 调试继续使用 GCC / MinGW 的符号格式。

源码 ZIP 中提供 `tools/verify.ps1`、`tools/verify.sh` 与 `.github/workflows/verify.yml`。Windows PowerShell 脚本支持 Debug / Release；Shell 脚本支持 debug / release / asan / tsan。实际执行失败会返回非零状态；配置存在不代表已经通过。连接器本身仍使用 Windows Job Object，不会自动安装 WSL 或把 Windows 运行结果冒充 Linux 验证。


新版连接器同时提供多文件 CMake 工程运行、真实 GDB/MI 调试和工程验收。私人网站上的源码与验收报告保存到当前账号；编译、运行、GDB 和 clangd 在配对的电脑上执行。关闭电脑后这些本机能力不可用，原有 Judge0 单题云端评测仍可使用。

在 **MSYS2 UCRT64 终端**中安装工程工具：

```sh
pacman -S --needed mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-gdb mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-ninja
```

然后在 PowerShell 中重新运行 `start-bridge.ps1 -SiteOrigin "https://qzhfx.dainty-ridge-8852.chatgpt.site"` 并配对。安装 clangd 仍使用 `install-language-tools.ps1`。非默认安装可配置 `CPP_COMPILER`、`LAB_GDB`、`LAB_CMAKE`、`LAB_CTEST`、`LAB_NINJA`、`LAB_CLANGD` 为对应程序的绝对路径。

- 打开「工程工作台」，默认线程池工程包含头文件、实现、演示程序和 7 类 CTest 用例。也可打开原课程的 4 个工程。
- `runtime-lab.json` 指定 `runTarget`（CMake 可执行目标，输出位于构建目录根部）和 `args`。构建使用 CMake/Ninja，Debug，C++20，默认警告。工程文件会按快照写入连接器 `.runtime/engineering`。
- 点击源码行号左侧设断点，启动调试会先停在 main。F5 继续、F10 跳过、F11 进入、Shift F11 跳出。支持局部变量、调用栈、线程切换和只读表达式监视。源码在运行/调试期间锁定；停止后继续编辑。
- clangd 的工程分析使用 C++20、工程根目录 / include / src 作为头文件搜索路径；复杂的自定义 CMake 编译宏或第三方依赖仍以真实构建诊断为准。F12 定义、Shift F12 引用、F2 提供跨文件重命名预览。
- 工程验收执行 CTest、带 concurrent/drain/lifetime/exception 标签的 5 次重复测试，以及 benchmark 标签的 3 次墙钟采样。测试源可编辑，报告不是防篡改认证。
- ASan+UBSan 与 TSan 会先实际编译、运行探测程序；支持时构建检测版本再运行全部测试。常见 MinGW GCC 不含这些运行库，报告会明确为「未完成」，绝不算作通过。资源生命周期测试不能代替 sanitizer。
- 每条构建/测试命令限制 120 秒、1 GiB/进程、32 个子进程、256 KiB 输出；普通运行最长 10 秒，CTest 每用例 8 秒。GDB 会话最长 15 分钟，空闲 3 分钟停止，离开工作台自动停止。Windows Job Object 回收进程树。这些限制不隔离文件与网络；CMake 也能执行脚本，只运行可信工程。
- 导出工程 JSON 可在另一个工作台导入；导出报告包含本次源码 SHA256 与命令、输出、结果。页面自动保存采用版本检查，避免两个浏览器页面静默覆盖同一工程。

参考：[GDB/MI](https://sourceware.org/gdb/current/onlinedocs/gdb.html/GDB_002fMI.html)、[CTest](https://cmake.org/cmake/help/latest/manual/ctest.1.html)、[GCC sanitizers](https://gcc.gnu.org/onlinedocs/gcc/Instrumentation-Options.html)。

