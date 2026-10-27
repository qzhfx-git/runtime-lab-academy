// Original, problem-led C++20 teaching assets. Examples are standalone programs.
const step = (title, ...paragraphs) => ({title, paragraphs});
const pit = (title, badCode, why, fix) => ({title, badCode, why, fix});
const stage = (title, task, deliverables, acceptance, hint, exerciseId) => ({title, task, deliverables, acceptance, hint, exerciseId});
const test = (name, body, expected, explanation) => ({name, body, expected, explanation});
const source = section => [
  {title:'C++20 工作草案 N4861 · 本课版本基线',url:'https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/n4861.pdf'},
  {title:`标准工作草案 [${section}] · 最新内容可能超出 C++20`,url:`https://eel.is/c++draft/${section}`},
  {title:'C++ Core Guidelines · 接口、资源与泛型建议',url:'https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines'}
];
const includes = `#include <algorithm>
#include <array>
#include <cassert>
#include <charconv>
#include <concepts>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <iostream>
#include <limits>
#include <memory>
#include <optional>
#include <ranges>
#include <span>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
#include <variant>
#include <vector>`;
const workshop = (id,title,objective,contract,guide,starter,solution,preamble,tests) => ({id:'deep-'+id,title,subtitle:'完整实现 · 边界验证 · 工程契约',objective,contract,guide,hints:guide.slice(0,2),starter,solution,preamble,tests});
const example = (title, exercise, main, expectedOutput, walkthrough, experiments) => ({title,code:includes+'\n'+exercise.preamble+'\n'+exercise.solution+'\nint main() {\n'+main+'\n}\n',expectedOutput,walkthrough,experiments});
export const depthLanguage = {};

{
const w=workshop('forwarding-identity','只消费一次的任务拥有者','实现 make_once_task(F&&) 与 OnceTask<F>，拥有可移动回调并最多执行一次，允许只提供 operator() && 的目标。',
 ['F 满足可无抛移动构造且可作为右值无参数调用；工厂从实参构造衰减后的拥有型 F。','任务不可复制；移动构造转移尚未执行的资格，来源 run() 返回 false。','首次 run() 先标记已消费，再以右值调用目标并返回 true；后续返回 false。','目标若抛异常，异常传播但执行资格仍被消费；不要求移动赋值。'],
 ['工厂边界用 forward 保留实参类别，存储类型用 decay_t 去掉引用。','执行时的 std::move 表达一次消费，与 repeat_apply 反复作为左值调用不同。','资格必须在调用用户代码前撤销，防止异常导致同一动作再次执行。'],
 `template<class F>class OnceTask{public:explicit OnceTask(F){}OnceTask(const OnceTask&)=delete;OnceTask(OnceTask&&)noexcept{}bool run(){return false;}};
template<class F>auto make_once_task(F&&f){return OnceTask<std::decay_t<F>>(std::forward<F>(f));}`,
 `template<class F>class OnceTask {
    static_assert(std::is_nothrow_move_constructible_v<F>);
    static_assert(std::is_invocable_v<F&&>);
    F function_;
    bool active_=true;
public:
    explicit OnceTask(F f)noexcept:function_(std::move(f)){}
    OnceTask(const OnceTask&)=delete;
    OnceTask&operator=(const OnceTask&)=delete;
    OnceTask(OnceTask&&other)noexcept:function_(std::move(other.function_)),active_(std::exchange(other.active_,false)){}
    bool run(){if(!std::exchange(active_,false))return false;std::invoke(std::move(function_));return true;}
};
template<class F>auto make_once_task(F&& f){
    return OnceTask<std::decay_t<F>>(std::forward<F>(f));
}`, '#include <functional>\n#include <type_traits>\n#include <utility>',[
 test('不可复制捕获','int n=0;auto t=make_once_task([p=std::make_unique<int>(7),&n]{n+=*p;});bool first=t.run(),second=t.run();std::cout<<n<<" "<<first<<second<<" "<<std::is_copy_constructible_v<decltype(t)>;','7 10 0','独占状态被拥有，调用资格不复制。'),test('只允许右值调用','struct F{int*p;void operator()()&&{++*p;}void operator()() & = delete;};int n=0;auto t=make_once_task(F{&n});std::cout<<t.run()<<" "<<n;','1 1','真正消费时选择右值限定重载。'),test('移动执行资格','int n=0;auto a=make_once_task([&]{++n;});auto b=std::move(a);std::cout<<a.run()<<b.run()<<b.run()<<" "<<n;','010 1','来源保持有效但失去执行资格。'),test('异常也消费','int n=0;auto t=make_once_task([&]{++n;throw std::runtime_error("fail");});try{t.run();}catch(const std::runtime_error&){}std::cout<<t.run()<<" "<<n;','0 1','发生异常不自动重试不明副作用。')]);
depthLanguage['forwarding-identity']={goals:['按推导规则写出引用折叠后的类型','区分借用反复调用与拥有一次消费','设计异常也不会重复执行的任务资格'],prerequisites:['理解 move、引用折叠和命名变量的值类别','理解回调对象可以不可复制并带引用限定重载'],derivation:[
step('同一个 T&& 可能承诺两种不同事情','重复执行器希望保留一个计数回调的身份，调用三次后外部仍能读到三次计数；一次任务则希望把独占资源交给最终动作使用。两者都可能在入口写出 F&&，但语义完全不同。先回答函数是否存储实参、是否反复使用、是否将其当作可消费对象，再决定转发位置。语法不能替代这三项关于资源与时间的决定。','对于参与推导的非 const 模板参数，左值实参让 F 推导为引用类型，经引用折叠后参数继续借用原对象；右值实参通常使 F 为普通类型。无论哪种情况，函数体内命名的 f 都是左值表达式。这解释了为什么 repeat_apply 直接调用 f 能保留同一对象状态，也解释了为何需要一次性传递时要显式恢复调用方类别。'),
step('在拥有边界保留类别并移除引用','make_once_task 要把回调带离工厂作用域，因此存储类型不能直接使用可能为引用的 F。我们用 decay_t 得到拥有型目标，再把 std::forward<F>(f) 交给构造。这不是“所有地方都 forward”，而是在一次明确的拥有权边界保留实参类别。传入可复制左值会构造副本，传入不可复制右值可以转移，传入不可复制左值则需要调用者显式决定是否移动。','OnceTask 的构造接收一个 F 值，再移动到成员，要求目标无抛移动以保持任务移动操作简单可靠。这个教学约束不是所有任务系统必须采用的选择；若允许抛出移动，队列扩容和失败恢复就需要更复杂的设计。工厂不保存对其参数变量的引用，因此参数作用域结束不会让任务本体悬空，但回调内部自己的引用捕获仍需调用方负责。'),
step('用引用限定调用运算符表达消费','某些回调只提供 operator() &&，表示它只能作为准备被消费的对象调用。run 使用 std::move(function_)，把拥有的目标交给这个消费接口；这里只会尝试一次。与之对照，重复执行器每轮都 forward 一个最初的右值，会反复选择消费重载，可能在第二轮使用已经耗尽的内部资源。因此正确与否由调用协议决定，而不是有没有使用所谓完美转发。','右值调用本身不强制对象销毁，也不保证目标清空资源，它只是参与重载选择。真正的消费行为由目标实现承担。任务包装器承担另一层责任：控制调用资格。将目标状态和资格状态分开后，可以清楚解释即使目标动作没有移动任何成员，也不能再次运行同一任务；因为任务语义要求最多执行一次，而不是检查目标看起来是否还可用。'),
step('在用户代码之前撤销执行资格','如果执行完回调才把 active 置假，回调抛出时资格仍然有效。调用方重试可能重复发送消息、扣除额度或提交结果，因此本课先 exchange 为假，再进入用户代码。异常传播给调用方，但包装器不会假装能够安全重试。要实现可重试任务，需要目标提供幂等键或更完整事务协议，不能仅凭一个布尔值恢复资格。','移动构造同时移动函数对象并取走 active。来源被置为无资格，仍可安全调用 run 得到 false。已运行任务再移动也只能得到无资格任务。不可复制是必要限制，否则一个原本只能执行一次的动作可能复制成两份资格。测试除了运行次数，还检查类型不可复制，以防接口层开放了会绕过运行时状态机的路径。'),
step('把失败替代与抽象成本一起评审','完整示例用只可右值调用、持有 unique_ptr 的目标，证明存储与调用没有暗中要求复制。再用会抛出的目标验证资格不恢复。失败替代包括保存 F& 导致工厂返回后借用风险、每轮消费导致重复耗尽，以及执行后撤销导致异常重试。每种替代都能对应一个明确反例，不需要靠“转发更现代”这种笼统判断选择实现。','这种模板任务会为不同 F 产生不同类型，可能改善内联机会，也增加实例化数量与代码体积。若需要一个运行期异构任务队列，需要虚接口、手写类型擦除或合适版本的任务包装器；C++20 的 std::function 要求目标可复制，不能直接替代本例的独占捕获。应测量编译时间、二进制体积和实际派发成本，再选择边界在哪里擦除类型。')],
example:example('拥有独占数据的单次动作',w,`struct Action {
 std::unique_ptr<int> payload;int*sum;
 Action(int n,int&s):payload(std::make_unique<int>(n)),sum(&s){}
 Action(Action&&)noexcept=default;Action(const Action&)=delete;
 void operator()()&&{*sum+=*payload;payload.reset();}
 void operator()() & = delete;
};
int sum=0;auto source=make_once_task(Action{9,sum});auto target=std::move(source);
assert(!source.run());assert(target.run());assert(!target.run());assert(sum==9);
int attempts=0;auto failure=make_once_task([&]{++attempts;throw std::runtime_error("failed");});
try{failure.run();}catch(const std::runtime_error&){}
assert(!failure.run()&&attempts==1);
std::cout<<sum<<' '<<attempts<<' '<<std::is_copy_constructible_v<decltype(target)>;`,'9 1 0',['Action 的复制被删除，工厂只能通过移动接收其独占状态。','decay_t 让成员保存拥有型目标，而非对工厂参数的引用。','run 中 std::move 命中 operator() &&；删除它会让此示例编译失败。','exchange 在调用之前撤销资格，异常后再调用返回 false。','移动来源和已消费目的都没有第二次执行资格，输出确认只执行一次。'],[{change:'将 std::invoke(std::move(function_)) 改为 std::invoke(function_)',prediction:'只提供右值调用的 Action 无法编译。',reason:'命名成员是左值，不能绑定到仅允许右值调用的重载。'},{change:'把 active_=false 放到回调返回后',prediction:'异常任务仍保持资格，重试会再次增加 attempts。',reason:'用户代码抛出会跳过后续状态更新。'},{change:'在 repeat_apply 中每轮都 forward 临时回调',prediction:'可能重复选择消费重载，第二次面对已耗尽资源。',reason:'转发类别不是反复消费许可；这一失败替代应以受控状态断言分析。'}]),
pitfalls:[pit('把所有双与号都当转发引用','void take(const T&& value);','const 限定或不参与推导的参数不满足同一转发规则。','先写出模板实参推导过程与折叠后的参数类型。'),pit('存储推导出的引用','template<class F>struct Task{F f;};','F 可能是引用，包装器看似拥有却继续借用外部对象。','在拥有边界选择 decay_t，并明确左值复制与右值转移。'),pit('机械重复转发','for(int i=0;i<n;++i)std::invoke(std::forward<F>(f));','相同对象可能被重复当作一次性消费目标。','重复使用按左值调用；消费接口维护最多一次资格。'),pit('异常后恢复未知副作用','try{f();active=false;}catch(...){active=true;throw;}','无法知道目标执行到哪一步，恢复资格可能重复外部动作。','把重试作为独立协议，默认最多一次任务不恢复资格。')],
stages:[stage('保留可复用身份','实现不复制回调的重复执行器并比较左右值重载。',['推导与引用折叠表','计数回调测试'],['不可复制左值仍可重复调用','不机械地每轮 forward'],'同一个命名回调在函数体内是左值。','generic-repeat'),stage('实现拥有与一次消费','建立 OnceTask 的拥有型成员与资格状态。',['独占捕获示例','移动前后状态表'],['仅右值可调用目标可工作','移动来源不能再次执行'],'拥有边界和消费边界是两个位置。','deep-forwarding-identity'),stage('形成明确任务协议','加入异常资格与运行期替代评审。',['完整任务实现','类型擦除与模板成本比较'],['全部综合测试通过','解释为何异常不自动重试'],'评审无法由包装器回滚的副作用。','deep-forwarding-identity')],workshop:w,sourceRefs:source('temp.deduct.call')};
}

