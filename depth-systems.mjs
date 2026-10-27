import {systemLessons} from './academy-systems.mjs';
const H=`#include <algorithm>
#include <array>
#include <atomic>
#include <cassert>
#include <charconv>
#include <cstdint>
#include <functional>
#include <iostream>
#include <limits>
#include <optional>
#include <queue>
#include <span>
#include <stdexcept>
#include <stop_token>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>
#include <coroutine>
#include <exception>
`;
const step=(title,...paragraphs)=>({title,paragraphs});
const pit=(title,badCode,why,fix)=>({title,badCode,why,fix});
const stage=(title,task,deliverables,acceptance,hint,exerciseId)=>({title,task,deliverables,acceptance,hint,exerciseId});
const test=(name,body,expected,explanation)=>({name,body,expected,explanation});
const experiment=(change,prediction,reason)=>({change,prediction,reason});
const example=(title,solution,main,expectedOutput,walkthrough,experiments)=>({title,code:H+'\n'+solution+'\nvoid check_example(bool condition) {\n    assert(condition);\n    if (!condition) throw std::logic_error("example check failed");\n}\nint main() {\n'+main.replace(/\bassert\(/g,'check_example(')+'\n}\n',expectedOutput,walkthrough,experiments});
const workshop=(id,title,subtitle,objective,contract,guide,hints,starter,solution,tests)=>({id:'deep-'+id,title,subtitle,objective,contract,guide,hints,starter,solution,preamble:H,tests});
const sources=id=>systemLessons.find(l=>l.id===id).sources;
export const depthSystems={};

const handoffSolution=String.raw`class OneShot {
    std::array<int, 3> data_{};
    std::atomic<bool> ready_{false};
public:
    void publish(std::array<int, 3> value) {
        data_ = value;
        ready_.store(true, std::memory_order_release);
    }
    bool try_read(std::array<int, 3>& output) const {
        if (!ready_.load(std::memory_order_acquire)) return false;
        output = data_;
        return true;
    }
};`;
depthSystems['atomic-publication']={
goals:['逐事件推导一次发布的 happens-before 链','区分原子标记、普通载荷和协议前提','为不可重复发布的对象设计可审查接口'],
prerequisites:['理解对象生命周期与数据竞争的区别','会使用 jthread 并说明 join 的同步作用'],
derivation:[
step('问题：标记出现时，数据是否准备好了？',
'一个线程计算三个整数，另一个线程只在结果完整后读取。直觉方案是先写数组再设置布尔标记，但源码顺序不等于另一线程可以依赖的可见性。首先列出写载荷、写标记、读标记、读载荷四类事件。把它们放进两条时间线，再问哪些事件由语言规则连接，而不是假设处理器按肉眼顺序交付所有写入。',
'普通布尔标记如果被一方写、另一方无同步地读，本身就可能发生数据竞争。把标记换成原子解决的是标记访问，不会自动解决数组访问。数组仍是普通内存，必须保证其写入先行发生于读取，并且读取期间不存在新的冲突写入。因此本课限制为一次发布，发布后载荷保持不变。'),
step('状态：未发布、已发布与唯一写者',
'初始状态是未发布，读取尝试返回失败。唯一生产者先完整计算结果，再交给发布函数；函数写完数组以后才切换状态。关键不变量不只是标记为真，而是标记一旦变真就不回退，数组也不再修改，且对象活得足够久。消费者的访问许可来自协议状态，不来自数组中是否恰好存在非零数字。',
'失败的读取不得改动调用者的输出数组。这让上层保留旧结果，也让测试清楚区分尚无结果和发布了全零结果。发布者不能在载荷构造一半时暴露标记；若将来载荷类型可能抛出，必须先完成构造，再进行不会失败的状态发布，否则消费者可能见到逻辑上不完整的对象。'),
step('同步：连接线程内顺序与跨线程关系',
'生产者写数组先于 release 存储，消费者通过 acquire 读取到这次存储发布的真值，两次原子操作在这里建立同步。消费者随后读数组，因此前面的普通写入先行发生于后面的普通读取。关系图应分别标注两条线程内顺序边和中间的同步边，不能只写一个没有来源与目标的内存屏障。',
'把观察操作改成 relaxed，标记仍可原子地变真，但上述中间边不再由该操作建立。添加 yield 或 sleep 只影响调度，不建立所需同步。反过来，如果消费者在生产者 join 之后才开始读取，join 可能提供另一条同步链；这种测试会掩盖信箱发布实现中的缺陷，必须单独解释其证据范围。'),
step('实现：一次性接口减少证明义务',
'本课不提供重置，因为重新置假再发布会引入轮次识别：消费者观察的真属于哪一轮，旧读取是否结束，生产者何时能够覆盖数组，都需要额外协议。多轮业务可以采用受锁队列、双缓冲或消费者归还通知，而不是给当前类添加一个随意重置的布尔成员。缩小接口也是减少必须证明的状态数量。',
'多个消费者可在发布后读取，因为它们不再修改载荷，但发布仍仅允许一次且只有一个生产者。析构不能与任何访问重叠。上述条件必须写进契约，函数签名无法自动验证。实际工程还需要上层所有权负责保活，原子标记不会延长信箱和被借用载荷的生命周期，也不会阻止另一个线程销毁对象。'),
step('验证：结果测试与同步证明分别提交',
'测试检查未发布时输出保持、三个字段完整以及重复读取一致。并发压力只能增加交错机会寻找反例，有限运行没有覆盖所有调度。日志锁、完成标记和 join 还可能补足缺失同步，所以必须审查测试是否无意改变了待验证协议。一次没有崩溃的实验，不能用作普通内存不存在竞争的证明。',
'人工验收要求画出先行发生关系，并列出一次发布、单写者、发布后不可变、对象保活四项前提。本机 Windows 没有执行 ThreadSanitizer，只能报告实际完成的功能检查。在支持平台运行检测器且未报告，也只是未观察到检测范围内的违例，不能替代同步推导，更不能证明并发回收安全。')
],
example:example('一次发布三字段载荷',handoffSolution,String.raw`    OneShot box;
    std::array<int, 3> output{9, 9, 9};
    assert(!box.try_read(output));
    assert((output == std::array<int, 3>{9, 9, 9}));
    box.publish({10, 20, 30});
    assert(box.try_read(output));
    assert((output == std::array<int, 3>{10, 20, 30}));
    std::cout << output[0] << ' ' << output[1] << ' ' << output[2] << '\n';`,'10 20 30\n',
['构造时标记为假，尚未对消费者发布。','首次读取失败，输出旧值保持。','发布先写三个字段，再 release 切换状态。','读取真后复制载荷；此顺序示例展示状态语义，并发正确性另按关系图论证。'],
[experiment('将初始输出换成三个负数','发布前读取仍失败且负数保持','失败路径在修改输出前返回。'),experiment('发布后重复读取五次','五次得到相同字段','一次性契约规定载荷不再修改。')]),
pitfalls:[
pit('原子标记不等于载荷发布',String.raw`ready.store(true, std::memory_order_relaxed);
// 另一线程看到真后读取普通 data：缺少本协议的同步。`,'relaxed 不建立本例普通载荷的跨线程发布关系；错误并发反例不执行。','按协议使用 release/acquire，另写关系推导。'),
pit('重置不能收回读取许可',String.raw`ready.store(false);
data = next; // 旧消费者可能仍在复制。`,'置假不能撤销已经获得许可的消费者，覆盖可能与旧读取冲突。','保留一次性契约，或设计显式归还和轮次。'),
pit('测试补足了同步',String.raw`producer.join();
box.try_read(output);`,'此测试能验证结果，不能独立区分正确发布与被 join 补足同步的实现。','将功能结果和内存模型审查分开报告。')
],
stages:[
stage('机制 · 一次发布','标出四类事件并实现一次性读取。',['事件关系图','信箱状态契约'],['失败读取不修改输出','逐边解释写入如何先行发生于读取'],'从不可变载荷开始，不添加 reset。','release-publish'),
stage('边界 · 观察失败','检查未发布、零值、负值和重复读取。',['边界测试表','测试自身同步说明'],['字段完整保留','区分尚未发布和全零结果'],'预置哨兵输出，检查失败路径。','deep-atomic-publication'),
stage('工程 · 保活与关闭','设计异步配置快照的所有权和关闭流程。',['所有权图','轮次与关闭文档'],['所有读取期间对象存活','明确动态检查不能证明的关系'],'先确认谁持有对象，再设计通知。','deep-atomic-publication')
],
workshop:workshop('atomic-publication','一次性快照信箱','原子发布 × 失败输出契约','实现 OneShot，一次发布三个整数，发布后可以重复读取。',['一个生产者，publish 最多调用一次，发布后不再写载荷。','try_read 失败保持输出，成功返回完整数组。','销毁不与访问并发；内存序另需人工论证。'],['数组完整写入后再发布。','观察到发布后才能复制载荷。'],['失败分支先返回。','标记原子不代表数组自然同步。'],
String.raw`class OneShot {
public:
    void publish(std::array<int, 3>) {}
    bool try_read(std::array<int, 3>&) const { return false; }
};`,handoffSolution,[
test('未发布保留输出','OneShot b;std::array<int,3> o{7,8,9};std::cout<<b.try_read(o)<<" "<<o[0]<<" "<<o[2];','0 7 9','失败不污染旧结果。'),
test('完整发布','OneShot b;b.publish({3,-2,10});std::array<int,3> o{};bool ok=b.try_read(o);std::cout<<ok<<" "<<o[0]<<" "<<o[1]<<" "<<o[2];','1 3 -2 10','复制真实载荷。'),
test('重复观察','OneShot b;b.publish({0,0,0});std::array<int,3>a{1,2,3},c{4,5,6};std::cout<<b.try_read(a)<<" "<<b.try_read(c)<<" "<<(a==c)<<" "<<a[2];','1 1 1 0','全零载荷与未发布不同。'),
test('跨线程结果','OneShot b;std::jthread p([&]{b.publish({11,22,33});});p.join();std::array<int,3>a{};std::cout<<b.try_read(a)<<" "<<a[0]+a[1]+a[2];','1 66','检查跨线程结果；join 自带同步，不能据此证明信箱内存序。')
]),sourceRefs:sources('atomic-publication')
};

const batchQueueSolution=String.raw`class BatchQueue {
    std::array<int, 4> slots_{};
    std::atomic<std::size_t> head_{0}, tail_{0};
public:
    bool push(int value) {
        auto tail = tail_.load(std::memory_order_relaxed);
        auto next = (tail + 1) % slots_.size();
        if (next == head_.load(std::memory_order_acquire)) return false;
        slots_[tail] = value;
        tail_.store(next, std::memory_order_release);
        return true;
    }
    std::vector<int> pop_up_to(std::size_t limit) {
        std::vector<int> result;
        const auto batch = std::min(limit, slots_.size() - 1);
        result.reserve(batch);
        auto head = head_.load(std::memory_order_relaxed);
        while (result.size() < batch) {
            auto tail = tail_.load(std::memory_order_acquire);
            if (head == tail) break;
            result.push_back(slots_[head]);
            head = (head + 1) % slots_.size();
            head_.store(head, std::memory_order_release);
        }
        return result;
    }
};`;
depthSystems['atomic-spsc']={
goals:['推导发布和归还两个同步方向','定义批量读取的容量与异常语义','识别 SPSC 与多生产者算法的边界'],
prerequisites:['会解释 release/acquire 发布链','理解保留空槽的环形数组'],
derivation:[
step('问题：批量读取不能越过槽位所有权',
'消费者希望一次取若干事件以减少接口开销，但底层仍需逐槽位保证合法访问。数组长四且保留空槽，可同时存三项。先区分已发布未读、已读完可复用和尚未使用三种槽位。不能按数组里有没有数值判断状态，因为旧值仍然留在存储里，真正的访问许可来自头尾索引与协议。',
'最多读取接口不承诺获取调用瞬间的精确快照。生产者可能在消费过程中继续发布，消费者可以看到这些新项，直到到达上限或观察到空。这让实现简单，却要求调用者不要把返回集合当作某个全局时间点的全部队列内容。首先定义这个可观察行为，再讨论是否需要缓存尾游标。'),
step('不变量：两端各自独占一个游标',
'唯一生产者修改尾游标，唯一消费者修改头游标。读取自己独占修改的游标只需获得自己此前写入的值。写方计算下一尾位置，若等于观察到的头则暂时判满；读方在头等于观察到的尾时暂时判空。索引按数组长度回绕，数值零不是一次新的对象生命周期，也不表示数据尚未初始化。',
'保留空槽让头尾相等唯一代表空，代价是容量少一。已发布元素按环形顺序位于头到尾之前，消费也按此顺序推进。禁止第二个生产者或消费者不是任意限制，而是证明依赖的独占写前提；破坏它后两个调用者可能读写同一普通槽位，单纯把所有内存序加强也不能修复槽位分配冲突。'),
step('同步：元素发布与槽位归还分别证明',
'写方先写槽位，再 release 推进尾；读方 acquire 观察尾前进后读取元素，建立载荷写入到读取的先行发生。读完以后消费者 release 推进头，生产者 acquire 观察头前进后才复用该槽位。后一条归还链保护下一轮覆盖不会与上一轮读取重叠，不能把它省略成一句读索引不重要。',
'读取较旧的对方游标可以造成保守地返回满或空，却不能使某一方越过尚未获得的访问许可。若接口要求等待成功，需要另外设计等待、唤醒和关闭。忙等次数不应成为正确性条件；线程调度缓慢也不等于队列中不存在数据。任何缓存或削弱对端游标加载的优化，都要重新检查这两条同步链。'),
step('实现：分配失败不能半途改变消费承诺',
'批量结果最多三项，所以在消费前按有效容量与上限的较小值预留空间。预留若抛出，头游标尚未推进，队列保持不变。随后加入整数不再需要扩容，可在复制每项后归还槽位。若推广为复杂类型，复制、移动和析构都有新的失败可能，不能把只针对整数的异常分析直接当成通用容器保证。',
'读取上限为零时必须得到空集合且不消费；上限极大时也不能按这个数申请内存。它是逻辑数量限制，不是调用者授权申请的存储容量。测试应交错部分读取和再次写入，迫使尾游标回绕，检查返回顺序依然是先进先出，而不是按物理数组地址从小到大遍历残留值。'),
step('验收：不加锁标签不能代替进展证明',
'没有显式互斥锁不意味着目标平台的所有原子实现都无锁，返回的动态数组还会进行分配，因此不能不加限定地宣传整个接口无锁。批量形式是否更快也要测量真实负载、分配次数和尾延迟。功能输出只能验证观察到的队列顺序，不应使用单次运行耗时来评判算法复杂度或并发性能。',
'压力测试能寻找丢项、重项和乱序的反例，无法覆盖所有线程交错。本例存储固定随队列存在，没有通用节点回收；销毁仍要求两端停止访问。当前 Windows 没有运行 TSan，人工验收应另交两个方向的同步链、每个槽位的所有者以及上层停止生产、排空消费、最后销毁的明确顺序。')
],
example:example('回绕之后仍保持 FIFO',batchQueueSolution,String.raw`    BatchQueue queue;
    assert(queue.push(10) && queue.push(20) && queue.push(30));
    assert(!queue.push(40));
    auto first = queue.pop_up_to(2);
    assert((first == std::vector<int>{10, 20}));
    assert(queue.push(40) && queue.push(50));
    auto second = queue.pop_up_to(9);
    assert((second == std::vector<int>{30, 40, 50}));
    for (int v : first) std::cout << v << ' ';
    for (std::size_t i=0; i<second.size(); ++i)
        std::cout << second[i] << (i+1==second.size()?'\n':' ');`,'10 20 30 40 50\n',
['三次写入填满有效容量，第四次拒绝。','读两项后归还两槽，头前移。','再写两项使尾在数组边界回绕。','最后结果顺序由逻辑队列决定，与物理地址排序不同。'],
[experiment('第一次读取上限改成零','未消费，后续写入仍会因满失败','零上限不推进头，相关断言需按新操作序列调整。'),experiment('最终上限改成 size_t 最大值','只取实际三项','预留数量受有效容量限制。')]),
pitfalls:[
pit('忘记归还同步','head.store(next, std::memory_order_relaxed);','无法按本协议推出旧读取与下一轮覆盖的先行发生；错误并发反例不执行。','读取后 release 归还，写方 acquire 观察。'),
pit('批量结果冒充瞬时快照','auto all = queue.pop_up_to(1000);','循环可能读到调用后才发布的项，接口没有定义统一快照时刻。','明确最多读取语义，需要快照时另设观察边界。'),
pit('按上限分配','result.reserve(limit);','巨大读取上限可能造成无意义分配失败。','按上限与有效容量的较小值预留。')
],
stages:[
stage('机制 · 槽位交接','跟踪同一槽位两轮读写。',['双向同步图','容量定义'],['说明四槽为何容量三','解释归还与发布的区别'],'不要只看第一次写入。','spsc-queue'),
stage('边界 · 批量回绕','实现零上限、巨大上限和部分读取。',['批量实现','回绕操作表'],['先进先出不丢不重','失败写入和零读取不改变内容'],'先按顺序参考模型核对游标。','deep-atomic-spsc'),
stage('工程 · 关闭通道','定义停止生产、排空和销毁流程。',['生命周期图','分离的性能与正确性报告'],['销毁时无活动访问','不把压力测试当作同步证明'],'先约束谁通知结束。','deep-atomic-spsc')
],
workshop:workshop('atomic-spsc','支持批量读取的 SPSC 队列','固定容量 × FIFO × 双向同步','实现四个物理槽位、有效容量三的 BatchQueue。',['一个生产者和一个消费者，析构不与访问重叠。','push 满时返回 false，不覆盖未读值。','pop_up_to 每批最多 min(limit,3) 项，零上限无副作用，非瞬时快照。','分配失败应在消费前发生，消费过程中不再扩容。'],['分别推导发布与归还。','先预留最多三项，并把本批读取上限也限制为该数量。'],['自己的游标可 relaxed。','四槽不等于存四项。'],
String.raw`class BatchQueue {
public:
    bool push(int) { return false; }
    std::vector<int> pop_up_to(std::size_t) { return {}; }
};`,batchQueueSolution,[
test('满边界','BatchQueue q;std::cout<<q.push(1)<<q.push(2)<<q.push(3)<<q.push(4);','1110','只有三项容量。'),
test('部分读取与回绕','BatchQueue q;q.push(1);q.push(2);q.push(3);auto a=q.pop_up_to(2);q.push(4);q.push(5);auto b=q.pop_up_to(10);for(int v:a)std::cout<<v;std::cout<<" ";for(int v:b)std::cout<<v;','12 345','回绕不改变逻辑顺序。'),
test('零与巨大上限','BatchQueue q;q.push(8);std::cout<<q.pop_up_to(0).size()<<" ";auto a=q.pop_up_to(std::numeric_limits<std::size_t>::max());std::cout<<a.size()<<" "<<(a.empty()?0:a[0])<<" "<<q.pop_up_to(2).size();','0 1 8 0','上限不是申请规模。')
]),sourceRefs:sources('atomic-spsc')
};

const creditSolution=String.raw`class CreditPool {
    const unsigned capacity_;
    std::atomic<unsigned> available_;
public:
    explicit CreditPool(unsigned c) : capacity_(c), available_(c) {}
    bool acquire(unsigned amount) {
        auto old = available_.load(std::memory_order_relaxed);
        while (old >= amount)
            if (available_.compare_exchange_weak(old, old-amount,
                std::memory_order_relaxed, std::memory_order_relaxed)) return true;
        return false;
    }
    bool release(unsigned amount) {
        auto old = available_.load(std::memory_order_relaxed);
        while (amount <= capacity_-old)
            if (available_.compare_exchange_weak(old, old+amount,
                std::memory_order_relaxed, std::memory_order_relaxed)) return true;
        return false;
    }
    unsigned available() const { return available_.load(std::memory_order_relaxed); }
};`;
depthSystems['atomic-cas-reclamation']={
goals:['从状态区间推导 CAS 重试与溢出保护','区分数字额度、资源所有权与回收','解释 ABA 防护不等于生命周期保护'],
prerequisites:['了解原子比较交换接口','会分析无符号整数回绕'],
derivation:[
step('问题：先看再扣会丢失更新',
'多个线程申请固定容量的额度。先读取可用量，判断足够，再存储扣减结果，即使每一步单独使用原子操作，也可能覆盖其他线程的更新。业务需要把依据旧值作出的检查和更新连接成一个不可分割的转换；比较交换允许线程在提交时验证据以决策的状态是否仍然有效，而不只是使用某个曾经正确的数字。',
'本题额度只是一项数值资源，不指向具体对象，也不承担普通内存发布。成功申请不等于获得缓冲区的读取权限，归还也不表示另一个对象已经安全析构。故意限制为独立计数后才能合理讨论 relaxed；把同一代码放进对象池时，槽位可见性、初始化完成与最终回收都需要额外协议。'),
step('不变量：可用量保持在容量区间',
'构造时可用量等于容量，所有成功操作都应保持零到容量的闭区间。申请前检查旧值不少于申请量，再计算差；归还前检查归还量不超过容量减旧值，再计算和。这种先比较差值的顺序避免加法先发生无符号回绕。零份申请和归还定义为合法成功且不改变状态，使边界可以一致处理。',
'归还只检查总量，未记录调用者是否曾申请，因此不能独自防止某个调用者归还别人的额度。范围不变量和资源责任是两种不同约束。若需要每份额度只归还一次，应返回不可复制的租约并在析构时释放，或跟踪身份。不能把原子数字永不超范围包装成完整的所有权管理与审计。'),
step('重试：失败后重新判断最新观察',
'弱比较交换成功时把旧值替换成新值，失败时更新 expected，并允许伪失败。因此循环要依据更新后的旧值重新检查条件和计算新值。竞争者已经耗尽额度时自然返回失败，伪失败而条件仍满足时继续尝试。若只重试旧的 desired 而不重新推导，就可能把基于过期状态的结果提交到新状态上。',
'成功比较交换是这次申请或归还的状态提交点。失败返回只表示某次观察下条件不满足，不承诺返回之后仍然不足，别的线程可以马上归还。这适合尝试接口；等待接口需要另外的通知、停止和公平性设计。一个循环没有互斥锁，也不能直接推出任何线程都能在固定步数内完成。'),
step('ABA：数字回来不代表旧对象还活着',
'本例允许额度先减后加回到原值，因为业务由当前数值决定，中间变化不使当前申请非法。但指针结构不同：地址从一个值变化后又恢复时，原节点可能已被销毁，新节点只是复用地址。比较地址成功不能证明此前读取的字段仍属于同一对象，更不能保证再次解引用时节点尚未回收。',
'版本标记能帮助发现一部分历史变化，却不延长对象生命，也需要解释计数回绕。危险指针或基于时代的回收必须规定宣布访问、退休节点、最终释放以及线程退出的完整协议。重复运行没有崩溃不是安全回收证明。把数值 CAS 例子机械替换成裸指针更新，会跳过本课刻意未处理的生命责任。'),
step('取舍：数值协议与资源系统分开验收',
'这里维护单个原子数字，没有需要借此发布的普通载荷，因此 relaxed 足以表达数值变化。如果将成功申请用作读取另一线程数据的许可，就必须指出与哪次 release 配对、保护哪些数据以及何时归还。内存序应由可见性需求推导，不能先挑选看似最快的选项，再希望测试替它补出不存在的关系。',
'自动验收覆盖耗尽、超额归还、零操作和整数边界，也可检查并发申请后的守恒结果，但有限交错无法证明进展、无饥饿或节点回收。目标平台的原子实现是否无锁也需独立证据。报告分别列出范围不变量、提交点、上层租约责任和平台诊断结果；当前 Windows 没有运行 ThreadSanitizer。')
],
example:example('额度申请、拒绝与归还',creditSolution,String.raw`    CreditPool pool(5);
    assert(pool.acquire(3));
    assert(!pool.acquire(3));
    assert(pool.release(2));
    assert(!pool.release(2));
    assert(pool.acquire(0));
    assert(pool.available()==4);
    std::cout<<pool.available()<<'\n';`,'4\n',
['扣三后剩二。','第二次申请三被拒绝。','归还二后剩四，再归还二超容量。','零操作成功不变值，不借额度发布其他对象。'],
[experiment('容量改为零，只申请和归还零','均成功且保持零','操作符合闭区间不变量。'),experiment('容量五可用四时归还 unsigned 最大值','失败且保持四','先比较容量差再相加避免回绕。')]),
pitfalls:[
pit('先加载后无条件存储','auto old=available.load(); if(old>=n) available.store(old-n);','两次操作间其他线程可更新，存储会丢失它的变化。','CAS 失败后重新判断和计算。'),
pit('先做可能回绕的加法','if(old+n<=capacity) { /* release */ }','加法可能先回绕，超大归还量反而通过检查。','先验证 n<=capacity-old。'),
pit('版本号当保活工具','auto* p=tagged.pointer; use(p->value);','只校验版本没有阻止并发回收；悬空访问反例不执行。','使用完整回收协议，或采用明确持锁方案。')
],
stages:[
stage('机制 · 区间不变量','实现尝试申请和归还。',['状态转换表','失败重试图'],['无下溢','无超容量'],'先确定合法转换再计算。','deep-atomic-cas-reclamation'),
stage('边界 · 重试与回绕','覆盖零容量和超大数值。',['边界用例','提交点说明'],['失败不改变额度','危险算术发生在验证后'],'选接近整数上界的值。','deep-atomic-cas-reclamation'),
stage('工程 · 额度租约','设计不可复制租约与关闭方案。',['租约所有权图','与回收问题的边界说明'],['不会重复归还','不宣称数字 CAS 解决指针回收'],'把计数与实际资源生命画成两条线。','deep-atomic-cas-reclamation')
],
workshop:workshop('atomic-cas-reclamation','原子额度池','CAS 重试 × 范围不变量','实现 CreditPool 的 acquire、release、available。',['容量固定，可用量处于零到容量。','不足或归还超容量返回 false 且状态不变；零操作成功。','不跟踪申请者身份，不发布普通载荷，不实现等待和节点回收。'],['先推导安全算术，再组织 CAS 循环。','失败观察值必须重新检查。'],['归还比较 amount<=capacity-old。','当前仅为独立数字协议。'],
String.raw`class CreditPool {
    unsigned value_;
public:
    explicit CreditPool(unsigned c):value_(c){}
    bool acquire(unsigned){return false;}
    bool release(unsigned){return false;}
    unsigned available()const{return value_;}
};`,creditSolution,[
test('耗尽','CreditPool p(5);std::cout<<p.acquire(3)<<p.acquire(3)<<" "<<p.available()<<" "<<p.acquire(2)<<" "<<p.available();','10 2 1 0','失败不消耗剩余。'),
test('归还防溢出','CreditPool p(5);p.acquire(4);std::cout<<p.release(3)<<" "<<p.available()<<" "<<p.release(std::numeric_limits<unsigned>::max())<<" "<<p.available();','1 4 0 4','巨大归还不能回绕通过。'),
test('零容量','CreditPool p(0);std::cout<<p.acquire(0)<<p.release(0)<<p.acquire(1)<<p.release(1)<<" "<<p.available();','1100 0','零操作合法，正量不能突破容量。')
]),sourceRefs:sources('atomic-cas-reclamation')
};

const layoutSolution=String.raw`bool step_selected(std::vector<float>& position,
                   const std::vector<float>& velocity,
                   const std::vector<std::size_t>& selected, float dt) {
    if (position.size()!=velocity.size()) return false;
    for (auto i:selected) if (i>=position.size()) return false;
    for (auto i:selected) position[i]+=velocity[i]*dt;
    return true;
}`;
depthSystems['performance-data-layout']={
goals:['把字段访问模式转换成布局选择','维护分离字段的长度与身份不变量','区分语义等价测试与性能实验'],
prerequisites:['理解 vector 连续存储和扩容失效','能够描述业务循环实际读取的字段'],
derivation:[
step('问题：更新位置为什么读了许多无关数据',
'假设每个实体含位置、速度、名称、状态和渲染资源，而某一轮只更新位置。按对象排列便于一次访问对象全部字段，却可能在扫描时带入无关数据。不能看到结构体很大就直接判定布局错误；先统计每轮访问字段、实体数量、筛选比例与访问顺序，明确目标是减少无关搬运还是改善连续计算。',
'把位置与速度分成数组后，更新循环能够连续读取所需字段，但同一实体的所有属性不再天然聚集。其他需要逐个对象处理全部字段的阶段可能受损，所以布局选择必须结合整条流水线。优化对象不是某段看起来漂亮的循环，而是具有明确输入分布和成本边界的实际工作负载。'),
step('状态：同一下标必须保持同一实体含义',
'两个字段数组长度相等只是最低要求，还需保证同一下标表示同一实体。插入、删除、排序和压缩都必须同时维护映射，否则数组仍然没有越界却会把甲的位置配上乙的速度。工程上应通过统一容器接口封装这些操作，避免业务层直接分别修改两个向量，然后靠开发者记住它们必须同步。',
'本课先限定没有结构修改，只更新给定索引列表。接口验证全部索引后再写任何位置，避免前半段更新成功、后半段越界失败造成半更新。重复索引被定义为重复应用同一更新，因此结果依赖列表中的出现次数。这不是最优业务约定，而是需要明确写出的语义，不能让测试与实现各自猜测是否去重。'),
step('实现：让检查顺序保护失败状态',
'首先检查字段长度，再遍历索引验证范围，全部通过后才执行更新。失败返回假且位置数组原样保持，速度数组不修改。这里依赖浮点赋值本身不抛出，且没有在更新循环中再做动态分配。若将更新换成可能抛出的用户回调，这个两遍结构便不足以提供同样的强状态保证，需要副本提交或回滚。',
'位置与速度在本课契约中必须是不同向量对象，避免写入位置后同时改变随后读取的速度。即使类型分别表现为可写引用和只读引用，也不能从签名自动推出二者不别名。数值输入还应限制为业务可接受的有限值，说明浮点舍入和误差要求；用更激进的向量化或重排时必须重新审视等价标准。'),
step('证据：先证明语义，再比较布局成本',
'功能测试检查选择集合、重复索引、零步长以及非法请求不修改状态，使用能够精确表示的数值避免把表示误差误判成逻辑缺陷。这些结果不证明分离布局更快，也不证明编译器生成了向量指令。性能实验应在相同机器、编译器选项、数据集和计时边界下比较，保留原始样本与完整负载表现。',
'渐进复杂度从两次索引遍历推导为与选中数量线性相关，不能从某个运行时间阈值证明。空间布局优化主要改变常数与硬件行为，选择很稀疏时随机访问仍可能主导成本。综合项目应额外衡量插删维护、映射存储和下游阶段开销，并解释局部收益是否抵消了整条管线新增的成本。')
],
example:example('选中实体的事务式边界验证',layoutSolution,String.raw`    std::vector<float> x{1,4,8}, v{2,-2,4};
    assert(step_selected(x,v,{0,2},0.5f));
    assert((x==std::vector<float>{2,4,10}));
    auto before=x;
    assert(!step_selected(x,v,{1,9},1.0f));
    assert(x==before);
    for(std::size_t i=0;i<x.size();++i)
        std::cout<<x[i]<<(i+1==x.size()?'\n':' ');`,'2 4 10\n',
['两个向量长度一致，每个索引表示同一实体。','验证索引零和二后才开始写入。','位置一未被选中，因此保持四。','第二次请求包含越界索引，全部修改被拒绝而不是只拒绝后半段。'],
[experiment('将选择列表改成 {0,0}','位置零会更新两次','契约按列表逐项应用，不进行去重。'),experiment('将步长改成零','合法请求成功但位置不变','语义为加上速度乘零。')]),
pitfalls:[
pit('边查边写破坏失败原子性','for(auto i:ids){ if(i>=x.size()) return false; x[i]+=v[i]*dt; }','非法索引之前的字段已经改变，失败不再表示原状态保持。','先验证完整列表，再执行无失败的更新阶段。'),
pit('字段数组身份错位','erase(position.begin()); // velocity 没有同步删除','不越界也会关联错误实体。','把结构修改封装进统一接口并维护身份映射。'),
pit('由布局名直接推断性能','// SoA 比 AoS 快，因此不测量其他阶段。','访问分布、缓存和维护成本决定结果，布局名字不是性能证据。','语义测试独立运行，再用完整负载收集样本。')
],
stages:[
stage('机制 · 字段访问表','记录一轮业务真正读取和写入的字段。',['字段访问表','布局草图'],['说明索引如何关联实体','列出至少一个可能受损阶段'],'先数访问，再讨论缓存。','soa-step'),
stage('边界 · 选中更新','实现整批验证后更新，并明确重复索引。',['函数实现','非法请求状态测试'],['错误请求不修改位置','重复索引遵循约定'],'把检查和提交分成两段。','deep-performance-data-layout'),
stage('工程 · 布局对照实验','比较原布局和字段分离布局的完整流水线。',['可复现实验计划','操作次数推导'],['不使用时间阈值当功能判定','记录映射与维护成本'],'让原始样本和语义测试成为两份证据。','deep-performance-data-layout')
],
workshop:workshop('performance-data-layout','选中实体更新器','SoA 不变量 × 批量验证','实现 step_selected，更新指定位置字段。',['位置与速度为不同向量，输入数值有限。','长度不等或任何索引越界返回 false，位置完整保持。','合法请求按列表顺序逐项更新，重复索引重复应用。','只验证语义，不用时间阈值评价性能。'],['验证长度和所有索引后再修改。','保留未选中的字段。'],['先检查整个请求。','不要悄悄对索引去重。'],
String.raw`bool step_selected(std::vector<float>&,const std::vector<float>&,
const std::vector<std::size_t>&,float){return false;}`,layoutSolution,[
test('选中字段','std::vector<float>x{1,4,8},v{2,-2,4};std::cout<<step_selected(x,v,{0,2},0.5f);for(auto n:x)std::cout<<" "<<n;','1 2 4 10','只更新选中项。'),
test('后段非法保持原状','std::vector<float>x{1,2},v{3,4};std::cout<<step_selected(x,v,{0,9},1);for(auto n:x)std::cout<<" "<<n;','0 1 2','完整验证后才更新。'),
test('重复与空选择','std::vector<float>x{1},v{2};std::cout<<step_selected(x,v,{0,0},1)<<" "<<x[0]<<" "<<step_selected(x,v,{},1);','1 5 1','重复按出现次数应用，空请求成功。'),
test('长度不符','std::vector<float>x{1,2},v{3};std::cout<<step_selected(x,v,{0},1)<<" "<<x[0];','0 1','长度不变量先于索引更新。')
]),sourceRefs:sources('performance-data-layout')
};

const shardsSolution=String.raw`class ShardedCounters {
    struct alignas(64) Shard { std::uint64_t value=0; };
    std::vector<Shard> shards_;
public:
    explicit ShardedCounters(std::size_t n):shards_(n){}
    bool add(std::size_t index,std::uint64_t delta) {
        if(index>=shards_.size()) return false;
        auto& value=shards_[index].value;
        if(delta>std::numeric_limits<std::uint64_t>::max()-value) return false;
        value+=delta; return true;
    }
    std::optional<std::uint64_t> total() const {
        std::uint64_t sum=0;
        for(const auto& shard:shards_) {
            if(shard.value>std::numeric_limits<std::uint64_t>::max()-sum)
                return std::nullopt;
            sum+=shard.value;
        }
        return sum;
    }
};`;
depthSystems['performance-contention']={
goals:['区分数据竞争、真共享与伪共享','利用单写者分片减少共享更新','明确静止汇总与整数溢出的契约'],
prerequisites:['理解不同内存位置与线程同步','会使用 join 建立工作完成边界'],
derivation:[
step('问题：没有竞争错误也可能很慢',
'多个线程各自更新不同原子计数，语言层面可以没有数据竞争，硬件却可能因为它们落在同一缓存一致性区域而反复转移缓存线。真共享是大家确实需要同一个状态，伪共享是逻辑独立的字段碰巧相邻。两者都不应凭一张地址图断言耗时，首先确认工作负载是否真的频繁写入这些状态。',
'一种重构是为每个工作线程分配独立计数，线程只更新自己的分片，完成后统一汇总。它改变了观察语义：运行中不再提供立即一致的总数。如果业务必须实时读取总数，就要另设快照或同步；不能为了省去原子开销，悄悄把原本并发可读的接口改成有数据竞争的普通整数读取。'),
step('不变量：每个分片同一时刻只有一个写者',
'本课用普通无符号计数，因为契约要求每个索引只有一个线程写入，汇总只能在所有写入停止后进行。向量在构造时一次创建，工作期间不扩容、不移动，不改变索引到线程的分配。若两个线程误用同一索引，或者另一个线程同时调用汇总，这个契约就失效；对齐本身不会提供任何同步。',
'示例通过工作线程 join 后再汇总建立明确完成边界，主线程此时才能读取各个普通计数。失败的 add 不得改变分片，超出索引范围直接拒绝，数值加法前检查剩余空间。局部计数各自不溢出还不代表总和可表示，因此汇总也逐项检查，超过总类型范围时返回空结果而不是回绕后的假小值。'),
step('实现：隔离布局是可测假设',
'每个分片按六十四字节对齐，使演示中的对象起点遵循固定间距约束，但六十四不是所有机器的缓存线保证。增加填充会扩大占用，可能让读取阶段的缓存密度变差。若线程只写一次，布局调整可能没有收益；若有大量随机访问，其他成本也可能压过一致性通信。因此不能在函数正确性测试中断言一定更快。',
'分片策略还可能引入合并延迟、线程数量变化和索引复用管理。线程池可以按稳定工作者编号分配槽位，而临时线程需要租约，确保同一槽位不会在旧写者退出前交给新写者。原子计数与分片计数各有适用边界，选择依据应是总数需要何种实时性、写入频率以及可以接受的内存成本。'),
step('验收：结果、同步与性能分别记录',
'自动测试先验证多分片相加、非法索引、单分片溢出和总和溢出。跨线程示例只在 join 后读取，所以输出确定，不通过随机读取来碰运气。人工报告应指出唯一写者的分配规则和汇总前的完成关系；如果将来需要在线汇总，就必须重新选择原子、锁或发布快照协议，而不只是增加测试次数。',
'性能比较应包含共享原子、普通分片、带填充分片等候选，使用相同线程数和工作量，记录内存、吞吐与延迟样本。不要用某个耗时阈值作为本题通过条件。有限功能测试不证明伪共享已被消除，也不证明无饥饿；本机未运行 TSan，所有正确性结论都应限定在明确契约和实际验证范围内。')
],
example:example('工作结束后汇总分片',shardsSolution,String.raw`    ShardedCounters counters(2);
    std::jthread a([&]{for(int i=0;i<1000;++i) assert(counters.add(0,1));});
    std::jthread b([&]{for(int i=0;i<1000;++i) assert(counters.add(1,2));});
    a.join(); b.join();
    auto total=counters.total();
    assert(total && *total==3000);
    std::cout<<*total<<'\n';`,'3000\n',
['两个索引分别分配给一个工作者。','不同线程只写自己分片，没有运行中汇总。','join 等待两者完成并建立观察完成结果的边界。','总和按检查过的算术累加，结果为三千。'],
[experiment('将第二个线程增量改为零','总和变成一千','零增量合法但不改变分片。'),experiment('在同一分片先加入最大值再加入一','第二次拒绝，原值保持','加法前检查剩余表示范围。')]),
pitfalls:[
pit('对齐冒充同步','alignas(64) int count; // 多线程仍直接 count++','对齐不使普通读写原子化，也不建立先行发生；错误反例不执行。','维护唯一写者，或使用合适同步。'),
pit('工作未结束就汇总','auto total=counters.total(); // 工作线程仍写普通分片','普通读取可能与写入竞争；此反例不执行。','先完成线程或建立可论证的快照协议。'),
pit('只检查局部不检查总和','sum += shard.value;','各分片合法但总和仍可能回绕。','汇总时逐项检查剩余空间。')
],
stages:[
stage('机制 · 分配唯一写者','定义索引到工作者映射和汇总时机。',['映射表','完成关系图'],['每槽只有一个写者','读取发生在全部写入完成后'],'对齐不是同步。','deep-performance-contention'),
stage('边界 · 两层溢出','实现局部与总和检查。',['计数实现','溢出用例'],['失败加法不改值','总和溢出可明确识别'],'分别分析局部上界和全局上界。','deep-performance-contention'),
stage('工程 · 成本对照','比较三种计数方案。',['基准方案','实时性与内存取舍报告'],['不用时间阈值代替正确性','记录运行中观察语义差别'],'先定义需要多新的总数。','deep-performance-contention')
],
workshop:workshop('performance-contention','带检查的分片计数器','单写者 × 静止汇总','实现 ShardedCounters，每个索引独占写，全部写入停止后才汇总。',['add 越界或单项溢出返回 false 且保持原值。','total 返回总和；总和溢出返回 nullopt；空集合总和为零。','同一索引只有一个写者，total 不与写入并发。','对齐是实验假设，测试不评价速度。'],['保持容器结构在工作期间固定。','局部和总和分别做加法前检查。'],['join 后才读取普通分片。','最大值减旧值可用于检查。'],
String.raw`class ShardedCounters {
public:
    explicit ShardedCounters(std::size_t){}
    bool add(std::size_t,std::uint64_t){return false;}
    std::optional<std::uint64_t> total()const{return 0;}
};`,shardsSolution,[
test('正常汇总','ShardedCounters c(2);std::cout<<c.add(0,7)<<c.add(1,9)<<" ";auto t=c.total();std::cout<<(t?*t:0);','11 16','两个分片独立累计。'),
test('非法与局部溢出','ShardedCounters c(1);std::cout<<c.add(9,1)<<c.add(0,std::numeric_limits<std::uint64_t>::max())<<c.add(0,1)<<" "<<(c.total()==std::optional<std::uint64_t>{std::numeric_limits<std::uint64_t>::max()});','010 1','拒绝不应污染分片。'),
test('全局溢出','ShardedCounters c(2);c.add(0,std::numeric_limits<std::uint64_t>::max());c.add(1,1);ShardedCounters empty(0);std::cout<<c.total().has_value()<<" "<<empty.total().value_or(9);','0 0','局部合法不保证总和合法。')
]),sourceRefs:sources('performance-contention')
};

const summarySolution=String.raw`struct SampleSummary {
    std::size_t count;
    long long minimum, median, p99, maximum;
};
SampleSummary summarize(std::vector<long long> samples) {
    if(samples.empty()) throw std::invalid_argument("empty samples");
    for(auto value:samples)
        if(value<0) throw std::invalid_argument("negative duration");
    std::sort(samples.begin(),samples.end());
    auto n=samples.size();
    auto rank99=n-n/100;
    return {n,samples.front(),samples[n/2],samples[rank99-1],samples.back()};
}`;
depthSystems['performance-measurement']={
goals:['为测量建立输入、计时边界和统计口径','实现可复核的样本统计','区分统计观察、复杂度论证与性能承诺'],
prerequisites:['了解排序与渐进复杂度','知道优化构建与调试构建用途不同'],
derivation:[
step('问题：一个平均值掩盖了什么',
'一次请求快不代表用户尾延迟好，平均值也可能掩盖少量长暂停。首先定义样本是什么：单个请求、一次批处理还是整个程序启动。不同粒度不能混合计算同一个分位数。还要明确单位、计时起止、是否包含分配和等待，记录机器负载与构建选项，否则两个数字相差再大也难以解释是哪项成本变化。',
'Profiling 帮助定位真实工作负载的热点和调用路径，微基准用于隔离候选原因。应该先确认值得优化的路径，再缩小实验，避免花时间优化几乎不占总耗时的函数。采样工具、插桩和动态检测会改变成本，所以它们的诊断构建不能直接与普通发布构建的时间混在一起比较。'),
step('状态：原始样本不可被摘要取代',
'本课接受非负整数时长列表，保留调用者原始样本，内部复制后排序。空集合没有可定义的最小值与分位数，因此拒绝；负时长也按输入错误拒绝。重复样本正常保留，因为它们代表多次观测。不要为了让图表整齐而删除极端值，除非有明确的异常数据判定规则并在报告中披露。',
'中位数采用上中位值：偶数数量时选择排序后下标为数量一半的样本。百分之九十九分位采用最近秩定义，排名是向上取整的百分之九十九倍数量。不同库可能采用插值等其他定义，所以字段叫 p99 还不够，必须公开算法。只有几次样本时它常等于最大值，不能包装成稳定的生产尾延迟。'),
step('实现：离散排名也需要边界推导',
'令样本数为正整数，最近秩可以写成数量减去数量除以一百的向下取整，再减一得到数组下标。这样避免先做九十九乘数量可能导致的无符号溢出。对于一百项，排名为九十九；对于五项，排名为五。公式需要从向上取整关系推导，而不是看到几个例子匹配就认为所有边界正确。',
'排序后最小值和最大值位于两端，上中位和分位值按上述下标取得。实现的复杂度主要来自排序，应按所用算法与比较次数要求解释，而不是用评测耗时猜测。函数返回纯摘要，不执行睡眠、真实业务负载或平台计时，让自动测试可以确定地检查统计语义，避免环境噪声造成通过或失败。'),
step('证据：测得曲线不等于证明增长规律',
'实际实验应记录预热、重复次数、输入生成和结果校验，确保工作没有被编译器当作无用计算消除。原始样本与摘要一起保存，区分吞吐、端到端延迟和单操作时间；用同一计时边界比较候选实现。一个较小的 p99 还需要样本规模、置信程度和负载分布支持，不能忽略系统调度与背景任务的影响。',
'有限计时点不能证明渐进复杂度，也不能证明优化在其他机器或规模上成立。复杂度需要对操作次数随输入规模的变化推导，性能则是特定环境下的证据。本站工作坊只检查统计结果，不设置速度阈值。综合验收要求同时提交热点解释、可复现实验、原始样本、计算口径以及明确限定的优化结论。')
],
example:example('可复核的最近秩统计',summarySolution,String.raw`    std::vector<long long> values;
    for(int i=1;i<=100;++i) values.push_back(i);
    auto result=summarize(values);
    assert(result.count==100 && result.minimum==1 && result.median==51);
    assert(result.p99==99 && result.maximum==100);
    std::cout<<result.count<<' '<<result.minimum<<' '<<result.median
             <<' '<<result.p99<<' '<<result.maximum<<'\n';`,'100 1 51 99 100\n',
['构造一百个确定样本而非实际计时。','排序后上中位下标五十，对应五十一。','最近秩九十九分位为第九十九项。','输出全部摘要字段，使统计规则可以直接复核。'],
[experiment('输入改为 {9,1,4,4,2}','摘要为数量五、最小一、中位四、p99 九、最大九','小样本最近秩分位等于最大项。'),experiment('加入一个负数','抛出 invalid_argument','负时长违反输入契约，不能静默截断为零。')]),
pitfalls:[
pit('百分位没有定义','p99 = sorted[static_cast<std::size_t>(n*0.99)];','浮点取整和下标规则可能偏离约定，边界还可能越界。','先选择统计定义，再推导整数排名。'),
pit('删除慢样本美化结果','erase_if(samples, [](auto x){return x>threshold;});','未经说明的截断改变分布，摘要不再代表原负载。','保留原始样本，另行披露有依据的异常处理。'),
pit('计时当复杂度证明','assert(elapsed<10); // 所以算法是 O(n)','时间阈值受环境影响，不能证明增长规律。','功能按语义判定，复杂度按操作次数论证。')
],
stages:[
stage('机制 · 统计口径','写出中位数与分位数定义。',['排名公式','一项、五项、一百项手算'],['区分排名和下标','解释小样本分位局限'],'先在纸上排序。','deep-performance-measurement'),
stage('边界 · 摘要实现','处理空、负值、重复和偶数样本。',['摘要函数','边界测试'],['错误输入明确拒绝','不改变调用者原始列表'],'用副本排序，避免乘法溢出。','deep-performance-measurement'),
stage('工程 · 实验报告','为真实热点建立可复现测量。',['原始样本和环境记录','热点及复杂度说明'],['计时边界一致','结论不超出负载证据'],'把 profiling 与微基准接起来。','deep-performance-measurement')
],
workshop:workshop('performance-measurement','可复核的性能样本摘要','统计契约 × 整数排名','实现 summarize，返回数量、最小、上中位、最近秩 p99、最大值。',['输入为非负 long long；空列表或负值抛 invalid_argument。','上中位下标 n/2，p99 排名 ceil(0.99*n)，排名从一开始。','不改变调用者列表；不测运行速度。'],['复制排序后提取字段。','用 n-n/100 计算分位排名，避免乘法。'],['排名要减一转换为下标。','重复样本不能去重。'],
String.raw`struct SampleSummary {std::size_t count;long long minimum,median,p99,maximum;};
SampleSummary summarize(std::vector<long long>){return {0,0,0,0,0};}`,summarySolution,[
test('重复样本','auto s=summarize({9,1,4,4,2});std::cout<<s.count<<" "<<s.minimum<<" "<<s.median<<" "<<s.p99<<" "<<s.maximum;','5 1 4 9 9','保留重复样本。'),
test('一百项排名','std::vector<long long>v;for(int i=100;i>=1;--i)v.push_back(i);auto s=summarize(v);std::cout<<s.median<<" "<<s.p99<<" "<<v.front();','51 99 100','按定义取排名，原列表保持。'),
test('拒绝非法','int n=0;try{summarize({});}catch(const std::invalid_argument&){++n;}try{summarize({1,-1});}catch(const std::invalid_argument&){++n;}std::cout<<n;','2','空和负值均明确拒绝。'),
test('单项与零','auto s=summarize({0});std::cout<<s.count<<" "<<s.minimum<<" "<<s.median<<" "<<s.p99<<" "<<s.maximum;','1 0 0 0 0','单项所有统计值相同。')
]),sourceRefs:sources('performance-measurement')
};

const transactionSolution=String.raw`bool apply_adjustments(std::vector<int>& balances,
                       const std::vector<std::pair<std::size_t,int>>& changes) {
    for(int value:balances) if(value<0) return false;
    auto staged=balances;
    for(auto [index,delta]:changes) {
        if(index>=staged.size()) return false;
        auto next=static_cast<long long>(staged[index])+delta;
        if(next<0 || next>std::numeric_limits<int>::max()) return false;
        staged[index]=static_cast<int>(next);
    }
    balances.swap(staged);
    return true;
}`;
depthSystems['engineering-transaction']={
goals:['逐失败点推导批量更新的强状态保证','识别提交边界与不可回滚副作用','用故障场景验证契约而非只测试成功'],
prerequisites:['理解 RAII 与栈展开','会区分基本保证、强保证与不抛出承诺'],
derivation:[
step('问题：第二个修改失败，第一次算不算成功',
'余额列表需要按顺序应用一批调整。第一项合法、第二项越界时，调用者希望整批拒绝而不是保留第一次修改。必须先明确这是事务语义，而非部分成功语义；两者都可能合理，但接口要能准确表达。若仅返回一个布尔值却让失败有时修改、有时不修改，上层无法可靠恢复，也很难组合多个操作。',
'把可观察状态定义为余额数组全部元素，失败时要求与调用前相同。日志、已发送通知和外部数据库等不在简单数组交换的自动保护范围内。如果更新过程中已经发送成功消息，随后回滚数组并不能撤销消息。因此事务边界必须说明覆盖哪些状态，避免把内存内强保证扩张成跨系统的原子事务承诺。'),
step('不变量：每一步的余额都合法',
'本课余额初始非负，每一步调整后也必须非负且能由 int 表示。即使稍后的调整会补回资金，前面造成透支仍应拒绝整批；这是按顺序验证与只检查最终总和的区别。索引重复合法，表示多次调整同一账户。输入数组本来包含负余额时直接拒绝，让函数不在无效初始状态上继续进行业务推导。',
'有符号整数溢出不能先发生再检测。把旧 int 提升到 long long 后再与 int 调整量相加，在本题数值范围中可表示，然后检查结果是否落在允许区间。这里的推导依赖具体类型范围，不应机械推广到两个任意 long long 相加。每一种新的数值类型都需要重新检查中间表达式的表示范围。'),
step('实现：副本准备，最后一次提交',
'先复制余额得到暂存数组，在副本上逐项检查并更新。复制分配可能抛出，但原数组尚未改变；索引或数值非法时返回失败，暂存资源由析构清理。全部完成后，默认分配器向量通过不抛出的交换提交。这个最后的提交点是强保证的关键，若它仍可能抛出就必须重新分析原对象状态。',
'副本方案消耗与余额数量相关的额外内存，调整很少而账户很多时可能不划算。可以研究撤销日志或持久化数据结构，但复杂方案同样要证明记录日志失败、回滚失败和重复索引的行为。本课先选择容易解释的基线，不把更少分配当作自动更好的设计；性能优化应在契约稳定后用真实负载比较。'),
step('验收：失败路径要有可观察证据',
'测试应把非法操作放在第二项或更后面，确认此前对副本的合法修改没有泄漏到原数组；另外覆盖重复索引、中间透支、最大值溢出和空批次。只把第一项写成非法并不足以检验回滚，因为实现可能还没有修改任何东西。每个测试应解释它对应哪个失败点，以及失败后的状态应该如何保持。',
'分配异常和复杂类型拷贝异常还需要故障注入，不能因当前整数用例全部通过就声称所有异常保证已经动态验证。强异常保证也不提供线程同步，另一个线程并发读取原数组仍需要锁或不可变快照。项目交付应列出可能抛出点、提交点、资源责任和未覆盖条件，让审查者能区分已测试行为与人工论证。')
],
example:example('整批成功才改变余额',transactionSolution,String.raw`    std::vector<int> balances{10,20};
    assert(apply_adjustments(balances,{{0,-3},{1,3}}));
    assert((balances==std::vector<int>{7,23}));
    auto before=balances;
    assert(!apply_adjustments(balances,{{0,2},{1,-100}}));
    assert(balances==before);
    std::cout<<balances[0]<<' '<<balances[1]<<'\n';`,'7 23\n',
['第一批先复制旧余额，在副本完成转移。','检查通过后交换提交，原余额变为七和二十三。','第二批第一项合法，但第二项造成透支。','整批拒绝，副本销毁，原余额完整保持。'],
[experiment('第二批改成 {{0,-8},{0,8}}','仍然拒绝并保持原状态','中间余额不得为负，不能只看最终总和。'),experiment('传入空调整列表','成功且值保持','空事务没有非法中间步骤。')]),
pitfalls:[
pit('在原数据上逐项修改','balances[i]+=delta; if(balances[i]<0) return false;','失败前已改变状态，而且加法还可能先溢出。','在暂存副本上使用安全中间类型验证。'),
pit('只检查最终和','// 合并同账户 delta 后一次检查','会接受契约禁止的中间透支，改变操作顺序语义。','按原列表顺序逐项检查。'),
pit('提交前发送不可撤销通知','send_success(); balances.swap(staged);','后续失败或进程退出可能让外部通知与状态不一致。','明确外部副作用边界，采用专门事务或可靠事件方案。')
],
stages:[
stage('机制 · 提交边界','标出准备、验证、提交、清理四阶段。',['状态图','异常点列表'],['提交前原对象不变','提交步骤的失败属性明确'],'先解释 swap 为什么满足当前分配器条件。','transaction-update'),
stage('边界 · 后段失败','实现批量调整并覆盖第二项失败。',['函数实现','中间透支与溢出测试'],['失败保持原数组','重复索引按顺序处理'],'别只把非法数据放第一项。','deep-engineering-transaction'),
stage('工程 · 故障注入','设计分配失败与外部通知的集成策略。',['故障注入计划','事务范围文档'],['不把内存回滚等同跨系统事务','区分测试证据与人工证明'],'先写出所有可观察状态。','deep-engineering-transaction')
],
workshop:workshop('engineering-transaction','整批余额调整','异常事务 × 安全算术','实现 apply_adjustments，全部步骤合法才提交。',['初始余额和每一步结果必须非负且不超 int 最大值。','任何索引非法、数值非法返回 false，原数组完全保持。','重复索引按顺序执行；中间透支不能由后项修复。','分配异常可传播但原数组保持；不提供并发同步。'],['副本上验证所有步骤。','使用可表示的中间算术，最后交换提交。'],['测试第二项失败。','先提升操作数类型再相加。'],
String.raw`bool apply_adjustments(std::vector<int>&,
const std::vector<std::pair<std::size_t,int>>&){return false;}`,transactionSolution,[
test('批次成功','std::vector<int>b{10,20};std::cout<<apply_adjustments(b,{{0,-3},{1,3}})<<" "<<b[0]<<" "<<b[1];','1 7 23','全部合法后提交。'),
test('后段失败回滚','std::vector<int>b{10,20};std::cout<<apply_adjustments(b,{{0,2},{9,1}})<<" "<<b[0]<<" "<<b[1];','0 10 20','此前副本变化不泄漏。'),
test('中间透支','std::vector<int>b{3};std::cout<<apply_adjustments(b,{{0,-4},{0,4}})<<" "<<b[0];','0 3','不能只检查最终余额。'),
test('溢出和空事务','std::vector<int>b{std::numeric_limits<int>::max()};std::cout<<apply_adjustments(b,{{0,1}})<<" "<<(b[0]==std::numeric_limits<int>::max())<<" "<<apply_adjustments(b,{});','0 1 1','溢出拒绝，空批合法。')
]),sourceRefs:sources('engineering-transaction')
};

const configSolution=String.raw`struct RuntimeConfig {
    unsigned workers,capacity;
    friend bool operator==(const RuntimeConfig&,const RuntimeConfig&)=default;
};
std::optional<RuntimeConfig> parse_config(std::string_view input) {
    if(!input.starts_with("workers=")) return std::nullopt;
    input.remove_prefix(8);
    auto split=input.find(';');
    if(split==std::string_view::npos) return std::nullopt;
    auto first=input.substr(0,split);
    auto second=input.substr(split+1);
    if(!second.starts_with("capacity=")) return std::nullopt;
    second.remove_prefix(9);
    auto number=[](std::string_view s)->std::optional<unsigned>{
        if(s.empty()) return std::nullopt;
        unsigned value=0;
        auto result=std::from_chars(s.data(),s.data()+s.size(),value);
        if(result.ec!=std::errc{} || result.ptr!=s.data()+s.size()) return std::nullopt;
        return value;
    };
    auto workers=number(first),capacity=number(second);
    if(!workers || !capacity || *workers<1 || *workers>64 ||
       *capacity<1 || *capacity>1000000) return std::nullopt;
    return RuntimeConfig{*workers,*capacity};
}`;
depthSystems['engineering-cmake-tests']={
goals:['把组件契约转成可独立构建测试的边界','建立目标级 CMake 依赖和可重复命令','识别覆盖率与通过率不能证明的内容'],
prerequisites:['会组织头文件和源文件','理解函数返回值与错误输入契约'],
derivation:[
step('问题：只在作者电脑能编译不算交付',
'运行时需要从配置字符串读取工作线程数与队列容量。把解析藏在主函数里并依赖本机编译参数，会让单元测试、其他程序复用和构建诊断都变困难。先抽出纯解析组件，输入字符串视图，输出可选配置，不读环境变量、不启动线程、不打印日志。这样解析行为与系统副作用分开，测试可以精确控制所有输入。',
'配置格式也必须具体：字段顺序固定，分别是 workers 和 capacity，中间一个分号，不接受空格、符号和尾随内容；线程数一到六十四，容量一到一百万。宽松格式可以另行设计，但不能让实现偶然接受多少就算多少。契约越明确，测试越容易找出边界，后续格式演化也有可比较的兼容性基线。'),
step('状态：文本验证先于运行时创建',
'解析过程分成字段结构、数字转换和业务范围三个阶段。先确认键和分隔符，再转换纯数字，最后检查允许范围；任何失败返回空，不生成半有效配置。不能只检查转换有没有产出数字，因为输入前缀可能合法而后面仍带垃圾。转换结果指针必须到达整个字段末尾，才能证明该字段完全被识别。',
'使用 from_chars 可以明确取得错误状态和消费位置，也避免把格式失败混成启动线程后的运行错误。数值过大时应按转换失败拒绝，而不是截断成小整数。配置对象只在全部阶段通过后构造；之后的执行器可以依赖这些范围，但仍须处理实际资源分配失败，因为合法配置不保证机器有足够线程或内存。'),
step('构建：依赖应该跟着目标传播',
'建立配置库目标、命令行程序目标和测试目标。语言要求用 target_compile_features 绑定到库，公开头文件路径通过目标接口传播，消费者通过 target_link_libraries 依赖库。避免到处复制编译选项或依赖全局包含路径，否则一个目录单独构建时可能失去隐含条件。C++20 是本课基线，不能悄悄引入需要 C++23 的库接口。',
'使用独立构建目录执行配置和构建，并通过 CTest 注册测试可执行文件。多配置生成器还需要指定相同的构建与测试配置，防止运行旧二进制。测试程序必须有有效的失败退出状态，不能只依靠可能被 NDEBUG 移除的 assert。下方示例同时保留断言和显式失败检查，正式工程也应使用可靠框架或明确失败出口。'),
step('验收：测试、覆盖率和需求分别对照',
'测试从合法最小与最大配置出发，覆盖缺字段、空数字、负号、加号、溢出、尾随垃圾和重复分隔符。每个用例应映射到契约条款，而不是机械镜像代码分支。覆盖率可以发现未执行区域，却不能说明断言有效，也不能证明需求没有遗漏；高通过率若全部是同一类正常输入，仍然可能掩盖严重边界问题。',
'交付时从干净目录重建，记录编译器版本、生成器、构建配置和测试命令，并保存实际执行结果。静态检查、地址检测器和线程检测器属于不同检查任务，未运行不能显示已通过。本机 Windows 未执行 TSan；并发组件应在支持环境另加检查与人工同步审查。构建成功只说明形成了程序，不能代替运行和契约验证。')
],
example:example('配置解析与完整消费',configSolution,String.raw`    auto good=parse_config("workers=4;capacity=256");
    assert(good && good->workers==4 && good->capacity==256);
    assert(!parse_config("workers=4;capacity=256junk"));
    assert(!parse_config("workers=0;capacity=256"));
    std::cout<<good->workers<<' '<<good->capacity<<'\n';`,'4 256\n',
['键顺序与分隔符首先被验证。','两个字段必须完全转换，没有尾随字符。','业务范围通过后才创建配置。','格式合法不意味着后续资源创建一定成功，调用方仍处理资源失败。'],
[experiment('容量字段尾部添加一个空格','解析失败','当前协议不接受空白，转换必须完全消费。'),experiment('输入 workers=64;capacity=1000000','解析成功','两个值正好处于允许上界。')]),
pitfalls:[
pit('只检查数字前缀','auto value=std::stoi(text); // 忽略消费位置','可能接受带尾随垃圾的输入，与严格格式契约不符。','验证完整字段都被消费并检查范围。'),
pit('测试只用可被移除的断言','assert(parse_config(good).has_value()); // Release NDEBUG','断言被移除时程序可能无检查地返回成功。','正式测试使用保留检查和失败退出的框架或显式条件。'),
pit('全局编译状态隐藏依赖','include_directories(...); set(CMAKE_CXX_FLAGS "...");','依赖传播不清，独立构建或消费者配置可能改变结果。','把语言、包含路径和链接关系绑定到目标。')
],
stages:[
stage('机制 · 纯组件','分离解析与启动副作用。',['格式契约','头文件和实现边界'],['失败无半有效配置','不在解析函数中启动线程'],'纯函数更容易组合和测试。','deep-engineering-cmake-tests'),
stage('边界 · 完整消费','实现严格数字解析和范围验证。',['解析实现','契约到用例映射'],['尾随垃圾被拒绝','溢出不截断'],'检查错误码和结束指针。','deep-engineering-cmake-tests'),
stage('工程 · 可重复构建','为库、示例和测试建立 CMake 目标。',['CMakeLists 与干净构建命令','真实 CTest 报告'],['明确 C++20 要求','Release 下测试检查仍有效'],'让测试链接真实库，不复制一份实现。','deep-engineering-cmake-tests')
],
workshop:workshop('engineering-cmake-tests','严格运行时配置解析','组件契约 × 完整转换','实现 parse_config，解析固定格式 workers=N;capacity=M。',['字段顺序固定，不接受空白、正负号、额外分号或尾随内容。','workers 范围 1..64，capacity 范围 1..1000000。','合法返回 RuntimeConfig；其他情况返回 nullopt。','不得读取外部环境或执行启动副作用。'],['分别验证结构、转换和业务范围。','数字必须完整消费。'],['from_chars 提供错误与停止位置。','转换成功后仍需要范围检查。'],
String.raw`struct RuntimeConfig {
    unsigned workers,capacity;
    friend bool operator==(const RuntimeConfig&,const RuntimeConfig&)=default;
};
std::optional<RuntimeConfig> parse_config(std::string_view){return std::nullopt;}`,configSolution,[
test('合法边界','auto a=parse_config("workers=1;capacity=1"),b=parse_config("workers=64;capacity=1000000");std::cout<<bool(a)<<" "<<bool(b)<<" "<<(b?b->capacity:0);','1 1 1000000','合法上下界均接受。'),
test('拒绝垃圾','std::cout<<bool(parse_config("workers=4;capacity=20x"))<<bool(parse_config("workers=+4;capacity=20"))<<bool(parse_config("workers=4;capacity=20 "));','000','不能只消费合法前缀。'),
test('范围与溢出','std::cout<<bool(parse_config("workers=0;capacity=1"))<<bool(parse_config("workers=65;capacity=1"))<<bool(parse_config("workers=4;capacity=9999999999999999999999"));','000','转换溢出及业务越界均拒绝。'),
test('字段契约','std::cout<<bool(parse_config("capacity=2;workers=1"))<<bool(parse_config("workers=;capacity=2"))<<bool(parse_config("workers=2;capacity=3;"));','000','顺序、空字段和尾随分隔符都受契约约束。')
]),sourceRefs:sources('engineering-cmake-tests')
};

const leaseSolution=String.raw`class CountLease {
    int* counter_=nullptr;
public:
    explicit CountLease(int& counter) {
        if(counter<0) throw std::invalid_argument("negative counter");
        if(counter==std::numeric_limits<int>::max())
            throw std::overflow_error("counter full");
        ++counter; counter_=&counter;
    }
    CountLease(const CountLease&)=delete;
    CountLease& operator=(const CountLease&)=delete;
    CountLease(CountLease&& other) noexcept
        :counter_(std::exchange(other.counter_,nullptr)){}
    CountLease& operator=(CountLease&& other) noexcept {
        if(this!=&other) {release();counter_=std::exchange(other.counter_,nullptr);}
        return *this;
    }
    ~CountLease() noexcept {release();}
    void release() noexcept {if(counter_){--*counter_;counter_=nullptr;}}
    bool active() const noexcept {return counter_!=nullptr;}
};`;
depthSystems['engineering-diagnostics']={
goals:['通过唯一清理责任缩小缺陷空间','逐状态验证移动、提前释放和异常退出','准确报告警告、检测器与人工审查范围'],
prerequisites:['理解移动构造与移动赋值的差别','了解析构与被借用对象的生命周期'],
derivation:[
step('问题：多个退出路径怎样只清理一次',
'进入某个操作时增加活动数，退出时减少。手工在正常返回、早退和异常分支都写减一，很容易漏掉或重复。把责任交给局部租约对象：构造成功增加计数，析构时减少。对象是否持有责任成为可观察状态，而不是散落在控制流里的习惯。这个小例子对应真实工程中的锁、订阅、临时注册和资源占用。',
'计数器由调用者拥有，租约只借用其地址，必须确保计数器活得更久。调用者还不能在租约存活期间随意改写计数，或让多个线程无同步地操作同一计数器。RAII 统一退出路径，却不会自动解决借用对象悬空、外部破坏不变量和数据竞争；这些前提需要在接口契约与项目所有权图中分别列明。'),
step('状态：活跃与空租约只有一条清理责任',
'构造成功后租约活跃，移动构造把计数器地址交给新对象，旧对象变空，计数数值不增加。提前释放减少一次计数并清空地址，重复释放为空操作。复制被禁止，因为复制一个地址却让两个析构都减一会制造重复清理。移动后的对象仍然可析构，也能接受新的移动赋值，但不再拥有原责任。',
'移动赋值比移动构造多一个旧资源来源：目标可能已经拥有另一份计数责任，必须先释放它，再接收来源责任。自移动要明确定义，本课选择保持现有状态。不同计数器之间移动时尤其容易看出遗漏：目标旧计数应减少，源计数保持当前活跃总数，源对象变空，最终只由目标执行那一次减少。'),
step('实现：构造失败不得留下半个责任',
'构造前先检查计数非负并且未到 int 最大值，再执行增加并保存地址。验证失败时抛异常，但尚未改变计数，未构造成功的对象也不会执行完整析构。清理路径只做满足契约的减一与置空，声明不抛出。若真实资源关闭可能失败，应提供显式可报告的关闭接口，而不是让析构在另一个异常展开中再抛出。',
'本课自定义租约使用 C++20；标准 std::scope_exit 属于 C++23，不能假设当前编译目标必然提供。这里也不是通用回调守卫，因为接口直接管理计数，便于逐状态验证。推广到任意回调时还要检查回调移动是否抛出、析构调用是否可靠以及解除责任后的行为，不能只把整数指针换成函数对象就宣称完整等价。'),
step('诊断：工具证据与责任推导互相补充',
'测试逐项观察构造、移动构造、覆盖移动赋值、自移动、提前释放、异常栈展开和构造拒绝时的计数。将资源数量变成可观察值能找到很多泄漏与重复清理，但不证明借用地址在所有真实调用中合法。静态分析可以提示可疑生命期，地址检测器可以发现执行到的悬空访问，二者都不能替代完整所有权设计。',
'报告应列出实际运行的工具与选项，区分编译警告、地址检测、未定义行为检测和线程检测。当前 Windows 没有执行 TSan，不能以功能通过替代。复现材料应带最小输入、编译器版本、堆栈和预期状态；性能定位则使用 profiling 另行分析，检测构建带来的开销不能混入普通发布性能结论。')
],
example:example('覆盖移动转移唯一清理责任',leaseSolution,String.raw`    int first=0, second=0;
    {
        CountLease a(first),b(second);
        assert(first==1 && second==1);
        b=std::move(a);
        assert(!a.active() && b.active());
        assert(first==1 && second==0);
        std::cout<<first<<' '<<second<<' ';
        b.release();
        b.release();
        assert(first==0);
        std::cout<<first<<'\n';
    }
    assert(first==0 && second==0);`,'1 0 0\n',
['两个租约各增加一个不同计数。','覆盖移动先释放目标原计数，所以第二个计数归零。','来源责任转移而非复制，第一个计数仍为一。','提前释放归零，再次释放和后续析构不会重复减少。'],
[experiment('让局部作用域抛出异常后在外面捕获','离开作用域后计数归零','栈展开调用活跃租约析构。'),experiment('把计数初值设成 int 最大值','构造抛出且计数保持','验证在增加之前完成，未建立半份责任。')]),
pitfalls:[
pit('允许复制清理责任','CountLease(const CountLease&)=default;','两个对象持有同一责任，最终会重复减少。','禁止复制，移动时清空来源。'),
pit('覆盖赋值不释放目标','counter_=std::exchange(other.counter_,nullptr);','目标原来承担的计数责任丢失，造成泄漏。','先释放目标，再接收来源，并定义自移动。'),
pit('借用计数先死亡','return CountLease(localCounter); // 计数是局部变量','租约保存悬空地址，之后清理发生未定义行为；反例不执行。','让计数器所有者覆盖所有租约的生命周期。')
],
stages:[
stage('机制 · 唯一责任','画出活跃与空租约状态转换。',['责任状态图','移动后状态说明'],['移动不增加总数','空对象可安全析构'],'把指针看成清理责任凭证。','scope-exit'),
stage('边界 · 覆盖与异常','实现移动赋值、提前释放和构造拒绝。',['租约实现','逐阶段计数测试'],['不漏目标旧责任','重复释放无副作用'],'用两个不同计数器观察覆盖赋值。','deep-engineering-diagnostics'),
stage('工程 · 复现与工具','为真实资源设计诊断包和工具矩阵。',['最小复现材料','已运行与未运行检查表'],['不把未执行工具标通过','借用对象保活条件明确'],'工具只能发现其观察范围内的违例。','deep-engineering-diagnostics')
],
workshop:workshop('engineering-diagnostics','可移动活动租约','RAII × 覆盖赋值 × 异常退出','实现 CountLease，为外部 int 计数承担一次增加和减少责任。',['构造检查非负且未达 int 最大值，非法分别抛 invalid_argument 或 overflow_error。','禁止复制；移动转移责任不增加计数；覆盖赋值释放目标旧责任。','release 可重复调用；自移动保持；析构不抛出。','外部计数器比租约活得久，外部不擅自修改且调用遵守线程同步。'],['空指针表示没有责任。','每次转移清空来源，释放后清空自身。'],['移动赋值有两个资源来源。','构造验证在增加前。'],
String.raw`class CountLease {
public:
    explicit CountLease(int&){}
    CountLease(const CountLease&)=delete;
    CountLease& operator=(const CountLease&)=delete;
    CountLease(CountLease&&)noexcept{}
    CountLease& operator=(CountLease&&)noexcept{return *this;}
    void release()noexcept{}
    bool active()const noexcept{return false;}
};`,leaseSolution,[
test('移动构造与释放','int n=0;{CountLease a(n);CountLease b(std::move(a));std::cout<<n<<" "<<a.active()<<b.active()<<" ";b.release();b.release();}std::cout<<n;','1 01 0','转移不增加，重复释放不减少两次。'),
test('覆盖与自移动','int a=0,b=0;{CountLease x(a),y(b);y=std::move(x);y=std::move(y);std::cout<<a<<" "<<b<<" "<<y.active()<<" ";}std::cout<<a<<" "<<b;','1 0 1 0 0','目标旧责任释放，自移动保持。'),
test('异常退出','int n=0;try{CountLease lease(n);throw std::runtime_error("test");}catch(const std::exception&){}std::cout<<n;','0','栈展开清理活跃责任。'),
test('构造拒绝','int n=std::numeric_limits<int>::max(),m=-1,c=0;try{CountLease a(n);}catch(const std::overflow_error&){++c;}try{CountLease b(m);}catch(const std::invalid_argument&){++c;}std::cout<<c<<" "<<(n==std::numeric_limits<int>::max())<<" "<<m;','2 1 -1','非法构造保持外部计数。')
]),sourceRefs:sources('engineering-diagnostics')
};

const entitySolution=String.raw`struct EntityKey {
    std::size_t slot;
    std::uint32_t generation;
    friend bool operator==(const EntityKey&,const EntityKey&)=default;
};
class EntityTable {
    struct Slot {std::uint32_t generation=1;bool alive=false;bool retired=false;};
    std::vector<Slot> slots_;
    std::size_t live_=0;
public:
    EntityKey create() {
        for(std::size_t i=0;i<slots_.size();++i)
            if(!slots_[i].alive && !slots_[i].retired) {
                slots_[i].alive=true;++live_;
                return {i,slots_[i].generation};
            }
        slots_.push_back(Slot{1,true,false});++live_;
        return {slots_.size()-1,1};
    }
    bool contains(EntityKey key)const {
        return key.slot<slots_.size() && slots_[key.slot].alive &&
               slots_[key.slot].generation==key.generation;
    }
    bool erase(EntityKey key) {
        if(!contains(key)) return false;
        auto& slot=slots_[key.slot];
        slot.alive=false;--live_;
        if(slot.generation==std::numeric_limits<std::uint32_t>::max())
            slot.retired=true;
        else ++slot.generation;
        return true;
    }
    std::size_t live()const{return live_;}
};`;
depthSystems['runtime-entity-storage']={
goals:['用槽位与代际组成稳定的实体身份','推导创建、删除、复用与退役状态转换','区分身份验证、组件位置和并发生命保护'],
prerequisites:['理解 vector 扩容导致地址变化','了解 sparse set 的双向映射'],
derivation:[
step('问题：地址变化和槽位复用都会混淆身份',
'实体组件为了连续遍历通常放在可扩容数组里，扩容会移动对象，删除还可能用末尾元素填洞。直接把地址当实体身份会在移动后失效；只用数组下标又会在槽位复用后把旧实体误认成新实体。因此先把业务身份与组件当前位置分开，允许位置改变而身份仍能被验证，而不是要求所有对象永远停留在同一地址。',
'本课身份由槽位和代际组成，槽位定位元数据，代际判断是否仍是当初那次创建。它是一组代数条件，不是某个裸指针的别名：索引在范围内、槽位存活、代际相等，三者同时满足才有效。零初始化出来的句柄不应自动代表一个实体，所以新槽位的初始代际选一，并由创建接口产生合法身份。'),
step('状态：死亡可以复用，但旧句柄不能复活',
'每个槽位处于存活、可复用空闲或永久退役状态。删除合法实体时结束存活并增加代际；随后创建可以复用该位置，但返回新代际。旧句柄即使索引相同也不再通过检查。重复删除和使用越界句柄应安全返回失败，不能让活跃计数重复减少，或者通过自动扩容把错误索引变成一个新槽位。',
'代际计数有上限，不能依靠足够大就忽略回绕。如果到达最大值后继续递增，最终可能与很久以前的旧句柄相等。本课选择在删除最大代际时退役该槽位，永不复用。这样牺牲少量长期容量换来清楚的身份承诺；其他系统可以采用更宽身份或全局回收约束，但必须说明旧句柄何时不再可能存在。'),
step('实现：身份表不等于完整组件存储',
'创建先寻找最低索引的可复用槽位，否则追加新槽位；追加分配若失败，活跃数不增加。删除先调用统一验证函数，再更新状态与计数。当前实现为了可读性线性扫描空闲位，复杂度与槽位总数相关，不应宣称创建恒定时间。工程扩展可以增加空闲链表，但要同步维护退役状态及失败路径。',
'组件存储仍需要另一个映射：实体槽位到稠密组件位置，以及稠密位置到实体身份。删除换位时必须修正被移动实体的映射，组件生命周期也要正确结束。身份表只说明编号是否有效，并不自动构造、析构或保活组件。把组件放进 Arena 时还要确认整批清空时没有跨帧存活对象，不能把释放存储当作调用析构。'),
step('验收：身份正确不等于并发访问安全',
'测试覆盖创建两个实体、删除一个、复用同槽但新代际、旧句柄拒绝、重复删除和越界索引，并持续检查活跃数量。真实达到最大代际可能需要不可接受的循环，因此退役分支应通过可注入的较小计数模型或人工边界证明验证，而不是声称普通测试已穷尽所有代际。测试覆盖情况必须准确记录。',
'contains 返回真之后，另一个线程仍可能删除实体，所以先验证再解引用不是自动安全的并发协议。读锁、阶段屏障、快照或专门回收方案需要另行选择，并明确保护范围。有限压力测试既不能证明所有交错安全，也不能证明节点回收。综合项目应分别提交身份不变量、组件映射、对象生命周期和并发保护四张关系图。')
],
example:example('同一槽位，不同实体',entitySolution,String.raw`    EntityTable table;
    auto old=table.create();
    auto other=table.create();
    assert(table.live()==2 && table.contains(old));
    assert(table.erase(old));
    auto replacement=table.create();
    assert(replacement.slot==old.slot);
    assert(replacement.generation!=old.generation);
    assert(!table.contains(old) && table.contains(other));
    assert(table.contains(replacement) && table.live()==2);
    std::cout<<old.slot<<':'<<old.generation<<' '
             <<replacement.slot<<':'<<replacement.generation<<' '
             <<table.live()<<'\n';`,'0:1 0:2 2\n',
['第一次创建产生零槽位第一代身份。','删除后该槽位不再存活，代际增加。','下一次创建复用最低空闲槽，返回第二代。','旧句柄失效而另一个实体保持有效，活跃数仍是二。'],
[experiment('删除 old 两次','第二次返回 false 且活跃数不再下降','第一次删除后旧身份已不满足代际与存活条件。'),experiment('保存很多句柄后继续创建导致 vector 扩容','这些句柄仍按索引和代际验证','身份不包含指向槽位元数据的裸地址。')]),
pitfalls:[
pit('仅检查索引','return key.slot<slots.size();','死亡或被复用的槽位会误认旧实体。','同时检查范围、存活、代际。'),
pit('让代际静默回绕','++generation; // 达到上限仍继续复用','历史身份可能再次相等，破坏旧句柄永久失效承诺。','规定并实现退役或其他回绕策略。'),
pit('验证当作保活','if(table.contains(key)) use(component); // 可并发删除','检查和访问之间仍可能失效；悬空反例不执行。','用锁、阶段或回收协议保护完整访问区间。')
],
stages:[
stage('机制 · 身份代数','写出句柄有效的三个条件。',['状态转换图','身份验证函数'],['死亡身份不通过','扩容不改变身份含义'],'身份和物理位置分开。','sparse-components'),
stage('边界 · 复用与退役','实现创建、删除、最低空闲位复用。',['身份表实现','重复删除与旧句柄测试'],['活跃计数守恒','代际上限策略明确'],'先验证再改状态，避免重复减数。','deep-runtime-entity-storage'),
stage('工程 · 组件接入','接入稀疏稠密映射和分配器。',['删除换位图','组件寿命与并发保护方案'],['移动后映射一致','不把 contains 当并发保活'],'分别画身份、位置、生命与保护。','deep-runtime-entity-storage')
],
workshop:workshop('runtime-entity-storage','代际实体身份表','复用槽位 × 旧句柄拒绝','实现 EntityTable，生成 EntityKey 并管理存活身份。',['新槽初始代际一，复用最低索引的可用空闲槽。','删除合法句柄后代际增加；达到 uint32 最大代际的槽删除后退役。','contains 同时检查范围、存活和代际；非法或重复删除返回 false。','live 返回活跃数；接口仅顺序使用，不提供组件或并发回收。'],['统一验证身份后再更新。','区分空闲可复用与永久退役。'],['追加成功后再增加活跃数。','不要持久保存 vector 元素地址。'],
String.raw`struct EntityKey {
    std::size_t slot;std::uint32_t generation;
    friend bool operator==(const EntityKey&,const EntityKey&)=default;
};
class EntityTable {
public:
    EntityKey create(){return {0,0};}
    bool contains(EntityKey)const{return false;}
    bool erase(EntityKey){return false;}
    std::size_t live()const{return 0;}
};`,entitySolution,[
test('独立身份','EntityTable t;auto a=t.create(),b=t.create();std::cout<<a.slot<<" "<<b.slot<<" "<<a.generation<<" "<<t.live()<<" "<<t.contains(a)<<t.contains(b);','0 1 1 2 11','新槽产生不同索引。'),
test('复用拒绝旧代','EntityTable t;auto a=t.create();t.erase(a);auto b=t.create();std::cout<<(a.slot==b.slot)<<" "<<a.generation<<" "<<b.generation<<" "<<t.contains(a)<<t.contains(b);','1 1 2 01','同槽不等于同实体。'),
test('重复与非法删除','EntityTable t;auto a=t.create();std::cout<<t.erase(a)<<t.erase(a)<<t.erase({99,1})<<" "<<t.live();','100 0','失败不能再次减少计数。'),
test('最低空闲位','EntityTable t;auto a=t.create(),b=t.create(),c=t.create();t.erase(c);t.erase(a);auto d=t.create();std::cout<<d.slot<<" "<<t.contains(b)<<" "<<t.live();','0 1 2','按约定选择最低可复用索引。')
]),sourceRefs:sources('runtime-entity-storage')
};

const graphSolution=String.raw`enum class TaskState {succeeded=0,failed=1,skipped=2};
struct TaskResult {TaskState state=TaskState::skipped;int value=0;};
std::vector<TaskResult> run_graph(
    const std::vector<std::vector<std::size_t>>& dependencies,
    const std::vector<std::function<int()>>& tasks) {
    const auto n=tasks.size();
    if(dependencies.size()!=n) throw std::invalid_argument("size mismatch");
    std::vector<std::vector<std::size_t>> children(n);
    std::vector<std::size_t> indegree(n,0),order;
    for(std::size_t node=0;node<n;++node)
        for(auto parent:dependencies[node]) {
            if(parent>=n) throw std::out_of_range("dependency");
            children[parent].push_back(node);++indegree[node];
        }
    std::queue<std::size_t> ready;
    for(std::size_t i=0;i<n;++i) if(indegree[i]==0) ready.push(i);
    while(!ready.empty()) {
        auto node=ready.front();ready.pop();order.push_back(node);
        for(auto child:children[node]) if(--indegree[child]==0) ready.push(child);
    }
    if(order.size()!=n) throw std::invalid_argument("cycle");
    std::vector<TaskResult> results(n);
    for(auto node:order) {
        bool blocked=false;
        for(auto parent:dependencies[node])
            if(results[parent].state!=TaskState::succeeded) blocked=true;
        if(blocked) continue;
        try {results[node]={TaskState::succeeded,tasks[node]()};}
        catch(...) {results[node]={TaskState::failed,0};}
    }
    return results;
}`;
depthSystems['runtime-job-graph']={
goals:['区分图合法性、调度就绪与任务结果','让失败传播与独立分支继续有确定语义','以顺序参考模型支撑未来并行执行器'],
prerequisites:['理解拓扑排序与依赖图','能够用异常表达单个任务执行失败'],
derivation:[
step('问题：失败以后哪些任务还能执行',
'任务图中一个准备任务失败，它的下游不能继续使用缺失结果，但不相关的分支也不应被无条件停止。首先定义三种终态：成功、失败、因前置未成功而跳过。失败表示任务确实运行并抛出，跳过表示根本没有调用任务函数。这一差别影响日志、重试与用户反馈，不能统统压缩成一个布尔失败标记。',
'图本身非法与任务运行失败也是两类错误。缺失节点、任务数量不匹配或依赖环应在任何回调运行前被拒绝，否则部分任务已经产生副作用才发现图无效，调用者很难恢复。本课先建立顺序参考执行器，把这些语义固定下来，再研究多线程调度，避免用并发复杂度掩盖尚未明确的业务契约。'),
step('状态：入度只回答依赖是否完成遍历',
'从每个节点的前置列表建立后继表，入度记录尚未处理的依赖边数量。入度归零表示可以按拓扑顺序考察这个节点，但不表示前置任务成功；成功条件还要读取结果状态。重复依赖在本课作为重复边处理，增加几次就减少几次，不额外调用任务。图结构阶段与运行结果阶段保持分离。',
'先完整生成拓扑顺序，再执行回调。若顺序长度小于节点数，说明有环，立即拒绝且调用次数应为零。非法索引也必须在执行之前识别。这样顺序列表成为一个可审查的合法性证据，但它不证明回调本身没有错误，也不消除任务访问共享外部状态时需要遵守的所有权和同步要求。'),
step('实现：结果状态决定是否调用',
'按拓扑顺序遍历，检查每个前置结果是否都成功。只要有失败或跳过，当前节点保持跳过状态，不能执行任何回调；否则调用函数，正常返回记录值，任何异常记录失败。下游再依据这些结果传播跳过，独立分支仍可运行。保存结果时按原节点编号索引，而不是按实际执行顺序重新排列。',
'这里把异常内容简化为失败状态和零值，只作为教学基线。工程系统应保留异常对象或结构化错误，支持关联任务身份的诊断。回调可能有外部副作用，捕获异常并不回滚这些效果；重试必须由业务契约决定是否幂等。把 catch 全部异常称作系统已经恢复，是把状态记录与实际补偿混淆。'),
step('扩展：并行时新增的证明义务',
'顺序基线的图处理按节点和边遍历推导复杂度；有限计时不能证明它，更不能直接说明线程池吞吐。并行扩展需要保证每个节点只入队一次，前置结果发布后下游才读取，入度更新不会丢失，并将队列容量、背压和取消纳入协议。不要持有调度锁执行用户回调，避免慢任务与重入扩大阻塞和死锁范围。',
'测试验证失败传播、独立分支继续、非法图零回调、重复边和空图。未来并发压力只能寻找交错反例，不能代替同步与生命周期论证；Windows 本机未执行 TSan。综合交付还应定义关闭时已接收任务是否排空、待执行任务如何取消，以及运行中任务如何响应停止，让每个任务最终都有明确可观察的结果。')
],
example:example('失败传播而独立分支继续',graphSolution,String.raw`    int called=0;
    std::vector<std::vector<std::size_t>> deps{{},{0},{0},{1,2},{}};
    std::vector<std::function<int()>> tasks{
        [&]{++called;return 1;},
        [&]()->int{++called;throw std::runtime_error("fail");},
        [&]{++called;return 3;},
        [&]{++called;return 4;},
        [&]{++called;return 9;}
    };
    auto result=run_graph(deps,tasks);
    assert(called==4);
    assert(result[1].state==TaskState::failed);
    assert(result[3].state==TaskState::skipped);
    assert(result[4].value==9);
    for(const auto& item:result) std::cout<<static_cast<int>(item.state);
    std::cout<<' '<<called<<'\n';`,'01020 4\n',
['节点零成功，使一和二具备检查前置的资格。','节点一抛出而二正常返回。','节点三因前置一失败而跳过，不调用函数。','独立节点四仍成功，状态按节点编号输出。'],
[experiment('让节点一正常返回','所有节点成功且回调调用五次','节点三的全部前置都成功。'),experiment('将依赖改为两个节点互相依赖','在任何回调前抛 invalid_argument','先完成整图拓扑验证，再运行任务。')]),
pitfalls:[
pit('入度零等于前置成功','if(--indegree[next]==0) run(next);','入度只表示边已处理，前置可能失败。','检查前置终态，再决定执行或跳过。'),
pit('边执行边发现图非法','run(root); // 很久后才发现剩余节点成环','非法请求已经产生部分副作用，违反零回调契约。','先完整验证图，再执行。'),
pit('捕获异常就当作已回滚','catch(...) { return failed; } // 声称外部状态恢复','状态记录没有撤销回调产生的外部副作用。','保留错误并由业务定义补偿或幂等重试。')
],
stages:[
stage('机制 · 三种终态','为失败、跳过和成功定义区别。',['状态与传播表','小图手工执行顺序'],['跳过不运行回调','独立分支继续'],'入度和结果是两套状态。','dependency-order'),
stage('边界 · 非法图零执行','实现顺序图执行器。',['实现与调用计数','环和无效索引测试'],['非法图无回调','结果按节点编号保留'],'先生成完整拓扑顺序。','deep-runtime-job-graph'),
stage('工程 · 并行与关闭','扩展线程池、背压和取消设计。',['同步关系图','关闭与错误传播文档'],['任务只入队一次','不在调度锁内执行用户代码'],'用顺序实现作为语义对照。','task-executor')
],
workshop:workshop('runtime-job-graph','具有失败传播的任务图','先验图验证 × 独立分支继续','实现 run_graph，根据前置依赖顺序执行任务并记录终态。',['dependencies[i] 是节点 i 的前置编号；允许重复边。','数量不匹配或有环抛 invalid_argument，越界依赖抛 out_of_range；均不得调用任务。','仅全部前置成功才运行；异常记 failed，受影响下游记 skipped，独立分支继续。','结果按节点编号返回；成功保存值，失败和跳过值为零。此题顺序执行。'],['先验证图并生成完整顺序。','执行时另查前置结果，而非只看入度。'],['用调用计数验证非法图零副作用。','跳过和失败要区分。'],
String.raw`enum class TaskState{succeeded=0,failed=1,skipped=2};
struct TaskResult{TaskState state=TaskState::skipped;int value=0;};
std::vector<TaskResult> run_graph(const std::vector<std::vector<std::size_t>>&,
const std::vector<std::function<int()>>& tasks){return std::vector<TaskResult>(tasks.size());}`,graphSolution,[
test('正常依赖','auto r=run_graph({{},{0},{0,1}},{[]{return 2;},[]{return 3;},[]{return 5;}});for(auto x:r)std::cout<<static_cast<int>(x.state);std::cout<<" "<<r[2].value;','000 5','合法依赖全部成功。'),
test('失败与跳过','int n=0;auto r=run_graph({{},{0},{}},{[&]()->int{++n;throw std::runtime_error("x");},[&]{++n;return 1;},[&]{++n;return 9;}});for(auto x:r)std::cout<<static_cast<int>(x.state);std::cout<<" "<<n<<" "<<r[2].value;','120 2 9','失败下游不运行，独立任务继续。'),
test('环在执行前拒绝','int n=0;try{run_graph({{1},{0}},{[&]{++n;return 1;},[&]{++n;return 2;}});}catch(const std::invalid_argument&){std::cout<<"cycle ";}std::cout<<n;','cycle 0','非法图没有部分执行。'),
test('非法索引与重复边','int n=0;try{run_graph({{9}},{[&]{++n;return 1;}});}catch(const std::out_of_range&){std::cout<<"bad ";}auto r=run_graph({{},{0,0}},{[]{return 1;},[]{return 7;}});std::cout<<n<<" "<<static_cast<int>(r[1].state)<<" "<<r[1].value;','bad 0 0 7','重复边不重复执行，非法索引先拒绝。')
]),sourceRefs:sources('runtime-job-graph')
};

const streamSolution=String.raw`class IntStream {
public:
    struct promise_type;
    using Handle=std::coroutine_handle<promise_type>;
    struct promise_type {
        inline static int live=0;
        int value=0;
        std::exception_ptr error;
        promise_type()noexcept{++live;}
        ~promise_type(){--live;}
        IntStream get_return_object(){return IntStream(Handle::from_promise(*this));}
        std::suspend_always initial_suspend()noexcept{return {};}
        std::suspend_always final_suspend()noexcept{return {};}
        std::suspend_always yield_value(int n)noexcept{value=n;return {};}
        void return_void()noexcept{}
        void unhandled_exception()noexcept{error=std::current_exception();}
    };
private:
    Handle handle_{};
    explicit IntStream(Handle handle):handle_(handle){}
public:
    IntStream()=default;
    IntStream(const IntStream&)=delete;
    IntStream& operator=(const IntStream&)=delete;
    IntStream(IntStream&& other)noexcept:handle_(std::exchange(other.handle_,{})){}
    IntStream& operator=(IntStream&& other)noexcept {
        if(this!=&other){
            if(handle_)handle_.destroy();
            handle_=std::exchange(other.handle_,{});
        }
        return *this;
    }
    ~IntStream(){if(handle_)handle_.destroy();}
    static int frames()noexcept{return promise_type::live;}
    bool next(int& output) {
        if(!handle_ || handle_.done()) return false;
        handle_.resume();
        if(handle_.promise().error)std::rethrow_exception(handle_.promise().error);
        if(handle_.done())return false;
        output=handle_.promise().value;return true;
    }
};
IntStream make_stream(std::vector<int> values,std::stop_token stop={},int fail_at=-1) {
    for(std::size_t i=0;i<values.size();++i){
        if(stop.stop_requested())co_return;
        if(fail_at>=0 && i==static_cast<std::size_t>(fail_at))
            throw std::runtime_error("stream failure");
        co_yield values[i];
    }
}`;
depthSystems['runtime-coroutine-lifetime']={
goals:['逐阶段追踪协程帧、返回对象和参数的所有权','实现惰性恢复、异常传播和协作式取消','区分函数结束、最终挂起与帧释放'],
prerequisites:['理解 move-only 所有权与异常指针','了解 co_yield、挂起和 stop_token 的基本概念'],
derivation:[
step('问题：返回以后还会继续执行的函数',
'普通函数返回时局部状态通常结束，而协程可以在挂起点保存执行状态，稍后由调用者恢复。C++20 提供这个控制流机制，却不会自动创建线程或调度器。本课做单线程拉取序列，每次 next 至多取得一个整数，调用者决定何时恢复。这样可以先把生命周期推导清楚，再接入更复杂的异步执行环境。',
'返回对象拥有协程句柄，句柄定位帧，但复制句柄本身不会增加所有权计数。若两个返回对象都销毁同一帧，会重复释放；若没有人销毁，帧可能泄漏。因此返回类型禁止复制，仅允许移动转移唯一责任。输入向量按值传入，元素由帧拥有；如果改成引用，调用者就必须另行保证源向量跨所有挂起点存活。'),
step('状态：初始挂起、产出、完成与最终挂起',
'调用工厂后创建帧和 promise，初始挂起让主体尚未运行。第一次 next 恢复到产出，把值放进 promise 后再次挂起；下一次恢复从该挂起点继续。最后返回或抛异常会进入完成路径，但 final_suspend 仍保留帧，便于返回对象读取状态和错误。因此完成不等于内存已经释放，帧直到拥有者销毁句柄才真正释放。',
'用 promise 构造析构维护存活帧计数，可以明确看到创建后是一、序列完成后仍是一、返回对象析构后才归零。移动只转移句柄，不应增加帧数；覆盖移动则先销毁目标旧帧，再接收来源。自移动保持，空对象析构和 next 都安全。这个计数仅用于顺序教学，不可作为未经同步的并发监控指标。'),
step('恢复：输出与异常都从同一状态机产生',
'next 先检查空句柄或完成状态，避免恢复已结束协程。恢复之后先看 promise 保存的异常，再检查是否完成，只有确实产出值才写调用者输出。因此正常结束、取消和异常都保持输出旧值。协程内的异常由 unhandled_exception 捕获为异常指针，恢复者重新抛出，让调用者获得可观察错误而不是静默结束。',
'异常发生后协程已到最终挂起，第一次相关 next 重新抛出，后续 next 看到完成并返回假；错误不会被无限重复抛出。移动和析构必须与恢复互斥，本课限制单线程顺序使用。若调度器持有未来恢复回调，拥有者销毁前必须取消或等待这些回调，否则一个仍在队列里的裸句柄就会指向已释放帧。'),
step('取消与交付：停止请求不等于强制终止',
'stop_token 按值保存在帧参数里，每次准备产出前检查停止。请求停止只改变协作状态，不会在任意指令处强杀，也不会自动中断普通阻塞输入输出。取消后下一次恢复运行到检查点才结束，最终仍需要拥有者释放帧。若长期不再恢复，可以直接销毁一个已挂起且没有并发访问的帧，但必须履行外部等待清理协议。',
'测试覆盖源向量修改不影响帧内副本、提前取消、产出后取消、异常传播、移动覆盖和帧计数归零。它不能证明通用异步调度器的所有交错安全；Windows 本机未运行 TSan，生命周期关系要人工审查。std::generator 属于 C++23，本课用 C++20 自定义类型展示机制；实际工程可选成熟库，但仍需验证关闭和恢复的责任边界。')
],
example:example('取消结束执行，析构释放帧',streamSolution,String.raw`    assert(IntStream::frames()==0);
    {
        std::stop_source stop;
        auto stream=make_stream({4,8},stop.get_token());
        assert(IntStream::frames()==1);
        int value=-1;
        assert(stream.next(value) && value==4);
        std::cout<<value<<' ';
        stop.request_stop();
        assert(!stream.next(value) && value==4);
        assert(IntStream::frames()==1);
        std::cout<<IntStream::frames()<<' ';
    }
    assert(IntStream::frames()==0);
    std::cout<<IntStream::frames()<<'\n';`,'4 1 0\n',
['工厂返回后主体尚未运行，但帧已存在。','第一次恢复产出四并挂起。','停止请求在下一次恢复的检查点被观察，输出保持旧值。','完成后的最终挂起仍保留帧，离开作用域才归零。'],
[experiment('首次 next 前就 request_stop','没有产出，next 返回假且输出不变','主体恢复后先检查停止。'),experiment('工厂传入 fail_at=1','第一项产出后，第二次 next 抛 runtime_error','异常被 promise 保存并由恢复者重新抛出。')]),
pitfalls:[
pit('复制句柄等于共享所有权','IntStream(const IntStream&)=default;','两个拥有者可能销毁同一帧；重复销毁反例不执行。','禁止复制，移动清空来源。'),
pit('保存引用却以为帧保活','Stream generate(const std::vector<int>& values);','帧只保存借用关系，不延长源容器生命。','按值拥有，或明确调用者保活契约。'),
pit('恢复或销毁与另一次恢复重叠','handle.resume(); // 另一线程同时 handle.destroy()','访问已释放或正在执行的帧可能产生未定义行为；反例不执行。','唯一恢复责任与销毁协议必须互斥，撤销调度回调后再清理。')
],
stages:[
stage('机制 · 帧状态图','追踪工厂调用、首次产出、最终挂起和销毁。',['帧状态图','输出修改条件'],['区分完成与释放','不恢复已完成句柄'],'观察 promise 计数。','deep-runtime-coroutine-lifetime'),
stage('边界 · 移动取消异常','实现所有权转移与取消检查。',['流类型实现','异常与帧计数测试'],['输出仅产出时改变','所有拥有者退出后帧数归零'],'异常和完成都在恢复后检查。','deep-runtime-coroutine-lifetime'),
stage('工程 · 接入调度器','设计异步等待、停止和恢复回调撤销。',['恢复权所有权图','关闭与等待取消协议'],['无恢复与销毁并发','普通阻塞等待有明确退出机制'],'先证明谁能恢复，再讨论线程池。','task-executor')
],
workshop:workshop('runtime-coroutine-lifetime','可取消的整数协程流','帧所有权 × 异常传播','实现 IntStream 与 make_stream，按值持有输入并逐项产出。',['C++20 惰性启动，final_suspend 保留帧，由唯一返回对象析构销毁。','禁止复制，支持空对象、移动和覆盖移动；frames 返回存活 promise 数。','next 仅产出时修改输出；完成返回 false；协程异常在该次 next 重抛。','每次产出前先检查停止，再检查 fail_at；非负 fail_at 对应位置抛 runtime_error。','仅顺序单线程使用，输入向量按值拥有；stop_token 按值保存。'],['promise 保存当前值、异常和帧计数。','恢复前查空与完成，恢复后查异常、完成、值。','移动转移句柄并清空来源。'],['完成后最终挂起仍需要 destroy。','取消是检查点协议，不是强制中断。'],
String.raw`class IntStream {
public:
    IntStream()=default;
    IntStream(const IntStream&)=delete;
    IntStream& operator=(const IntStream&)=delete;
    IntStream(IntStream&&)noexcept=default;
    IntStream& operator=(IntStream&&)noexcept=default;
    static int frames()noexcept{return 0;}
    bool next(int&){return false;}
};
IntStream make_stream(std::vector<int>,std::stop_token={},int=-1){return {};}`,streamSolution,[
test('按值与完整结束','{std::vector<int>v{3,7};auto s=make_stream(v);v[0]=99;int x=-1;while(s.next(x))std::cout<<x<<" ";std::cout<<x<<" "<<IntStream::frames()<<" ";}std::cout<<IntStream::frames();','3 7 7 1 0','帧拥有副本，完成后仍保留帧直到析构。'),
test('取消保持输出','std::stop_source stop;{auto s=make_stream({1,2},stop.get_token());int x=8;stop.request_stop();std::cout<<s.next(x)<<" "<<x<<" "<<IntStream::frames()<<" ";}std::cout<<IntStream::frames();','0 8 1 0','取消在检查点生效，不污染输出。'),
test('异常可观察','{auto s=make_stream({4,5},{},1);int x=0;bool first=s.next(x);std::cout<<first<<" "<<x<<" ";try{s.next(x);}catch(const std::runtime_error&){std::cout<<"error ";}std::cout<<s.next(x)<<" "<<x<<" ";}std::cout<<IntStream::frames();','1 4 error 0 4 0','异常重抛后完成，输出保留已产出值。'),
test('覆盖移动释放旧帧','{auto a=make_stream({2});auto b=make_stream({9});std::cout<<IntStream::frames()<<" ";b=std::move(a);int x=0;std::cout<<IntStream::frames()<<" "<<a.next(x)<<" "<<b.next(x)<<" "<<x<<" ";}std::cout<<IntStream::frames();','2 1 0 1 2 0','覆盖释放旧帧，来源变空。')
]),sourceRefs:sources('runtime-coroutine-lifetime')
};




