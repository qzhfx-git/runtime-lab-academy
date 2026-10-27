const S = (title, text, code = '') => ({ title, text, code });
const Q = (question, options, answer, explanation) => ({ question, options, answer, explanation });
const referenceSets = {
  structures: [
    { title: '标准工作草案 · vector 的修改与失效规则', url: 'https://eel.is/c++draft/vector.modifiers' },
    { title: '标准工作草案 · 有序关联容器', url: 'https://eel.is/c++draft/associative.reqmts' },
    { title: '标准工作草案 · 无序关联容器', url: 'https://eel.is/c++draft/unord.req' },
    { title: '标准工作草案 · list 的 splice 操作', url: 'https://eel.is/c++draft/list.ops' },
    { title: '标准工作草案 · priority_queue', url: 'https://eel.is/c++draft/priority.queue' },
  ],
  memory: [
    { title: '标准工作草案 · 对象生命周期', url: 'https://eel.is/c++draft/basic.life' },
    { title: '标准工作草案 · 内存对齐', url: 'https://eel.is/c++draft/ptr.align' },
    { title: '标准工作草案 · monotonic_buffer_resource', url: 'https://eel.is/c++draft/mem.res.monotonic.buffer' },
  ],
  concurrency: [
    { title: '标准工作草案 · jthread 的构造与析构', url: 'https://eel.is/c++draft/thread.jthread.cons' },
    { title: '标准工作草案 · condition_variable', url: 'https://eel.is/c++draft/thread.condition.condvar' },
    { title: '标准工作草案 · packaged_task', url: 'https://eel.is/c++draft/futures.task.members' },
  ],
};
const L = (id, module, title, subtitle, sections, quiz, exercises, review, visual = '') => ({
  id, module, title, subtitle, sections, quiz, exercises, review, visual, minutes: 30,
  sources: [
    { title: 'C++ Core Guidelines · 资源、接口与并发', url: 'https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines' },
    ...referenceSets[module],
  ],
});