{
const w=workshop('constraints-constants','带强保证的泛型批量追加','定义 TransactionalIntSink<C> 概念及 append_checked(C&,span<const int>,maximum)，把符合契约的容器作为事务目标。',
 ['概念要求 C 可复制构造、可无抛 swap；C& 上 reserve(size_t)、push_back(int) 返回 void，const C& 上 size() 精确返回 size_t。','若现有大小大于 maximum 或追加后超限，返回 false 且不改变目标。','合法请求先复制目标并修改副本，成功后交换提交；分配或 push_back 异常传播且目标不变。','概念不要求默认构造；实现语义要求这些操作确实满足容器含义。'],
 ['表达式约束只写算法真实使用的能力，避免误加默认构造要求。','使用 input.size()<=maximum-current 防止大小加法溢出。','强保证还依赖无抛提交；把这一类型性质也纳入约束。'],
 `template<class C>concept TransactionalIntSink=false;
template<class C>bool append_checked(C&,std::span<const int>,std::size_t){return false;}`,
 `template<class C>concept TransactionalIntSink=
    std::copy_constructible<C> && std::is_nothrow_swappable_v<C> &&
    requires(C&value,const C&read,std::size_t count,int element){
        {read.size()}->std::same_as<std::size_t>;
        {value.reserve(count)}->std::same_as<void>;
        {value.push_back(element)}->std::same_as<void>;
    };
template<TransactionalIntSink C>
bool append_checked(C&destination,std::span<const int>input,std::size_t maximum){
    const auto current=destination.size();
    if(current>maximum || input.size()>maximum-current)return false;
    C next=destination;
    next.reserve(current+input.size());
    for(int element:input)next.push_back(element);
    using std::swap;swap(destination,next);
    return true;
}`, '#include <concepts>\n#include <span>\n#include <type_traits>\n#include <utility>',[
 test('能力约束','struct Missing{void reserve(std::size_t);};struct Wrong{std::size_t size()const;int reserve(std::size_t);void push_back(int);};std::cout<<TransactionalIntSink<std::vector<int>><<TransactionalIntSink<Missing><<TransactionalIntSink<Wrong>;','100','返回类型与完整操作集合都需要满足。'),test('容量与提交','std::vector<int>a{1};std::array<int,2>b{2,3};std::cout<<append_checked(a,b,2)<<" "<<a.size()<<" "<<append_checked(a,b,3)<<" "<<a.back();','0 1 1 3','拒绝不修改，成功一次提交。'),test('中途异常回滚','struct C{std::vector<int>v;std::size_t size()const{return v.size();}void reserve(std::size_t n){v.reserve(n);}void push_back(int n){if(n<0)throw std::runtime_error("negative");v.push_back(n);}};C c{{1}};std::array<int,2>input{2,-1};try{append_checked(c,input,9);}catch(const std::runtime_error&){}std::cout<<c.v.size()<<" "<<c.v[0];','1 1','副本上部分成功不影响原容器。'),test('不要求默认构造','struct C{std::vector<int>v;C()=delete;explicit C(int n):v{n}{}std::size_t size()const{return v.size();}void reserve(std::size_t n){v.reserve(n);}void push_back(int n){v.push_back(n);}};C c(4);std::cout<<TransactionalIntSink<C><<" "<<append_checked(c,std::array{5},2)<<" "<<c.v.back();','1 1 5','requires 参数不会构造实际 C。'),test('已有大小超限','std::vector<int>a{1,2};std::cout<<append_checked(a,{},1)<<" "<<a.size();','0 2','空追加也必须满足整体容量契约。')]);
depthLanguage['constraints-constants']={goals:['从算法使用点反推 concepts 的最小要求','区分静态语法可用性与动态容器语义','用类型约束和候选提交共同证明强保证'],prerequisites:['理解模板替换与 requires 表达式','理解拷贝、swap 和异常保证'],derivation:[
step('从泛型函数深处的错误开始','批量追加算法调用 reserve、size 和 push_back，换一种容器后却在模板函数体深处报出长串错误。我们先不增加复杂元编程，而是列出算法确实需要的操作，以及每个返回类型怎样被使用。只检查有没有 reserve 这个名字远远不够，它可能返回不同类型、只在错误的 const 限定下可调用，或根本不接受我们传入的大小。','本课希望追加失败后原容器不变，所以操作需求不止三个成员函数：还需要能够复制出候选，并用不抛出的交换提交。接口概念因此同时包含表达式要求和类型性质。这样约束不只是改善报错，它公开了实现为什么能够承诺强保证的部分证据。若这些要求对某个容器太重，应提供另一种语义的接口，而不是放宽约束后继续保留原承诺。'),
step('把表达式写在正确的对象类别上','requires 中使用 C& 检查可变操作，使用 const C& 检查大小查询，能把只读能力也纳入契约。形参仅用于描述表达式，不会真正构造一个 C，因此不应该额外要求默认构造。返回 size_t 的精确要求是本课特定接口选择，其他算法可以接受可转换类型；无论选择哪种，都应对应实际使用需求，而不是照抄某个看起来通用的概念。','requires 表达式检查能否形成合法表达式，通常不执行这些操作。一个伪容器可以提供正确签名却完全不存数据，依然通过语法约束。这说明“满足概念”包含编译器可检查部分和设计者约定的语义部分。命名应表达能力而不是某个具体实现，同时用测试证明追加、容量和复制行为符合预期，不能把运行期验证全部删掉。'),
step('在进行加法之前证明范围','最大容量来自调用者，当前大小可能已经超过它；必须先检查这个状态，再用输入长度与剩余容量比较。若直接计算 current+input.size()，无符号回绕可能把超大请求伪装成小值。通过减法建立安全范围后，加法才具有数学上的含义。拒绝请求在复制和修改之前返回，既保持状态，也避免对明显无效输入进行多余分配。','constexpr 可以把纯粹的范围判定提取成可在编译期验证的函数，但它不意味着整个容器事务都在编译期运行。static_assert 要求特定常量调用成立，运行期长度仍在运行期检查。对于本课，更重要的是将可静态证明的接口性质、纯规则测试以及动态资源操作分层，而不是为了展示关键字把不适合的全部逻辑塞进常量表达式。'),
step('用候选副本隔离所有可能失败动作','复制目标、预留容量和逐项追加都可能失败，因此它们都在独立 next 对象上进行。异常传播时局部对象析构，原 destination 保持不变。只有全部成功才执行 swap。我们要求交换不抛出，使提交点不会出现半途失败。输入 span 即使借用原 vector 的元素，在提交前原对象也没有被修改；提交后该借用的失效仍应由调用方按容器规则处理。','这个保证针对目标容器状态，不承诺容器内部恶意修改全局对象的副作用也会回滚。自定义容器必须遵守复制与交换的正常语义。无抛交换这一 traits 检查也依赖函数声明诚实，错误 noexcept 可能在运行时终止程序。因此静态约束是工程契约的一层证据，代码审查和异常注入测试仍有价值，不能把一个 true 的概念值当作形式化证明。'),
step('分别验证接受集合与行为保证','第一组测试检查标准 vector 被接受、缺少方法或返回类型不符的类型被拒绝。另一组使用没有默认构造的容器，证明接口没有添加无关限制。行为测试让第二次 push_back 抛出，观察原容器仍保留旧数据；容量测试则检查拒绝发生在修改前。这样测试分别覆盖类型集合、正常行为和异常路径，不会重复实现中的某一条判断来制造虚假信心。','模板为不同容器实例化可能增加编译时间和代码体积，但不一定比虚接口更慢或更快。若产品边界需要运行期选择容器，可以隐藏具体类型并在边界擦除；若热点循环需要具体类型信息，可以保留模板。应使用相同输入和优化构建测量，并报告工具链、数据量及分配行为。抽象决策建立在约束与证据上，而不是“泛型天然零成本”的口号。')],
example:example('静态能力与动态回滚各自验证',w,`static_assert(TransactionalIntSink<std::vector<int>>);
constexpr auto fits=[](std::size_t used,std::size_t extra,std::size_t limit){return used<=limit && extra<=limit-used;};
static_assert(fits(2,3,5));static_assert(!fits(2,4,5));
struct Sink{std::vector<int>v;std::size_t size()const{return v.size();}void reserve(std::size_t n){v.reserve(n);}void push_back(int n){if(n<0)throw std::runtime_error("reject");v.push_back(n);}};
static_assert(TransactionalIntSink<Sink>);Sink sink{{1}};
try{append_checked(sink,std::array{2,-1},5);}catch(const std::runtime_error&){}
assert((sink.v==std::vector<int>{1}));assert(append_checked(sink,std::array{2,3},3));
assert(!append_checked(sink,std::array{4},3));
std::cout<<sink.v.size()<<' '<<sink.v.front()<<' '<<sink.v.back();`,'3 1 3',['requires 检查具体对象限定和返回类型，static_assert 验证接受集合。','constexpr fits 仅演示纯范围规则，不能替代运行期容量判断。','第二次追加抛出时只破坏候选副本，原容器仍为一个元素。','using std::swap 后无抛交换成为唯一提交点。','失败替代是直接修改 destination；它会在异常后遗留第二个元素，破坏断言。'],[{change:'去掉 const C& 上的 size 要求',prediction:'只可在可变对象上查询的类型可能错误进入接受集合。',reason:'接口约束不再表达原先的只读能力。'},{change:'在 destination 上直接 push_back',prediction:'负数回调失败前追加的 2 会遗留在原容器。',reason:'用户可见状态在全部成功前就被修改。'},{change:'把静态概念检查当成容量正确性的证明',prediction:'伪容器可以通过编译，却不保存任何元素。',reason:'表达式合法不等于业务语义满足。'}]),
pitfalls:[pit('无意要求默认构造','requires { C{}.reserve(10); }','会拒绝本来可以复制和追加但不能默认构造的类型。','在 requires 参数中声明假想引用。'),pit('只按名字检查','requires(C&c){c.reserve(1);};','没有表达返回类型、只读查询、追加及无抛提交需求。','从算法每个使用点推导最小完整约束。'),pit('用 constexpr 宣传自动提速','constexpr bool fits(...); // 因而整个事务无运行成本','constexpr 不强制所有调用编译期求值，更不消除容器分配。','区分常量表达式上下文和普通运行期调用。'),pit('忽略提交能否失败','swap(destination,next); // 任意 swap 都安全','若交换可能抛出，强保证的提交证明不完整。','限制无抛交换或设计另外的可恢复提交协议。')],
stages:[stage('提取真实能力','完成 Reservable 概念并列出不应要求的属性。',['操作与类型关系表','正反类型样例'],['无默认构造类型可接受','返回类型错误被拒绝'],'requires 参数不会构造对象。','reservable-concept'),stage('将能力用于事务算法','实现容量验证和副本追加。',['候选提交状态图','大小边界测试'],['拒绝不修改目标','加法前已经证明范围'],'把可能抛出的动作全部放在候选上。','deep-constraints-constants'),stage('验证语义与替代设计','加入异常容器并比较静态约束与运行期验证。',['完整泛型算法','概念无法证明的性质清单'],['全部测试通过','解释无抛交换为何是要求'],'用第二次追加失败打破只测试正常路径的盲点。','deep-constraints-constants')],workshop:w,sourceRefs:source('expr.prim.req')};
}

