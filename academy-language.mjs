// Original C++20 lessons. The live working draft links below are references,
// not a claim that every feature in the current draft is available in C++20.
const S = (title, text, code = '') => ({ title, text, code });
const Q = (question, options, answer, explanation) => ({ question, options, answer, explanation });
const L = (id, module, title, subtitle, sections, quiz, exercises, review, visual = '') => ({
  id, module, title, subtitle, sections, quiz, exercises, review, visual, minutes: 30,
  sources: [
    { title: 'C++ Core Guidelines · 工程实践建议', url: 'https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines' },
    { title: 'C++20 工作草案 N4861 · 用于核对版本', url: 'https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/n4861.pdf' }
  ]
});

export const languageLessons = [
  L('deduction-capture', 'modern', '推导类型，也要推导责任。', 'auto、值类别与 Lambda 捕获共同决定数据怎样流动。', [
    S('从声明追踪到表达式', 'auto 的便利不代表可以忽略类型：按值推导通常去掉引用和顶层 const，auto& 保留借用，const auto& 表达只读访问。值类别描述表达式怎样参与绑定，不能只看变量的声明类型。命名的右值引用仍是左值表达式，std::move 只提供可移动的表达式类别；调用哪个重载、是否真的转移资源，还要继续检查。'),
    S('把捕获写成资源边界', 'Lambda 是携带状态的对象。引用捕获借用外部变量，不会延长它的生命；按值捕获普通对象会形成副本，初始化捕获则能明确移动独占资源。示例把字符串移入闭包，离开工厂函数后仍可调用。若捕获的是裸指针、视图或 this，复制捕获值仍然只是复制地址，必须另外证明所指对象存活。', `#include <iostream>
#include <string>
#include <utility>

auto make_formatter(std::string prefix) {
    return [prefix = std::move(prefix)](int value) {
        return prefix + std::to_string(value);
    };
}

int main() {
    const std::string source = "task:";
    auto copy = source;          // 独立的 std::string
    const auto& borrowed = source;
    auto format = make_formatter(copy);
    copy = "changed:";
    std::cout << format(7) << ' ' << borrowed;
    // task:7 task:
}`),
    S('在延迟执行处重新审查', '一个在同步函数里安全的引用捕获，移到队列、缓存或后台任务后可能悬空。评审时先找最后一次执行回调的时刻，再向前追溯每个捕获值的拥有者。不要以统一改成值捕获结束分析：大对象复制有成本，智能指针可能形成环，状态副本也可能改变业务语义。选择捕获方式应同时解释寿命、共享需求和修改可见性。')
  ], [
    Q('std::string&& text = std::string("x"); 中，单独写出表达式 text 时它是什么？', ['右值，因为声明中有 &&', '左值，因为它是命名变量表达式', '已被移动的空字符串'], 1, '表达式类别与声明中的引用类型要分开判断。要选择接收右值的重载，通常需要显式使用 std::move(text)。'),
    Q('把 [this] 改成 [=]，就能让一个会逃离当前对象寿命的回调安全了吗？', ['能，所有成员都会复制进闭包', '不能，隐式捕获 this 仍不拥有当前对象', '能，编译器自动增加引用计数'], 1, '在 C++20 中通过 [=] 隐式捕获 this 已被弃用；它仍捕获指针，并不延长对象寿命。必须明确拥有、观察或取消回调的策略。')
  ], ['generic-repeat', 'strategy-pipeline'], '人工评审：把一个引用捕获的同步回调改成延迟执行。列出每项捕获的类型、拥有者和最后使用时刻，给出安全方案，并说明复制成本及状态变化是否符合原业务。'),

  L('typed-failure', 'modern', '让失败，也拥有准确的类型。', '用 optional 表达缺席，用 variant 表达需要区分的状态。', [
    S('先问调用方需要知道什么', 'optional<T> 表达有值或无值，不会记录缺席原因。如果配置不存在和配置格式错误需要不同处理，就不能把两者都悄悄转换成默认值。variant 可以把成功数据与具体错误组成封闭集合，迫使接口设计者列出状态。本地编译标准是 C++20，不能直接把 C++23 的 std::expected 或 optional 单子成员当作已有能力。'),
    S('严格解析要检查完整消费', 'from_chars 将解析结果、停止位置和错误码分开返回；成功读出前缀，并不代表整段配置有效。下面区分空串、格式、整数范围和端口范围，再返回明确的成功类型。实际关联练习只要求 optional：它适合调用方只关心成功与否的契约。类型应随业务信息需求选择，不必为每个函数引入复杂错误层级。', `#include <charconv>
#include <iostream>
#include <string_view>
#include <variant>

struct Port { unsigned value; };
enum class ParseError { empty, syntax, range };
using PortResult = std::variant<Port, ParseError>;

PortResult parse(std::string_view text) {
    if (text.empty()) return ParseError::empty;
    unsigned n = 0;
    auto [end, ec] = std::from_chars(
        text.data(), text.data() + text.size(), n);
    if (ec == std::errc::result_out_of_range)
        return ParseError::range;
    if (ec != std::errc{} || end != text.data() + text.size())
        return ParseError::syntax;
    if (n == 0 || n > 65535) return ParseError::range;
    return Port{n};
}

int main() {
    auto result = parse("8080");
    if (const auto* port = std::get_if<Port>(&result))
        std::cout << port->value;
}`),
    S('封闭集合也需要异常边界', '访问 variant 前应确认当前分支，或用 visit 处理所有候选类型。新增候选时，过宽的兜底分支可能掩盖漏处理；显式列举或依赖类型的编译期断言更利于发现变化。variant 的某些类型切换操作在构造抛出后可能进入 valueless_by_exception 状态，它不是业务错误枚举。对外接口仍须说明分配失败与访问错误怎样传播。')
  ], [
    Q('from_chars 对 "8080x" 返回无错误且停止在 x。严格端口配置解析应如何判断？', ['接受 8080，忽略后缀', '拒绝，因为没有消费完整输入', '必须重新用 stoi 解析'], 1, '解析器读出合法前缀与整个字段满足契约是两回事；必须同时检查错误码和停止位置。'),
    Q('调用方必须区分“没有配置”和“配置损坏”时，单个 optional<Port> 是否完整表达需求？', ['是，nullopt 自动保存错误原因', '否，需要额外错误类型或其他明确的错误通道', '否，必须改用继承'], 1, 'optional 只有有值与无值两种状态。可选择 variant、专用结果类型或符合项目约定的异常通道，不必强制采用继承。')
  ], ['parse-port', 'variant-event'], '人工评审：为实际服务的端口配置写一张状态表，区分缺失、空串、尾随字符、溢出和系统资源失败。逐项说明是否回退默认值、是否重试，以及日志需要保留的信息。'),

  L('borrowed-pipelines', 'modern', '视图越轻，寿命越要清楚。', 'span 传递范围，ranges 描述计算，容器承担结果所有权。', [
    S('把指针与长度放在一起', 'span<T> 是连续对象序列的借用视图，携带边界信息，但不拥有底层存储，也不延长对象寿命。span<const T> 约束通过该视图修改元素，不保证其他别名不会修改。原 vector 析构或扩容导致指针失效后，原视图也不能继续使用。把一对裸指针和长度换成 span 改善接口表达，却不自动完成生命周期证明。'),
    S('惰性管线在遍历时工作', 'filter 和 transform 组合表达计算步骤，构造管线通常并不生成结果数组。下例在输入仍存活时遍历视图，并把结果存入独立 vector，因此返回后不再借用输入。转换选择乘二，输入约定在安全范围内；换成平方时也必须分析整数溢出。不要从少写一个循环推断少做了运算，成本仍取决于遍历次数和谓词开销。', `#include <iostream>
#include <ranges>
#include <span>
#include <vector>

// 契约：所有输入值都在 -1000..1000 内。
std::vector<int> doubled_positive(std::span<const int> input) {
    auto pipeline = input
        | std::views::filter([](int n) { return n > 0; })
        | std::views::transform([](int n) { return n * 2; });
    std::vector<int> output;
    for (int n : pipeline) output.push_back(n);
    return output;
}

int main() {
    std::vector<int> input{-2, 3, 0, 4};
    auto result = doubled_positive(input);
    input.clear();
    for (int n : result) std::cout << n << ' '; // 6 8
}`),
    S('返回值是所有权决策', '返回借用局部容器的视图会留下悬空关系；即使视图对象本身按值返回，也没有复制元素。还要检查谓词捕获的引用，以及迭代器是否依赖视图自身。view 并不一律等于不拥有数据，必须审查具体适配器和标准版本。本课按 C++20 编写，显式循环物化结果；不要照搬后来版本的 ranges::to 或改变过的临时范围接受规则。')
  ], [
    Q('函数返回基于局部 vector 的 span，span 本身按值返回。有什么问题？', ['没有问题，元素随 span 一起复制', '局部 vector 销毁后 span 悬空', '只要元素是 int 就安全'], 1, 'span 的复制只复制视图信息，不复制元素，也不延长 vector 的生命周期。'),
    Q('本课管线函数返回 vector 的主要语义收益是什么？', ['保证所有计算在编译期完成', '结果拥有独立存储，调用方不用维持输入寿命', '保证比普通循环快两倍'], 1, '独立结果切断了输入借用关系。性能仍要结合分配、输入大小和优化后的机器码测量。')
  ], ['range-pipeline'], '人工评审：为“返回 vector”“返回 span”“返回 filter 视图”各设计一个合理接口，画出输入、谓词、视图及迭代器的寿命关系，并列出容器扩容后哪些对象失效。'),

  L('forwarding-identity', 'generic', '转发类别，保留对象身份。', '区分转发一次、反复调用与消费资源。', [
    S('推导过程决定它是不是转发引用', '函数模板中参与推导的非 const 模板参数 T 配合 T&&，可以形成转发引用。接收左值时 T 会推导成左值引用，经引用折叠后参数仍绑定原对象；接收右值时通常得到右值引用。const T&& 以及类型已经固定的某些 T&& 参数不满足这一规则。分析时先写出 T，再写参数类型，最后判断函数体里的表达式类别。'),
    S('只在真正转交责任处 forward', '命名参数在函数体中是左值表达式。一次性包装调用可用 std::forward 保留调用方的类别，但重复调用通常应继续把同一个函数对象当左值使用。下面的 repeat 不复制回调，所以外部计数保留下来；即使调用方传入临时对象，它也在整个调用期间存活。若每轮都转发成右值，可能反复触发仅供消费一次的 && 重载。', `#include <functional>
#include <iostream>
#include <utility>

template<class F, class... Args>
decltype(auto) call_once(F&& f, Args&&... args) {
    return std::invoke(std::forward<F>(f),
                       std::forward<Args>(args)...);
}

template<class F, class T>
void repeat(int n, F&& f, T& value) {
    for (int i = 0; i < n; ++i) std::invoke(f, value);
}

struct Counter {
    int calls = 0;
    Counter() = default;
    Counter(const Counter&) = delete;
    void operator()(int& value) { value += ++calls; }
};

int main() {
    Counter counter;
    int value = 0;
    repeat(3, counter, value);
    std::cout << value << ' ' << counter.calls; // 6 3
}`),
    S('保留引用也可能保留危险', '完美转发不保证结果安全，只尽量保留重载选择所需的类别信息。decltype(auto) 会保留被调函数返回的引用，因此包装器也可能把引用传向更外层；若引用指向临时实参，调用结束后的保存可能悬空。泛型接口评审要补上是否存储参数、是否多次消费、返回值借用谁三项契约。能用简单值传递说明的边界，不必默认堆叠转发。')
  ], [
    Q('template<class T> void f(T&&); 接收一个 int 左值 x 时，T 推导成什么？', ['int', 'int&', 'const int&&'], 1, '转发引用对左值采用特殊推导，T 为 int&；引用折叠后参数类型为 int&。'),
    Q('repeat_apply 需要反复使用同一回调。函数体应优先怎样调用命名参数 f？', ['每次 std::forward<F>(f)，越多越完美', '作为左值调用 f，保留同一个可复用对象', '每轮复制 f，隔离状态'], 1, '重复调用的契约要求复用身份和状态。是否消费对象由语义决定，不能机械地给所有 T&& 参数加 forward。')
  ], ['generic-repeat', 'scope-exit'], '人工评审：写一个分别提供 operator() & 和 operator() && 的回调类型，对比一次性包装器和重复执行器。为每次调用标明命中的重载，并审查返回引用是否逃离实参寿命。'),

  L('constraints-constants', 'generic', '把要求放在错误发生之前。', 'Concepts 约束接口，constexpr 检查可计算的规则。', [
    S('约束的是可用操作，不是成员名字', 'Concepts 应描述算法实际需要的能力。检查 reserve 成员存在还不够，可能需要它接收大小并返回 void，同时要求 size 可在 const 对象上调用。requires 中的形参用于表达式检查，不会真实构造对象，因此不应顺便要求默认构造。约束越贴近使用点，调用方越容易读懂失败诊断，也越少依赖模板函数体深处的偶然报错。'),
    S('区分表达式检查和常量计算', '下面的概念同时检查写操作和只读查询，再用 constexpr 函数表达一个无溢出问题的二次幂判定。static_assert 要求这些特定调用在编译期成立；constexpr 函数本身仍可接收运行期输入。requires 对表达式合法性的检查不会执行 reserve，更不会实际分配内存。把编译期可验证的部分提前，可以让运行期测试聚焦状态与异常路径。', `#include <concepts>
#include <cstddef>
#include <iostream>
#include <vector>

template<class T>
concept Reservable = requires(T& value, const T& read,
                             std::size_t count) {
    { value.reserve(count) } -> std::same_as<void>;
    { read.size() } -> std::convertible_to<std::size_t>;
};

constexpr bool power_of_two(std::size_t n) {
    return n != 0 && (n & (n - 1)) == 0;
}

static_assert(Reservable<std::vector<int>>);
static_assert(!Reservable<int>);
static_assert(power_of_two(64));
static_assert(!power_of_two(0));

int main() { std::cout << power_of_two(12); } // 0`),
    S('编译通过还差语义证据', '一个返回正确类型却完全不保存数据的伪容器，仍可能满足语法约束。Concepts 不能自动证明复杂度、无分配、排序一致性或线程安全；这些需要语义说明、实现审查和有针对性的测试。constexpr 也不是强制内联或提速标记。只有调用处需要常量表达式，或使用适当的 consteval 接口，才会把相应求值限制在编译阶段。')
  ], [
    Q('requires(T& value) { value.reserve(10); } 会构造 T 并分配内存吗？', ['会，约束通过后立刻分配', '不会，它在这里检查表达式是否有效', '仅在优化构建中不会'], 1, 'requires 的局部参数没有真实存储和生命周期，要求中的表达式用于检查，不进行这一运行期调用。'),
    Q('一个类型满足 Reservable，是否证明 reserve 达到了预期容量语义？', ['证明了，concept 会执行隐藏测试', '没有，语法成立还需要语义与行为验证', '证明了，只要函数名叫 reserve'], 1, '概念可限制表达式及类型关系，但任意实现仍可能违背容量、复杂度或异常保证等语义承诺。')
  ], ['reservable-concept'], '人工评审：构造一个语法满足 Reservable 却不符合容器语义的类型。为真实接口补充前置条件、后置条件、异常保证及复杂度说明，并分别指出哪些能靠静态检查、哪些需要运行验证。'),

  L('crtp-erasure', 'generic', '抽象放在编译期，还是运行期？', 'CRTP、虚接口和类型擦除各自付出不同成本。', [
    S('CRTP 把派生接口交给静态绑定', 'CRTP 让基类模板以派生类型作为参数，通过 static_cast 调用派生类提供的操作。它适合复用不依赖存储布局的算法、混入接口和编译期组合，不需要虚函数完成这一步派发。前提是当前基类子对象确实属于指定派生类型；错误配对会破坏向下转换的前提。构造或析构尚未完成时，也不能随意访问派生层状态。'),
    S('约束构造入口，保留 const 语义', '示例将基类构造设为私有并授予指定派生类访问权限，使普通错误配对更难创建可用对象；受保护析构避免经基类指针直接删除。混入接口使用 const Derived&，因此只调用只读派生接口。这些措施不把 static_cast 变成运行期检查，仍应保持继承关系简单。教学练习刻意简化访问控制，重点验证求和逻辑与静态接口。', `#include <iostream>
#include <string>

template<class Derived>
class DebugMixin {
    friend Derived;
    DebugMixin() = default;
    DebugMixin(const DebugMixin&) = default;
protected:
    ~DebugMixin() = default;
public:
    std::string debug() const {
        const auto& self = static_cast<const Derived&>(*this);
        return "[" + self.label() + "]";
    }
};

class Worker final : public DebugMixin<Worker> {
public:
    std::string label() const { return "worker"; }
};

int main() {
    const Worker worker;
    std::cout << worker.debug(); // [worker]
}`),
    S('按扩展边界选择工具', 'CRTP 的不同特化不是一个运行期统一类型，异构集合、动态插件和稳定二进制边界通常需要别的方案。虚接口公开抽象基类，类型擦除把具体类型藏在包装器中，两者均需明确所有权与派发成本。C++20 的 std::function 要求所保存目标可复制；它可能分配内存，不能假定总有小对象优化。最终选择还应比较编译耗时、代码体积与实际热点数据。')
  ], [
    Q('CRTP 基类里 static_cast<const Derived&>(*this) 合法使用的关键前提是什么？', ['Derived 名字与类名相似', '当前基类子对象确实位于对应的 Derived 对象中', '编译器开启了优化'], 1, 'static_cast 的向下转换没有运行期类型检查。实际对象必须满足继承和生命周期前提，不能任意把基类对象当派生对象。'),
    Q('需要运行期装入多种处理器并放在同一个容器中，哪个判断更合理？', ['CRTP 特化天然可以装入同一种 vector', '评估虚接口或类型擦除，并衡量所有权与派发成本', '一律改成宏，才能零成本'], 1, '运行期异构集合需要统一表示。CRTP 擅长静态组合，不能单独消除运行期表示需求。')
  ], ['crtp-mixin', 'strategy-pipeline'], '人工评审：用 CRTP、虚接口和 std::function 分别表达一个处理步骤。写出具体类型在哪一层暴露、是否允许运行期替换、可否保存不可复制状态，并用编译产物与基准数据支持最终选择。'),

  L('strategy-factory', 'design', '把变化装进组合，而不是分支深处。', 'Strategy 定义可替换行为，Factory 负责合法创建。', [
    S('先定位真正会变化的规则', '策略模式的价值是把独立变化的算法从稳定流程中抽离，而不是把每个 if 都包装成类。文本管线的执行顺序稳定，各步骤可能按配置替换，函数对象就足以表达这种变化。工厂负责把外部配置转成合法策略，并明确未知配置如何失败。创建与执行分离后，业务代码不必同时理解配置拼写、对象构造和每一步内部实现。'),
    S('函数对象也需要拥有权契约', '下面工厂返回可复制的函数包装器；管线拥有策略对象，字符串按值进入并通过移动传给下一步。示例的空工厂结果被明确检查，而不是执行空 std::function。若策略捕获引用，拥有包装器并不等于拥有被引用对象；若业务要求不可复制状态，则应重新选择表示。组合顺序影响结果，因此顺序本身也属于应测试的业务契约。', `#include <functional>
#include <iostream>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

using Step = std::function<std::string(std::string)>;
std::optional<Step> make_step(std::string_view kind) {
    if (kind == "brackets")
        return Step{[](std::string s) { return "[" + s + "]"; }};
    if (kind == "suffix")
        return Step{[](std::string s) { return s + "!"; }};
    return std::nullopt;
}

int main() {
    std::vector<Step> steps;
    for (auto kind : {"suffix", "brackets"}) {
        auto step = make_step(kind);
        if (!step) return 1;
        steps.push_back(std::move(*step));
    }
    std::string text = "ready";
    for (const auto& step : steps) text = step(std::move(text));
    std::cout << text; // [ready!]
}`),
    S('从可替换走到可维护', '接口应说明策略能否保存状态、是否可并发调用、发生异常后还能否重试。const 管线成员函数并不自动证明目标回调纯净或线程安全，因为回调仍可能修改外部状态。不要用模式名替代异常语义：步骤抛出时，当前中间结果可能已被消费，调用方需要明确处理失败。只有确实存在运行期扩展需求，才进一步引入注册表、插件加载与版本协议。')
  ], [
    Q('创建策略与执行策略分开的直接收益是什么？', ['保证没有任何堆分配', '隔离配置解释与执行逻辑，方便分别验证', '自动消除所有异常'], 1, '工厂验证配置并创建行为，管线只负责按契约组合执行；成本和错误传播仍要单独设计。'),
    Q('管线按值保存 std::function，其中 Lambda 捕获了局部对象的引用。安全结论是什么？', ['绝对安全，std::function 拥有所有捕获目标', '仍要证明被引用对象覆盖回调的使用寿命', '只要 run 是 const 就安全'], 1, '包装器拥有闭包，但引用捕获保持借用关系。const 也不会延长被借用对象的寿命。')
  ], ['strategy-pipeline'], '人工评审：为文本处理产品设计三种可替换策略和一个配置工厂。提交正常、未知配置、步骤失败及顺序交换的用例，并说明为何这里选择函数组合，而不是继承层级。'),

  L('observer-lifetimes', 'design', '退订不是删掉一个回调那么简单。', '把 Observer 的派发、寿命与取消语义写清楚。', [
    S('发布动作需要一个确定边界', 'Observer 把发布者与订阅者解耦，也引入何时还能被调用的问题。若回调执行中修改订阅容器，直接遍历可能使迭代器失效。本课练习采用开始发布时复制回调快照的契约：本轮参与者固定，新增与退订从后续发布生效。这意味着退订成功后，本轮快照中的回调仍可能执行。它不是“立即停止”的取消语义，调用方必须知道差别。'),
    S('用弱引用保护观察目标', '示例返回的回调保存 weak_ptr，每次执行时通过 lock 尝试取得临时强引用，因此拥有者销毁后再次调用只会跳过工作。这个模式保护目标寿命，却不会自动移除发布者中的回调记录，也不保证目标成员的线程安全。实际系统常再配一个可移动的连接令牌，以 RAII 承担退订责任；令牌本身同样不能保存可能先销毁的发布者裸地址。', `#include <functional>
#include <iostream>
#include <memory>

struct Listener {
    int total = 0;
    void on_event(int value) { total += value; }
};

std::function<void(int)> observe(std::weak_ptr<Listener> weak) {
    return [weak](int value) {
        if (auto owner = weak.lock()) owner->on_event(value);
    };
}

int main() {
    auto listener = std::make_shared<Listener>();
    auto callback = observe(listener);
    callback(4);
    std::cout << listener->total; // 4
    listener.reset();
    callback(9); // 目标已销毁，安全跳过
}`),
    S('重入与并发是额外的协议', '单线程的快照派发不能直接宣称线程安全。多线程系统需要同步注册表，但持锁调用用户回调可能死锁或放大阻塞；通常先在锁内确定任务，再释放锁执行，并重新定义取消语义。本练习不支持递归 publish，回调异常直接传播，因此后面的回调可能尚未执行。走向产品前应明确递归、异常隔离、重复退订、订阅编号耗尽及关闭阶段的行为。')
  ], [
    Q('按本课快照契约，回调 A 在发布中退订了回调 B，B 已在本轮快照里。B 会怎样？', ['本轮仍会执行，后续发布不再包含它', '本轮一定立刻跳过', '这是语言层面的未定义行为'], 0, '退订修改的是注册表，本轮使用的回调快照不变。立即取消是另一种契约，需要额外状态与检查。'),
    Q('weak_ptr::lock 成功后，哪项能力并没有因此自动获得？', ['临时强引用维持目标存活', '安全尝试取得目标的共享所有权', '目标成员可被多个线程无同步地修改'], 2, 'lock 解决共享所有权取得与存活问题，不替目标对象成员建立互斥或其他同步关系。')
  ], ['event-bus', 'scope-exit'], '人工评审：在 EventBus 上设计连接令牌，写出发布者先销毁、订阅者先销毁、移动令牌、回调中退订四条时序。明确当前快照是否还能调用目标，并给出不会捕获悬空发布者地址的方案。'),

  L('pimpl-boundaries', 'design', '把实现变化，留在边界里面。', 'Pimpl、ABI 与可维护 API 的取舍。', [
    S('头文件也是长期契约', '公开类的私有字段仍出现在头文件中，修改它们可能改变对象布局并触发调用方重编译。Pimpl 把实现对象藏在不完整类型后，通过一个拥有指针隔开编译依赖，适合需要稳定库边界的场景。但它不是跨编译器 ABI 通行证：调用约定、符号、标准库类型、异常配置和工具链仍可能不兼容。先定义支持的构建环境，再讨论二进制兼容承诺。'),
    S('在完整类型处定义释放动作', 'unique_ptr 可以在头文件中持有不完整类型，但默认删除器真正销毁对象时需要完整定义。因此析构函数放到实现文件，在 Impl 已定义之后实现；这里同时显式声明移动操作，因为用户声明析构会影响隐式移动生成。示例合并展示两个文件的内容，产品中应拆开。是否允许复制、移动后可调用哪些成员，也必须成为公开 API 的明确契约。', `#include <iostream>
#include <memory>
#include <utility>

// widget.hpp
class Widget {
    struct Impl;
    std::unique_ptr<Impl> impl_;
public:
    explicit Widget(int value);
    ~Widget();
    Widget(Widget&&) noexcept;
    Widget& operator=(Widget&&) noexcept;
    Widget(const Widget&) = delete;
    Widget& operator=(const Widget&) = delete;
    int value() const noexcept;
};

// widget.cpp；此处开始 Impl 已完整定义。
struct Widget::Impl { int value; };
Widget::Widget(int n) : impl_(std::make_unique<Impl>(Impl{n})) {}
Widget::~Widget() = default;
Widget::Widget(Widget&&) noexcept = default;
Widget& Widget::operator=(Widget&&) noexcept = default;
int Widget::value() const noexcept { return impl_ ? impl_->value : 0; }

int main() {
    Widget first(42);
    Widget second(std::move(first));
    std::cout << first.value() << ' ' << second.value(); // 0 42
}`),
    S('为稳定性付出可衡量的成本', 'Pimpl 通常增加一次间接访问，并可能为每个实例分配内存，不适合未经测量就用于每个小值类型。维护 API 时还需确定失败通道、线程规则、返回视图寿命与版本演化方式。可以保持实现指针布局稳定，却仍因改变函数签名或内联逻辑破坏兼容。评审的证据应包括调用方构建、旧客户端链接和行为回归；模式本身不能代替这些验证。')
  ], [
    Q('unique_ptr<Impl> 配合 Pimpl 时，把析构定义放在 Impl 完整定义之后，主要解决什么？', ['强制 Impl 拥有虚函数', '默认删除器销毁时需要完整类型', '禁止所有动态分配'], 1, '持有指针不等于执行删除；默认删除器执行销毁时必须了解完整类型，通常通过实现文件中的析构定义满足。'),
    Q('用了 Pimpl 后，可以直接承诺任意编译器和标准库之间二进制兼容吗？', ['可以，所有 ABI 差异都被指针消除了', '不可以，还要约束工具链、公开接口及构建配置', '可以，只要所有成员都是 private'], 1, 'Pimpl 限制一部分布局与编译依赖变化，并不统一名称修饰、调用约定、异常 ABI 或标准库表示。')
  ], ['strategy-pipeline', 'scope-exit'], '人工评审：把管线实现藏进 Pimpl，提交拆分后的头文件与实现文件。定义复制、移动后状态、异常及线程契约；再模拟新增私有缓存，记录哪些客户端需要重编译，并说明自动练习尚未验证的 ABI 风险。')
];

const draftSections = {
  'deduction-capture': ['dcl.spec.auto', 'expr.prim.lambda.capture'],
  'typed-failure': ['optional', 'variant'],
  'borrowed-pipelines': ['span.overview', 'range.filter'],
  'forwarding-identity': ['temp.deduct.call'],
  'constraints-constants': ['expr.prim.req', 'dcl.constexpr'],
  'crtp-erasure': ['expr.static.cast'],
  'strategy-factory': ['func.wrap.func'],
  'observer-lifetimes': ['util.smartptr.weak.obs'],
  'pimpl-boundaries': ['unique.ptr.single.dtor']
};
for (const lesson of languageLessons) {
  lesson.sources.push(...draftSections[lesson.id].map(section => ({
    title: `最新标准工作草案 [${section}] · 含 C++20 之后的变化`,
    url: `https://eel.is/c++draft/${section}`
  })));
}
