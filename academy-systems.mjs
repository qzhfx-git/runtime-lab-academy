const S=(title,text,code='')=>({title,text,code});
const Q=(question,options,answer,explanation)=>({question,options,answer,explanation});
const R=(title,url)=>({title,url});
const L=(id,module,title,subtitle,sections,quiz,exercises,review,visual='',sources=[])=>({id,module,title,subtitle,sections,quiz,exercises,review,visual,minutes:30,sources});

export const systemLessons=[
L('atomic-publication','atomics','先发布数据，再发布可见性。','用 happens-before 解释跨线程交接。',[
 S('原子的是操作，不是整段业务','原子变量保证针对它的操作具有相应的原子性，但不会自动把周围普通对象变成线程安全对象。两线程并发访问同一内存位置，只要存在冲突、至少一个访问非原子且缺少必要的先行发生关系，就可能形成数据竞争。分析时应列出具体读写，而不是笼统地说“已经用了 atomic”。'),
 S('发布链的每一环都要成立','生产者先写 payload，再以 release 存储发布标记；消费者以 acquire 读到这次发布后，才能依赖此前的数据写入。关键不是看到相同的布尔值，而是读取来自符合规则的发布操作。下面是一轮交接，消费者读取期间生产者不再修改 payload；直接复用标记做多轮协议需要额外设计。',`#include <atomic>
#include <cassert>
#include <thread>
int main() {
    int payload = 0;
    std::atomic<bool> ready{false};
    std::jthread producer([&] {
        payload = 42;
        ready.store(true, std::memory_order_release);
    });
    std::jthread consumer([&] {
        while (!ready.load(std::memory_order_acquire))
            std::this_thread::yield();
        assert(payload == 42);
    });
}`),
 S('通过测试之后仍要解释为什么','压力测试只能探索实际执行到的线程交错，重复一万次也不是无数据竞争的证明。本机 Windows 评测没有执行 ThreadSanitizer，不能把绿色结果解释成并发安全认证。提交时应写出普通写入、release、读到该值的 acquire、普通读取这条关系链，再在支持的平台补充动态检查。')
],[Q('将示例中的 ready 操作全部改为 relaxed，能否继续依赖 payload 的同步发布？',['能，布尔标记还是原子的','不能，缺少这里需要的发布同步关系','只要再加 sleep 就能'],1,'relaxed 保留原子操作自身的性质，但不建立本例所需的跨线程发布关系；sleep 也不是同步。'),Q('消费者 acquire 加载必须满足什么，才能利用本例的发布？',['在日历时间上晚于写入','读取到符合规则的 release 发布结果','恰好运行在同一个 CPU 核上'],1,'同步来自语言规定的读写关系，不来自肉眼观察到的先后或线程调度位置。')],['release-publish'],'画出本例的四个关键事件及先行发生关系；再说明生产者第二次修改 payload 会破坏哪项前提。','publication',[R('标准草案 · 数据竞争','https://eel.is/c++draft/intro.races'),R('标准草案 · 原子顺序','https://eel.is/c++draft/atomics.order'),R('Clang · ThreadSanitizer 平台','https://clang.llvm.org/docs/ThreadSanitizer.html')]),

L('atomic-spsc','atomics','一个生产者，一个消费者。','从槽位所有权推导 SPSC 队列。',[
 S('先缩小参与者集合','SPSC 的前提是恰好一个生产者和一个消费者，分别独占写入尾索引与头索引。数组里的普通元素可以保持非原子，但每个槽位必须在两方之间按协议交接。此处用一个空槽区分满和空，因此数组长度为八时可存七个元素；这项容量契约应直接写进接口和测试。'),
 S('两个方向都有发布','生产者写好元素后以 release 推进尾索引，消费者 acquire 观察后才读取元素。消费者读完以后也要 release 推进头索引，生产者 acquire 观察后才可以复用该槽位。只证明数据发布而忘记存储复用，容易留下覆盖尚未读取元素的缺口；读自己独占修改的索引则可使用 relaxed。',`#include <array>
#include <atomic>
#include <cassert>
#include <cstddef>
class Spsc {
    std::array<int, 8> data_{};
    std::atomic<std::size_t> head_{0}, tail_{0};
public:
    bool push(int value) {
        auto tail = tail_.load(std::memory_order_relaxed);
        auto next = (tail + 1) % data_.size();
        if (next == head_.load(std::memory_order_acquire)) return false;
        data_[tail] = value;
        tail_.store(next, std::memory_order_release);
        return true;
    }
    bool pop(int& value) {
        auto head = head_.load(std::memory_order_relaxed);
        if (head == tail_.load(std::memory_order_acquire)) return false;
        value = data_[head];
        head_.store((head + 1) % data_.size(), std::memory_order_release);
        return true;
    }
};
int main() {
    Spsc queue;
    int value = 0;
    assert(queue.push(7));
    assert(queue.pop(value) && value == 7);
}`),
 S('无锁标签需要额外证据','示例只讨论 int 槽位，不包含任意对象的构造异常、析构和跨槽位移动；扩展模板类型前必须补齐这些契约。算法没有显式互斥锁，也不意味着目标平台的每种 atomic 都必然无锁。压力测试检查不丢不重和顺序，人工审查负责槽位所有权、同步关系以及关闭期间的行为。')
],[Q('数组长八、保留一个空槽时，队列容量是多少？',['八','七','九'],1,'空槽协议用 head == tail 表示空，满状态必须与之区分，因此有效容量减一。'),Q('能否直接让两个生产者调用本例 push？',['能，tail 已经是 atomic','不能，生产者独占更新的前提被破坏','把所有操作改为 seq_cst 就必然可以'],1,'两个生产者可能取得同一尾位置并冲突写槽；单纯加强内存序不会修复算法所有权。')],['spsc-queue'],'分别标出元素发布和槽位归还的同步链；说明满、空、回绕以及消费者退出时的契约。','publication',[R('标准草案 · 原子顺序','https://eel.is/c++draft/atomics.order'),R('标准草案 · 数据竞争','https://eel.is/c++draft/intro.races')]),

L('atomic-cas-reclamation','atomics','CAS 成功，不等于结构安全。','分开思考更新、ABA 与内存回收。',[
 S('失败会带回新的观察值','compare_exchange 比较当前值与 expected，成功时写入 desired，失败时通常把实际观察值写回 expected；weak 版本还允许伪失败。因此循环里的决策必须基于更新后的 expected 重新计算。示例只维护独立的最大计数，不通过该值发布其他数据，所以 relaxed 足以表达这项孤立任务。'),
 S('先用简单状态理解重试','单调最大值的循环只在候选值更大时尝试更新。竞争线程已经发布更大数值时，失败路径更新 observed，下一轮条件会自然退出。不能把这段代码机械改为指针栈：指针相等并不能说明对象仍然活着，也不能说明从上次观察以来该地址没有经历删除和重新分配。',`#include <atomic>
#include <cassert>
void publish_max(std::atomic<int>& maximum, int candidate) {
    int observed = maximum.load(std::memory_order_relaxed);
    while (observed < candidate &&
           !maximum.compare_exchange_weak(
               observed, candidate,
               std::memory_order_relaxed,
               std::memory_order_relaxed)) {
        // 失败后 observed 已更新；伪失败也会重新尝试。
    }
}
int main() {
    std::atomic<int> maximum{3};
    publish_max(maximum, 8);
    publish_max(maximum, 5);
    assert(maximum.load() == 8);
}`),
 S('地址身份和存活责任要分开','ABA 描述观察到的状态从 A 变化后又回到 A，使仅比较当前值的算法漏掉中间变化。带版本的标记可以帮助识别变化，却不能独自保护被解引用对象的生命；版本溢出也要有契约。Hazard Pointer 与 epoch 回收需要完整参与协议，初学项目应优先选可论证的锁方案，不靠随机测试宣称回收安全。')
],[Q('compare_exchange_weak 失败后，expected 应如何对待？',['认为完全没变','把它作为新的观察结果重新推导','直接解引用成另一个类型'],1,'失败路径会提供观察值，伪失败也允许发生，循环必须能够安全重试。'),Q('给指针增加版本号，是否就保证解引用时对象仍存活？',['保证','不保证，检测变化和保护生命周期是不同问题','只要版本号够大就保证'],1,'另一个线程仍可能回收对象；必须有独立且正确的回收与访问协议。')],['release-publish','spsc-queue'],'为一个拟议的无锁栈分别写出线性化点、ABA 防护、节点存活和回收条件；哪一项尚无证据就明确标记。','publication',[R('标准草案 · 原子操作顺序','https://eel.is/c++draft/atomics.order'),R('标准草案 · 对象生命周期','https://eel.is/c++draft/basic.life')]),

L('performance-data-layout','performance','布局要跟着访问模式走。','把 AoS、SoA 与局部性放回具体工作负载。',[
 S('先描述每轮真正需要的数据','AoS 将同一对象的字段相邻存放，适合一轮处理对象的大部分字段；SoA 将同一字段连续存放，适合批量处理少数字段。不能仅凭“连续”就断言某种布局获胜，还需要考虑对象总量、筛选比例、缓存层级、向量化机会与维护成本。结构改变后，身份和跨字段长度不变量也必须保持。'),
 S('让不变量成为接口的一部分','示例将位置与速度分为两个数组，更新前验证长度一致，避免一个数组扩容后另一个没有跟上的越界错误。这里仍然保留每个向量内部的连续存储，便于逐元素访问。生产工程可把两个数组封装到一个类型内，由统一的插入和删除操作维护对应关系，而不是让调用者自行约定。',`#include <cassert>
#include <stdexcept>
#include <vector>
struct Positions {
    std::vector<float> x;
    std::vector<float> velocity;
    void step(float dt) {
        if (x.size() != velocity.size())
            throw std::logic_error("field lengths differ");
        for (std::size_t i = 0; i < x.size(); ++i)
            x[i] += velocity[i] * dt;
    }
};
int main() {
    Positions data{{1.0f, 4.0f}, {2.0f, -2.0f}};
    data.step(0.5f);
    assert(data.x[0] == 2.0f && data.x[1] == 3.0f);
}`),
 S('验证语义，再收集性能证据','优化前后应对同一输入得到符合约定的结果，再在相同编译选项、数据规模和机器条件下测量。浮点重排可能改变舍入，不能把所有差异都视为无害。本站功能测试验证字段更新，不证明 SoA 在用户负载上更快；项目报告应保留原始样本、编译器版本与改变布局的实际收益。')
],[Q('哪种负载更有理由尝试 SoA？',['只批量更新位置，其他大字段很少读取','每次只访问一个对象的全部字段','所有负载都必定更快'],0,'同字段连续访问可能减少无关数据带入并帮助向量化，但仍需实际测量。'),Q('SoA 中两个字段数组长度不一致，首先是何种问题？',['只是显示问题','数据结构不变量被破坏','一定能由 CPU 自动补齐'],1,'同一索引应表示同一实体的不同字段；长度不同会造成错误或越界。')],['soa-step','sparse-components'],'为你的实际工作负载列出每轮访问的字段和数量；设计一个能公平比较 AoS/SoA 的实验。','',[R('C++ Core Guidelines · Performance','https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-performance'),R('GCC · 优化选项','https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html')]),

L('performance-contention','performance','共享一条缓存线，也可能付出代价。','区分数据竞争、真共享和伪共享。',[
 S('正确性问题与性能问题分开','两线程分别更新不同原子对象，语言层面可以没有数据竞争，却仍可能因为硬件缓存一致性协议反复迁移同一缓存线而变慢。真共享是双方确实需要同一状态，伪共享则是互不相关的数据偶然落在同一区域。它们都不能只凭地址图断言耗时，需要通过规模化测量和采样定位。'),
 S('隔离是一种假设，不是万能药','示例显式按六十四字节对齐两个独立计数对象，以便演示布局干预；六十四是实验假设，不能当成所有机器的缓存线保证。每个线程仍只负责自己的计数，最终在线程结束后汇总。实际业务如果允许本地累计再合并，减少共享写入次数往往比不断扩大对象尺寸更值得先测试。',`#include <atomic>
#include <cassert>
#include <thread>
struct alignas(64) Counter {
    std::atomic<int> value{0};
};
int main() {
    Counter first, second;
    std::jthread a([&] {
        for (int i = 0; i < 10000; ++i)
            first.value.fetch_add(1, std::memory_order_relaxed);
    });
    std::jthread b([&] {
        for (int i = 0; i < 10000; ++i)
            second.value.fetch_add(1, std::memory_order_relaxed);
    });
    a.join(); b.join();
    assert(first.value.load() + second.value.load() == 20000);
}`),
 S('用成本换成本要有记录','填充会增加内存占用，可能降低其他阶段的缓存密度；分片计数会引入合并成本和可见性延迟。报告必须说明统计值需要实时一致还是最终汇总，并同时给出吞吐、延迟和内存变化。一次较快的运行不能证明伪共享已消失，更不能用测试超时直接给并发算法判定渐进复杂度。')
],[Q('两个线程写不同的 atomic，程序无数据竞争就一定没有争用吗？',['一定','不一定，仍可能发生缓存层面的争用','只有 Debug 构建才会争用'],1,'语言层面的正确性和硬件层面的共享成本是两种分析维度。'),Q('为计数器增加 padding 的主要代价是什么？',['程序自动失去原子性','占用更多内存，可能降低其他访问的密度','所有计数会自动变成非零'],1,'布局优化有空间和局部性代价，须在完整负载下评估。')],['soa-step','task-executor'],'比较共享原子计数、分线程累计、对齐隔离三种设计，写出一致性需求和你将收集的指标。','',[R('C++ Core Guidelines · Concurrency','https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-concurrency'),R('标准草案 · 内存位置','https://eel.is/c++draft/intro.memory')]),

L('performance-measurement','performance','测量的是问题，不是一个漂亮数字。','建立 profiling、基准和复杂度的证据链。',[
 S('先找到热点，再缩小实验','Profiling 用于观察真实负载的时间分布和调用路径，微基准用于隔离某个候选原因。两者需要衔接：先确认总时间确实花在待优化路径，再设计能复现其数据分布的实验。记录编译器、优化级别、输入规模、预热与重复次数，避免把首次分配、磁盘缓存或日志输出混进核心操作。'),
 S('保留可观察结果与原始样本','下面只是计时骨架：每轮在计时前复制同一输入，计时后使用排序结果，避免结果完全无人使用。它没有消除操作系统调度与缓存影响，也没有自动得到可信的分位数。正式基准应保存多轮样本，明确是否包含分配，并使用适合工具链的优化屏障和统计方法检查编译器是否改变了待测工作。',`#include <algorithm>
#include <chrono>
#include <iostream>
#include <numeric>
#include <vector>
int main() {
    std::vector<int> source(10000);
    std::iota(source.rbegin(), source.rend(), 1);
    long long checksum = 0;
    for (int trial = 0; trial < 5; ++trial) {
        auto data = source;
        auto start = std::chrono::steady_clock::now();
        std::sort(data.begin(), data.end());
        auto finish = std::chrono::steady_clock::now();
        checksum += data.front() + data.back();
        auto us = std::chrono::duration_cast<
            std::chrono::microseconds>(finish - start).count();
        std::cout << us << '\\n';
    }
    std::cout << "checksum=" << checksum << '\\n';
}`),
 S('时间曲线不能代替复杂度推导','渐进复杂度需要对操作次数和输入规模的关系作出论证，有限数据点只能支持或反驳具体假设。p99 延迟也需要足够样本和明确统计口径，五次测量不适合包装成稳定尾延迟。当前在线评测的时间主要用于限制运行，不能当作跨提交公平的性能排名；综合项目另交可复现基准和热点解释。')
],[Q('某实现连续五次比另一实现快，能否证明它的渐进复杂度更低？',['能','不能，复杂度需要算法与操作次数论证','只要用 Release 就能'],1,'有限计时受常数、规模与机器环境影响，不能证明所有规模下的增长规律。'),Q('优化前最值得先确认什么？',['代码是否足够短','真实负载是否确实在这条路径花费大量成本','是否使用了更多模板'],1,'先定位热点可防止优化对整体体验影响很小的部分。')],['soa-step','lru-cache','arena'],'提交一页基准计划：负载来源、纳入成本、控制变量、原始样本、统计口径，以及复杂度的独立推导。','',[R('GCC · Instrumentation Options','https://gcc.gnu.org/onlinedocs/gcc/Instrumentation-Options.html'),R('标准草案 · 容器复杂度要求','https://eel.is/c++draft/container.requirements')]),

L('engineering-transaction','engineering','失败以后，对象还是什么状态？','用事务式更新理解异常保证。',[
 S('先给失败结果定义契约','基本保证通常要求异常后对象仍满足不变量且没有资源泄漏，强保证进一步要求可观察状态保持原样，无异常保证则承诺操作不抛出。它们不是“安全等级”按钮，而是需要逐步检查的接口承诺。业务上允许部分成功的操作，也应明确返回哪些变化已经生效，不能让调用者靠猜测恢复。'),
 S('把可能失败的工作留在提交之前','示例先复制原容器，再在副本上完成可能失败的更新，最后通过默认分配器下的不抛出 swap 提交。复制或索引校验失败时，原对象没有被修改。这个模式需要额外内存，并不适用于所有大对象；若提交操作自身可能抛出，或者包含已发出的外部消息，就不能直接声称具备同样的强保证。',`#include <cassert>
#include <stdexcept>
#include <utility>
#include <vector>
void update(std::vector<int>& values, std::size_t index, int value) {
    auto staged = values;
    staged.at(index) = value;
    values.swap(staged);
}
int main() {
    std::vector<int> values{1, 2, 3};
    try { update(values, 9, 7); }
    catch (const std::out_of_range&) {}
    assert((values == std::vector<int>{1, 2, 3}));
    update(values, 1, 8);
    assert(values[1] == 8);
}`),
 S('把故障路径也放进验收','正常路径测试只能证明某些成功输入得到预期结果。针对异常保证，应在构造、分配、复制和回调等潜在失败点注入故障，检查原状态、活对象计数和资源责任。异常安全与线程安全也相互独立：事务式副本更新没有给并发读者加锁，跨线程使用仍需要明确同步与可见性协议。')
],[Q('为什么示例在副本上调用 at？',['让越界异常发生时原容器保持原样','为了取消所有边界检查','因为 vector 不能直接更新'],0,'先完成可能失败的工作，再以符合条件的操作提交，是强保证的一种实现方式。'),Q('事务式更新自动提供线程安全吗？',['提供','不提供，仍需同步并发访问','仅当元素为 int 时提供'],1,'异常路径的状态承诺不建立线程之间的同步关系。')],['transaction-update'],'列出你实现的每个抛出点，逐点说明异常发生时哪些状态已变、哪些资源必须释放，以及提交是否真的不抛出。','',[R('C++ Core Guidelines · Error handling','https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-errors'),R('标准草案 · 容器要求与交换','https://eel.is/c++draft/container.requirements')]),

L('engineering-cmake-tests','engineering','让别人能够重建你的证据。','从单文件通过走向可重复构建与测试。',[
 S('把要求绑定到目标','工程应把库、示例和测试拆成独立 CMake target，用 target_compile_features(runtime PUBLIC cxx_std_20) 声明语言要求，再通过目标链接传播依赖，避免依赖机器上的全局编译参数。配置和构建分离，例如 cmake -S . -B build 后执行 cmake --build build；多配置生成器还需明确构建配置。'),
 S('测试程序需要真实失败出口','示例把等价断言写成非零返回值，因而即使定义了 NDEBUG 也不会消失。实际项目把函数实现放进库，测试目标只负责构造输入和检查契约。CMake 使用 include(CTest) 启用测试，再用 add_test(NAME boundary COMMAND boundary_test) 注册目标；ctest --test-dir build --output-on-failure 执行并展示失败。',`#include <cstddef>
#include <iostream>
#include <optional>
#include <vector>
std::optional<int> lookup(const std::vector<int>& v, std::size_t i) {
    if (i >= v.size()) return std::nullopt;
    return v[i];
}
int main() {
    const std::vector<int> values{4, 9};
    if (lookup(values, 0) != 4 || lookup(values, 1) != 9 ||
        lookup(values, 2).has_value() || lookup({}, 0).has_value()) {
        std::cerr << "lookup boundary contract failed\\n";
        return 1;
    }
    return 0;
}`),
 S('通过率和覆盖率要各自解释','单元测试检查局部契约，集成测试检查组件组合，性质测试用更广输入寻找反例，故障注入检查失败路径。覆盖率说明哪些代码被执行，不说明断言足够有效，更不说明所有并发交错都被覆盖。交付时从干净目录重建并运行测试，记录工具链和命令；C++23 功能应单独声明，不能悄悄混入 C++20 必做题。')
],[Q('为什么示例没有只依靠 assert 作为交付测试出口？',['assert 从来不能用','定义 NDEBUG 时 assert 检查可能被移除','返回非零能自动证明全部正确'],1,'工程测试需要在选定构建配置中保留有效的失败检测；非零退出可被 CTest 识别。'),Q('达到百分之百行覆盖率意味着什么？',['每条需求都正确','被统计的行被执行过，仍需检查断言和遗漏场景','所有线程交错已测试'],1,'覆盖率是执行范围指标，不是正确性或需求完备性证明。')],['transaction-update','scope-exit'],'为一个多文件组件写出目标依赖图、干净构建命令、测试分层和失败退出规则，并说明怎样区分未运行与已通过。','',[R('CMake · 官方教程','https://cmake.org/cmake/help/latest/guide/tutorial/index.html'),R('CMake · add_test','https://cmake.org/cmake/help/latest/command/add_test.html'),R('Clang · Source-based Code Coverage','https://clang.llvm.org/docs/SourceBasedCodeCoverage.html')]),

L('engineering-diagnostics','engineering','诊断工具，是证据而不是护身符。','组合警告、检测器、日志和清理契约。',[
 S('每种工具只回答一部分问题','编译器警告提示可静态发现的可疑代码，AddressSanitizer 检测一类内存访问错误，UndefinedBehaviorSanitizer 覆盖部分未定义行为，ThreadSanitizer 用于发现运行中数据竞争。未报告不等于没有缺陷，未运行更不能标作通过；本机 Windows 评测没有执行 TSan，应把 Linux 等支持环境的检查作为独立证据。'),
 S('用类型缩小需要诊断的范围','下例是 C++20 的简单作用域清理器，禁止复制和移动来保持唯一清理责任，并静态要求回调不抛出。它不是标准 std::scope_exit 的完整替代，后者属于 C++23 库功能。析构适合可靠回收，可能失败且需要报告的提交或关闭操作应提供显式接口，避免在栈展开中再抛异常。',`#include <cassert>
#include <type_traits>
#include <utility>
template<class F>
class ScopeExit {
    static_assert(std::is_nothrow_invocable_v<F&>);
    F action_;
public:
    explicit ScopeExit(F action) : action_(std::move(action)) {}
    ScopeExit(const ScopeExit&) = delete;
    ScopeExit& operator=(const ScopeExit&) = delete;
    ScopeExit(ScopeExit&&) = delete;
    ScopeExit& operator=(ScopeExit&&) = delete;
    ~ScopeExit() noexcept { action_(); }
};
int main() {
    int active = 0;
    {
        ++active;
        ScopeExit guard([&active]() noexcept { --active; });
        assert(active == 1);
    }
    assert(active == 0);
}`),
 S('定位材料需要能被重放','一次缺陷报告至少包含最小复现、预期和实际行为、编译器版本、构建选项以及完整诊断位置。日志记录任务身份和状态变化，避免只输出无法关联的“失败”；性能诊断则先通过 profiling 找热点，再另做基准。动态检测通常改变运行成本，不能把检测构建的耗时直接与发布构建比较后宣称优化收益。')
],[Q('本机 Windows 页面未运行 TSan，应如何呈现？',['显示未发现数据竞争','明确显示未运行或平台不支持该检查','用功能测试通过替代 TSan 通过'],1,'功能测试与动态竞争检测是不同证据，必须准确报告实际执行范围。'),Q('示例为什么限制清理回调为 noexcept 可调用？',['为了表达析构清理不得抛出的契约','为了自动修复所有资源泄漏','为了让回调永远不执行'],0,'清理时再次抛出尤其可能破坏异常展开；这一限制仍不能证明回调内部的业务正确性。')],['scope-exit','slot-pool','arena'],'为一次越界或泄漏缺陷设计复现包，区分静态诊断、动态检测和人工生命周期审查各自能证明什么。','',[R('Clang · AddressSanitizer','https://clang.llvm.org/docs/AddressSanitizer.html'),R('Clang · UndefinedBehaviorSanitizer','https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html'),R('Clang · ThreadSanitizer','https://clang.llvm.org/docs/ThreadSanitizer.html')]),

L('runtime-entity-storage','runtime','实体身份，不能只是一处地址。','把 ECS 存储、代际句柄和对象生命接起来。',[
 S('槽位可以复用，身份不能误认','组件存储为了紧凑访问会搬移元素，为了减少分配会复用槽位；裸指针或单独的数组下标因此很难长期代表实体。代际句柄同时保存槽位与 generation，查询时验证二者匹配且槽位存活，防止旧句柄误认新对象。代际计数也有上限，项目必须规定溢出时退役槽位或采取其他可解释策略。'),
 S('稀疏与稠密映射要一起维护','典型 sparse set 用实体索引找到稠密位置，再由稠密实体表反向确认身份。删除时若用末尾元素填洞，必须同时修正被搬移实体的稀疏映射，并结束被删除组件的生命周期。下面只演示句柄验证这一层，不构成完整 ECS；它把存活与代际检查集中在函数中，避免业务调用点各写一套判断。',`#include <cassert>
#include <cstdint>
#include <vector>
struct Entity { std::uint32_t slot, generation; };
struct Slot { std::uint32_t generation; bool alive; };
bool valid(const std::vector<Slot>& slots, Entity entity) {
    return entity.slot < slots.size() && slots[entity.slot].alive &&
           slots[entity.slot].generation == entity.generation;
}
int main() {
    std::vector<Slot> slots{{4, true}};
    Entity old{0, 4};
    assert(valid(slots, old));
    slots[0].alive = false;
    ++slots[0].generation; // 此演示已知不会溢出。
    slots[0].alive = true;
    assert(!valid(slots, old));
    assert(valid(slots, Entity{0, 5}));
}`),
 S('让分配策略服从生命边界','Arena 适合整批释放的数据，组件若跨帧保留就不能随帧清空；Pool 的槽位归还也不等于可以跳过组件析构。验收同时检查旧句柄拒绝、删除换位、扩容后的访问以及构造失败回滚。顺序功能测试不能证明跨线程句柄安全，查询与删除并发时仍需要锁、阶段屏障或其他明确的保护协议。')
],[Q('稠密数组删除时用末尾元素填洞，还要更新什么？',['被搬移实体的稀疏映射','只要缩短数组就够了','所有实体都必须重新创建'],0,'稠密位置改变后，反向定位必须同步修正，否则查询会指向错误组件。'),Q('代际句柄自动保护查询和删除并发吗？',['自动保护','不保护，它识别身份但不独自保证存活期间的同步','只要 generation 是整数就保护'],1,'校验以后仍可能发生删除，安全访问必须有独立的并发生命周期协议。')],['sparse-components','slot-pool','arena'],'画出一次删除换位前后的双向映射，给出旧句柄、扩容、代际溢出和并发删除的接口契约。','queue',[R('标准草案 · 对象生命周期','https://eel.is/c++draft/basic.life'),R('C++ Core Guidelines · Resource management','https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-resource')]),

L('runtime-job-graph','runtime','任务完成之后，谁可以继续？','依赖、背压与关闭共同组成执行协议。',[
 S('先区分可运行和已入队','任务图描述依赖，只有所有前置任务完成后节点才能进入就绪集合。执行器队列描述当前可调度任务，两者不能简单混成一个容器。验收应明确重复依赖、缺失节点和环的处理方式，也要规定任务失败后下游是取消、继续还是接收错误，避免队列空了却仍有永远无法完成的等待。'),
 S('从顺序拓扑模型建立基线','示例使用入度和就绪队列产生合法顺序，若处理节点数不足就报告依赖环。它是顺序参考模型，复杂度由每个节点和边被处理的次数推导为 O(V+E)，不是因为一次跑得快。将它改成并行执行器时，任务完成后的入度更新、唯一入队和结果发布都要建立新的同步协议。',`#include <cassert>
#include <queue>
#include <stdexcept>
#include <vector>
std::vector<int> order(const std::vector<std::vector<int>>& edges) {
    std::vector<int> indegree(edges.size(), 0), result;
    for (const auto& next : edges)
        for (int to : next) ++indegree.at(to);
    std::queue<int> ready;
    for (int i = 0; i < static_cast<int>(edges.size()); ++i)
        if (indegree[i] == 0) ready.push(i);
    while (!ready.empty()) {
        int from = ready.front(); ready.pop();
        result.push_back(from);
        for (int to : edges[from])
            if (--indegree[to] == 0) ready.push(to);
    }
    if (result.size() != edges.size()) throw std::logic_error("cycle");
    return result;
}
int main() {
    auto result = order({{1, 2}, {3}, {3}, {}});
    assert(result.front() == 0 && result.back() == 3);
}`),
 S('关闭是状态机，不是一个布尔值','有限队列需要规定提交失败、阻塞或等待的背压策略；关闭则要区分停止接收、排空已接收任务、取消待执行任务与等待运行中任务结束。不要在持有队列互斥锁时运行用户回调，否则慢任务和重入提交可能拖垮系统。项目报告应检查任务恰好执行一次、异常可观察以及析构不会等待自身线程。')
],[Q('拓扑遍历只处理了部分节点，最直接的解释是什么？',['一定是 CPU 太慢','在既定图契约下存在无法消除的依赖环','需要把队列换成 vector 就能解决'],1,'无环图的所有节点最终都能消除入度；处理不足应按接口契约报告环，而非静默遗漏任务。'),Q('为什么不在持有队列锁时执行用户任务？',['用户任务可能慢、抛出或重入，扩大锁作用域并引入死锁风险','因为锁禁止所有函数调用','为了避免任务真的运行'],0,'通常应在锁内取得任务和更新队列状态，释放锁后运行回调，再按协议发布完成。')],['dependency-order','task-executor'],'写出执行器从接收至关闭的状态机，逐条说明提交竞争、依赖失败、队列满、回调抛出和析构时的处理。','queue',[R('C++ Core Guidelines · Concurrency','https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-concurrency'),R('标准草案 · Threads','https://eel.is/c++draft/thread.threads')]),

L('runtime-coroutine-lifetime','runtime','挂起以后，谁还活着？','协程帧所有权、恢复与协作式取消。',[
 S('协程是控制流机制','C++20 协程允许函数挂起与恢复，但不会自动创建线程或提供调度器。局部状态可保存在协程帧中，按值参数与借用参数的生命责任不同；传入引用或捕获 this 并不会自动延长目标对象的生命周期。设计异步接口时应画出调用者、返回对象、帧和调度器之间的所有权，而不是仅关注 co_await 写在哪里。'),
 S('恢复和销毁只能有明确负责人','示例是单线程、惰性启动的整数序列：返回对象独占句柄，析构销毁仍存在的帧，异常在恢复后重新抛出。stop_token 按值进入帧，取消只在恢复执行到检查点时被观察。它并非通用异步库；如果调度器持有恢复任务，就必须先撤销或等待这些任务，不能一边恢复同一帧一边销毁它。',`#include <cassert>
#include <coroutine>
#include <exception>
#include <stop_token>
#include <utility>
struct Sequence {
    struct promise_type;
    using Handle = std::coroutine_handle<promise_type>;
    struct promise_type {
        int value = 0;
        std::exception_ptr error;
        Sequence get_return_object() {
            return Sequence{Handle::from_promise(*this)};
        }
        std::suspend_always initial_suspend() noexcept { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        std::suspend_always yield_value(int n) noexcept {
            value = n; return {};
        }
        void return_void() noexcept {}
        void unhandled_exception() noexcept { error = std::current_exception(); }
    };
    Handle handle;
    explicit Sequence(Handle h) : handle(h) {}
    Sequence(const Sequence&) = delete;
    Sequence& operator=(const Sequence&) = delete;
    Sequence(Sequence&& other) noexcept
        : handle(std::exchange(other.handle, {})) {}
    ~Sequence() { if (handle) handle.destroy(); }
    bool next(int& value) {
        if (!handle || handle.done()) return false;
        handle.resume();
        if (handle.promise().error) std::rethrow_exception(handle.promise().error);
        if (handle.done()) return false;
        value = handle.promise().value;
        return true;
    }
};
Sequence numbers(std::stop_token stop) {
    for (int i = 0; i < 3; ++i) {
        if (stop.stop_requested()) co_return;
        co_yield i;
    }
}
int main() {
    std::stop_source source;
    auto sequence = numbers(source.get_token());
    int value = -1;
    assert(sequence.next(value) && value == 0);
    source.request_stop();
    assert(!sequence.next(value));
}`),
 S('取消需要贯穿等待和清理','请求停止不等于强制中断，普通阻塞 I/O 也不会因为 token 改变就自动返回。完整运行时应规定等待操作如何响应取消、待恢复回调如何撤销、异常如何传回调用者以及帧最终由谁释放。C++23 的 std::generator 不属于本课 C++20 环境；项目可以选成熟库，但仍须验证提前退出、异常、取消和关闭后的生命周期。')
],[Q('调用 request_stop 后，示例协程会在何时观察取消？',['立即在任意指令处被强制终止','下次恢复并运行到 stop_requested 检查点时','永远不会观察'],1,'stop_token 表达协作式取消；请求本身不强制打断协程或线程。'),Q('把局部对象引用传入一个会挂起的协程，是否自动延长该对象生命周期？',['自动延长','不延长，借用对象必须由外部保证存活','只要使用 co_yield 就延长'],1,'协程帧保存引用或指针不等于拥有被引用对象，恢复前必须保证借用仍有效。')],['task-executor','scope-exit'],'画出本例从创建、首次恢复、挂起、取消到析构的帧状态；若调度器并发恢复句柄，必须新增哪些所有权和同步约束？','queue',[R('标准草案 · Coroutine definitions','https://eel.is/c++draft/dcl.fct.def.coroutine'),R('标准草案 · Stop tokens','https://eel.is/c++draft/thread.stoptoken'),R('C++ Core Guidelines · Coroutine lifetime','https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-concurrency')])
];