{
const pre='#include <concepts>\n#include <optional>\n#include <limits>\nstruct SequenceSummary{std::size_t count;long long total;int minimum,maximum;};\ntemplate<class T>concept HasSummary=requires(const T&value){value.summarize();};';
const w=workshop('crtp-erasure','有静态契约的 CRTP 序列分析','实现 SequenceMixin<Derived>::summarize() const，为只读整数序列提供统计，并限制错误的基类构造。',
 ['Derived 的 size() const 可转换为 size_t；at(size_t) const 必须精确返回 int。不满足时 summarize 不参与调用。','语义上 size 必须返回可无损转换为 size_t 的非负长度；同次统计中长度与元素读取保持一致。Concepts 不自动证明这项语义。','空序列返回 nullopt 且不调用 at；非空返回 count、long long total、minimum、maximum。','size 大于 1000000 时抛 length_error，避免无界遍历并给累加范围提供上界；元素异常直接传播。','基类默认与复制构造为 private，仅 friend Derived；析构为 protected；不得使用 virtual。','不在基类构造或析构期间调用派生接口，实际对象必须与 CRTP 参数匹配。'],
 ['在成员函数 requires 上检查 Derived，避免基类实例化时过早要求未完整派生类。','从 const this 转换成 const Derived&，保留只读语义。','私有构造配合 friend Derived 限制普通错误配对，静态向下转换仍依赖真实对象关系。'],
 `template<class D>class SequenceMixin{public:SequenceMixin()=default;std::optional<SequenceSummary>summarize()const{return {};}};`,
 `template<class D>concept IntegerSequence=requires(const D&value,std::size_t index){
    {value.size()}->std::convertible_to<std::size_t>;
    {value.at(index)}->std::same_as<int>;
};
template<class D>class SequenceMixin {
    friend D;
    SequenceMixin()=default;
    SequenceMixin(const SequenceMixin&)=default;
protected:
    ~SequenceMixin()=default;
public:
    std::optional<SequenceSummary> summarize()const requires IntegerSequence<D>{
        const auto&self=static_cast<const D&>(*this);
        const auto count=static_cast<std::size_t>(self.size());
        if(count>1000000)throw std::length_error("sequence too large");
        if(count==0)return {};
        const int first=self.at(0);
        SequenceSummary result{count,first,first,first};
        for(std::size_t i=1;i<count;++i){const int n=self.at(i);result.total+=n;result.minimum=std::min(result.minimum,n);result.maximum=std::max(result.maximum,n);}
        return result;
    }
};`,pre+'\n#include <stdexcept>\n#include <algorithm>',[
 test('静态只读接口','struct S:SequenceMixin<S>{S()=default;std::size_t size()const{return 3;}int at(std::size_t i)const{return i==0?-4:(i==1?7:2);}};const S value;auto r=value.summarize();if(!r)std::cout<<"empty";else std::cout<<r->count<<" "<<r->total<<" "<<r->minimum<<" "<<r->maximum;','3 5 -4 7','基类通过 const 派生接口复用算法。'),test('空与范围上界','struct Empty:SequenceMixin<Empty>{Empty()=default;std::size_t size()const{return 0;}int at(std::size_t)const{throw std::logic_error("unexpected");}};struct Huge:SequenceMixin<Huge>{Huge()=default;std::size_t size()const{return 1000001;}int at(std::size_t)const{return 1;}};bool caught=false;try{Huge{}.summarize();}catch(const std::length_error&){caught=true;}std::cout<<Empty{}.summarize().has_value()<<" "<<caught;','0 1','空不访问，超限不遍历。'),test('拒绝错误签名','struct Bad:SequenceMixin<Bad>{Bad()=default;std::size_t size()const{return 1;}double at(std::size_t)const{return 1;}};std::cout<<HasSummary<Bad>;','0','不依赖函数体深处才发现不符合接口。'),test('限制构造和虚派发','struct Good:SequenceMixin<Good>{Good()=default;std::size_t size()const{return 1;}int at(std::size_t)const{return 1;}};struct Wrong:SequenceMixin<Good>{};std::cout<<std::is_default_constructible_v<SequenceMixin<Good>><<std::is_default_constructible_v<Wrong><<std::is_polymorphic_v<Good>;','000','普通误配不能建立可用对象，接口不使用虚派发。'),test('宽累加与异常传播','struct S:SequenceMixin<S>{S()=default;std::size_t size()const{return 3;}int at(std::size_t)const{return 2000000000;}};struct Broken:SequenceMixin<Broken>{Broken()=default;std::size_t size()const{return 2;}int at(std::size_t i)const{if(i)throw std::runtime_error("failed");return 1;}};bool caught=false;try{Broken{}.summarize();}catch(const std::runtime_error&){caught=true;}auto summary=S{}.summarize();std::cout<<(summary?summary->total:0)<<" "<<caught;','6000000000 1','累加不截断，派生失败不伪装成成功结果。')]);
depthLanguage['crtp-erasure']={goals:['从重复算法推导 CRTP 的静态接口与向下转换前提','利用延迟成员约束和访问控制限制误用','比较静态混入、虚接口与类型擦除的工程成本'],prerequisites:['理解模板实例化、继承和 const 成员','理解 concepts、引用类别与对象构造顺序'],derivation:[
step('先识别算法相同而存储不同的地方','两个序列类型分别拥有 vector 和固定数组，但都需要总和、最小值与最大值。重复统计代码会让边界修复不同步，而让它们继承一个虚基类又可能引入并不需要的运行期接口。先把共同算法真正需要的操作写出来：只读 size 与按索引读取整数。算法不需要知道存储布局，这为静态混入提供了清楚而有限的职责边界。','CRTP 的形式是派生类把自己的类型作为基类模板参数，基类在成员实现里把自身引用转换回指定派生类型，再调用这些操作。调用目标在实例化时已知，编译器有机会内联，但机会不是性能保证。不同派生类型产生不同基类特化，它们并没有因此获得一个运行期统一类型；理解这一点可以避免后来把异构集合问题错误地推给模板语法。'),
step('在正确时机检查完整派生接口','定义派生类的基类列表时，派生类本身尚未完整。如果立刻在基类模板入口要求 Derived 已经提供全部成员，可能过早检查而失败。我们把 IntegerSequence 要求放在 summarize 的成员约束上，等调用该成员时再判断完整类型。约束检查只读 size 能转换为大小类型，at 精确返回 int，使错误签名在接口层被拒绝。','函数体首先 static_cast 到 const Derived&，明确保持只读访问。这里的转换没有运行期类型检查，合法性依赖当前基类子对象确实属于指定 Derived。Concepts 能检查表达式，却不能替我们证明这个实际对象关系。接下来给大小设置一百万上限，既限制遍历成本，也使整数元素累加到 long long 有清晰范围证明，避免把“类型更宽”当成无限安全。'),
step('用构造访问限制普通误配','如果基类构造公开，用户可能单独构造 SequenceMixin<Good>，或者定义 Wrong 继承它，再调用假定自己属于 Good 的算法。这样的静态向下转换前提不成立，可能产生未定义行为。我们把默认和复制构造设为 private，并只授予 Derived 友元访问，使普通误配类型无法完成基类构造。析构受保护则阻止经基类指针直接删除，进一步表达它不是运行期拥有接口。','访问限制不是魔法运行期证明，复杂友元代码仍可能制造错误关系，因此工程上还应保持继承层次简单并进行审查。C++20 中若派生仍是聚合，花括号可能直接在调用处初始化私有基类而被拒绝；显式声明派生构造函数，让它在友元权限下构造基类。基类构造函数和析构函数不调用派生接口：这些阶段派生层可能尚未建立或已经结束，访问其成员状态会违反寿命前提。为了复用少量算法而引入复杂多重继承通常得不偿失，组合或自由函数可能更清楚。'),
step('从可见边界推导完整统计行为','空序列没有自然的最小值和最大值，因此返回 nullopt，而不是用零冒充结果。非空时先读取第一个元素初始化三项统计，再从第二项开始循环，避免重复访问或不合理哨兵。派生 at 抛出时直接传播，局部结果不会被返回为成功。size 与 at 的一致性仍是语义契约：编译器只看到签名，不能证明索引小于大小时一定能正确访问。','测试不仅检查总和，还检查 const 对象可调用、错误返回类型不可调用、空序列不触发 at、超限提前拒绝，以及 Wrong 的普通构造被禁用。故意错误的向下转换只做文字推演，不执行以观察崩溃。示例再提供一个 std::function 包装同一统计操作，让学习者看到静态算法可以在明确边界被擦除，生命周期与分配成本也必须在该边界重新审查。'),
step('把零虚调用放回完整成本模型','模板可能为多个序列类型生成近似机器码，增加编译耗时、链接工作和二进制体积；内联也可能让热点更快或让指令缓存压力变大。若要比较 CRTP 与虚接口，应固定数据、调用数量和优化选项，分别记录构建时间、产物大小与运行性能，不能只看一次纳秒级计时。需要的结论是具体系统在哪个边界受益，而不是给一种语法永久排名。','运行期插件或异构集合通常更适合统一虚接口或拥有型类型擦除。前者公开继承契约，后者把具体类型藏在包装器内部，两者都需要清楚的析构、复制移动与线程语义。C++20 的 std::function 适合可复制调用目标，却不保证所有目标都不分配。最终设计可以让内部统计保持模板、外部控制面使用擦除接口，这种分层比全系统统一成一种多态方式更灵活。')],
example:example('静态混入与一个明确的擦除边界',w,`class Samples final:public SequenceMixin<Samples>{
 std::vector<int> values_;
public:explicit Samples(std::vector<int>v):values_(std::move(v)){}
 std::size_t size()const{return values_.size();}
 int at(std::size_t i)const{return values_.at(i);}
};
struct Wrong:SequenceMixin<Samples>{};
static_assert(!std::is_default_constructible_v<Wrong>);
static_assert(!std::is_polymorphic_v<Samples>);
static_assert(HasSummary<Samples>);
const Samples samples({-2,5,8});auto direct=samples.summarize();
assert(direct&&direct->total==11&&direct->minimum==-2&&direct->maximum==8);
std::function<std::optional<SequenceSummary>()> erased=[&samples]{return samples.summarize();};
assert(erased()->total==direct->total);
const Samples empty({});assert(!empty.summarize());
std::cout<<direct->count<<' '<<direct->total<<' '<<erased()->maximum;`,'3 11 8',['SequenceMixin<Samples> 在基类列表时不急于检查尚未完整的 Samples。','summarize 的 requires 在调用处检查 size/at，失败类型不会得到可用成员。','const Derived& 的转换保持只读性，实际对象关系由正确继承和构造限制共同支持。','Wrong 的默认构造静态断言失败替代，避免执行任何错误向下转换。','先以第一个值初始化统计，再遍历剩余值，空序列独立返回 nullopt。','std::function 形成运行期调用边界；此例捕获引用只在 samples 仍存活的 main 内使用，不能直接作为逃逸任务返回。'],[{change:'把基类默认构造改为 public',prediction:'Wrong 可能变得可默认构造，保护性断言失败。',reason:'普通误配不再被构造入口阻止；不要执行它的向下转换。'},{change:'把 Samples::at 返回类型改成 double',prediction:'HasSummary<Samples> 变为假，调用 summarize 不满足约束。',reason:'静态接口要求精确整数元素类型。'},{change:'将擦除回调返回给长于 samples 的拥有者',prediction:'引用捕获可能悬空；该变体只做寿命审查。',reason:'类型擦除不会自动延长捕获目标生命。'}]),
 pitfalls:[pit('基类入口过早约束','template<IntegerSequence D>class SequenceMixin;','派生类在基类列表处尚未完整，接口可能被过早检查。','在真正调用的成员上延迟要求，或重新组织独立自由算法。'),pit('静态转换当运行期检查','return static_cast<const D&>(*this).at(0);','实际对象若不是对应 D，转换前提不成立，可能是未定义行为；不执行该反例。','限制构造、保持继承简单，并审查真实对象关系。'),pit('构造阶段访问派生状态','SequenceMixin(){static_cast<D&>(*this).initialize();}','派生成员尚未建立，不能假设完整派生状态已经可用。','把依赖完整对象的操作放到构造完成后的显式接口。'),pit('聚合初始化绕过构造入口','struct Good:SequenceMixin<Good>{ /* 只有方法 */ }; auto x=Good{};','在 C++20 中聚合花括号初始化可能直接在调用方上下文初始化基类，从而碰到私有构造和受保护析构的访问限制。','为正确派生类声明 Good()=default 或具体构造，使它成为非聚合，并在派生构造内部使用友元权限。'),pit('认为没有虚表就没有成本','// CRTP 一定更小、更快，所以无需测量','实例化和内联可能增加代码体积，性能取决于数据及调用边界。','固定构建条件比较运行性能、构建耗时与产物大小。')],
stages:[stage('建立静态派发模型','完成 SumMixin 并写出模板实例化后的调用关系。',['Derived 到基类的关系图','const 派发示例'],['不使用 virtual','宽类型累加正确'],'先明确算法真正需要的派生操作。','crtp-mixin'),stage('加入接口与构造限制','为统计接口增加 requires、私有构造与友元。',['合法错误类型矩阵','构造阶段禁止事项'],['错误返回类型不可调用','普通错误配对不可构造'],'不要在派生类型未完整时过早检查接口。','deep-crtp-erasure'),stage('交付并比较运行时替代','完成边界统计与类型擦除演示，提出可复现性能比较。',['完整混入与擦除示例','代码体积和编译性能实验方案'],['全部综合测试通过','能解释异构集合为何另需统一表示'],'用证据讨论成本，不把零虚调用当作万能结论。','deep-crtp-erasure')],workshop:w,sourceRefs:source('expr.static.cast')};
}

{
const w=workshop('deduction-capture','拥有独立状态的延迟历史记录器','实现 make_history(vector<int> seed)，返回可调用对象；每次调用追加一个整数，并按值返回完整历史。',
 ['记录器拥有 seed 的独立存储，调用方之后修改原容器不影响它。','调用同一记录器会累积历史；按值复制记录器形成独立分支。','每次返回的 vector 独立于内部状态，调用方修改返回值不影响后续历史。','不保存传入参数或局部变量的悬空引用；本课不提供并发调用保证。'],
 ['按值参数把函数边界的所有权说清楚，再用初始化捕获移动进闭包。','修改闭包自身状态需要 mutable，但这不意味着外部参数也会被修改。','返回状态副本是本题的快照契约，不能改成引用来省拷贝。'],
 `auto make_history(std::vector<int> seed){(void)seed;return [](int){return std::vector<int>{};};}`,
 `auto make_history(std::vector<int> seed){
    return [history=std::move(seed)](int value) mutable {
        history.push_back(value);
        return history;
    };
}`, '#include <vector>\n#include <utility>',[
 test('延迟状态独立','std::vector<int>seed{1};auto log=make_history(seed);seed[0]=9;auto a=log(2);for(int n:a)std::cout<<n<<" ";','1 2','外部种子变化不污染闭包。'),test('累积和返回副本','auto log=make_history({});auto first=log(3);if(!first.empty())first[0]=99;auto second=log(4);if(second.size()<2)std::cout<<"short";else std::cout<<second[0]<<" "<<second[1];','3 4','返回快照不泄漏可变内部引用。'),test('复制形成分支','auto a=make_history({1});a(2);auto b=a;auto x=a(3);auto y=b(8);std::cout<<(x.empty()?0:x.back())<<" "<<(y.empty()?0:y.back())<<" "<<x.size()<<" "<<y.size();','3 8 3 3','闭包复制复制拥有的容器状态。')]);
depthLanguage['deduction-capture']={goals:['通过实际声明判断复制、借用与转移','从闭包成员理解捕获和 mutable','为延迟回调设计明确的状态快照语义'],prerequisites:['能区分值传递和引用传递','知道局部对象在函数返回时销毁'],derivation:[
step('从一个返回 Lambda 的函数开始','我们要返回一个以后还能追加历史记录的回调。最直观的写法是在工厂里创建 vector，再用引用捕获返回 Lambda；然而工厂返回后局部 vector 已经销毁，回调中的引用只剩悬空关系。问题不在 Lambda 语法是否新，而在持有状态的人已经离开。第一步是画出工厂调用、闭包返回、首次执行三个时刻，明确状态必须跨越哪条寿命边界。','将工厂参数写成按值 vector，意味着函数获得自己的对象。调用方传左值会复制，传右值则有机会移动；函数内部再把它移动到初始化捕获中。闭包因而拥有容器，而不是记住工厂栈帧中的地址。这个选择也确定调用方后来修改原种子不会影响记录器，属于业务语义，而不只是避免崩溃的实现技巧。'),
step('由闭包对象解释 mutable','可以把闭包想象成编译器生成的类，其中有一个 history 成员和调用运算符。默认调用运算符不允许修改按值捕获的成员，追加元素因此需要 mutable。它解除的是该调用运算符对闭包状态的只读限制，不代表原调用方变量成为引用，也不保证线程安全。两次调用同一个闭包会修改同一份内部容器，这正是历史累积的来源。','auto 推导返回的闭包类型让我们不必给匿名类型命名，但它不会模糊所有权。类似地，auto copy=source 通常形成值副本，auto& 则形成别名；命名的右值引用依然是左值表达式，需要在真正转移责任时使用 move。类型、引用修饰与表达式类别应逐层判断，不能因为看到了 auto 或双与号就推断数据一定没有复制。'),
step('决定复制记录器和返回结果的含义','用户可能复制一个记录器来创建实验分支。我们的闭包拥有 vector，因此按值复制闭包会复制当前历史，后续追加彼此独立。如果希望所有副本共享历史，就必须明确引入共享状态并面对同步与生命周期问题。两种方案都可合理，但不能让某次捕获选择在无意中决定产品行为；测试应该将副本分叉后的结果分别观察。','调用结果也有相同选择：按值返回 vector 形成快照，调用方修改或长期保存它不会影响记录器。返回引用虽然可能减少复制，却增加失效规则，下一次扩容或记录器销毁后引用相关访问可能出问题。本课优先明确快照契约，再讨论成本；真正数据量很大时，可以设计只读共享快照或分页接口，而不是偷偷改变返回类型。'),
step('用分叉与外部修改验证模型','完整例子先复制种子创建回调，再修改原种子，验证闭包持有独立值。首次调用得到的快照被主动改写，第二次调用仍返回正确历史，证明没有暴露内部可变别名。接着复制记录器，分别追加不同值，验证两个分支独立。每一条断言都对应一个所有权决定，能识别引用捕获、共享状态和引用返回带来的语义变化。','工程中延迟任务还可能捕获 this、string_view 或裸指针。按值复制这些轻量对象通常只是复制借用关系，并不会保活实际目标。评审需要逐个追踪捕获成员指向谁，而不是统一建议“全部值捕获”。若需要不可复制资源，可用移动捕获，但 C++20 的 std::function 不能保存任意不可复制目标；应选用适当模板拥有类型或另行设计任务包装器。')],
example:example('历史快照与分支',w,`std::vector<int> seed{1};auto log=make_history(seed);seed[0]=99;
auto first=log(2);assert((first==std::vector<int>{1,2}));first[0]=88;
auto branch=log;auto a=log(3);auto b=branch(7);
assert((a==std::vector<int>{1,2,3}));assert((b==std::vector<int>{1,2,7}));
std::cout<<a.front()<<' '<<a.back()<<' '<<b.back();`,'1 3 7',['按值参数与移动捕获共同把容器放入闭包。','修改种子不改变已经创建的记录器。','返回值是独立快照，改写快照不污染内部状态。','复制闭包后分支各自追加，最后一个值不同。'],[{change:'把捕获改为 [&seed]',prediction:'返回后调用会借用已销毁参数，存在未定义行为；只审查，不执行。',reason:'工厂参数的寿命在工厂返回时结束。'},{change:'把 history 改成 shared_ptr<vector<int>> 并共享捕获',prediction:'两份记录器将修改共同历史，分支断言不再成立。',reason:'复制拥有指针与复制容器表达了不同业务关系。'}]),
pitfalls:[pit('逃逸引用捕获','return [&local](int x){local.push_back(x);};','局部容器销毁后闭包仍借用它，稍后访问会悬空；该反例不执行。','让闭包拥有状态，或者由外部明确延长拥有者寿命。'),pit('把 mutable 当共享','return [state](int x) mutable {state.push_back(x);};','修改的是该闭包里的副本，不会自动回写原 state。','先决定独立分支还是共享状态，再选择捕获。'),pit('值捕获就认为安全','return [view]{return view[0];};','若 view 是 string_view，按值捕获仍只复制借用；目标可能先销毁。','捕获实际字符串，或证明目标拥有者覆盖回调寿命。')],
stages:[stage('标出每一次复制与借用','分析 auto、auto&、初始化捕获和调用参数。',['类型与所有权表','不会逃逸的同步回调'],['能解释命名右值引用的类别','不把轻量视图视为拥有者'],'先画状态存放在哪里。','generic-repeat'),stage('让闭包独立存活','实现可延迟调用的历史记录器。',['种子独立测试','连续调用测试'],['工厂返回后状态仍有效','同一回调累积历史'],'用初始化捕获跨越工厂寿命。','deep-deduction-capture'),stage('交付快照与分支契约','加入复制分支、返回副本与成本说明。',['完整实现','线程和复制成本说明'],['全部综合测试通过','明确返回快照的所有权'],'别为了省拷贝改变已承诺的语义。','deep-deduction-capture')],workshop:w,sourceRefs:source('expr.prim.lambda.capture')};
}

