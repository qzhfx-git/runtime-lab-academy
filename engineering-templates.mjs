import {curriculum} from './curriculum.mjs';
import {projectFiles} from './project-bundle.mjs';
import {studyTemplates} from './study-projects.mjs';

const files={
'CMakeLists.txt':`cmake_minimum_required(VERSION 3.20)
project(RuntimeTaskPool LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
find_package(Threads REQUIRED)
enable_testing()
add_library(task_pool src/task_pool.cpp)
target_include_directories(task_pool PUBLIC include)
target_link_libraries(task_pool PUBLIC Threads::Threads)
add_executable(runtime_demo src/main.cpp)
target_link_libraries(runtime_demo PRIVATE task_pool)
add_executable(runtime_tests tests/task_pool_test.cpp)
target_link_libraries(runtime_tests PRIVATE task_pool)
foreach(case functional lifetime exception drain rejection concurrent benchmark)
  add_test(NAME pool_\${case} COMMAND runtime_tests \${case})
  set_tests_properties(pool_\${case} PROPERTIES LABELS \${case} TIMEOUT 10)
endforeach()
`,
'include/task_pool.hpp':`#pragma once
#include <condition_variable>
#include <functional>
#include <future>
#include <memory>
#include <utility>
#include <cstddef>
#include <mutex>
#include <queue>
#include <stdexcept>
#include <thread>
#include <type_traits>
#include <vector>

// All queue/closing state belongs to mutex_. User callbacks run without it.
class TaskPool {
public:
    explicit TaskPool(std::size_t workers);
    ~TaskPool();
    TaskPool(const TaskPool&) = delete;
    TaskPool& operator=(const TaskPool&) = delete;
    // Call shutdown from an external owner, never from a worker callback.
    void shutdown();
    template<class F>
    auto submit(F&& fn) -> std::future<std::invoke_result_t<F>> {
        using R = std::invoke_result_t<F>;
        auto task = std::make_shared<std::packaged_task<R()>>(std::forward<F>(fn));
        auto future = task->get_future();
        {
            std::lock_guard lock(mutex_);
            if (closing_) throw std::runtime_error("pool is closed");
            tasks_.emplace([task] { (*task)(); });
        }
        ready_.notify_one();
        return future;
    }
private:
    void worker();
    std::mutex mutex_;
    std::mutex shutdown_mutex_;
    std::condition_variable ready_;
    std::queue<std::function<void()>> tasks_;
    std::vector<std::thread> workers_;
    bool closing_ = false;
};
`,
'src/task_pool.cpp':`#include "task_pool.hpp"

TaskPool::TaskPool(std::size_t count) {
    if (count == 0) throw std::invalid_argument("workers must be positive");
    try {
        for (std::size_t i = 0; i < count; ++i)
            workers_.emplace_back([this] { worker(); });
    } catch (...) {
        shutdown();
        throw;
    }
}

TaskPool::~TaskPool() { shutdown(); }

void TaskPool::worker() {
    while (true) {
        std::function<void()> task;
        {
            std::unique_lock lock(mutex_);
            ready_.wait(lock, [this] { return closing_ || !tasks_.empty(); });
            if (closing_ && tasks_.empty()) return;
            task = std::move(tasks_.front());
            tasks_.pop();
        }
        task(); // packaged_task transfers user exceptions into its future.
    }
}

void TaskPool::shutdown() {
    std::lock_guard shutdown_lock(shutdown_mutex_);
    {
        std::lock_guard lock(mutex_);
        closing_ = true;
    }
    ready_.notify_all();
    for (auto& thread : workers_)
        if (thread.joinable()) thread.join();
}
`,
'src/main.cpp':`#include "task_pool.hpp"
#include <iostream>

int square(int value) {
    int result = value * value;
    return result;
}

int main() {
    TaskPool pool(2);
    int input = 7;
    auto answer = pool.submit([input] { return square(input); });
    int result = answer.get();
    pool.shutdown();
    std::cout << "square(" << input << ") = " << result << '\\n';
    return result == 49 ? 0 : 1;
}
`,
'tests/task_pool_test.cpp':`#include "task_pool.hpp"
#include <atomic>
#include <chrono>
#include <iostream>
#include <latch>
#include <memory>
#include <string>

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
struct Tracked {
    inline static std::atomic<int> alive{0};
    Tracked() { ++alive; }
    ~Tracked() { --alive; }
};
void check(const std::string& name) {
    if (name == "functional") {
        TaskPool pool(2);
        auto value = pool.submit([] { return 42; });
        require(value.get() == 42, "wrong future result");
    } else if (name == "lifetime") {
        {
            TaskPool pool(2);
            std::weak_ptr<Tracked> weak;
            {
                auto object = std::make_shared<Tracked>();
                weak = object;
                auto result = pool.submit([object] { return Tracked::alive.load(); });
                require(result.get() >= 1, "capture did not retain resource");
            }
            pool.shutdown();
            require(weak.expired(), "queued callback retained shared ownership");
        }
        require(Tracked::alive == 0, "RAII resource leaked");
    } else if (name == "exception") {
        TaskPool pool(1);
        auto failure = pool.submit([]() -> int { throw std::logic_error("task failed"); });
        bool caught = false;
        try { (void)failure.get(); } catch (const std::logic_error&) { caught = true; }
        require(caught, "exception not transferred to future");
        require(pool.submit([] { return 9; }).get() == 9, "worker died after exception");
    } else if (name == "drain") {
        TaskPool pool(1);
        std::latch entered(1), release(1);
        auto first = pool.submit([&] { entered.count_down(); release.wait(); return 1; });
        entered.wait();
        std::vector<std::future<int>> results;
        for (int i = 0; i < 50; ++i) results.push_back(pool.submit([i] { return i; }));
        std::jthread unlock([&] { release.count_down(); });
        pool.shutdown();
        require(first.get() == 1, "running task lost");
        int sum = 0;
        for (auto& result : results) sum += result.get();
        require(sum == 1225, "shutdown lost accepted tasks");
    } else if (name == "rejection") {
        TaskPool pool(2);
        pool.shutdown();
        pool.shutdown();
        bool caught = false;
        try { (void)pool.submit([] {}); } catch (const std::runtime_error&) { caught = true; }
        require(caught, "submit after shutdown was accepted");
        bool invalid = false;
        try { TaskPool empty(0); } catch (const std::invalid_argument&) { invalid = true; }
        require(invalid, "zero workers accepted");
    } else if (name == "concurrent") {
        TaskPool pool(4);
        std::atomic<int> accepted{0}, executed{0}, rejected{0};
        std::latch ready(5), start(1);
        std::vector<std::jthread> producers;
        for (int p = 0; p < 4; ++p) producers.emplace_back([&] {
            ready.count_down(); start.wait();
            for (int i = 0; i < 200; ++i) {
                try { (void)pool.submit([&] { ++executed; }); ++accepted; }
                catch (const std::runtime_error&) { ++rejected; }
            }
        });
        std::jthread closer([&] { ready.count_down(); start.wait(); pool.shutdown(); });
        ready.wait(); start.count_down();
        producers.clear(); closer.join();
        require(accepted + rejected == 800, "submission accounting mismatch");
        require(executed == accepted, "accepted tasks were lost or duplicated");
    } else if (name == "benchmark") {
        TaskPool pool(4);
        auto start = std::chrono::steady_clock::now();
        std::vector<std::future<int>> results;
        for (int i = 0; i < 2000; ++i) results.push_back(pool.submit([i] { return i; }));
        int sum = 0;
        for (auto& r : results) sum += r.get();
        require(sum == 1999000, "benchmark produced wrong result");
        auto us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - start).count();
        std::cout << "2000 tasks: " << us << " us (Debug, local measurement)\\n";
    } else throw std::runtime_error("unknown test");
}
int main(int argc, char** argv) {
    if (argc != 2) return 2;
    try { check(argv[1]); std::cout << "PASS " << argv[1] << '\\n'; return 0; }
    catch (const std::exception& e) { std::cerr << "FAIL " << argv[1] << ": " << e.what() << '\\n'; return 1; }
}
`,
'runtime-lab.json':JSON.stringify({name:'线程池 · 生命周期与关闭协议',runTarget:'runtime_demo',args:[]},null,2)+'\n',
'DESIGN.md':`# 线程池工程走读与递进练习

这是可以构建、运行和调试的参考工程。验收代表当前快照覆盖的行为，不代表生产可用性或职业等级。

## 1. 结果与异常
在 src/main.cpp 的 result 处打断点，观察主线程和工作线程，进入 square，跟踪 packaged_task → future 的结果传递。在测试中增加 move-only 捕获。

## 2. 生命周期
读 lifetime 测试，说明引用计数降到零的时机。在 worker 中把 task 留在循环外，观察资源释放时机变化。RAII 计数测试只验证这个资源类型，不等于内存扫描。

## 3. 关闭协议
给 worker 的关闭分支设断点。改成 if (closing_) return，运行验收，定位 drain 失败。用「调试此用例」检查队列和 future 状态，再恢复正确条件。

## 4. 并发边界
解释 submit 与 shutdown 的线性化点。concurrent 用屏障让生产者与关闭线程同时起跑，并验证每次提交恰好进入接受或拒绝集合。重复测试不能证明没有数据竞争，仍需 ThreadSanitizer。

## 5. 有界队列
新增容量、满队列拒绝策略与压力测试。不要在持有队列锁时运行用户函数。规定 worker 内调用 shutdown 的行为（当前契约禁止），再设计并实现更通用的生命周期模型。

## 6. 测量与取舍
benchmark 输出任务吞吐耗时。改变线程数和任务粒度，多次测量。报告硬件、构建参数、样本数量与尾延迟；不要把 Debug 下的单次耗时当作发布性能。

## 环境检查
工程验收会运行 CMake、CTest、重复测试，并探测 ASan/UBSan/TSan。当前工具链不支持的检测明确为未完成，不计为通过。可导出工程在支持这些工具的 Linux 环境完成补测。
`
};

export const engineeringTemplates=[{id:'task-pool',title:'线程池 · 从源码到证据',description:'7 类真实测试 · 关闭协议 · 异常传播 · 资源生命周期',files},...curriculum.academy.projects.map(p=>{
 const source=projectFiles(p,curriculum.exercises);delete source['.gitignore'];
 source['runtime-lab.json']=JSON.stringify({name:p.title,runTarget:p.exercises[0].replaceAll('-','_'),args:['0']},null,2)+'\n';
 return {id:p.id,title:p.title,description:'沿用课程工程与测试；初始实现需要你完成。',files:source};
}),...studyTemplates];
