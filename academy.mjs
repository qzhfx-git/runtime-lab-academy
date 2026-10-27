const S=(title,text,code='')=>({title,text,code});
const Q=(question,options,answer,explanation)=>({question,options,answer,explanation});
const L=(id,module,title,subtitle,sections,quiz,exercises,review,visual='')=>({id,module,title,subtitle,sections,quiz,exercises,review,visual,minutes:25,sources:[{title:'C++ Core Guidelines',url:'https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines'},{title:'标准工作草案 · 请核对特性版本',url:'https://eel.is/c++draft/'}]});
export const modules=[
 {id:'object-model',name:'对象模型',en:'Object model',tag:'FOUNDATIONS',description:'从字节到对象，建立可推导的底层模型。',skills:['存储与生命周期','对齐与对象表示','别名与有效访问'],topics:['objects','layout']},
 {id:'ownership',name:'所有权与值语义',en:'Ownership',tag:'FOUNDATIONS',description:'让资源的创建、转移与释放都有明确归属。',skills:['RAII 与异常路径','共享与弱引用','移动与异常保证'],topics:['ownership','move']},
 {id:'modern',name:'现代 C++',en:'Modern C++',tag:'LANGUAGE',description:'用类型表达意图，让接口承担更多约束。',skills:['类型推导与值类别','optional / variant','span / ranges / lambda'],topics:['modern']},
 {id:'generic',name:'泛型与 CRTP',en:'Generic programming',tag:'LANGUAGE',description:'让抽象在编译期成立，也知道它的边界。',skills:['转发引用','Concepts 与 constexpr','CRTP 与类型擦除'],topics:['templates']},
 {id:'structures',name:'数据结构与建模',en:'Data structures',tag:'SYSTEMS',description:'从容器不变量走向缓存、索引和依赖调度。',skills:['数组 / 环形队列 / 堆','哈希 / 树 / Trie','LRU / 图 / 复杂度'],topics:['structures']},
 {id:'memory',name:'内存管理',en:'Memory management',tag:'SYSTEMS',description:'为分配策略、对象寿命和内存成本负责。',skills:['Arena / Pool','allocator / pmr','资源上限与回收'],topics:['allocator']},
 {id:'design',name:'设计模式与 API',en:'Design & interfaces',tag:'ARCHITECTURE',description:'从变化点选择抽象，而不是从模式名出发。',skills:['Strategy / Factory','Observer / 生命周期','Pimpl / 类型擦除'],topics:['patterns']},
 {id:'concurrency',name:'多线程协作',en:'Concurrency',tag:'SYSTEMS',description:'把线程生命周期、等待与关闭设计成协议。',skills:['mutex / RAII locks','condition_variable','jthread / future / thread pool'],topics:['concurrency']},
 {id:'atomics',name:'原子与内存模型',en:'Memory model',tag:'ADVANCED',description:'写出同步关系，再讨论无锁。',skills:['happens-before','acquire / release / CAS','SPSC / ABA / reclamation'],topics:['atomics']},
 {id:'performance',name:'数据布局与性能',en:'Performance',tag:'ADVANCED',description:'用可重复的证据决定优化方向。',skills:['AoS / SoA / cache','false sharing / locality','基准 / profiling / p99'],topics:['performance']},
 {id:'engineering',name:'工程质量',en:'Engineering',tag:'DELIVERY',description:'让“能运行”走到可维护、可定位、可交付。',skills:['异常安全与契约','CMake / tests / sanitizers','API 演化与诊断'],topics:['engineering']},
 {id:'runtime',name:'TinyRuntime 实战',en:'Build a runtime',tag:'CAPSTONE',description:'组合组件存储、分配器和任务执行体系。',skills:['ECS / entity identity','Job System / backpressure','架构审查 / 迭代交付'],topics:['ecs','jobs','runtime']}
];
export const projects=[
 {id:'cache-service',title:'可预测的缓存组件',subtitle:'LRU CACHE / CONTAINER INVARIANTS',description:'把索引、顺序和容量约束组合成一个可复用组件。以确定行为、异常保证和复杂度分析为验收依据。',exercises:['ring-buffer','min-heap','lru-cache'],deliverables:['可编译的缓存实现与独立测试','设计说明：链表与索引不变量','容量、热点访问与失败场景报告'],rubric:['用不变量解释命中、更新和淘汰后两个容器保持一致','说明 get/put 的平均与最坏复杂度，不把一次计时当成证明','审查迭代器生命周期、复制策略与分配失败的回滚','新增 TTL 或内存预算需求，并解释 API 和测试如何改变'],brief:'交付一个固定容量、平均 O(1) 查询与更新的整数缓存。追加设计任务：如果容量改为字节预算，你会如何计算键值与索引成本？如果需要线程安全，锁应覆盖哪些操作？'},
 {id:'event-service',title:'可组合的事件系统',subtitle:'OBSERVER / LIFETIME / API DESIGN',description:'处理订阅、派发中退订、回调寿命与策略组合，让扩展点有明确契约。',exercises:['event-bus','strategy-pipeline','scope-exit'],deliverables:['事件分发器与策略管线','订阅和关闭协议说明','新增插件场景的演示与回归测试'],rubric:['说明快照派发中新增与退订的时序，避免隐含承诺','证明捕获对象不会因延迟回调而悬空','定义回调异常、中途取消和递归调用的策略','比较 std::function、虚接口、CRTP 的扩展与分配成本'],brief:'实现具有确定派发语义的单线程事件分发器。扩展任务：设计不可复制的 Subscription RAII 句柄。注意发布者可能先于订阅者析构，不能只在句柄中保存裸 EventBus*。'},
 {id:'task-service',title:'可关闭的任务执行器',subtitle:'THREAD POOL / BACKPRESSURE / SHUTDOWN',description:'从有界通道出发，交付传播异常、排空任务、可重复关闭的执行器。',exercises:['locked-counter','blocking-queue','task-executor','lazy-once'],deliverables:['执行器、future 接口和队列测试','关闭时序图与锁顺序表','压力测试记录及 Linux TSan 检查计划'],rubric:['画出接受任务、关闭与工作线程退出的线性化点','证明持锁期间不执行用户回调、不在锁内 join','说明任务丢失、重复执行、取消和异常传播的契约','用目标平台工具检查竞争，记录命令与限制，不用压力测试替代证明'],brief:'交付可排空关闭的任务执行器，线程数量由构造参数决定。扩展任务：增加有界待执行队列和显式取消模型，说明提交返回 rejected、cancelled、exception 的区别。Windows 本机评测没有运行 TSan。'},
 {id:'tiny-runtime',title:'TinyRuntime 组件底座',subtitle:'MEMORY / ECS / JOB GRAPH',description:'把内存、组件布局和依赖模型连成工程主线，练习边界划分与架构演进。',exercises:['arena','slot-pool','sparse-components','dependency-order','soa-step','spsc-queue'],deliverables:['分配与组件核心模块、依赖图测试','实体代数与系统访问约束设计文档','可重复基准、资源统计与性能分析'],rubric:['区分槽位生命周期、对象生命周期与实体身份，说明陈旧句柄检测','说明 swap erase 后稀疏/稠密索引为什么仍一致','定义系统读写集、依赖关系以及环和任务失败的处理','报告 AoS/SoA 的实验方法和数据，并记录同步及回收的未决风险'],brief:'本项目包包含可分别构建和测试的组件模块。整合任务：将 ComponentStore、Arena 和任务执行层组织成多文件运行时，增加带代数的 Entity 句柄及访问声明。整合架构和性能结论需要人工评审，单题 AC 不代表系统已经生产可用。'}
];
export const lessons=[
L('storage-lifetime','object-model','有内存，不等于有对象。','分开观察分配、构造、析构与回收。',[
 S('先区分两条时间线','存储是容纳字节的区域，对象有自己的类型和生命周期。分配一段足够大的内存，并不意味着任意类型的对象都能直接通过指针访问。普通类对象通常需要完成初始化，生命周期结束后也不能继续调用成员。隐式生命周期类型存在专门规则，不应被泛化到所有类。'),
 S('显式构造与销毁','把原始存储交给 construct_at，使用返回的对象指针；结束使用后调用 destroy_at。它结束对象生命，但不会释放承载它的存储。顺序若颠倒，析构代码可能访问已归还的内存。',`alignas(Widget) std::byte storage[sizeof(Widget)];\nauto* p = std::construct_at(\n    reinterpret_cast<Widget*>(storage), 42);\nstd::cout << p->value;\nstd::destroy_at(p); // storage 仍存在`),
 S('工程里的影响','对象池通常先取得槽位，再构造对象。若构造抛出，必须归还槽位；只有构造成功的对象才能被销毁。把这三个状态画出来，比依赖一对看似对称的 new/delete 更容易发现异常路径。')
],[Q('destroy_at(p) 之后，下列哪一项仍然可能存在？',['原对象的有效成员访问','承载对象的原始存储','可继续调用的虚函数表'],1,'destroy_at 结束对象生命周期，不负责释放存储。'),Q('构造函数抛出后，对这个尚未构造成功的对象应怎样处理？',['直接再调用一次析构','归还原始存储，已构造子对象由语言规则清理','忽略这段存储'],1,'完整对象未构造成功，不能把它当成活对象析构。')],['lifetime'],'用三种颜色画出未分配、已取得存储、对象存活三个状态，标出构造异常的回边。','lifetime'),
L('alignment-layout','object-model','让每个对象，落在合法的位置。','理解 alignment、padding 与布局契约。',[
 S('大小和对齐不是同一属性','sizeof 描述对象表示占用的字节数，alignof 描述起始地址需要满足的对齐约束。结构体可能在成员之间和尾部插入 padding，使数组中下一对象依然对齐。它们依赖类型与实现，不能从某台机器的一次输出推导所有平台。'),
 S('对齐计算要保护边界','对正的二次幂 a，可用掩码向上取整，但 size_t 加法可能溢出。分配器应先验证 a，再验证 n+a-1 不会越界。错误请求要保持游标不变，这也是分配接口的失败原子性。',`// 前提：a > 0 且 a 是二次幂\n// 还必须先检查 n + (a - 1) 不溢出\nauto aligned = (n + (a - 1)) & ~(a - 1);`),
 S('不要把布局细节写成业务协议','将结构体直接写入文件会把 padding、端序和 ABI 带进数据格式。持久化与网络协议应定义字段、版本和编码。性能敏感时可以重排字段，但必须测量整体访问模式，而非只追求更小 sizeof。')
],[Q('为什么结构体末尾也可能有 padding？',['让数组中后续对象满足对齐','为了自动清零所有字段','因为每个类都必须有虚表'],0,'尾部填充使 sizeof 成为适合数组步长的大小。'),Q('对齐公式执行前最容易漏掉哪个条件？',['对象是否可复制','加法溢出','函数是否内联'],1,'无符号回绕会把大地址变成小地址，必须先验证。')],['align-up','arena'],'解释一个包含 char 和 double 的结构为什么不能只把字段大小相加。','arena'),
L('representation','object-model','比较的是值，还是字节？','把对象表示与语义、别名规则分开。',[
 S('表示相同和语义相同是两件事','memcmp 比较字节，不调用领域相等关系。具有 padding 的结构体，即使成员值相同，其表示也可能不同；浮点、指针和用户定义语义同样不能简单归约为字节比较。应当按字段定义值相等。'),
 S('字节观察不等于任意类型访问','通过允许的字符或字节视图观察对象表示，与把同一内存强制解释成另一个不相关类型不同。reinterpret_cast 不构造对象，也不取消对齐和别名要求。需要位级转换时，先检查 bit_cast 对大小与可平凡复制类型的要求。',`struct Key { char kind; int id; };\nbool same(const Key& a, const Key& b) {\n    return a.kind == b.kind && a.id == b.id;\n}`),
 S('从规则走到诊断','“我运行过没有崩溃”不能排除未定义行为。优化器依赖语言规则变换代码，调试构建与发布构建可能表现不同。遇到可疑对象访问，应先证明生命周期、对齐和合法访问类型，再使用检测工具寻找违例。')
],[Q('两个对象的成员逐个相等，memcmp 一定返回 0 吗？',['一定','不一定，padding 等表示因素可能不同','只有在堆上才不一定'],1,'值相等不蕴含全部表示字节相同。'),Q('reinterpret_cast 的作用是什么？',['自动开始目标类型生命周期','进行指针或表示层面的转换，不免除访问规则','保证目标地址已经对齐'],1,'转换本身不是合法解引用的证明。')],['value-equality'],'为一个需要跨进程传输的 Key 设计序列化格式，说明版本、端序和字段校验。'),
L('raii-exception','ownership','每条退出路径，都有人负责。','RAII 与唯一资源责任。',[
 S('让类型承担释放责任','RAII 把资源的有效期绑定到对象生命周期。资源不仅是堆内存，还包括锁、文件句柄、事务和订阅。构造成功后对象必须维持不变量；析构负责释放。这样 return、异常和正常退出都走同一条清理路径。'),
 S('所有权接口应该能看出来','按值接收 unique_ptr 表示转移所有权，T& 通常表示借用；返回裸指针前必须说明谁保活对象。shared_ptr 不应成为缺少所有权分析时的默认答案。它会带来引用计数成本，也不能避免逻辑循环。',`void install(std::unique_ptr<Widget> widget);\nauto w = std::make_unique<Widget>(7);\ninstall(std::move(w)); // 此后 w 不再拥有该对象`),
 S('析构与异常','清理动作原则上不应向外抛异常，尤其不能在另一个异常的栈展开中抛出。对于必须报告的关闭错误，提供显式 close/commit 接口，并把析构设计为最后的安全回收。scope guard 适合局部补偿，不替代长期资源类型。')
],[Q('按值接收 unique_ptr 最直接表达什么？',['临时观察','转移独占所有权','隐式复制对象'],1,'参数对象接过释放责任。'),Q('RAII 对异常路径的主要价值是什么？',['禁止所有异常','由对象析构统一清理，不依赖每个分支手写','让所有析构自动无错误'],1,'自动清理解决路径覆盖，释放本身仍须正确设计。')],['unique-transfer','scope-exit'],'把一段含三次获取资源的函数改成 RAII，逐个解释第二次和第三次获取失败时谁负责释放。'),
L('shared-weak','ownership','拥有、观察，各司其职。','control block、weak_ptr 与所有权图。',[
 S('控制块才是共享身份','两个 shared_ptr 的 get() 相同，不一定共享控制块。共享关系来自复制、转换、别名构造或正确的 shared_from_this。重新 shared_ptr(this) 通常制造新的释放责任，可能导致重复释放。enable_shared_from_this 需要对象已经被合适的 shared_ptr 管理。'),
 S('弱引用只观察','weak_ptr 不维持对象存活。lock() 一步尝试取得强引用；成功后返回值负责保活，失败则为空。先 expired() 再直接访问不是安全的并发模式，因为检查之后状态可以变化。shared_ptr 的引用计数安全也不意味着对象成员线程安全。',`if (auto owner = observer.lock()) {\n    use(*owner); // owner 在此作用域内保活\n} else {\n    // 对象已经不存在\n}`),
 S('把循环拆成责任和反向导航','父节点可以拥有子节点，子节点通过 weak_ptr 指向父节点。不是所有边都必须变弱，而是每条强边都需要业务上的释放责任。画出强连通分量后，才能确认是否存在没有外部所有者仍无法释放的闭环。')
],[Q('shared_ptr 的 get() 相等意味着共享控制块吗？',['意味着','不意味着','仅 Windows 意味着'],1,'裸地址相等不代表共享所有权身份。'),Q('安全取得观察对象的做法是什么？',['先 expired 再缓存裸指针','调用 lock 并检查返回 shared_ptr','增加一个普通 bool 标记'],1,'lock 把检查和尝试取得所有权作为一个操作。')],['weak-lock','shared-self','break-cycle','alias-member'],'画出你当前练习中每一条强边和弱边，解释最后一个外部根释放时的销毁顺序。','ownership'),
L('move-guarantees','ownership','移动，转移的是责任。','Rule of Five、noexcept 与容器搬迁。',[
 S('std::move 不是移动操作本身','std::move 是到右值引用类别的转换，让重载决议可能选择移动操作。真正转移资源的是被选中的构造或赋值函数。命名的 T&& 变量仍是左值表达式；const 对象也可能无法使用接受 T&& 的移动构造。'),
 S('移动赋值有两个资源来源','目的对象可能已持有资源，需要正确处理旧资源；源对象要留下有效、可析构的状态。自移动赋值的行为也必须有明确契约。noexcept 是承诺，不是优化开关，写错可能导致 terminate。',`Buffer& operator=(Buffer&& other) noexcept {\n    if (this != &other) {\n        delete[] data_;\n        data_ = std::exchange(other.data_, nullptr);\n        size_ = std::exchange(other.size_, 0);\n    }\n    return *this;\n}`),
 S('容器为什么关心异常保证','当元素移动可能抛出而拷贝可用时，容器可能选择拷贝来维持异常保证。设计一个可移动类型，需要同时考虑转移成本、不变量、异常路径和调用者可依赖的移动后状态，不能只观察有没有出现 std::move。')
],[Q('std::move(x) 本身做了什么？',['复制 x','改变表达式类别，为移动重载创造条件','销毁 x'],1,'它不直接搬运资源。'),Q('移动赋值最常漏掉的资源是什么？',['目的对象原来的资源','源对象的类型名','编译器的缓存'],0,'覆盖目的指针前必须处理它已有的所有权。')],['move-buffer'],'用资源计数证明移动构造、覆盖赋值、自移动和析构都不会泄漏或重复释放。')
];
import {languageLessons} from './academy-language.mjs';
import {foundationLessons} from './academy-foundations.mjs';
import {systemLessons} from './academy-systems.mjs';
lessons.push(...languageLessons,...foundationLessons,...systemLessons);
lessons.sort((a,b)=>modules.findIndex(m=>m.id===a.module)-modules.findIndex(m=>m.id===b.module));
const visualByLesson={'sequence-invariants':'ring','pool-object-lifetime':'pool','atomic-spsc':'spsc','atomic-cas-reclamation':'reclamation','runtime-entity-storage':'entity','runtime-job-graph':'graph','runtime-coroutine-lifetime':'coroutine'};
for(const l of lessons)if(visualByLesson[l.id])l.visual=visualByLesson[l.id];