{
const pre='#include <variant>\n#include <string_view>\n#include <charconv>\nstruct Limits{unsigned low,high;};\nenum class LimitError{Empty,Syntax,Range,Order};\nusing LimitResult=std::variant<Limits,LimitError>;';
const w=workshop('typed-failure','分层错误的区间配置解析器','实现 parse_limits(string_view)，解析 low:high 两个十进制非负整数，并以 variant 返回成功或精确错误类别。',
 ['完整空串返回 Empty；缺失字段、不是一个冒号、空白、符号或非数字返回 Syntax。','每个值必须在 0..1000000；数值越界返回 Range。','字段均合法但 low>high 返回 Order；允许前导零。','先检查整体分隔结构，再按左字段、右字段依次验证；数字串格式先于数值范围。'],
 ['将协议结构、字段格式、数值范围和跨字段约束分成连续层次。','检查字符均为数字后，用 from_chars 判断表示范围与完整消费。','失败与合法零不能共用同一个整数返回值。'],
 `LimitResult parse_limits(std::string_view){return LimitError::Empty;}`,
 `LimitResult parse_limits(std::string_view text){
    if(text.empty())return LimitError::Empty;
    const auto colon=text.find(':');
    if(colon==text.npos || text.find(':',colon+1)!=text.npos)return LimitError::Syntax;
    auto number=[](std::string_view part)->std::variant<unsigned,LimitError>{
        if(part.empty())return LimitError::Syntax;
        for(char c:part)if(c<'0'||c>'9')return LimitError::Syntax;
        unsigned value=0;
        auto[end,error]=std::from_chars(part.data(),part.data()+part.size(),value);
        if(error!=std::errc{} || end!=part.data()+part.size() || value>1000000)return LimitError::Range;
        return value;
    };
    auto left=number(text.substr(0,colon));
    if(auto*error=std::get_if<LimitError>(&left))return *error;
    auto right=number(text.substr(colon+1));
    if(auto*error=std::get_if<LimitError>(&right))return *error;
    Limits result{std::get<unsigned>(left),std::get<unsigned>(right)};
    if(result.low>result.high)return LimitError::Order;
    return result;
}`,pre,[test('成功与边界','auto a=std::get<Limits>(parse_limits("000:1000000"));auto b=std::get<Limits>(parse_limits("7:7"));std::cout<<a.low<<" "<<a.high<<" "<<b.high;','0 1000000 7','零与相等端点都是有效数据。'),test('语法错误类别','for(auto s:{"",":2","1:","1:2:3","+1:2","1:2x"})std::cout<<int(std::get<LimitError>(parse_limits(s)))<<" ";','0 1 1 1 1 1','缺失和格式错误不混成数值零。'),test('范围和顺序','for(auto s:{"1000001:1000002","999999999999999999999:2","9:2"})std::cout<<int(std::get<LimitError>(parse_limits(s)))<<" ";','2 2 3','区分数值表示/业务范围与字段间约束。'),test('校验优先级','std::cout<<int(std::get<LimitError>(parse_limits("99999999999999999x:2")))<<" "<<int(std::get<LimitError>(parse_limits("1000001:x")));','1 2','格式优先于同字段范围，左字段优先于右字段。')]);
depthLanguage['typed-failure']={goals:['由调用方决策推导错误模型','把结构、格式、范围与跨字段约束分层','验证错误优先级与合法边界而非只看成功样例'],prerequisites:['会使用 optional、variant 和 get_if','理解 string_view 不拥有输入字符串'],derivation:[
step('从无法解释的默认值开始','服务加载工作线程区间配置，格式是最小值到最大值。如果解析失败一律返回零，调用方分不清合法的零、缺失配置与用户拼写错误，只能在日志里猜。先列出调用方行动：缺失可能采用默认值，语法错误需要指出格式，范围错误提示限制，最小值大于最大值要求用户纠正。返回类型应保留这些决策所需的信息，而不是先选一个方便的整数。','本课使用 variant 将 Limits 成功值与 LimitError 枚举组成封闭结果集合。成功对象只有在两个字段和关系都合法时才产生，不存在半有效区间。错误枚举不是所有系统异常的集合：内存不足、程序缺陷和外部 I/O 仍应按项目边界处理。当前使用 C++20，不依赖 C++23 的 expected 或 optional 单子成员，避免示例版本与本机评测不一致。'),
step('先建立字段边界再解释内容','解析首先处理完整空串，再要求恰好一个冒号。只有结构成立，左右字段才有明确边界。接着逐字符验证只含十进制数字，拒绝空白、正负号和后缀。与只读出合法前缀不同，这个步骤要求整段字段符合协议，使数值解析不会默默接受用户写错的尾部。顺序明确后，测试才能约定同一个输入同时存在多个问题时应报告哪个。','语法正确的数字串交给 from_chars，它通过错误码报告表示范围问题，不靠异常表示普通输入错误。然后检查业务上限一百万，这与 unsigned 能表示多大是不同层次。完整消费检查作为接口边界仍保留。先验证数字格式也让超长数字带非法后缀时返回 Syntax，而不是随编译库的停止位置偶然变成 Range，保持错误优先级稳定。'),
step('在最后一步验证字段关系','两个数都合法还不代表区间合法，必须满足 low 不大于 high。我们最后检查这条跨字段不变量，再构造成功结果。允许相等端点和前导零，是协议明确选择；零也合法，不能当失败哨兵。调用方可以用 get_if 先尝试成功分支，再针对错误枚举行动，或者写覆盖所有分支的访问者，让遗漏处理更容易被审查发现。','封闭类型集合也有演化成本：新增错误类别时，含默认兜底的 switch 可能继续编译却给出不恰当行为。日志、用户提示、重试策略应分别审查，不要将枚举序号直接固化成外部协议。variant 在某些会抛出类型切换操作后还可能处于无值异常状态；本例候选类型简单，但通用结果包装器不能把它与业务错误混为一谈。'),
step('用错误矩阵测试完整契约','测试矩阵按空输入、字段缺失、分隔符数量、非法字符、表示溢出、业务越界和逆序逐层展开。还要加入零、最大值、相等值和前导零，防止为了拒绝错误而误伤合法边界。专门的多错误输入验证优先级：左字段范围错误优先于右字段格式错误，同字段则先检查格式。这样失败行为和成功行为一样具备可重复性。','工程接口应决定错误是否附带位置、原始字段或安全截断后的诊断文本。配置可能含敏感信息，日志内容不能无限制回显。这个小解析器不做 I/O、不保存输入视图，因此返回结果独立于原字符串寿命。扩展到完整配置系统时，应让解析、验证、应用三步分开，只有整份新配置通过验证后才替换正在使用的有效配置。')],
example:example('成功值和三种拒绝路径',w,`auto good=parse_limits("0002:10");assert(std::holds_alternative<Limits>(good));
auto value=std::get<Limits>(good);assert(value.low==2 && value.high==10);
assert(std::get<LimitError>(parse_limits("2:10x"))==LimitError::Syntax);
assert(std::get<LimitError>(parse_limits("1000001:2000000"))==LimitError::Range);
assert(std::get<LimitError>(parse_limits("10:2"))==LimitError::Order);
std::cout<<value.low<<' '<<value.high<<' '<<int(std::get<LimitError>(parse_limits("")));`,'2 10 0',['variant 的成功分支保存完整区间。','前导零不改变数值，也不是格式错误。','尾随字符、范围与逆序分别走不同错误通道。','空输入具有独立类别，调用方可以选择不同处理。'],[{change:'把 low==high 判为错误',prediction:'合法的单点区间测试失败。',reason:'接口明确允许相等端点。'},{change:'删掉逐字符验证和完整消费检查',prediction:'例如 2:10x 可能被错误接受。',reason:'解析出前缀不等于整个配置满足语法。'}]),
pitfalls:[pit('用零吞掉所有失败','return parsed.value_or(0);','合法零与错误变得不可区分，调用方丢失处理依据。','根据所需决策选择 optional 或具体错误结果。'),pit('仅检查错误码','if(ec==std::errc{})return value;','停止位置可能未到末尾，后缀会被忽略。','同时验证格式与完整消费。'),pit('过早发布部分配置','config.low=parse(left); config.high=parse(right);','第二字段失败时旧配置可能已经被部分改写。','先构造独立候选，全部合法后再提交。')],
stages:[stage('让缺席可见','完成单字段严格端口解析。',['成功失败分支图','完整消费测试'],['失败不用数值哨兵','拒绝空白和后缀'],'先问调用方需要区分哪些失败。','parse-port'),stage('添加分层错误','实现双字段结构、格式与范围检查。',['错误矩阵','错误优先级说明'],['返回明确类别','边界值无误伤'],'避免一次函数同时修改正在使用的配置。','deep-typed-failure'),stage('维护完整区间不变量','增加跨字段约束与工程诊断设计。',['完整解析器','应用配置的提交流程'],['全部测试通过','成功值始终 low<=high'],'只有最后验证完成才发布成功对象。','deep-typed-failure')],workshop:w,sourceRefs:source('charconv.from.chars')};
}

