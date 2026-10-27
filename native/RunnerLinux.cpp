// Resource supervisor for a personal Linux/Codespaces workspace.
// This is not a security sandbox: filesystem and network use the workspace account.
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/wait.h>
#include <unistd.h>
#include <signal.h>
#include <cerrno>
#include <chrono>
#include <fstream>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

static volatile sig_atomic_t interrupted = 0;
static void on_signal(int value) { interrupted = value; }
static bool limit(int resource, rlim_t soft, rlim_t hard) {
    const rlimit value{soft, hard};
    return setrlimit(resource, &value) == 0;
}
static void kill_descendants(pid_t parent) {
    // Only descendants of this supervisor, including children reparented by subreaper.
    std::ifstream children("/proc/" + std::to_string(parent) + "/task/" +
                           std::to_string(parent) + "/children");
    pid_t child;
    while (children >> child) {
        kill(child, SIGSTOP);
        kill_descendants(child);
        kill(child, SIGKILL);
    }
}
int main(int argc, char** argv) {
    int first = 1;
    std::string mode = argc > 1 ? argv[1] : "";
    bool compile = mode == "--compile", engineering = mode == "--engineering",
         debug = mode == "--debug";
    if (compile || engineering || debug) ++first;
    if (argc <= first) return 125;
    if (prctl(PR_SET_CHILD_SUBREAPER, 1) != 0) return 125;
    signal(SIGTERM, on_signal); signal(SIGINT, on_signal); signal(SIGHUP, on_signal);
    const auto started = std::chrono::steady_clock::now();
    const auto wall_ms = debug ? 900000 : engineering ? 120000 : compile ? 25000 : 2200;
    const pid_t child = fork();
    if (child < 0) return 125;
    if (child == 0) {
        setpgid(0, 0);
        signal(SIGTERM, SIG_DFL); signal(SIGINT, SIG_DFL); signal(SIGHUP, SIG_DFL);
        if (prctl(PR_SET_PDEATHSIG, SIGKILL) != 0 || getppid() == 1) _exit(125);
        // Sanitizers reserve a large virtual address range. Engineering/debug sessions
        // use the Codespace's memory limit; simple exercise processes use RLIMIT_AS.
        bool ok = limit(RLIMIT_CORE, 0, 0);
        const rlim_t cpu = debug ? 900 : engineering ? 120 : compile ? 25 : 2;
        ok = limit(RLIMIT_CPU, cpu, cpu + 1) && ok;
        if (!engineering && !debug)
            ok = limit(RLIMIT_AS, compile ? 1073741824 : 134217728,
                                  compile ? 1073741824 : 134217728) && ok;
        if (!compile && !engineering && !debug)
            ok = limit(RLIMIT_FSIZE, 1048576, 1048576) && ok;
        if (!ok) _exit(125);
        execvp(argv[first], argv + first);
        std::cerr << "Runner: cannot execute requested program\n";
        _exit(125);
    }
    setpgid(child, child);
    int status = 0, result = 125;
    for (;;) {
        const pid_t ended = waitpid(child, &status, WNOHANG);
        if (ended == child) {
            result = WIFEXITED(status) ? WEXITSTATUS(status) :
                     WIFSIGNALED(status) && WTERMSIG(status) == SIGXCPU ? 124 :
                     WIFSIGNALED(status) ? 128 + WTERMSIG(status) : 125;
            break;
        }
        if (ended < 0 && errno != EINTR) break;
        const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - started).count();
        if (interrupted || elapsed >= wall_ms) { result = 124; break; }
        std::this_thread::sleep_for(std::chrono::milliseconds(8));
    }
    kill(-child, SIGKILL);
    // GDB may give its inferior a separate process group. Subreaping lets us collect it.
    for (int i = 0; i < 100; ++i) {
        kill_descendants(getpid());
        pid_t reaped;
        do { reaped = waitpid(-1, &status, WNOHANG); } while (reaped > 0);
        if (reaped < 0 && errno == ECHILD) break;
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    return result;
}