// 原创课程；示例限定为 C++20。链接中的滚动标准草案也包含更新版本的特性。
export const foundationLessons = [
  L('sequence-invariants', 'structures', '容器的第一课，是不变量。', '从 vector 的失效规则，走到有界环形队列。', [
    S('连续存储带来什么承诺', 'vector 的优势是连续存储、常数时间随机访问和良好的遍历局部性；尾部追加通常具有摊还常数复杂度，但一次扩容仍会搬迁元素。不要把摊还成本理解成每次延迟上限。服务中的请求缓冲区还要回答容量上限、满载策略和对象构造失败时的行为，这些才决定它能否直接使用 vector。'),
    S('修改后，重新确认访问资格', '扩容使 vector 的全部元素指针、引用和迭代器失效；没有扩容的插入也会使插入位置及其之后的迭代器失效。erase 同样影响被删位置及其后方。下面使用 erase 返回的新迭代器继续遍历，避免递增一个已经失效的旧迭代器。reserve 只能减少扩容，不能取消其他失效规则。', `#include <vector>
#include <iostream>
int main() {
    std::vector<int> values{3, -1, 4, -2};
    for (auto it = values.begin(); it != values.end();) {
        if (*it < 0) it = values.erase(it);
        else ++it;
    }
    for (int value : values) std::cout << value << ' ';
}`),
    S('把环形队列画成状态机', '固定容量环形队列可以用 head 与 size 区分空和满，不必浪费一个槽位。任何操作结束时都要满足 size 不超过容量，只有活跃区间中的槽位含有效元素。容量为零、绕回、移动构造抛出都需要明确契约；先成功构造再提交 size，才能避免把失败的入队登记成有效元素。'),
  ], [
    Q('vector 没有发生扩容，执行中间插入后哪些迭代器仍然有效？', ['全部有效', '插入位置之前的迭代器有效', '只有原来的 end 有效'], 1, '没有扩容也不代表没有失效；插入位置及其之后的迭代器，包括原 end，都失效。'),
    Q('环形队列用 head 和 size 记录状态，容量为 C 时，满的判定是什么？', ['head 等于 0', 'size 等于 C', 'head 等于 size'], 1, 'size 显式记录活跃元素数量，避免仅靠相同头尾下标无法区分空与满。零容量必须单独处理，不能做模零运算。'),
  ], ['ring-buffer'], '给出容量为 3 的入队、出队、绕回轨迹，每一步列出 head、size 和活跃槽位；再写出一次元素构造失败后的状态，论证不变量仍成立。指出至少两处迭代器失效风险，并说明摊还常数复杂度为什么不保证单次低延迟。', 'queue'),

  L('index-selection', 'structures', '先写访问模式，再选结构。', '哈希、树、堆、Trie 各自回答不同的问题。', [
    S('精确命中与有序查询', '精确查找可以考虑 unordered_map，它的平均查找成本通常为常数，最坏情况仍可线性退化；计算字符串哈希本身也有字符成本。需要范围查询、有序遍历或对数级查找保证时，map 更合适。标准约束接口与复杂度，不要求 map 必须用某一种树；自定义比较器还必须满足严格弱序。'),
    S('堆只维护足够的顺序', '优先队列适合持续取出最小截止时间或最高优先级任务。二叉堆维护父子之间的序关系，堆顶查询为常数，插入和删除堆顶为对数级，并不支持廉价的任意键查找。下面用 greater 构造小顶堆。若业务经常修改任意任务优先级，还需要句柄与索引维护，不能假定 priority_queue 已提供这些接口。', `#include <queue>
#include <vector>
#include <functional>
#include <iostream>
int main() {
    std::priority_queue<int, std::vector<int>, std::greater<int>> deadlines;
    for (int value : {7, 3, 9, 1}) deadlines.push(value);
    while (!deadlines.empty()) {
        std::cout << deadlines.top() << ' ';
        deadlines.pop();
    }
}`),
    S('前缀、内存与复杂度证据', 'Trie 把共享前缀编码为路径，适合路由、补全和前缀计数；查找长度为 L 的键需要沿字符访问，但实际成本取决于子节点表示。固定字母表数组更直接，也可能浪费大量空间；字节 Trie 处理 UTF-8 时需先定义前缀语义。有限评测不能证明渐进复杂度，应另外给出操作次数推导和规模实验。'),
  ], [
    Q('系统需要查询键在 [a, b] 范围内的所有记录，哪个结构最直接支持这种访问？', ['unordered_map', '带有序比较规则的 map', '只提供堆顶的 priority_queue'], 1, 'map 提供有序迭代与 lower_bound，可定位范围起点；哈希和堆没有相同的顺序接口。'),
    Q('一次 Trie 查询可写成 O(L)，隐含了哪项关键条件？', ['全部节点都必须在栈上', '每个字符的子节点访问成本受控', '键的数量不能超过 100'], 1, '若每层还要遍历很长的子节点列表，就必须把该成本计入，不能只按路径长度计数。'),
  ], ['min-heap', 'prefix-trie'], '为截止时间调度、用户 ID 精确索引、路径前缀补全分别选型，写明 n、键长、读写比例和内存预算。推导查找与更新的最坏成本，并设计能暴露哈希冲突或 Trie 稀疏节点成本的实验，不能用“通过测试”代替证明。'),

  L('cache-and-dependencies', 'structures', '让数据结构，服务于系统模型。', 'LRU 的双结构一致性与 DAG 的依赖协议。', [
    S('LRU 不是两只容器的拼接', '典型 LRU 用链表记录新旧顺序，用哈希表映射键到链表位置；核心不变量是每个缓存键恰好对应一个有效节点，两边数量一致且不超过容量。命中需要移动节点，淘汰要同时移除索引和节点。新增时若第二步分配失败，必须回滚第一步，否则之后的查询会得到不一致的缓存状态。'),
    S('用稳定节点表达最近使用', 'list 的单节点 splice 可以在同一链表中调整位置，并保留该元素的迭代器，因此适合 LRU 命中后的移到头部。下面只演示已有键命中，不是完整缓存。把这个动作与新增、替换、淘汰分开分析，才能看清哪些操作可能抛出。多线程缓存还需要把两只容器当成一个整体保护。', `#include <list>
#include <unordered_map>
#include <utility>
#include <iostream>
int main() {
    using Entry = std::pair<int, int>;
    std::list<Entry> recency{{1, 10}, {2, 20}};
    std::unordered_map<int, std::list<Entry>::iterator> index;
    for (auto it = recency.begin(); it != recency.end(); ++it)
        index.emplace(it->first, it);
    auto hit = index.find(2);
    if (hit != index.end()) {
        recency.splice(recency.begin(), recency, hit->second);
        std::cout << recency.front().second;
    }
}`),
    S('依赖图表达能否执行', '构建系统和任务调度器可以用有向图表示依赖，约定边从前置任务指向后继任务。Kahn 算法反复取入度为零的节点，删除它的出边；最终处理数小于节点数说明存在环。邻接表实现可达 O(V+E)。拓扑顺序只证明依赖顺序合法，不等于并发调度已正确；失败传播、取消和重复边也须定义。'),
  ], [
    Q('LRU 链表节点移动到头部后，哈希表保存的该节点迭代器如何处理？', ['同链表单节点 splice 保持该迭代器有效', '必须销毁整个哈希表', '任何 list 操作都会使它失效'], 0, 'splice 重新连接节点，不会像 vector 搬迁那样使该元素迭代器失效；节点真正被 erase 后才不能继续使用。'),
    Q('Kahn 算法结束后只处理了部分节点，说明什么？', ['剩余节点一定完全没有依赖', '图中存在有向环，部分剩余节点也可能只是受环阻塞', '图一定不连通但没有环'], 1, '有环时无法不断消除入度；剩余集合可能同时包含环和依赖环的后继，不能把全部剩余节点都标成环成员。'),
  ], ['lru-cache', 'dependency-order'], '对容量 2 的 LRU 写出 get/put/更新同键/淘汰的完整轨迹，说明哈希插入抛出时如何回滚。为含共享前置任务和一个有向环的图给出入度变化，区分“环成员”与“被环阻塞”，并论证算法访问每条边的次数。'),

  L('arena-transactions', 'memory', '批量分配，也需要事务边界。', '对齐、溢出、检查点与 Arena 回滚。', [
    S('Arena 适合共同结束的生命', 'Arena 用大块存储与递增游标服务多个小请求，在同一批对象一起结束时能简化回收；它并不自动缩短对象构造成本，也不适合任意顺序的单独释放。接口应区分取得存储与构造对象，并说明 reset 是否负责析构。把带文件句柄或堆缓冲的对象直接遗忘，会使批量回收变成资源泄漏。'),
    S('先计算，成功后再提交', '分配必须同时满足剩余容量和目标对齐，不能只对游标偏移做位运算而忽略基地址。std::align 在给定区域内寻找合法起点，失败返回空指针；计算保存在局部变量中，确认成功后再提交游标，便于保证失败不改变 Arena。调用前还应验证接口允许的大小和对齐，并避免容量运算溢出。', `#include <array>
#include <cstddef>
#include <memory>
#include <iostream>
int main() {
    alignas(std::max_align_t) std::array<std::byte, 64> storage{};
    void* cursor = storage.data();
    std::size_t remaining = storage.size();
    void* candidate = cursor;
    std::size_t space = remaining;
    if (std::align(alignof(int), sizeof(int), candidate, space)) {
        auto* value = std::construct_at(static_cast<int*>(candidate), 42);
        cursor = static_cast<std::byte*>(candidate) + sizeof(int);
        remaining = space - sizeof(int);
        std::cout << *value << ' ' << remaining;
        std::destroy_at(value);
    }
}`),
    S('回滚不是时间倒流', '检查点保存游标位置，回滚前必须先按逆序销毁检查点之后仍存活的非平凡对象，再恢复游标。所有指向这些对象的借用都会失效，不能继续保留在外部容器中。检查点还应属于同一个 Arena 和同一代分配周期，防止 reset 后拿旧检查点回退。可先限制为平凡可析构对象，再逐步增加析构记录。'),
  ], [
    Q('Arena 把游标恢复到旧位置，是否已经完成其中所有 C++ 对象的清理？', ['是，改游标会自动调用析构', '否，非平凡对象可能仍需要显式析构及外部资源释放', '只要存储在栈上就是'], 1, '原始存储管理与对象生命周期管理是两层责任；游标操作本身不会调用对象析构函数。'),
    Q('一次对齐分配失败，最合理的游标状态是什么？', ['保持调用前的状态', '仍然越过失败请求的大小', '随机回退到任意合法地址'], 0, '失败不提交状态，让调用者可以恢复或尝试较小请求，也避免丢失尚可使用的空间。'),
  ], ['arena', 'lifetime'], '为容量、游标、基地址、请求大小与对齐写出不变量。手算两个不同对齐请求，再设计空间不足和整数溢出的输入，证明失败不会推进游标。解释回滚跨越两个带外部资源对象时的析构顺序，以及旧借用为何必须作废。', 'arena'),

  L('pool-object-lifetime', 'memory', '复用一个槽位，不是复用一个对象。', '空闲表、构造异常与带代数的句柄。', [
    S('把槽位看成三态资源', '定长 Pool 将存储切成大小与对齐都合适的槽位，用空闲表快速分配。一个槽位至少经历空闲、构造中、对象存活三个状态。只有构造成功才能计入活对象；构造抛出后要重新链接回空闲表。若对象类型过度对齐，普通字节数组未必满足要求，槽位起点和步长都必须重新校验。'),
    S('使用构造返回的有效指针', '原始存储可以承载不同时间的对象，但不能把旧指针仍能解引用当作通用规则。更稳妥的接口把 construct_at 返回的指针作为本次对象访问入口，在 destroy_at 后立即撤销对它的借用。下面 Slot 是单对象示范，故意不提供复制移动；完整池还需处理空闲表一致性、异常归还和退出时全部活对象的销毁。', `#include <cstddef>
#include <memory>
#include <string>
#include <utility>
#include <stdexcept>
#include <type_traits>
template<class T> class Slot {
    static_assert(std::is_nothrow_destructible_v<T>);
    alignas(T) std::byte storage_[sizeof(T)];
    T* object_ = nullptr;
public:
    Slot() = default;
    Slot(const Slot&) = delete;
    Slot& operator=(const Slot&) = delete;
    template<class... Args> T& emplace(Args&&... args) {
        if (object_) throw std::logic_error("occupied slot");
        object_ = std::construct_at(reinterpret_cast<T*>(storage_),
                                    std::forward<Args>(args)...);
        return *object_;
    }
    void reset() noexcept {
        if (object_) std::destroy_at(std::exchange(object_, nullptr));
    }
    ~Slot() { reset(); }
};
int main() {
    Slot<std::string> slot;
    slot.emplace("first");
    slot.reset();
    slot.emplace("second");
}`),
    S('身份不能只有地址', '槽位回收后可能立刻存入另一个对象，旧索引或旧地址会看似有效却指向错误身份。可以用索引加 generation 组成句柄，每次回收更新代数，查询时同时验证占用状态和代数。还要说明代数回绕策略，不能宣称它永远防止重用冲突。并发池需要额外同步；单线程空闲链表并不会自动成为安全的无锁结构。'),
  ], [
    Q('Pool 中对象构造函数抛出，池应该做什么？', ['调用这个未完整构造对象的析构函数', '把槽位归还空闲集合，保持活对象计数不变', '直接把该槽位标为存活'], 1, '完整对象尚未构造成功，不应析构它；语言已负责已构造子对象的展开，池负责归还槽位。'),
    Q('索引加 generation 的句柄主要防止哪种问题？', ['对象太大', '槽位复用后旧句柄误认新对象', '所有类型的并发数据竞争'], 1, 'generation 区分不同时期的身份；其正确性仍依赖回绕策略和访问同步，不能替代并发回收协议。'),
  ], ['slot-pool', 'lifetime'], '画出一个槽位在成功构造、构造抛出、销毁、重复释放和复用时的状态迁移。用计数型资源论证析构恰好一次，再给出旧句柄访问新对象的反例，说明 generation 校验和回绕策略如何改变结果。', 'ownership'),

  L('pmr-budget', 'memory', '把分配策略，提升为可观察的资源。', 'pmr、上游资源、生命周期与内存预算。', [
    S('类型稳定，资源可替换', 'pmr 通过运行时 memory_resource 让同一种容器类型选择不同分配来源，适合请求作用域或分层内存预算。它不是自动托管内存：容器仍须正常析构，资源也必须活得更久。嵌套对象能否使用同一资源取决于它是否支持对应的 allocator 构造，普通 string 不会因为外层容器是 pmr 就自动改用同一资源。'),
    S('固定缓冲区不是默认硬上限', 'monotonic_buffer_resource 用完初始缓冲区后，通常会继续向上游申请。若希望固定预算，可以把上游设为 null_memory_resource，耗尽时通过 bad_alloc 报告。下面将 vector 限制在资源内部作用域，先销毁容器，再销毁资源和缓冲区。release 释放的是存储，不会帮使用这片存储的对象调用析构。', `#include <array>
#include <cstddef>
#include <memory_resource>
#include <vector>
#include <new>
#include <iostream>
int main() {
    alignas(std::max_align_t) std::array<std::byte, 1024> buffer{};
    std::pmr::monotonic_buffer_resource resource(
        buffer.data(), buffer.size(), std::pmr::null_memory_resource());
    try {
        std::pmr::vector<int> values{&resource};
        values.reserve(32);
        for (int i = 0; i < 32; ++i) values.push_back(i);
        std::cout << values.size();
    } catch (const std::bad_alloc&) {
        std::cout << "request budget exhausted";
    }
}`),
    S('测量需要区分逻辑与物理', '统计资源可包裹上游，分别记录申请次数、请求字节、当前未归还字节和峰值。上游保留的块容量、进程工作集与容器逻辑 size 不是同一指标。单调资源的逐次 deallocate 不回收单块，所以容器缩小后资源占用仍可能不降。对跨线程共享的统计器也要同步，并将测量开销从性能结论中分离。'),
  ], [
    Q('pmr::vector 使用一个局部 memory_resource，返回该 vector 后才销毁它是否安全？', ['总是安全，vector 拥有资源对象', '不安全，资源必须覆盖容器的相关使用与析构期', '只要 vector 为空就永远安全'], 1, 'polymorphic_allocator 保存资源指针，并不取得资源对象所有权；操作和析构可能再次访问资源。'),
    Q('给 monotonic_buffer_resource 提供 1 KiB 初始缓冲区，能否直接断言总分配不超过 1 KiB？', ['能', '不能，默认上游可能继续提供内存', '只能在 Release 模式断言'], 1, '初始缓冲区并非硬预算；禁用上游分配或使用具有明确预算的上游资源，才能建立相应上限。'),
  ], ['arena', 'slot-pool'], '画出缓冲区、资源、容器和嵌套元素的销毁顺序；构造一次默认上游扩容与一次硬预算耗尽。分别解释逻辑元素字节、资源保留容量、进程工作集会怎样变化，并设计统计接口记录峰值和失败次数。', 'arena'),

  L('locks-and-thread-lifetime', 'concurrency', '锁保护不变量，线程也需要所有者。', 'mutex、锁顺序、join 与协作停止。', [
    S('先界定共享状态的边界', '数据竞争并不取决于某次运行是否出现错误输出。多个线程对同一内存位置发生冲突访问、至少一次写入且缺少所需同步时，就可能触发未定义行为。mutex 应保护一组共同成立的不变量，所有相关读写都必须遵循同一协议。用 lock_guard 或 scoped_lock 绑定作用域，避免 return 与异常路径漏解锁。'),
    S('一起取得所需锁', '转账等操作需要同时维护两个对象的关系，分别锁住再更新可能暴露中间状态；两个线程按相反顺序持锁又会死锁。scoped_lock 可以一起取得多个不同的 mutex，或为系统规定一致的锁层级。示例先排除自己转给自己，避免对同一非递归锁重复加锁；这里假定金额非负，调用者还应验证余额和溢出。', `#include <mutex>
#include <thread>
struct Account { std::mutex mutex; int balance = 100; };
void transfer(Account& from, Account& to, int amount) {
    if (&from == &to) return;
    std::scoped_lock guard(from.mutex, to.mutex);
    from.balance -= amount;
    to.balance += amount;
}
int main() {
    Account a, b;
    std::jthread first([&] { transfer(a, b, 10); });
    std::jthread second([&] { transfer(b, a, 20); });
} // 线程先析构并 join，随后账户才析构`),
    S('停止请求不是强制终止', 'jthread 在可连接时析构会先请求停止再 join，但 stop_token 依靠工作函数主动检查，不能强行中断任意阻塞调用。线程引用的状态必须存活到 join 完成，析构时也不能持有工作线程正在等待的锁。本机评测尚未运行 ThreadSanitizer，有限用例通过不能证明无数据竞争或无死锁，仍须论证同步关系。'),
  ], [
    Q('两个线程需要同时持有 A 与 B 的 mutex，较合适的做法是什么？', ['各自随意选择顺序', '使用 scoped_lock 同时取得，或遵守统一锁顺序', '只把其中一个指针声明为 volatile'], 1, '联合加锁或一致锁层级可以消除这类相反持锁顺序；volatile 不提供所需的线程同步。'),
    Q('jthread 已请求停止，但工作函数不检查 token 且永久阻塞，会怎样？', ['立刻被强制杀死', '析构中的 join 仍可能一直等待', '自动转成 detached 线程'], 1, '停止是协作协议，join 等待实际线程完成；设计必须包含唤醒和退出条件。'),
  ], ['locked-counter', 'lazy-once'], '列出每个共享字段与保护它的锁，给出相反锁顺序造成死锁的交错，再说明你的方案如何阻断它。绘制线程创建、停止请求、退出、join、共享状态销毁的时间线；区分测试证据与尚需证明的性质。'),

  L('queue-close-protocol', 'concurrency', '等待的不是通知，是一个条件。', '虚假唤醒、有界队列与可结束的生产消费。', [
    S('条件变量不保存业务事件', 'notify 不会像信箱一样积累许可证，等待线程可能被虚假唤醒，也可能在开始等待前就错过一次通知。真正需要保存的是互斥锁保护下的队列状态。使用带谓词的 wait，让线程重新取得锁后检查“有数据或已经关闭”；检查与进入等待必须遵循同一锁协议，才能避免丢失唤醒造成永久睡眠。'),
    S('关闭状态与数据一起保护', '下面演示只消费的队列端：close 在同一把锁下改变 closed，再唤醒所有消费者；pop 在关闭且为空时返回空值，关闭但仍有数据时继续排空。完整有界队列还需要容量、不满条件变量和生产端关闭检查。不要持锁执行用户回调，也不要在仍有线程等待时销毁队列及其条件变量。', `#include <mutex>
#include <condition_variable>
#include <deque>
#include <optional>
class Inbox {
    std::mutex mutex_;
    std::condition_variable ready_;
    std::deque<int> queue_;
    bool closed_ = false;
public:
    std::optional<int> pop() {
        std::unique_lock lock(mutex_);
        ready_.wait(lock, [&] { return closed_ || !queue_.empty(); });
        if (queue_.empty()) return std::nullopt;
        int value = queue_.front();
        queue_.pop_front();
        return value;
    }
    void close() {
        { std::lock_guard lock(mutex_); closed_ = true; }
        ready_.notify_all();
    }
};
int main() { Inbox inbox; inbox.close(); return inbox.pop().has_value(); }`),
    S('背压和退出是一份协议', '有界队列满时可以等待、拒绝或按明确规则丢弃，不能悄悄增长成无界队列。关闭时既要唤醒等待数据的消费者，也要唤醒等待空位的生产者；生产者醒来应拒绝新增，而消费者可按约定排空或放弃。验收要覆盖关闭与入队竞争、多个等待者和重复关闭，并用协议推演补充有限调度测试。'),
  ], [
    Q('wait 返回后为何仍需检查谓词？', ['因为条件变量可能虚假唤醒，其他线程也可能先改变状态', '因为 wait 一定不会重新加锁', '因为 notify 会自动清空队列'], 0, '唤醒只表示重新获得检查机会，不意味着当前线程需要的业务条件一定成立；谓词版本内部会循环检查。'),
    Q('关闭一个已满的有界队列，只唤醒消费者有什么问题？', ['没有问题，生产者会自动收到通知', '等待空位的生产者可能永远阻塞', '所有历史任务一定丢失'], 1, '关闭是两个等待集合共同关心的状态变化，必须使生产者也有机会观察 closed 并退出。'),
  ], ['blocking-queue'], '分别画出空队列等待、满队列等待和关闭时的线程交错；为 push/pop/close 写线性化点及成功、拒绝、排空条件。提出一次会永久挂起的错误实现，说明你的谓词和双向通知为何修复它，再记录重复压力运行结果。', 'queue'),

  L('executor-results', 'concurrency', '提交任务，也要交代结果与结束。', 'future、异常传播、线程池与背压边界。', [
    S('结果通道也是异常通道', 'future 连接生产结果的一端与消费结果的一端，get 会等待共享状态就绪并取得值，若存储了异常则在调用端重新抛出。packaged_task 可以把一次调用的结果或异常写入该状态。它只是任务封装，不会自动创建线程；普通 future 的 get 通常只能消费一次，多个读者应明确选择 shared_future。'),
    S('任务执行在锁之外', '线程池从工作队列移出任务后应先释放队列锁，再调用任务，避免慢任务串行化整个队列或因重入提交造成死锁。下面用一个 jthread 演示异常通过 future 回到调用者，不是完整线程池。C++20 中 packaged_task 只能移动，直接塞入要求可复制目标的 std::function 会遇到约束，队列设计要支持移动任务或明确封装方式。', `#include <future>
#include <thread>
#include <stdexcept>
#include <iostream>
#include <utility>
int main() {
    std::packaged_task<int()> task([]() -> int {
        throw std::runtime_error("task failed");
    });
    auto result = task.get_future();
    std::jthread worker([job = std::move(task)]() mutable { job(); });
    try { std::cout << result.get(); }
    catch (const std::exception& error) { std::cout << error.what(); }
}`),
    S('能接受负载，也要能拒绝负载', '生产级线程池需要明确队列容量、提交失败的反馈，以及关闭时排空还是取消。排队任务被取消后，其结果通道必须按约定结束，不能让调用者永久等待。若工作线程提交子任务后等待，而全部工作线程都在这样等待，就可能饥饿死锁。有限测试不证明所有调度正确；当前 Windows 评测未运行 TSan，需补充协议审查与受支持环境的检测。'),
  ], [
    Q('packaged_task 包装的业务函数抛出异常，正常调用 future::get 时会怎样？', ['自动返回 0', '在 get 的调用线程重新抛出所存储的异常', '异常一定穿透任务调用并终止所有线程'], 1, 'packaged_task 把业务函数的返回值或异常送入共享状态；无效状态、重复调用等属于另外的接口错误。'),
    Q('线程池里每个工作线程都等待一个仍在同池排队的子任务，主要风险是什么？', ['任务自动扩展成无限线程', '没有可用工作线程执行子任务，发生饥饿死锁', 'future 会自动帮忙执行队列'], 1, 'future 的普通等待不提供线程池调度保证；可通过禁止这种等待、任务依赖编排或具有相应协议的执行器解决。'),
  ], ['task-executor', 'blocking-queue'], '为提交、接受、开始、成功、异常、取消、关闭列出状态和结果通道行为；证明每个已接受任务最终只完成一次。构造全员等待子任务的死锁场景，并给出有界容量下的拒绝或等待策略。记录压力测试、异常注入和关闭测试，但注明它们未覆盖全部调度。', 'queue'),
];