{
const pre='#include <span>\n#include <ranges>\n#include <string_view>\n#include <string>\nstruct BorrowedRow{std::string_view name;int score;};\nstruct OwnedRow{std::string name;int score;};';
const w=workshop('borrowed-pipelines','从借用输入生成拥有型报告','实现 build_report(span<const BorrowedRow>,threshold)，选出 score>=threshold 的行，保序复制名字并将分数乘二。',
 ['输出拥有每个名字的字符串，输入随后销毁或修改不影响结果。','只对入选行执行乘法；若入选分数乘二超出 int 范围，抛 overflow_error。','不得修改输入；允许空名字、内含零字节名字与空输入。','函数返回完整 vector；异常时没有部分结果发布。输入的所有借用在调用期间必须有效。'],
 ['span 借用行序列，行内 string_view 又借用文本，两层寿命都要检查。','先筛选再验证变换范围，不对本来被过滤的行做多余拒绝。','用 string(view) 按长度复制，而不是只拷贝到第一个零字符。'],
 `std::vector<OwnedRow> build_report(std::span<const BorrowedRow>,int){return {};}`,
 `std::vector<OwnedRow> build_report(std::span<const BorrowedRow> input,int threshold){
    std::vector<OwnedRow> result;
    auto selected=input|std::views::filter([threshold](const auto&r){return r.score>=threshold;});
    for(const auto&row:selected){
        if(row.score>std::numeric_limits<int>::max()/2 || row.score<std::numeric_limits<int>::min()/2)
            throw std::overflow_error("score");
        result.push_back({std::string(row.name),row.score*2});
    }
    return result;
}`,pre+'\n#include <limits>\n#include <stdexcept>',[
 test('顺序与筛选','std::array<BorrowedRow,3>a{{{"A",3},{"B",1},{"C",4}}};for(auto&r:build_report(a,3))std::cout<<r.name<<":"<<r.score<<" ";','A:6 C:8','筛选后保留相对顺序。'),test('拥有文本','std::string name="job";std::array<BorrowedRow,1>a{{{name,2}}};auto out=build_report(a,0);name[0]=\'X\';if(out.empty())std::cout<<"empty";else std::cout<<out[0].name<<" "<<out[0].score;','job 4','输出不保留 string_view 借用。'),test('乘法边界','std::array<BorrowedRow,2>a{{{"low",std::numeric_limits<int>::min()},{"ok",1}}};std::cout<<build_report(a,0).size()<<" ";bool caught=false;try{build_report(a,std::numeric_limits<int>::min());}catch(const std::overflow_error&){caught=true;}std::cout<<caught;','1 1','过滤掉的非法乘法无需执行，入选则明确拒绝。'),test('长度与空输入',`std::string s{'a',char(0),'b'};std::array<BorrowedRow,1>a{{{s,0}}};auto out=build_report(a,0);std::cout<<(out.empty()?0:out[0].name.size())<<" "<<build_report({},0).size();`,'3 0','按长度拥有文本，空输入自然产生空结果。')]);
depthLanguage['borrowed-pipelines']={goals:['追踪 span 与元素内视图的两层借用','解释惰性计算发生的时刻和顺序','将借用结果物化成独立拥有型报告'],prerequisites:['理解连续容器和迭代器失效','会使用 string、string_view 与范围循环'],derivation:[
step('从一份过期报告追踪到两层借用','监控模块收到一批行，每行包含任务名视图和分数，然后返回筛选后的报告。如果直接保存输入行或返回筛选视图，调用结束后输入数组可能消失，名字所在字符串也可能变化。这里有两层独立借用：span 指向行，行中的 string_view 指向字符。只保证数组活着并不能保证字符活着，因此第一步要画出每个拥有者与借用者。','报告需要离开输入作用域仍可展示，这直接决定输出行必须拥有 string，而不是沿用 string_view。输入采用 span<const BorrowedRow> 表达连续借用和只读接口，输出采用 vector<OwnedRow> 表达独立存储。这种类型上的方向性让调用者容易看出哪里需要保活、哪里可自由保存，比函数里临时写几次拷贝却不说明结果责任更可维护。'),
step('理解筛选管线并未立刻产生数组','views::filter 保存遍历规则，在实际迭代时才寻找满足条件的元素。构造 selected 并没有生成一个独立行数组，也没有复制名字。因此我们必须在输入仍有效的函数调用期间消费该视图，然后把需要的字段复制到输出。谓词按值保存 threshold，避免对局部参数建立不必要的引用依赖，这也让视图自身的状态更简单。','筛选顺序是业务语义的一部分：本课只对入选行做分数乘二，所以一个被筛掉的极小值不应该触发乘法越界拒绝。若把变换放在筛选前面，就可能执行本来不需要的危险操作。惰性管线的简洁不能代替对每步定义域的分析，尤其转换会抛异常、有副作用或对部分输入未定义时，需要明确操作的先后关系。'),
step('在乘法之前证明值可表示','有符号整数溢出不能作为正常结果接受，也不应执行后再检查。对于乘二，先将分数与 int 最大值除二、最小值除二比较，在可表示范围内才进行运算。入选行若不满足范围就抛出，局部输出 vector 自动清理已生成部分，调用方没有拿到半份报告。这个保证只涉及返回对象，不能撤销调用期间发生的其他外部副作用。','复制名字使用 string(view)，按视图长度保存所有字符，包括内嵌零字节。如果改成 view.data() 的零结尾字符串接口，就可能截断或越过视图边界。空名字仍是合法值，不等于名字指针可以随意访问。由类型和长度驱动的复制可以让协议更明确，但前提仍是输入视图在这次复制期间指向有效字符；span 不会自动验证这个事实。'),
step('让测试主动破坏旧拥有者','报告生成后修改原名字，若输出也变化，就证明我们泄漏了借用而没有物化。固定顺序样本验证筛选稳定性，极端整数样本验证只在入选后检查，内嵌零字符样本验证长度语义。空输入单独覆盖零元素范围，不能依赖至少一个元素存在。测试组合检查数据关系，不只是检查最后输出元素的数量。','工程上还要衡量物化成本：复制名字和保存结果需要分配，若报告每帧产生，可以复用输出容器或改用持有共享拥有者的快照类型。无论怎样优化，都要保持清晰的失效契约。不要假定所有 view 都不拥有数据，也不要把当前草案的新适配器直接当作 C++20 能力；本例显式循环物化，避免版本差异掩盖核心生命周期问题。')],
example:example('报告离开输入后仍可使用',w,`std::vector<OwnedRow> report;
{std::string name="worker";std::array<BorrowedRow,2> rows{{{name,3},{"ignored",-1}}};
 report=build_report(rows,0);name[0]='X';assert(report[0].name=="worker");}
assert(report.size()==1 && report[0].score==6);
bool rejected=false;std::array<BorrowedRow,1> huge{{{"huge",std::numeric_limits<int>::max()}}};
try{build_report(huge,0);}catch(const std::overflow_error&){rejected=true;}
assert(rejected);std::cout<<report[0].name<<' '<<report[0].score<<' '<<rejected;`,'worker 6 1',['输出行把名字从借用转成了拥有。','原字符串被修改并销毁后，报告仍保持内容。','只有入选数据才进入变换。','超范围乘法在执行前被拒绝，不依赖溢出后的结果。'],[{change:'OwnedRow 的 name 改为 string_view',prediction:'名字作用域结束后输出借用失效；该变体只审查，不执行。',reason:'复制视图不会复制字符或延长拥有者寿命。'},{change:'用 std::string(row.name.data()) 复制名字',prediction:'内嵌零字符测试可能被截断，非零结尾视图还可能越界读取。',reason:'该构造形式使用零结尾协议，而不是视图长度。'}]),
pitfalls:[pit('按值返回视图就当拥有','return local_rows|std::views::filter(pred);','视图对象的值复制不代表复制底层元素；局部拥有者销毁后可能悬空，此反例不执行。','在拥有者存活时物化，或让返回类型同时持有拥有者。'),pit('忽略元素内的借用','std::vector<BorrowedRow> out(input.begin(),input.end());','行被复制了，名字视图仍指向原字符。','为需要独立寿命的每一层定义拥有型字段。'),pit('先算再查越界','int doubled=score*2; if(doubled<score)...','有符号溢出可能已发生未定义行为，不能靠结果判断。','在运算之前使用范围证明。')],
stages:[stage('理解惰性筛选','完成偶数平方管线并标出执行时刻。',['管线步骤图','输入与输出所有权说明'],['不修改输入','结果独立存储'],'管线构造不等于结果已经生成。','range-pipeline'),stage('处理嵌套借用','把名字视图转换为拥有型报告行。',['两层寿命图','原名字修改测试'],['销毁输入后仍能读报告','按长度复制字符'],'容器拥有元素不等于元素拥有它引用的数据。','deep-borrowed-pipelines'),stage('补齐工程边界','加入乘法范围、空输入与异常行为。',['完整报告函数','分配成本与复用方案'],['全部综合测试通过','不发布半份结果'],'先筛选再检查本次实际需要的变换。','deep-borrowed-pipelines')],workshop:w,sourceRefs:source('range.filter')};
}

{
const w=workshop('raii-exception','可移动的预留额度事务','实现 DebitGuard(int& balance,int amount)：构造扣减额度，未 commit 时析构回滚，移动构造转移唯一回滚责任。',
 ['amount 非负且不超过 balance，否则构造抛 invalid_argument 且余额不变。','commit() 幂等；回滚与提交均不得发生两次。','禁止复制，不要求移动赋值；移动后的旧对象不再回滚。','balance 必须比 guard 活得久；guard 活跃期间不得通过其他路径修改余额。本课单线程。'],
 ['先验证参数再扣减，把成功获取作为构造的最后一步。','用可空指针表示回滚责任，commit 和移动都更新同一个责任字段。','析构不抛出；余额不被外部修改的契约确保回滚加法恢复原值。'],
 `class DebitGuard{public:DebitGuard(int&,int){}DebitGuard(const DebitGuard&)=delete;DebitGuard(DebitGuard&&)noexcept{}void commit()noexcept{}};`,
 `class DebitGuard {
    int* balance_;
    int amount_;
public:
    DebitGuard(int&balance,int amount):balance_(nullptr),amount_(amount){
        if(amount<0 || amount>balance)throw std::invalid_argument("budget");
        balance-=amount;
        balance_=&balance;
    }
    DebitGuard(const DebitGuard&)=delete;
    DebitGuard& operator=(const DebitGuard&)=delete;
    DebitGuard(DebitGuard&&other)noexcept
        :balance_(std::exchange(other.balance_,nullptr)),amount_(other.amount_){}
    ~DebitGuard()noexcept{if(balance_)*balance_+=amount_;}
    void commit()noexcept{balance_=nullptr;}
};`, '#include <utility>\n#include <stdexcept>',[
 test('正常回滚与提交','int n=10;{DebitGuard a(n,3);std::cout<<n<<" ";}std::cout<<n<<" ";{DebitGuard b(n,4);b.commit();b.commit();}std::cout<<n;','7 10 6','默认回滚，显式提交保留扣减。'),test('异常路径','int n=20;try{DebitGuard a(n,8);throw std::runtime_error("abort");}catch(const std::runtime_error&){}std::cout<<n;','20','异常展开执行清理。'),test('移动唯一责任','int n=10;{DebitGuard a(n,6);DebitGuard b(std::move(a));}std::cout<<n<<" "<<std::is_copy_constructible_v<DebitGuard>;','10 0','不能复制回滚动作。'),test('失败不改变余额','int n=3;int errors=0;try{DebitGuard a(n,4);}catch(const std::invalid_argument&){++errors;}try{DebitGuard b(n,-1);}catch(const std::invalid_argument&){++errors;}std::cout<<n<<" "<<errors;','3 2','验证先于资源获取。')]);
depthLanguage['raii-exception']={goals:['把回滚责任放进对象生命周期','设计可移动但不可复制的清理所有权','区分内部状态回滚和外部副作用'],prerequisites:['理解异常传播与局部对象析构顺序','能说明引用借用的寿命要求'],derivation:[
step('先找一次失败会留下什么','订单流程先预留额度，再执行可能失败的校验。若每个 return 和 catch 都手工归还额度，增加一条分支就可能漏掉清理。我们需要的不是更多清理调用，而是一个拥有回滚责任的局部对象：预留成功时它出现，作用域结束时默认归还，只有整段流程成功才撤销回滚。这样流程结构和资源责任同时清楚。','本课把资源简化为整数余额，不涉及金融计算或并发事务。约定余额在保护器活跃期间不被外部修改，而且余额对象活得更久。这个契约非常重要：如果外部随意写余额，析构时加回原额度不一定能恢复之前状态，甚至可能溢出。RAII 统一执行清理，却不能把不成立的业务逆操作变成正确回滚。'),
step('让构造建立唯一有效状态','构造先验证金额非负并且额度足够，失败就直接抛出，不修改余额。全部验证通过后才扣减并保存余额地址。从此保护器代表一项确实存在的预留责任，析构可以依照同一不变量执行，不需要知道调用方后面走过哪些业务分支。构造失败的保护器没有完整对象，因此不能依赖它自己的析构去修复提前做出的修改。','用可空指针表达责任，比一个指针再加一个可能不同步的布尔变量更容易保持一致。非空表示应当回滚，空表示已经提交或责任已转出。commit 将它置空，重复调用仍为空。对象不需要在析构中判断当前是否有异常：默认回滚本来就是语义，只有显式提交才改变退出行为，正常早退与异常早退因此使用同一套规则。'),
step('移动必须转走清理资格','如果保护器能够复制，就可能让两个析构函数对同一预留额度各归还一次。我们删除复制，并在移动构造时用 exchange 把来源的责任字段置空。移动后的对象仍可安全析构，却不再拥有回滚义务。这里移动的不是整数余额，而是未来必须执行一次动作的资格，它与独占文件句柄、事务令牌的语义完全相同。','移动构造标记 noexcept 是基于实现只进行指针和整数操作，而不是为了获得一个优化标签。若以后添加会抛出的成员，必须重新检查这项承诺。析构同样不传播异常；对于关闭操作可能失败的真实资源，应增加显式关闭接口和错误记录策略。不能把会抛出的任意用户回调直接塞进清理路径，再期待语言替我们处理二次异常。'),
step('证明路径覆盖而非只看结果','示例依次覆盖异常回滚、移动后回滚和成功提交。每一步都断言余额与当前责任状态相符，而不是只在最后输出一个正确数字。错误实现有时会先漏归还又重复归还，最终值偶然相同，所以测试应观察关键阶段。失败构造测试则确认没有发生部分资源获取，移动测试同时检查不可复制这一类型属性。','推广到数据库、文件和多资源函数时，需要列出每次获取的顺序与失败后释放的逆序。RAII 能负责我们拥有的资源，却不能自动撤销已经发送的消息或用户回调造成的外部改变。提交点之前尽量在局部状态准备，之后再公布结果；跨系统副作用可能需要补偿协议。把清理、状态恢复与业务补偿分开，才是可维护的异常设计。')],
example:example('预留、失败与最终提交',w,`int balance=20;
try{DebitGuard pending(balance,7);assert(balance==13);throw std::runtime_error("reject");}catch(const std::runtime_error&){}
assert(balance==20);
{DebitGuard first(balance,5);DebitGuard owner(std::move(first));assert(balance==15);}
assert(balance==20);
{DebitGuard success(balance,6);success.commit();}
assert(balance==14);std::cout<<balance<<' '<<std::is_copy_constructible_v<DebitGuard>;`,'14 0',['预留成功后保护器承担唯一回滚责任。','异常导致析构，余额恢复二十。','移动把责任交给新对象，旧对象不再回滚。','提交撤销回滚义务，最终扣减六。'],[{change:'删除最后的 commit()',prediction:'最终余额变回二十，断言失败。',reason:'保护器采用默认回滚语义。'},{change:'将移动改成复制构造',prediction:'编译失败。',reason:'复制会产生重复清理责任，因此类型主动禁止。'}]),
pitfalls:[pit('修改后才验证','balance-=amount; if(balance<0)throw error;','构造失败时完整保护器不会析构，已经发生的修改可能遗留。','先验证，再执行不会失败的获取步骤。'),pit('复制清理责任','DebitGuard(const DebitGuard&)=default;','两个对象可能对同一资源各执行一次回滚。','删除复制，移动时清空来源责任。'),pit('让被保护对象先消失','return DebitGuard(local_balance,3);','返回的保护器借用了即将销毁的局部变量；稍后解引用将悬空，该反例不执行。','让资源寿命包围保护器，或把实际资源所有权纳入类型。')],
stages:[stage('用类型接管释放','把手工归还的局部流程改成默认回滚。',['获取释放时序图','正常退出示例'],['早退也归还额度','参数无效不修改余额'],'构造成功必须对应一份明确责任。','scope-exit'),stage('覆盖异常与转移','实现不可复制、可移动的回滚令牌。',['异常测试','移动后责任表'],['移动来源不再回滚','栈展开不传播清理异常'],'先转移责任，再让旧对象保持空状态。','deep-raii-exception'),stage('定义事务使用边界','提交完整保护器并评审业务副作用。',['完整实现','寿命与并发限制说明'],['全部测试通过','明确无法回滚的外部操作'],'不要把 RAII 等同于跨系统事务。','deep-raii-exception')],workshop:w,sourceRefs:source('except.ctor')};
}

{
const w=workshop('shared-weak','不延长对象寿命的观察注册表','实现 WeakRegistry<T>，记录弱引用并按快照访问尚存活的对象。',
 ['observe(shared_ptr<T>) 追加一个弱引用，允许重复和空指针。','alive() 返回当前未过期记录数；prune() 删除过期记录并返回删除数。','visit(f) 先复制弱引用列表，再依次 lock；成功时以 T& 调用同一个 f。','visit 中新增观察从下一轮生效；回调异常直接传播；本课单线程。'],
 ['注册表保存 weak_ptr，因此注册不应增加对象强计数。','快照保存弱引用而不是提前锁定所有对象；目标可以在轮到它之前过期。','每次 lock 成功后，用局部 shared_ptr 覆盖这次回调的执行区间。'],
 `template<class T>class WeakRegistry{public:void observe(const std::shared_ptr<T>&){}std::size_t alive()const{return 0;}std::size_t prune(){return 0;}template<class F>void visit(F&&){}};`,
 `template<class T>class WeakRegistry {
    std::vector<std::weak_ptr<T>> entries_;
public:
    void observe(const std::shared_ptr<T>& value){entries_.push_back(value);}
    std::size_t alive()const{std::size_t n=0;for(const auto&w:entries_)if(!w.expired())++n;return n;}
    std::size_t prune(){const auto old=entries_.size();std::erase_if(entries_,[](const auto&w){return w.expired();});return old-entries_.size();}
    template<class F>void visit(F&&f){auto snapshot=entries_;for(const auto&w:snapshot)if(auto owner=w.lock())std::invoke(f,*owner);}
};`, '#include <memory>\n#include <functional>\n#include <vector>',[
 test('观察不拥有','WeakRegistry<int>r;auto a=std::make_shared<int>(3);r.observe(a);std::cout<<a.use_count()<<" "<<r.alive()<<" ";a.reset();std::cout<<r.alive()<<" "<<r.prune();','1 1 0 1','弱引用不维持目标存活。'),test('按需锁定','WeakRegistry<int>r;auto a=std::make_shared<int>(1),b=std::make_shared<int>(2);r.observe(a);r.observe(b);int sum=0;r.visit([&](int&v){sum+=v;if(v==1)b.reset();});std::cout<<sum<<" "<<r.alive();','1 1','尚未 lock 的目标可以在本轮中消失。'),test('新增从下轮开始','WeakRegistry<int>r;auto a=std::make_shared<int>(1),b=std::make_shared<int>(2);r.observe(a);bool added=false;int sum=0;auto f=[&](int&v){sum+=v;if(!added){added=true;r.observe(b);}};r.visit(f);std::cout<<sum<<" ";r.visit(f);std::cout<<sum;','1 4','快照稳定本轮记录列表。'),test('重复与空记录','WeakRegistry<int>r;auto a=std::make_shared<int>(4);r.observe({});r.observe(a);r.observe(a);int n=0;r.visit([&](int&){++n;});std::cout<<n<<" "<<r.prune()<<" "<<r.alive();','2 1 2','记录数不是唯一对象数。')]);
depthLanguage['shared-weak']={goals:['根据所有权图判断强引用与弱引用','用 lock 建立一次使用所需的临时所有权','明确弱引用快照在回调修改期间的语义'],prerequisites:['了解 shared_ptr 的控制块与基本计数','理解回调可能修改外部状态'],derivation:[
step('从诊断列表意外保活对象开始','运行时希望记录所有任务用于展示状态，但任务结束后迟迟不析构。原因可能不是泄漏分配，而是诊断列表保存 shared_ptr，成了额外拥有者。先画出谁负责让任务存活：执行队列或业务会话是拥有者，诊断列表只是观察者。将后者改为 weak_ptr，能表达它不会因为展示需求而延长任务生命这一业务决定。','弱引用不是不安全的裸地址替代品，它关联控制块，允许后来尝试取得强引用。对象析构后，观察记录仍可能存在，记录本身会占一些管理资源，因此还需要清除过期记录。注册表的容量和对象存活是两条不同生命周期，不应把 alive 返回零误认为注册表已经没有内容，也不能靠引用计数推断业务是否已经完成。'),
step('把检查与取得使用资格合成一步','访问目标时，直接调用 lock 并检查返回值。成功得到的局部 shared_ptr 维持目标在本次回调期间存活；失败则跳过。先 expired 再使用之前缓存的裸指针不能获得这种保证，因为检查和使用之间目标可能消失。即使当前练习单线程，也应采用表达完整所有权动作的接口，而不是依赖暂时没有并发这一偶然环境。','alive 使用 expired 只是瞬时统计，它不承诺稍后 visit 一定会调用相同数量的对象。对外文档要区分统计快照和执行保证。shared_ptr 管理控制块的同步也不保护目标成员，多个线程同时修改同一个整数仍需另外同步。所有权解决“还能否使用这个对象”，互斥或其他协议解决“能否同时进行这些访问”，两者不能混为一谈。'),
step('决定本轮究竟固定哪些东西','回调中可能追加观察记录，如果直接遍历原 vector，扩容会使当前迭代状态失效。因此 visit 首先复制弱引用列表，把本轮参与记录固定下来。我们没有提前把所有记录 lock 成强引用，这意味着前面的回调可以释放后面的目标，后者轮到时会被跳过。这个选择减少临时保活，但与“本轮所有目标保证执行”的契约不同。','重复记录按重复订阅处理，空 shared_ptr 形成过期记录，prune 可以清除它。每一个决定都影响使用者对调用次数的预期，不能靠容器碰巧怎样遍历来决定。回调异常直接传播意味着后续记录不一定访问，这同样需要明确。若产品需要隔离单个订阅者失败，就应新增错误收集策略，而不是偷偷吞掉所有异常并报告成功。'),
step('把计数现象还原成责任图','验证时先检查注册后强计数没有增加，再释放唯一外部拥有者，确认注册表不会保活。第二组在第一个回调中释放第二个目标，验证按需 lock 语义；第三组在回调中新增记录，确认只影响下一轮。测试把对象寿命与列表变更分别拉开，能发现把弱快照误写成强快照、或者直接遍历原列表的问题。','工程扩展还要评审循环：如果目标又拥有捕获自身 shared_ptr 的回调，弱注册表也不能消除那个独立强环。正确 shared_from_this 必须连接已有控制块，不应重新以 this 构造 shared_ptr。对于异步系统，还需要取消、关闭和派发完成协议；本课提供的是局部观察语义，不宣称只要使用弱指针就自动解决全部对象关系。')],
example:example('观察列表不会让任务滞留',w,`WeakRegistry<int> registry;
auto first=std::make_shared<int>(1), second=std::make_shared<int>(2);
registry.observe(first);registry.observe(second);
assert(first.use_count()==1 && registry.alive()==2);
int sum=0;registry.visit([&](int&n){sum+=n;if(n==1)second.reset();});
assert(sum==1 && registry.alive()==1);
assert(registry.prune()==1);first.reset();
assert(registry.alive()==0);std::cout<<sum<<' '<<registry.prune();`,'1 1',['注册只增加弱关系，没有额外强拥有者。','访问第一项时临时 owner 保证该回调期间对象存活。','第二项在轮到之前失去最后强引用，所以本轮跳过。','显式 prune 回收残留观察记录，与对象析构分开。'],[{change:'把快照改成全部提前 lock 的 shared_ptr 列表',prediction:'第二个目标会被临时保活，本轮总和变成三。',reason:'快照保存的所有权种类改变了派发语义。'},{change:'同一个目标 observe 两次',prediction:'只要存活，它会收到两次访问。',reason:'接口统计的是观察记录，不自动按对象去重。'}]),
pitfalls:[pit('用拥有者实现观察者','std::vector<std::shared_ptr<T>> diagnostics;','诊断记录意外成为长期拥有者，改变对象释放时机。','先画所有权图，再决定哪些关系应该弱引用。'),pit('分离检查与使用','if(!weak.expired()) cached_raw->work();','状态可在两步之间改变；cached_raw 可能悬空，此错误路径不执行。','使用 lock 返回的强引用覆盖访问区间。'),pit('回调修改正在遍历的容器','for(auto&w:entries_) callback();','回调追加引发扩容可能让迭代失效。','明确快照语义，在独立列表上遍历。')],
stages:[stage('区分拥有与观察','完成 lock 练习并画出强弱关系。',['控制块与对象关系图','目标消失测试'],['观察不增加强拥有计数','lock 失败不访问对象'],'用局部强引用包住一次使用。','weak-lock'),stage('固定本轮记录','增加回调内新增与释放目标的场景。',['快照语义说明','调用顺序测试'],['新增只影响下一轮','明确弱快照不会提前保活全部目标'],'不要只复制裸指针。','deep-shared-weak'),stage('完成观察注册表','实现 prune 并评审关闭与异常策略。',['完整注册表','产品接入的寿命和并发限制'],['全部综合测试通过','不把成员线程安全归因于引用计数'],'区分统计信息与执行承诺。','deep-shared-weak')],workshop:w,sourceRefs:source('util.smartptr.weak.obs')};
}

{
const w=workshop('move-guarantees','可移动缓冲区与事务变换','实现 IntBuffer(vector<int>)，支持移动、带边界的 at 和 transform_strong(f)。',
 ['禁止复制；移动后源 size() 为零；自移动保持内容不变。','at(index) 越界抛 out_of_range；提供 const 与非 const 重载。','transform_strong 在独立缓冲区计算，任一次 f 抛出时原缓冲区不变。','f 接收 int 返回 int；不得通过别名修改原缓冲区，外部副作用不在回滚范围内。'],
 ['先为候选结果申请独立资源，再逐项计算。','所有计算完成后用不抛出的指针交换提交。','移动赋值先明确自移动策略，释放目的旧资源后接收新责任。'],
 `class IntBuffer{public:explicit IntBuffer(const std::vector<int>&){}IntBuffer(const IntBuffer&)=delete;IntBuffer(IntBuffer&&)noexcept{}IntBuffer&operator=(IntBuffer&&)noexcept{return *this;}std::size_t size()const{return 0;}int&at(std::size_t){throw std::out_of_range("todo");}const int&at(std::size_t)const{throw std::out_of_range("todo");}template<class F>void transform_strong(F&&){}};`,
 `class IntBuffer {
    std::unique_ptr<int[]> data_;
    std::size_t size_=0;
public:
    explicit IntBuffer(const std::vector<int>& values):data_(values.empty()?nullptr:std::make_unique<int[]>(values.size())),size_(values.size()){if(size_)std::copy(values.begin(),values.end(),data_.get());}
    IntBuffer(const IntBuffer&)=delete;
    IntBuffer&operator=(const IntBuffer&)=delete;
    IntBuffer(IntBuffer&&o)noexcept:data_(std::move(o.data_)),size_(std::exchange(o.size_,0)){}
    IntBuffer&operator=(IntBuffer&&o)noexcept{if(this!=&o){data_=std::move(o.data_);size_=std::exchange(o.size_,0);}return *this;}
    std::size_t size()const noexcept{return size_;}
    int&at(std::size_t i){if(i>=size_)throw std::out_of_range("index");return data_[i];}
    const int&at(std::size_t i)const{if(i>=size_)throw std::out_of_range("index");return data_[i];}
    template<class F>void transform_strong(F&&f){
        auto next=size_?std::make_unique<int[]>(size_):nullptr;
        for(std::size_t i=0;i<size_;++i)next[i]=std::invoke(f,data_[i]);
        data_.swap(next);
    }
};`, '#include <functional>\n#include <memory>\n#include <algorithm>\n#include <utility>',[
 test('移动与覆盖','IntBuffer a({1,2}),b({9});b=std::move(a);std::cout<<a.size()<<" "<<b.size()<<" "<<b.at(1);','0 2 2','旧目的资源被释放，源成为空状态。'),test('自移动和只读访问','IntBuffer a({3,4});a=std::move(a);const auto&c=a;std::cout<<c.at(0)<<" "<<c.size()<<" "<<std::is_copy_constructible_v<IntBuffer>;','3 2 0','自移动契约与 const 接口明确。'),test('中途失败不提交','IntBuffer a({1,2,3});try{a.transform_strong([](int n){if(n==2)throw std::runtime_error("fail");return n*10;});}catch(const std::runtime_error&){}std::cout<<a.at(0)<<" "<<a.at(1)<<" ";a.transform_strong([](int n){return n+1;});std::cout<<a.at(2);','1 2 4','已算出的临时结果不会泄漏进原对象。'),test('空与边界','IntBuffer a({});int calls=0;a.transform_strong([&](int n){++calls;return n;});bool caught=false;try{a.at(0);}catch(const std::out_of_range&){caught=true;}std::cout<<calls<<" "<<caught;','0 1','空缓冲区不调用回调，越界明确失败。')]);
depthLanguage['move-guarantees']={goals:['把移动理解为资源责任转移而非语法装饰','实现覆盖赋值、自移动和空状态不变量','用候选结果加无抛提交建立强异常保证'],prerequisites:['理解 unique_ptr 与析构责任','理解左值、右值以及 std::move'],derivation:[
step('给缓冲区写出必须同时成立的事实','一个整数缓冲区有指针与长度，二者必须描述同一份资源。若长度非零，指针应指向足够多已初始化整数；长度为零时本课允许空指针。先把这个不变量写出来，再考虑移动。只把指针拿走而忘记清零源长度，会留下一个看似有元素却没有资源的对象，之后的边界检查也可能被这个假状态骗过。','使用 unique_ptr 管理数组能减少手写释放路径，但不会自动维护额外长度。我们禁止复制，让学习焦点停在单一拥有者之间转移。构造从 vector 复制数据是一个明确输入边界，不意味着对象自身可复制。移动后源对象仍是一个有效对象，本课进一步约定它为空；标准库某些类型只承诺有效但未指定，不能把本课约定泛化到所有类型。'),
step('把目的旧资源纳入移动赋值','移动构造从无资源的新对象开始，移动赋值则面对目的对象已经拥有的数组。直接覆盖裸指针会丢失旧资源；unique_ptr 的移动赋值会正确处理这个释放责任。随后清零来源长度，使两边不变量同时恢复。自移动被显式检测并保持内容不变，这比依赖偶然的成员操作结果更容易给调用方一个可验证的契约。','std::move 本身只是改变表达式类别，真正转移发生在我们的移动操作或成员的移动操作中。noexcept 的理由是指针所有权操作与整数交换不抛出，不是“移动通常应该更快”。如果类型后来增加会抛出的成员，或移动过程需要重新分配内存，必须重新审查承诺。错误 noexcept 在异常出现时可能直接结束程序，不能当成随意的性能注释。'),
step('把可能失败的计算移出原状态','现在要求对每个整数应用一个可能抛出的函数。原地更新在第三个元素失败时，前两个已经变化，只能提供部分更新后的状态。为获得强保证，先申请同样大小的候选数组，在其中计算所有结果。任意回调抛出，局部 unique_ptr 自动释放候选资源，原数组没有被修改，因此不需要逐项记录旧值或编写复杂逆操作。','全部计算成功后，交换拥有指针就是提交点。它不调用用户代码、不重新分配，因而能稳定完成。强保证是针对缓冲区自身状态：回调写日志、增加外部计数或修改其他对象不会自动被撤销。我们还要求回调不通过别名修改原缓冲区，否则独立候选也无法保护原状态。把这些边界写进契约比笼统地说“异常安全”更准确。'),
step('用可控失败证明提交位置','在第二个元素抛出的测试最有价值：它证明候选已经发生部分计算，而原数组仍保持原样。随后再执行成功转换，验证对象在失败后依然可用。移动覆盖测试检查来源为空与目的数据同时正确，自移动测试锁定约定，空缓冲区测试确保回调不被意外调用。测试组合覆盖责任转移和内容事务这两条不同轴线。','工程中不应总为每次操作复制全部数据。强保证需要额外内存和计算，热点路径可能选择基本保证或由调用者提供预分配空间。首先依据业务恢复需求选择保证级别，再测量成本。一个能解释何时值得候选提交、何时可以接受部分状态的接口设计，比仅在类型里写出五个特殊成员函数更接近成熟的资源管理能力。')],
example:example('失败变换不会污染原内容',w,`IntBuffer input({1,2,3});
try{input.transform_strong([](int n){if(n==2)throw std::runtime_error("stop");return n*10;});}catch(const std::runtime_error&){}
assert(input.at(0)==1 && input.at(2)==3);
IntBuffer owner(std::move(input));assert(input.size()==0);
owner.transform_strong([](int n){return n+1;});owner=std::move(owner);
assert(owner.at(0)==2 && owner.at(2)==4);
std::cout<<input.size()<<' '<<owner.at(0)<<' '<<owner.at(2);`,'0 2 4',['第一次变换在候选数组中进行。','第二项抛出使候选自动释放，原值仍为一到三。','移动构造同时转移数组并清零来源长度。','成功变换通过交换提交，自移动保持已提交内容。'],[{change:'直接写 data_[i]=f(data_[i])',prediction:'失败后第一个元素已变成十，强保证断言失败。',reason:'在所有可能失败操作完成前修改了公开状态。'},{change:'移除移动构造对来源长度的清零',prediction:'来源 size 不再是零，契约断言失败。',reason:'拥有指针与长度不变量不同步。'}]),
pitfalls:[pit('移动仅覆盖裸指针','data_=other.data_; other.data_=nullptr;','目的旧资源可能泄漏，而且长度可能仍描述旧数组。','使用拥有型成员并一起维护所有相关状态。'),pit('误把 move 当执行动作','std::move(buffer);','这行只形成表达式，不会自动转走资源。','检查表达式最终传给哪个构造、赋值或参数。'),pit('承诺无法做到的强保证','for(auto&x:values)x=callback(x);','回调中途抛出时前面的元素已修改。','明确降低保证，或准备独立候选并在成功后提交。')],
stages:[stage('建立移动后状态','实现缓冲区移动构造与覆盖赋值。',['源目的状态表','资源责任说明'],['源长度清零','目的旧资源正确释放'],'指针和长度共同构成不变量。','move-buffer'),stage('增加异常变换','实现候选数组与成功提交。',['中途失败测试','强保证边界说明'],['失败后所有原元素不变','成功后结果一次发布'],'不要试图把未知回调副作用也称为可回滚。','deep-move-guarantees'),stage('交付可审查资源类型','补齐 const、空状态、自移动和范围检查。',['完整实现','性能与保证级别取舍'],['全部综合测试通过','解释额外数组的成本'],'逐一列出可能抛出的操作发生在提交前还是后。','deep-move-guarantees')],workshop:w,sourceRefs:source('class.copy.assign')};
}

{
const w=workshop('storage-lifetime','可恢复的单对象槽位','实现 ObjectSlot<T>：在预留原始存储里最多容纳一个 T，对构造失败、重复构造和销毁保持明确状态。',
 ['emplace(args...) 返回 T&；非空时抛 logic_error，原对象不变。','构造失败后保持空槽；value() 在空槽上抛 logic_error。','reset() 幂等，成功构造的对象恰好析构一次；T 的析构不抛出。','槽位不可复制、不可移动，避免内部对象被当作字节搬运。'],
 ['用独立指针记录对象是否存活，只有 construct_at 成功才赋值。','原始字节数组按 T 对齐；用构造返回的指针访问对象。','reset 结束对象生命，字节数组由槽位本身继续持有。'],
 `template<class T> class ObjectSlot { public: ObjectSlot()=default; ObjectSlot(const ObjectSlot&)=delete; ObjectSlot& operator=(const ObjectSlot&)=delete; template<class... A> T& emplace(A&&...){throw std::logic_error("todo");} T& value(){throw std::logic_error("empty");} bool has_value()const noexcept{return false;} void reset()noexcept{} };`,
 `template<class T> class ObjectSlot {
    alignas(T) std::byte storage_[sizeof(T)];
    T* live_ = nullptr;
public:
    ObjectSlot() = default;
    ObjectSlot(const ObjectSlot&) = delete;
    ObjectSlot& operator=(const ObjectSlot&) = delete;
    ~ObjectSlot() { reset(); }
    template<class... A> T& emplace(A&&... args) {
        if (live_) throw std::logic_error("occupied");
        T* next = std::construct_at(reinterpret_cast<T*>(storage_),
                                    std::forward<A>(args)...);
        live_ = next;
        return *live_;
    }
    T& value() { if (!live_) throw std::logic_error("empty"); return *live_; }
    bool has_value() const noexcept { return live_ != nullptr; }
    void reset() noexcept {
        if (live_) { std::destroy_at(live_); live_ = nullptr; }
    }
};`, '#include <memory>\n#include <utility>\n#include <stdexcept>',[
 test('构造与重复构造','ObjectSlot<int>s;s.emplace(7);try{s.emplace(9);}catch(const std::logic_error&){}std::cout<<s.value()<<" "<<s.has_value();','7 1','拒绝覆盖活对象，原值不丢失。'),
 test('抛出后可重试','struct P{int n;explicit P(int v):n(v){if(v<0)throw std::runtime_error("bad");}};ObjectSlot<P>s;try{s.emplace(-1);}catch(const std::runtime_error&){}std::cout<<s.has_value()<<" ";s.emplace(5);std::cout<<s.value().n;','0 5','失败不发布活对象状态。'),
 test('析构与空槽','int dead=0;struct P{int* p;explicit P(int&d):p(&d){}~P(){++*p;}};{ObjectSlot<P>s;s.emplace(dead);s.reset();s.reset();s.emplace(dead);}bool caught=false;ObjectSlot<int>x;try{x.value();}catch(const std::logic_error&){caught=true;}std::cout<<dead<<" "<<caught;','2 1','两次成功构造对应两次析构，空访问明确失败。'),
 test('扩展对齐','struct alignas(64)P{int x;explicit P(int n):x(n){}};ObjectSlot<P>s;auto&p=s.emplace(8);std::cout<<(reinterpret_cast<std::uintptr_t>(&p)%alignof(P)==0)<<" "<<p.x;','1 8','对象槽位遵守类型对齐要求。')]);
depthLanguage['storage-lifetime']={
 goals:['用状态转换说明原始存储与活对象的区别','在构造异常后保持可重试状态','证明销毁次数与成功构造次数一一对应'], prerequisites:['理解构造、析构与异常栈展开','能阅读模板参数包和指针表达式'],
 derivation:[
 step('问题从对象池的空槽开始','假设任务系统提前准备了一块槽位，之后才知道要构造哪个任务。此时已经取得足够的字节，但任务的构造函数尚未执行，业务不变量还没有建立。直接把地址转成任务指针并调用成员，会跳过建立不变量的过程。第一步不是选择哪个转换语法，而是分别记录存储归属和对象是否存活，避免把两个状态误写成一个指针。','把需求压缩成一格对象池：槽位拥有一段固定字节，外部只能请求构造、读取和清空。我们不支持移动槽位，因为直接移动字节会把未知类型的内部指针、锁或地址身份一起搬错。这个限制减少了第一版需要证明的性质，让注意力集中在对象生命开始、结束以及失败的回边，而不是试图一次实现完整分配器。'),
 step('将初始化成功设为发布点','emplace 收到参数时，先检查槽位必须为空，然后才调用 construct_at。构造器可能在任意一步抛出，所以不能在调用前就把 live_ 标成非空。只有函数成功返回，才保存返回的对象指针。这样构造异常沿栈传播时，槽位仍描述为空，不会在稍后的析构中对一个从未完整构造成功的对象调用析构函数。','这里把参数转发给构造函数，是把一次初始化所需的类别信息传到真正消费它的位置。返回的指针成为后续访问入口，避免反复从原始地址猜测当前对象身份。原始数组通过 alignas 满足对齐；大小通过 sizeof 满足空间要求。这两项是必要条件，却不能代替初始化本身，三项证据都成立后才可以访问成员。'),
 step('把销毁写成一个可重复请求','reset 的外部请求可以重复，但真正的析构不能重复。实现先查看 live_，只有非空才销毁对象，然后清除状态。槽位的字节数组没有被释放，因此下一次 emplace 可以重新使用这份存储。把这条路径与槽位自身析构复用，能减少正常退出与异常退出之间的清理差异，并使析构次数容易计数验证。','约定 T 的析构不抛出是接口的一部分：若释放责任在栈展开中再次失败，程序很难恢复。更复杂的资源可以提供显式关闭并报告失败，但本课槽位负责的是对象生命周期边界。构造失败时已经成功构造的成员由语言规则清理；槽位不能补一次完整对象析构，否则会把局部清理误认为完整对象已经存在。'),
 step('用可观察事件替代猜测','测试不应该只打印 value。我们让测试对象在析构时增加外部计数，并让负数构造故意抛出。正常构造后重置、重复重置、异常构造后重试、离开槽位作用域分别验证不同状态边。对齐对象测试则验证槽位地址符合扩展对齐需求。每个测试都对应模型中的一条路径，失败时可以定位究竟是哪一步提前改变了状态。','最后把这种单槽证明推广到对象池：分配槽位编号与开始对象生命仍是两个动作。构造失败要归还编号，析构成功后才能交回槽位，而借出的引用必须在回收前失效。单元测试只能检查被覆盖的操作序列，接口评审还需要确认外部没有保存越过 reset 的引用，这一借用约束不能由原始指针自动强制执行。')],
 example:example('一个槽位，三次构造请求',w,`int destroyed=0;
struct Task { int value; int* counter; Task(int v,int&c):value(v),counter(&c){if(v<0)throw std::runtime_error("bad");} ~Task(){++*counter;} };
ObjectSlot<Task> slot;
try { slot.emplace(-1,destroyed); } catch(const std::runtime_error&) {}
assert(!slot.has_value() && destroyed==0);
slot.emplace(7,destroyed);
assert(slot.value().value==7);
slot.reset(); slot.reset();
assert(destroyed==1);
slot.emplace(9,destroyed);
std::cout<<slot.value().value<<' '<<destroyed<<' '<<slot.has_value();`, '9 1 1',
 ['字节数组在槽位构造时已存在，但 has_value 仍为假。','失败构造没有经过发布点，析构计数保持零。','连续两次 reset 只产生一次析构。','第二个成功对象在打印时仍存活，main 退出时由槽位继续负责析构。'],
 [{change:'将第一次构造参数改成 1',prediction:'原来的空槽断言失败，后续 emplace 会拒绝覆盖。',reason:'成功构造已经发布了活对象状态，不能按失败路径继续。'},{change:'在第二次 reset 后调用 value()',prediction:'抛出 logic_error，不能读取旧的 7。',reason:'存储仍存在不代表旧对象仍存在。'}]),
 pitfalls:[pit('把地址存在当作对象存在','T* p=reinterpret_cast<T*>(bytes); p->run();','对于需要显式构造的此类对象，未开始生命周期就访问成员可能是未定义行为；此反例只用于审查，不执行。','先满足大小和对齐，再显式构造，并通过构造返回的指针访问。'),pit('在构造前标记成功','live_=reinterpret_cast<T*>(storage_); std::construct_at(live_,args...);','构造抛出后 live_ 仍非空，会诱发对未成功构造对象的错误析构。','使用局部 next，构造成功后再发布。'),pit('重复销毁','std::destroy_at(live_); // 没有置空','第二次 reset 可能再次销毁生命周期已经结束的对象，属于不应执行的错误路径。','销毁后立即维护空状态，并测试 reset 的幂等性。')],
 stages:[stage('建立空槽模型','实现合法构造、读取和一次 reset。',['两状态图','最小实现与构造计数'],['空槽读取抛异常','成功构造的值可以读取'],'先决定哪个字段表示对象存活。','lifetime'),stage('加入失败回边','让构造器可抛出，验证重试及重复 reset。',['异常路径表','失败后重试测试'],['失败不产生完整对象析构','重复 reset 不增加计数'],'状态只能在初始化成功后改变。','deep-storage-lifetime'),stage('提交可复用对象槽位','支持参数转发和扩展对齐，明确借用失效。',['完整 ObjectSlot','引用寿命与类型限制说明'],['全部综合测试通过','禁止复制移动且无原始字节搬运'],'检查 reset 后曾借出的引用。','deep-storage-lifetime')], workshop:w,sourceRefs:source('basic.life')};
}

{
const w=workshop('alignment-layout','有边界的布局规划器','实现 LayoutPlanner(capacity)：allocate(bytes,alignment) 返回可用偏移或 nullopt，不真正分配对象存储。',
 ['alignment 必须是非零二次幂；无效请求不改变 used()。','检查向上对齐和区间结尾的整数溢出。','零字节请求合法，可能因对齐消耗 padding；reset() 将游标归零。','这是相对零偏移的布局计算器，实际存储基地址仍须满足最大对齐。'],
 ['先验证对齐，再检查 used+alignment-1 不溢出。','通过 bytes<=capacity-offset 检查尾界，避免先做可能回绕的加法。','所有检查完成后一次提交新游标。'],
 `class LayoutPlanner{public:explicit LayoutPlanner(std::size_t){}std::optional<std::size_t>allocate(std::size_t,std::size_t){return {};}std::size_t used()const noexcept{return 0;}void reset()noexcept{}};`,
 `class LayoutPlanner {
    std::size_t capacity_, used_=0;
public:
    explicit LayoutPlanner(std::size_t capacity):capacity_(capacity){}
    std::optional<std::size_t> allocate(std::size_t bytes,std::size_t alignment){
        if(alignment==0 || (alignment&(alignment-1))!=0)return {};
        const auto mask=alignment-1;
        if(used_>std::numeric_limits<std::size_t>::max()-mask)return {};
        const auto offset=(used_+mask)&~mask;
        if(offset>capacity_ || bytes>capacity_-offset)return {};
        used_=offset+bytes;
        return offset;
    }
    std::size_t used()const noexcept{return used_;}
    void reset()noexcept{used_=0;}
};`, '#include <optional>\n#include <limits>',[
 test('顺序布局','LayoutPlanner p(16);std::cout<<p.allocate(3,1).value_or(999)<<" "<<p.allocate(2,8).value_or(999)<<" "<<p.used();','0 8 10','对齐空洞计入占用。'),test('失败原子性','LayoutPlanner p(10);p.allocate(3,1);std::cout<<p.allocate(9,8).has_value()<<p.allocate(1,3).has_value()<<p.allocate(1,0).has_value()<<" "<<p.used();','000 3','每种拒绝都保留游标。'),test('零字节与重置','LayoutPlanner p(8);p.allocate(3,1);std::cout<<p.allocate(0,8).value_or(999)<<" "<<p.used()<<" ";p.reset();std::cout<<p.allocate(8,1).value_or(999);','8 8 0','零字节也可能需要对齐。'),test('溢出检查','auto m=std::numeric_limits<std::size_t>::max();LayoutPlanner p(m);p.allocate(m-1,1);std::cout<<p.allocate(0,8).has_value()<<" "<<(p.used()==m-1);','0 1','不让回绕伪装成可用空间。')]);
depthLanguage['alignment-layout']={goals:['推导二次幂对齐公式并说明适用条件','用减法检查防止长度和偏移回绕','区分布局规划与真实基地址对齐'],prerequisites:['理解 size_t 与无符号整数回绕','了解 sizeof、alignof 和连续数组'],derivation:[
step('先模拟三次不同对齐的请求','准备十六字节的区域，先放三个字节，再放一个起始位置必须为八的倍数的对象。如果只把大小相加，第二次请求会从偏移三开始，违反对齐条件。我们真正需要的是找到不小于当前游标的最小合法偏移，然后再判断尾端放不放得下。这个例子把有用数据与对齐空洞分开，帮助解释为什么总占用不等于请求大小之和。','将接口设计成返回偏移而不是裸指针，可以先独立验证整数模型。实际分配器还需要保证基地址符合所要求的对齐，因为对齐的偏移加到不对齐基址上仍然错误。规划器并不构造对象，也不负责销毁对象。把职责拆开后，布局公式、实际地址与对象生命周期各有一个可审查的前提，不会互相掩盖缺陷。'),
step('由二进制低位推导掩码','对于八字节对齐，合法偏移的低三位必须为零。先加七，使已有余数能够进位，再把低三位清零，就得到向上取整结果。一般二次幂对齐使用减一作为掩码。若对齐不是二次幂，清低位并不表达取倍数，因此必须在计算前拒绝；零也必须先处理，否则减一会得到最大无符号值，破坏整个证明。','这个公式还隐含加法能够精确表示的前提。无符号回绕虽然在语言层面有定义，却会把靠近最大值的游标变成很小的地址，造成逻辑越界。我们比较当前游标与最大值减掩码，先证明加法不会回绕，再执行公式。这里使用减法检查不是编码风格偏好，而是把数学运算的范围前提落实到机器整数。'),
step('把失败请求做成没有副作用','得到候选偏移后，还不能马上移动游标。先确认偏移不大于容量，再比较请求大小是否不大于剩余容量。顺序不可倒置，否则容量减偏移也可能回绕。所有检查完成后，再用已经证明安全的偏移加长度得到新游标。这样无效对齐、空间不足和溢出都共用同一失败语义，调用方可放心尝试别的请求。','零字节请求也要明确。这里允许它，但要求返回的位置满足对齐，所以它可能推进游标消耗填充。这不是唯一设计，另一种接口可以约定零请求不改变状态；关键是测试与文档一致。容量为零也应能处理零字节、对齐为一的请求，而拒绝需要真实空间的请求，边界不能依赖偶然绕过某个分支。'),
step('把公式证据带回工程','只用几个常见对象大小无法覆盖溢出问题，所以综合实验允许容量只是数字，不实际分配海量内存。我们可以让游标靠近最大整数，再提出大对齐请求，验证它明确失败且保持原值。普通请求验证填充，零请求验证边界，reset 验证重用。每一组输入分别挑战公式成立条件，避免把通过常见样例误认为完整证明。','回到结构体布局时，成员间与末尾都可能有填充，具体大小依赖实现和 ABI。重排成员可能减少占用，也可能不改善实际访问性能。工程判断应记录对象数量、访问模式、缓存行为和序列化边界；不要把某台机器的 sizeof 输出固定写成跨平台协议。布局规划器提供的是合法位置计算，性能与持久化格式仍需另外设计。')],
example:example('可解释的三个布局结果',w,`LayoutPlanner plan(16);
auto first=plan.allocate(3,1); auto second=plan.allocate(2,8);
assert(first==0 && second==8 && plan.used()==10);
auto denied=plan.allocate(7,8); assert(!denied && plan.used()==10);
assert(plan.allocate(1,1)==10);
std::cout<<*first<<' '<<*second<<' '<<plan.used();`,'0 8 11',['第一项从零开始，占用三个字节。','第二项跳过五字节填充，从八开始。','空间不足的尝试没有提交新游标。','最后一个单字节请求复用原有尾端，最终占用十一。'],[{change:'把第二个请求对齐改成 3',prediction:'请求返回 nullopt。',reason:'掩码公式的前提是非零二次幂。'},{change:'容量改成 9',prediction:'第二个请求失败，已使用空间仍是三。',reason:'合法起始偏移不等于整个区间能够容纳。'}]),
pitfalls:[pit('先加再判断','if(offset+bytes>capacity)return {};','加法可能先回绕，之后比较会把超大请求误当作小请求。','先验证 offset<=capacity，再比较 bytes<=capacity-offset。'),pit('接受任意对齐','auto p=(used+a-1)&~(a-1);','掩码公式只适用于非零二次幂，且加法本身需要范围证明。','分开检查对齐形式与整数范围。'),pit('偏移对齐等同地址对齐','auto* p=base+aligned_offset;','如果 base 本身不满足对齐，最终地址仍不合法；错误解引用可能产生未定义行为，不执行此反例。','在真实分配层证明基地址满足最大对齐，并保持规划器职责清晰。')],
stages:[stage('从二进制推导取整','手算游标零到十五在八字节对齐下的结果。',['结果表与掩码解释','基础取整函数'],['结果不小于原值','每个结果是八的倍数'],'先画出最低三位。','align-up'),stage('加入拒绝与回滚语义','实现有限容量与无效请求处理。',['失败前后状态表','零字节契约'],['失败后 used 不变','零容量不发生除零或回绕'],'候选位置与已提交位置使用不同变量。','deep-alignment-layout'),stage('形成分配器前置组件','完成溢出边界并说明真实基址条件。',['完整规划器','接入 Arena 的前提说明'],['最大整数附近的请求安全失败','不把偏移规划描述成对象构造'],'不要实际申请最大整数大小的内存来测试公式。','deep-alignment-layout')],workshop:w,sourceRefs:source('basic.align')};
}

{
const pre='#include <array>\n#include <span>\n#include <optional>\n#include <cstdint>\nstruct WireRecord{std::uint16_t id;std::uint32_t count;bool enabled;bool operator==(const WireRecord&)const=default;};';
const w=workshop('representation','稳定的七字节记录格式','实现 encode_record 与 decode_record：明确字段、端序与布尔编码，不复制结构体原始表示。',
 ['格式恰好七字节：id 两字节大端，count 四字节大端，enabled 为 0 或 1。','decode_record(span<const uint8_t>) 长度不是七或布尔字节非法时返回 nullopt。','所有字段边界值都必须无损往返，不依赖结构体填充或主机端序。'],
 ['逐字节移动和截取无符号字段，避免对齐访问。','先验证格式再构造值对象；无效消息没有半个结果。','值相等按字段定义，协议相等按规范编码定义。'],
 `std::array<std::uint8_t,7> encode_record(const WireRecord&){return {};}
std::optional<WireRecord> decode_record(std::span<const std::uint8_t>){return {};}`,
 `std::array<std::uint8_t,7> encode_record(const WireRecord&r){
    return {std::uint8_t(r.id>>8),std::uint8_t(r.id),
        std::uint8_t(r.count>>24),std::uint8_t(r.count>>16),
        std::uint8_t(r.count>>8),std::uint8_t(r.count),std::uint8_t(r.enabled?1:0)};
}
std::optional<WireRecord> decode_record(std::span<const std::uint8_t>b){
    if(b.size()!=7 || b[6]>1)return {};
    auto id=std::uint16_t((std::uint16_t(b[0])<<8)|b[1]);
    auto count=(std::uint32_t(b[2])<<24)|(std::uint32_t(b[3])<<16)
        |(std::uint32_t(b[4])<<8)|std::uint32_t(b[5]);
    return WireRecord{id,count,b[6]!=0};
}`,pre,[test('明确线序','auto b=encode_record({0x1234,0x01020304,true});for(auto x:b)std::cout<<unsigned(x)<<" ";','18 52 1 2 3 4 1','验证协议字节而不是本机内存。'),test('边界往返','WireRecord a{65535,4294967295u,false};auto b=encode_record(a);auto r=decode_record(b);std::cout<<(r&&*r==a)<<" "<<(r?r->enabled:false);','1 0','高位不因符号扩展或截断丢失。'),test('拒绝不完整记录','std::array<std::uint8_t,7>b{};b[6]=2;std::cout<<decode_record(b).has_value()<<decode_record(std::span<const std::uint8_t>(b).first(6)).has_value()<<decode_record({}).has_value();','000','长度与离散值都属于格式验证。')]);
depthLanguage['representation']={goals:['区分值相等、对象表示相等与协议等价','写出独立于填充和主机端序的序列化','在解码边界建立完整值对象'],prerequisites:['理解整数位运算及无符号类型','理解结构体字段与 padding'],derivation:[
step('从跨进程读错字段追查起','假设服务把一个结构体的 sizeof 个字节直接发送给另一个程序。开发机器上正常，并不能证明协议有效：编译器可能插入填充，字段端序可能不同，布尔和其他类型的表示也可能有平台约束。我们真正想传输的是三个字段的值，而不是某次编译产生的对象布局。因此先列出业务字段，再明确它们在消息中的字节位置。','本课选取两个无符号整数和一个开关，刻意规定固定七字节格式。这个长度不从 sizeof 推导，而由协议字段宽度相加得到。编码函数的输入是有效值对象，输出是规范字节序列；解码函数面对不可信字节，要么产生完整有效对象，要么拒绝。接口因此具有清晰方向，不会将未知字节当成已经构造好的业务对象。'),
step('用显式移位建立唯一表示','大端格式规定最高有效字节先出现。对十六位编号，右移八位得到首字节，再截取低八位得到第二字节；三十二位计数同理。无符号字段避免有符号右移和符号扩展造成额外解释负担。每个字节都由值计算而来，结构体里即使存在填充，也不会进入输出。这一过程同时建立了一种规范表示，方便协议比较和回归测试。','解码时必须先把字节转成足够宽的无符号类型，再移到目标位置并按位合并。尤其最高字节左移二十四位，应在三十二位无符号域里完成。我们不把输入地址强制转换为整数指针，因为消息可能不满足对齐，也不能据此保证相应对象的合法访问。逐字节计算直接表达协议，不需要借用本机对象表示的偶然性质。'),
step('把离散状态和长度一起验证','长度必须恰好为七，而不仅仅至少为七，这是本课消息边界的契约。启用字段只接受零和一，其他字节不自动当作真。先验证这些条件，再一次性构造 WireRecord，能够避免调用方收到部分有效的结果。optional 在这里足够，因为练习只要求知道成功或失败；真实通信协议若需诊断，可以增加具体错误位置和错误类别。','按字段默认比较可以表达这三个值的相等关系，但不要反推所有结构都适合默认相等。含浮点、缓存字段或身份字段的类型需要领域决定。memcmp 比较的是字节，不负责理解业务语义；即使对象可平凡复制，也不代表字节比较就等价于业务比较。可复制表示、可合法访问、具有相同含义是三个需要分别审查的判断。'),
step('以规范样本和恶意边界验收','普通往返测试有一个盲点：编码和解码若犯了相同端序错误，仍可能彼此抵消。因此第一组测试直接要求已知整数产生规定的字节序列，第二组再做最大值往返，第三组拒绝短包与非法布尔值。这样测试分别验证格式、数值范围和输入校验，既检查两函数之间的关系，也检查它们与外部协议的关系。','工程扩展时，还需考虑版本、消息长度、校验和与未知字段策略，不能把七字节样例直接包装成通用协议库。持久化格式一旦发布，字段含义的改变也是兼容性问题。建议提交一份不依赖 C++ 代码的格式说明，并让另一个语言实现解码；这能暴露隐藏的本机假设，但不替代对超长输入、资源限制和错误恢复策略的评审。')],
example:example('值到字节，再回到值',w,`WireRecord input{0x1234,0x01020304,true};
auto bytes=encode_record(input);
assert(bytes[0]==18 && bytes[1]==52 && bytes[6]==1);
auto output=decode_record(bytes); assert(output && *output==input);
bytes[6]=9; assert(!decode_record(bytes));
std::cout<<output->id<<' '<<output->count<<' '<<output->enabled;`,'4660 16909060 1',['编码字段宽度由协议规定，与 sizeof 无关。','已知高低字节断言单独验证端序。','往返比较按字段值执行。','非法布尔字节被拒绝，不产生似是而非的真值。'],[{change:'交换输出的前两个字节',prediction:'id 会被解码成另一个值，格式长度仍合法。',reason:'端序是语义的一部分，合法长度不能检测所有数据错误。'},{change:'只传入前六字节',prediction:'返回 nullopt。',reason:'解码必须先建立完整记录边界，不能越界补读。'}]),
pitfalls:[pit('把结构体直接发出去','send(fd,&record,sizeof(record),0);','将填充、主机端序与 ABI 一起写入协议，还可能泄漏未定义内容。','逐字段定义格式并初始化每个输出字节。'),pit('用整数指针读消息','auto n=*reinterpret_cast<const std::uint32_t*>(bytes);','可能违反对齐、生命周期或合法访问类型要求；只做文字审查，不运行该反例。','逐字节解码或使用满足前提的表示复制再显式转换端序。'),pit('只验证往返','assert(decode(encode(x))==x);','编码器与解码器可能共享同一个格式错误，互相抵消。','加入外部规定的固定字节样本。')],
stages:[stage('明确值相等','给字段定义相等关系并解释为何不采用 memcmp。',['字段语义表','比较实现与反例分析'],['相等关系不读取 padding','能区分表示与意义'],'先写业务需要比较的字段。','value-equality'),stage('定义七字节协议','实现编码与规范字节样本。',['独立格式说明','端序样本'],['输出恒为七字节','最大字段值保留'],'不要调用 sizeof 决定消息长度。','deep-representation'),stage('完成安全解码边界','加入严格长度和布尔值校验。',['完整编码解码器','错误输入测试和版本扩展草案'],['全部综合测试通过','失败不会暴露部分对象'],'先验证，再发布值。','deep-representation')],workshop:w,sourceRefs:source('basic.types')};
}
