// 深入课原稿；所有 example.code 均为可独立编译的 C++20 程序。
const headers = `#include <algorithm>
#include <array>
#include <cassert>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <functional>
#include <future>
#include <iostream>
#include <limits>
#include <list>
#include <map>
#include <memory>
#include <memory_resource>
#include <mutex>
#include <new>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <thread>
#include <type_traits>
#include <unordered_map>
#include <utility>
#include <vector>
`;
const step = (title, a, b, code) => ({title, paragraphs:[a,b], ...(code ? {code} : {})});
const pit = (title,badCode,why,fix) => ({title,badCode,why,fix});
const stage = (title,task,deliverables,acceptance,hint,exerciseId) => ({title,task,deliverables,acceptance,hint,exerciseId});
const test = (name,body,expected,explanation) => ({name,body,expected,explanation});
const experiment = (change,prediction,reason) => ({change,prediction,reason});
const refs = (...sections) => [
  {title:'C++ Core Guidelines · 资源、接口与并发',url:'https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines'},
  ...sections.map(s=>({title:`标准工作草案 [${s}] · 请区分 C++20 与后续新增规则`,url:`https://eel.is/c++draft/${s}`})),
];
const solutions = {};

solutions.ring = `class BoundedLog {
    std::vector<int> cells_;
    std::size_t head_ = 0, size_ = 0;
public:
    explicit BoundedLog(std::size_t capacity) : cells_(capacity) {}
    bool push(int value) {
        if (size_ == cells_.size()) return false;
        auto tail = (head_ + size_) % cells_.size();
        cells_[tail] = value;
        ++size_;
        return true;
    }
    std::optional<int> pop() {
        if (!size_) return std::nullopt;
        int value = cells_[head_];
        head_ = (head_ + 1) % cells_.size();
        --size_;
        return value;
    }
    std::vector<int> snapshot() const {
        std::vector<int> out;
        out.reserve(size_);
        for (std::size_t i=0; i<size_; ++i)
            out.push_back(cells_[(head_+i)%cells_.size()]);
        return out;
    }
    std::size_t size() const noexcept { return size_; }
};`;
solutions.index = `class PrefixIndex {
    std::set<std::string> keys_;
public:
    bool insert(std::string key) { return keys_.insert(std::move(key)).second; }
    bool erase(const std::string& key) { return keys_.erase(key) != 0; }
    std::vector<std::string> top(const std::string& prefix, std::size_t limit) const {
        std::vector<std::string> out;
        for (auto it=keys_.lower_bound(prefix); it!=keys_.end() && out.size()<limit; ++it) {
            if (!it->starts_with(prefix)) break;
            out.push_back(*it);
        }
        return out;
    }
};`;
solutions.lru = `class TransactionalLru {
    using Entry = std::pair<int,int>;
    std::size_t capacity_;
    std::list<Entry> order_;
    std::unordered_map<int,std::list<Entry>::iterator> index_;
public:
    explicit TransactionalLru(std::size_t capacity) : capacity_(capacity) {}
    TransactionalLru(const TransactionalLru&) = delete;
    TransactionalLru& operator=(const TransactionalLru&) = delete;
    std::optional<int> get(int key) {
        auto it=index_.find(key);
        if (it==index_.end()) return std::nullopt;
        order_.splice(order_.begin(),order_,it->second);
        return it->second->second;
    }
    void put(int key,int value,bool injectFailure=false) {
        if (!capacity_) return;
        auto hit=index_.find(key);
        if (hit!=index_.end()) {
            hit->second->second=value;
            order_.splice(order_.begin(),order_,hit->second);
            return;
        }
        order_.emplace_front(key,value);
        try {
            if (injectFailure) throw std::runtime_error("injected index failure");
            index_.emplace(key,order_.begin());
        } catch (...) { order_.pop_front(); throw; }
        if (order_.size()>capacity_) {
            index_.erase(order_.back().first);
            order_.pop_back();
        }
    }
    std::vector<int> keys() const {
        std::vector<int> out;
        for (const auto& e:order_) out.push_back(e.first);
        return out;
    }
};`;
solutions.arena = `class CheckpointArena {
    alignas(64) std::array<std::byte,128> storage_{};
    std::size_t capacity_, used_=0;
    std::uint64_t generation_=1;
public:
    struct Mark { std::size_t offset; std::uint64_t generation; };
    explicit CheckpointArena(std::size_t capacity) : capacity_(capacity) {
        if (capacity>storage_.size()) throw std::invalid_argument("capacity");
    }
    CheckpointArena(const CheckpointArena&)=delete;
    CheckpointArena& operator=(const CheckpointArena&)=delete;
    void* allocate(std::size_t bytes,std::size_t alignment) {
        if (!bytes || !alignment || alignment>64 || (alignment&(alignment-1))) return nullptr;
        void* candidate=storage_.data()+used_;
        std::size_t space=capacity_-used_;
        if (!std::align(alignment,bytes,candidate,space)) return nullptr;
        used_=static_cast<std::byte*>(candidate)-storage_.data()+bytes;
        return candidate;
    }
    Mark mark() const noexcept { return {used_,generation_}; }
    bool rewind(Mark m) noexcept {
        if (m.generation!=generation_ || m.offset>used_) return false;
        used_=m.offset; return true;
    }
    void reset() {
        if (generation_==std::numeric_limits<std::uint64_t>::max())
            throw std::overflow_error("generation exhausted");
        used_=0; ++generation_;
    }
    std::size_t used() const noexcept { return used_; }
};`;
const record = `struct PoolRecord {
    inline static int alive=0;
    int value;
    explicit PoolRecord(int v):value(v) {
        if (v<0) throw std::runtime_error("construction failure");
        ++alive;
    }
    ~PoolRecord() noexcept { --alive; }
    PoolRecord(const PoolRecord&)=delete;
};
`;
solutions.pool = `template<class T,std::size_t N> class SlotPool {
    static_assert(std::is_nothrow_destructible_v<T>);
    struct Slot {
        alignas(T) std::byte storage[sizeof(T)];
        T* object=nullptr;
        std::uint64_t generation=1;
        bool retired=false;
    };
    std::array<Slot,N> slots_{};
public:
    struct Handle { std::size_t index; std::uint64_t generation; };
    SlotPool()=default;
    SlotPool(const SlotPool&)=delete;
    SlotPool& operator=(const SlotPool&)=delete;
    template<class... Args> std::optional<Handle> emplace(Args&&... args) {
        for (std::size_t i=0;i<N;++i) {
            auto& s=slots_[i];
            if (s.object || s.retired) continue;
            T* p=std::construct_at(reinterpret_cast<T*>(s.storage),std::forward<Args>(args)...);
            s.object=p;
            return Handle{i,s.generation};
        }
        return std::nullopt;
    }
    T* get(Handle h) noexcept {
        if (h.index>=N) return nullptr;
        auto& s=slots_[h.index];
        return s.generation==h.generation ? s.object : nullptr;
    }
    bool erase(Handle h) noexcept {
        T* p=get(h);
        if (!p) return false;
        auto& s=slots_[h.index];
        std::destroy_at(p); s.object=nullptr;
        if (s.generation==std::numeric_limits<std::uint64_t>::max()) s.retired=true;
        else ++s.generation;
        return true;
    }
    ~SlotPool() { for (auto& s:slots_) if (s.object) std::destroy_at(s.object); }
};`;
solutions.budget = `class BudgetResource final : public std::pmr::memory_resource {
    std::size_t limit_,current_=0,peak_=0,allocations_=0;
    std::pmr::memory_resource* upstream_;
protected:
    void* do_allocate(std::size_t bytes,std::size_t alignment) override {
        if (bytes>limit_-current_) throw std::bad_alloc();
        void* p=upstream_->allocate(bytes,alignment);
        current_+=bytes; peak_=std::max(peak_,current_); ++allocations_;
        return p;
    }
    void do_deallocate(void* p,std::size_t bytes,std::size_t alignment) override {
        upstream_->deallocate(p,bytes,alignment);
        current_-=bytes;
    }
    bool do_is_equal(const std::pmr::memory_resource& other) const noexcept override { return this==&other; }
public:
    explicit BudgetResource(std::size_t limit,std::pmr::memory_resource* upstream=std::pmr::new_delete_resource())
        :limit_(limit),upstream_(upstream) { if (!upstream) throw std::invalid_argument("null upstream"); }
    std::size_t current() const noexcept { return current_; }
    std::size_t peak() const noexcept { return peak_; }
    std::size_t allocations() const noexcept { return allocations_; }
};`;
solutions.ledger = `class AccountPair {
    mutable std::mutex firstMutex_,secondMutex_;
    int first_,second_;
public:
    AccountPair(int first,int second):first_(first),second_(second) {
        if (first<0 || second<0) throw std::invalid_argument("negative balance");
    }
    bool transfer(int from,int to,int amount) {
        if (from<0 || from>1 || to<0 || to>1 || amount<0) return false;
        std::scoped_lock guard(firstMutex_,secondMutex_);
        int& src=from==0 ? first_:second_;
        int& dst=to==0 ? first_:second_;
        if (src<amount) return false;
        if (from==to) return true;
        if (dst>std::numeric_limits<int>::max()-amount) return false;
        src-=amount; dst+=amount; return true;
    }
    std::pair<int,int> snapshot() const {
        std::scoped_lock guard(firstMutex_,secondMutex_);
        return {first_,second_};
    }
};`;
solutions.queue = `class CloseQueue {
    std::size_t capacity_;
    std::deque<int> queue_;
    std::mutex mutex_;
    std::condition_variable readable_,writable_;
    bool closed_=false;
public:
    explicit CloseQueue(std::size_t capacity):capacity_(capacity) {
        if (!capacity) throw std::invalid_argument("zero capacity");
    }
    bool push(int value) {
        std::unique_lock lock(mutex_);
        writable_.wait(lock,[&]{return closed_ || queue_.size()<capacity_;});
        if (closed_) return false;
        queue_.push_back(value);
        lock.unlock(); readable_.notify_one(); return true;
    }
    std::optional<int> pop() {
        std::unique_lock lock(mutex_);
        readable_.wait(lock,[&]{return closed_ || !queue_.empty();});
        if (queue_.empty()) return std::nullopt;
        int value=queue_.front(); queue_.pop_front();
        lock.unlock(); writable_.notify_one(); return value;
    }
    void close() {
        { std::lock_guard lock(mutex_); closed_=true; }
        readable_.notify_all(); writable_.notify_all();
    }
};`;
solutions.executor = `class BoundedExecutor {
    std::mutex mutex_;
    std::condition_variable ready_;
    std::deque<std::packaged_task<int()>> jobs_;
    std::vector<std::jthread> workers_;
    std::size_t capacity_;
    bool closed_=false;
    void work() {
        for (;;) {
            std::packaged_task<int()> task;
            {
                std::unique_lock lock(mutex_);
                ready_.wait(lock,[&]{return closed_ || !jobs_.empty();});
                if (jobs_.empty()) return;
                task=std::move(jobs_.front()); jobs_.pop_front();
            }
            task();
        }
    }
public:
    BoundedExecutor(std::size_t workers,std::size_t capacity):capacity_(capacity) {
        if (!workers || !capacity) throw std::invalid_argument("zero workers/capacity");
        try { for (std::size_t i=0;i<workers;++i) workers_.emplace_back([this]{work();}); }
        catch (...) { stop(); throw; }
    }
    std::future<int> submit(std::function<int()> fn) {
        std::packaged_task<int()> task(std::move(fn));
        auto future=task.get_future();
        {
            std::lock_guard lock(mutex_);
            if (closed_ || jobs_.size()>=capacity_) throw std::runtime_error("rejected");
            jobs_.push_back(std::move(task));
        }
        ready_.notify_one(); return future;
    }
    // 单一拥有者调用；不能由本池工作线程调用，不能与另一次 stop 并发。
    void stop() {
        { std::lock_guard lock(mutex_); closed_=true; }
        ready_.notify_all();
        workers_.clear(); // 析构 jthread 并 join；队列排空之后线程才退出
    }
    ~BoundedExecutor() { stop(); }
};`;
const priceInterface = `struct PricePolicy {
    virtual ~PricePolicy()=default;
    virtual int quote(int cents) const=0;
};
`;
solutions.strategy = `class StandardPrice final : public PricePolicy {
public:
    int quote(int cents) const override {
        if (cents<0) throw std::invalid_argument("negative price");
        return cents;
    }
};
class MemberPrice final : public PricePolicy {
public:
    int quote(int cents) const override {
        if (cents<0) throw std::invalid_argument("negative price");
        return static_cast<int>(static_cast<std::int64_t>(cents)*9/10);
    }
};
std::unique_ptr<PricePolicy> make_policy(const std::string& name) {
    if (name=="standard") return std::make_unique<StandardPrice>();
    if (name=="member") return std::make_unique<MemberPrice>();
    throw std::invalid_argument("unknown policy");
}`;
solutions.signal = `class Signal {
    struct State { std::map<std::size_t,std::function<void(int)>> slots; std::size_t next=1; };
    std::shared_ptr<State> state_=std::make_shared<State>();
public:
    class Connection {
        std::weak_ptr<State> state_;
        std::size_t id_=0;
        friend class Signal;
        Connection(std::weak_ptr<State> state,std::size_t id):state_(std::move(state)),id_(id) {}
    public:
        Connection()=default;
        Connection(const Connection&)=delete;
        Connection& operator=(const Connection&)=delete;
        Connection(Connection&& other) noexcept :state_(std::move(other.state_)),id_(std::exchange(other.id_,0)) {}
        Connection& operator=(Connection&& other) noexcept {
            if (this!=&other) { disconnect(); state_=std::move(other.state_); id_=std::exchange(other.id_,0); }
            return *this;
        }
        void disconnect() noexcept {
            if (auto state=state_.lock()) state->slots.erase(id_);
            id_=0; state_.reset();
        }
        ~Connection() { disconnect(); }
    };
    Signal()=default;
    Signal(const Signal&)=delete;
    Signal& operator=(const Signal&)=delete;
    Connection connect(std::function<void(int)> fn) {
        if (!fn) throw std::invalid_argument("empty callback");
        if (state_->next==std::numeric_limits<std::size_t>::max()) throw std::overflow_error("ids exhausted");
        auto id=state_->next++;
        state_->slots.emplace(id,std::move(fn));
        return Connection(state_,id);
    }
    void emit(int value) {
        auto state=state_;
        std::vector<std::size_t> snapshot;
        for (const auto& [id,fn]:state->slots) { (void)fn; snapshot.push_back(id); }
        for (auto id:snapshot) {
            auto it=state->slots.find(id);
            if (it==state->slots.end()) continue;
            auto fn=it->second; // 回调可退订自身，局部副本负责本次调用的寿命
            fn(value);
        }
    }
};`;
solutions.pimpl = `class Document {
    struct Impl;
    std::unique_ptr<Impl> impl_;
public:
    Document();
    explicit Document(std::string text);
    ~Document();
    Document(const Document&);
    Document& operator=(const Document&);
    Document(Document&&) noexcept;
    Document& operator=(Document&&) noexcept;
    std::string text() const;
    std::size_t revision() const noexcept;
    void replace(std::string text);
};
struct Document::Impl { std::string text; std::size_t revision=0; };
Document::Document():impl_(std::make_unique<Impl>()) {}
Document::Document(std::string text):Document() { replace(std::move(text)); }
Document::~Document()=default;
Document::Document(Document&&) noexcept=default;
Document& Document::operator=(Document&&) noexcept=default;
Document::Document(const Document& other):impl_(other.impl_ ? std::make_unique<Impl>(*other.impl_) : nullptr) {}
Document& Document::operator=(const Document& other) {
    if (this!=&other) { Document copy(other); impl_.swap(copy.impl_); }
    return *this;
}
std::string Document::text() const { return impl_ ? impl_->text : std::string{}; }
std::size_t Document::revision() const noexcept { return impl_ ? impl_->revision : 0; }
void Document::replace(std::string text) {
    if (text.size()>64) throw std::length_error("document limit");
    if (revision()==std::numeric_limits<std::size_t>::max()) throw std::overflow_error("revision");
    if (!impl_) impl_=std::make_unique<Impl>();
    impl_->text.swap(text); ++impl_->revision;
}`;

const starters = {
ring:`class BoundedLog { public: explicit BoundedLog(std::size_t) {} bool push(int){return false;} std::optional<int> pop(){return {};} std::vector<int> snapshot() const{return {};} std::size_t size() const noexcept{return 0;} };`,
index:`class PrefixIndex { public: bool insert(std::string){return false;} bool erase(const std::string&){return false;} std::vector<std::string> top(const std::string&,std::size_t) const{return {};} };`,
lru:`class TransactionalLru { public: explicit TransactionalLru(std::size_t){} std::optional<int> get(int){return {};} void put(int,int,bool=false){} std::vector<int> keys() const{return {};} };`,
arena:`class CheckpointArena { public: struct Mark{std::size_t offset;std::uint64_t generation;}; explicit CheckpointArena(std::size_t){} void* allocate(std::size_t,std::size_t){return nullptr;} Mark mark() const noexcept{return {0,0};} bool rewind(Mark) noexcept{return false;} void reset(){} std::size_t used() const noexcept{return 0;} };`,
pool:`template<class T,std::size_t N> class SlotPool { public: struct Handle{std::size_t index;std::uint64_t generation;}; template<class... Args> std::optional<Handle> emplace(Args&&...){return {};} T* get(Handle) noexcept{return nullptr;} bool erase(Handle) noexcept{return false;} };`,
budget:`class BudgetResource final:public std::pmr::memory_resource { void* do_allocate(std::size_t,std::size_t) override{throw std::bad_alloc();} void do_deallocate(void*,std::size_t,std::size_t) override{} bool do_is_equal(const std::pmr::memory_resource& o) const noexcept override{return this==&o;} public: explicit BudgetResource(std::size_t,std::pmr::memory_resource* =std::pmr::new_delete_resource()){} std::size_t current() const noexcept{return 0;} std::size_t peak() const noexcept{return 0;} std::size_t allocations() const noexcept{return 0;} };`,
ledger:`class AccountPair {public: AccountPair(int,int){} bool transfer(int,int,int){return false;} std::pair<int,int> snapshot() const{return {0,0};}};`,
queue:`class CloseQueue {public: explicit CloseQueue(std::size_t){} bool push(int){return false;} std::optional<int> pop(){return {};} void close(){}};`,
executor:`class BoundedExecutor {public: BoundedExecutor(std::size_t,std::size_t){} std::future<int> submit(std::function<int()>){throw std::runtime_error("TODO: implement submit");} void stop(){}};`,
strategy:`std::unique_ptr<PricePolicy> make_policy(const std::string&){throw std::runtime_error("TODO: implement factory");}`,
signal:`class Signal {public: class Connection {public: void disconnect() noexcept{}}; Connection connect(std::function<void(int)>){return {};} void emit(int){}};`,
pimpl:`class Document {public: Document()=default; explicit Document(std::string){} std::string text() const{return {};} std::size_t revision() const noexcept{return 0;} void replace(std::string){}};`,
};

function lesson(config) {
  const {id,key,extra='',main,expectedOutput,exampleTitle,walkthrough,experiments,tests,contract,...rest}=config;
  return {
    ...rest,
    example:{title:exampleTitle,code:headers+extra+solutions[key]+'\n'+main,expectedOutput,walkthrough,experiments},
    workshop:{
      id:'deep-'+id,title:exampleTitle+' · 综合实现',subtitle:'由机制、边界到工程契约',
      objective:rest.stages[2].task,contract,
      guide:rest.stages.map(s=>s.task),hints:rest.stages.map(s=>s.hint),
      starter:starters[key],solution:solutions[key],preamble:headers+extra,tests,
    },
  };
}
export const depthFoundations = {};

depthFoundations['strategy-factory']=lesson({
 id:'strategy-factory',key:'strategy',extra:priceInterface,goals:['从变化点划分策略与创建责任','用接口契约保证策略可替换','验证金额边界与失败通道'],prerequisites:['理解虚函数和虚析构','掌握 unique_ptr 与整数溢出规则'],
 derivation:[
  step('1 · 先找到真正变化的行为','购物服务可能对普通用户原价计费，对会员按固定比例折扣。变化的是计价算法，订单读取、展示和保存不应随着每种算法重新分支。把输入输出契约固定后，调用者只需要请求一个价格，而无需知道内部是普通策略还是会员策略。','不应为了使用模式而给每个函数增加继承层。如果策略集合很小且编译期固定，普通函数、模板或 variant 也可能更合适。本课选择运行时多态，是为了练习配置字符串决定具体行为、调用方只持有统一接口的场景。'),
  step('2 · 将策略契约写成可验证规则','接口接收以分为单位的非负整数，返回非负整数。会员价格定义为原价乘九再除十，向下取整到分，避免浮点四舍五入差异。负输入统一抛 invalid_argument，而不是某个策略返回零、另一个策略静默接受，破坏调用者对可替换性的依赖。','计算中间值使用更宽的整数类型，再转换回 int。即使最终折扣结果不大于原值，先用 int 乘九仍可能溢出。算法的数学性质不能免除表达式求值类型的约束；边界测试要包含最大合法输入，并检查中间步骤而非只检查结果。'),
  step('3 · 工厂只负责合法创建','配置名与具体类型的映射集中在 make_policy 中，已知名称返回拥有独占责任的 unique_ptr，未知名称明确拒绝。调用方不需要到处重复 new 与 delete，也不会把解析错误伪装成默认原价。默认回退属于业务决策，若确实需要必须明确写入契约。','基类需要虚析构，因为调用者通过基类指针拥有派生对象。工厂返回完整构造后的策略，构造过程中失败则由 RAII 收尾。不要返回指向工厂局部对象的裸指针，也不要为了绕开所有权设计把所有策略自动升级成 shared_ptr。'),
  step('4 · 组合步骤时关注次序','真实价格还可能包含优惠券、税费和运费，各步骤往往不满足交换律。先打折后加固定运费，与先加运费再打折会产生不同结果。扩展阶段应将顺序作为显式配置或类型规则，并为每一步规定金额范围和失败行为，而不是隐藏在多个策略互相调用中。','策略对象若保存可变缓存，需要另行声明线程安全和状态寿命；当前两个策略无可变状态，可被只读调用，但接口本身不保证所有未来策略都同样安全。可替换性包含错误、资源与并发契约，不仅是函数签名完全一致。'),
  step('5 · 用契约测试支持演化','同一组输入同时验证普通与会员策略的非负性、边界处理和异常类型，再单独验证各自算法结果。这样新增第三种策略时可以复用基础契约测试，避免只对新算法几个示例满意就上线。工厂未知名称和拼写错误也需要独立测试。','商业接口变更还涉及已有配置兼容、审计记录与版本规则。例如把会员比例从九折改为八五折属于可观察业务变更，不能当成内部重构静默替换。设计模式帮助分离责任，但定价规则的版本和批准流程仍需由业务系统定义。'),
 ],exampleTitle:'可替换的金额策略工厂',main:String.raw`int main(){auto normal=make_policy("standard");auto member=make_policy("member");assert(normal->quote(101)==101);assert(member->quote(101)==90);assert(member->quote(std::numeric_limits<int>::max())>=0);bool bad=false;try{make_policy("unknown");}catch(const std::invalid_argument&){bad=true;}assert(bad);std::cout<<normal->quote(101)<<' '<<member->quote(101)<<'\n';}`,expectedOutput:'101 90\n',walkthrough:['工厂把字符串配置转换成完整的策略对象。','调用者统一通过 PricePolicy 接口取得价格。','会员计算使用更宽中间值，避免先乘法溢出。','未知配置明确失败；unique_ptr 通过虚析构清理派生对象。'],experiments:[experiment('把乘法中间类型改为 int','最大输入可能触发有符号溢出','最终值合法不代表中间计算合法。'),experiment('未知名称自动选择原价','配置错误被静默隐藏','合法创建与业务回退是不同责任。')],
 pitfalls:[pit('基类没有虚析构','struct Policy { virtual int quote(int)=0; };','通过基类拥有并销毁派生对象缺少正确析构契约。','为多态拥有接口提供虚析构。'),pit('窄类型中间乘法','return cents*9/10;','中间乘法可能先溢出。','先扩展整数类型，再计算并验证结果范围。'),pit('策略错误契约不同','negative ? 0 : price;','某个策略吞掉错误会破坏可替换性。','统一输入前置条件与失败通道。')],
 stages:[stage('01 策略接口','实现原价与会员策略的统一接口。',['金额单位说明','共享契约测试'],['负数统一拒绝','正常结果准确'],'先定义输入输出，再选择模式。','strategy-pipeline'),stage('02 合法工厂','加入配置创建、未知名和最大金额检查。',['工厂映射','边界计算过程'],['未知名明确失败','中间乘法不溢出'],'返回拥有完整对象的 unique_ptr。','deep-strategy-factory'),stage('03 业务演化','完成 make_policy，再设计优惠、税费和运费组合顺序。',['完整实现','顺序不可交换的反例'],['综合测试通过','标明策略版本与线程契约'],'不要让模式名代替业务规则。','deep-strategy-factory')],
 contract:['题目提供 PricePolicy，含虚析构及 virtual int quote(int) const=0；实现 make_policy(string)。','standard 返回原价；member 返回非负金额的九折向下取整到分；负金额抛 invalid_argument；未知名称也抛 invalid_argument。','全部 int 非负输入都必须避免中间溢出；返回 unique_ptr<PricePolicy>。'],
 tests:[test('可替换行为','auto a=make_policy("standard"),b=make_policy("member");std::cout<<a->quote(101)<<" "<<b->quote(101)<<" "<<b->quote(0);','101 90 0','统一接口产生各自规则的结果。'),test('配置与负输入','bool a=false,b=false;try{make_policy("bad");}catch(const std::invalid_argument&){a=true;}try{make_policy("member")->quote(-1);}catch(const std::invalid_argument&){b=true;}std::cout<<a<<b;','11','错误不被静默吞掉。'),test('最大边界','auto p=make_policy("member");int n=std::numeric_limits<int>::max();std::cout<<(p->quote(n)==static_cast<int>(static_cast<std::int64_t>(n)*9/10))<<" "<<make_policy("standard")->quote(7);','1 7','中间计算必须扩展宽度。')],sourceRefs:refs('class.virtual','expr.delete','unique.ptr','expr.mul'),
});

depthFoundations['observer-lifetimes']=lesson({
 id:'observer-lifetimes',key:'signal',goals:['把订阅寿命封装为可移动 RAII 连接','定义派发中退订、新增与异常语义','避免回调自退订导致对象被提前销毁'],prerequisites:['理解 weak_ptr 与 shared_ptr 的责任','掌握 lambda 捕获、std::function 和移动'],
 derivation:[
  step('1 · 订阅本身是一种资源','事件源保存回调时，回调可能引用界面、插件或业务对象。注册成功后就形成了需要在适当时间解除的关系，因此返回一个 Connection 比只返回整数编号更容易表达责任：连接对象销毁时自动退订，移动连接则转移这份责任。','Connection 只弱引用事件源状态，避免订阅令牌反向保活整套事件系统。事件源先结束后，令牌析构仍然可以安全执行空操作。接收者的生命是另一层问题，回调应通过 weak_ptr 获取接收者或由外部保证借用寿命，令牌并不会自动识别任意裸指针捕获。'),
  step('2 · 先确定派发中的变更语义','回调可能在收到事件时退订自己、退订后面的回调，甚至新增订阅。直接遍历正在被修改的容器容易出现迭代器失效或一次事件重复触发。这里在派发开始时只快照当前连接编号，新注册的连接不参加本轮，但退订的旧编号会在调用前重新核对。','编号按注册顺序递增，因此 map 遍历产生稳定顺序。删除某个尚未调用的连接会使本轮跳过它；删除已经调用的连接不会追溯撤销副作用。重入 emit 会建立自己的新快照，可能产生递归调用，业务应防止无限递归。'),
  step('3 · 当前回调必须自己保活','即使编号仍存在，也不能直接对容器里的 std::function 调用后允许它销毁自身存储。先将函数复制到局部变量，再执行；回调自退订时删除的是容器中的那份，正在调用的局部副本继续存活到调用完成。这个局部所有权很容易被忽略。','emit 同时先复制 shared_ptr<State> 到局部，使本轮派发所需的内部状态有明确寿命。若回调结束事件源的外部所有权，当前函数也不再依赖随后访问 this。函数复制可能抛出，本课约定向外传播并终止本轮，不承诺回滚已经完成的回调副作用。'),
  step('4 · 异常与取消必须写清边界','本课采用遇到第一个回调异常就终止当前派发，异常向调用方传播；后续回调本轮不再执行，但连接关系仍由令牌管理。另一种设计可以收集异常并继续，但它是不同契约，不能在实现过程中随意切换。退订也不等于取消一个已经开始运行的回调。','当前实现为单线程事件源，不允许多个线程并发修改连接或派发。若要支持跨线程退订，需要进一步定义是否等待在途回调结束、是否允许回调等待自己退出、以及接收者如何保持生命；仅给 map 加锁并持锁调用用户代码会制造新的死锁风险。'),
  step('5 · 把生命周期测试设计成轨迹','测试覆盖正常注册、令牌移动、作用域退出退订、事件源先销毁、派发期间删除后续回调，以及新增回调推迟到下一轮。记录实际调用序列而不只记录总次数，因为顺序错误可能恰好产生相同总和，掩盖协议违例。','工程验收还要检查回调捕获是否形成 shared_ptr 环、连接是否被无意当临时对象丢弃、异常后令牌是否仍可使用。有限测试不能证明全部插件组合安全，但通过明确状态、快照规则和资源责任，调用者能推导自己代码何时可以释放接收者。'),
 ],exampleTitle:'可安全退订的事件连接',main:String.raw`int main(){Signal s;int total=0;auto a=s.connect([&](int n){total+=n;});{auto b=s.connect([&](int n){total+=10*n;});s.emit(2);assert(total==22);}s.emit(3);assert(total==25);auto moved=std::move(a);moved.disconnect();s.emit(99);assert(total==25);Signal::Connection detached;{Signal shortLived;detached=shortLived.connect([](int){});}detached.disconnect();std::cout<<"observer total=25\n";}`,expectedOutput:'observer total=25\n',walkthrough:['连接对象 b 的作用域覆盖第一次派发。','b 析构后自动退订，第二次只调用 a。','移动 a 后释放责任归 moved，主动断开后不再调用。','事件源先析构时，外部连接的弱引用使清理安全失效。'],experiments:[experiment('不保存 connect 返回的令牌','临时令牌立即析构，订阅随即解除','RAII 连接的寿命就是订阅寿命。'),experiment('去掉 emit 的局部函数副本','回调自退订可能销毁正在执行的函数包装','执行过程也需要稳定的拥有者。')],
 pitfalls:[pit('丢弃令牌','signal.connect(callback);','临时对象立即退订，代码看似注册实际无效。','保存令牌直到订阅应结束。'),pit('持锁执行回调','lock_guard lock(m); callback();','回调重入连接操作可能死锁。','先确定快照与在途寿命，再在锁外调用。'),pit('强引用循环','callback=[owner]{ owner->use(); };','事件源与接收者可能相互强持有无法释放。','根据所有权图选择弱捕获并在调用时 lock。')],
 stages:[stage('01 连接责任','实现注册、手动断开与 RAII 清理。',['所有权图','令牌移动轨迹'],['退出作用域退订','源先销毁仍安全'],'令牌弱引用状态。','event-bus'),stage('02 派发变更','定义并实现自退订、后续退订和延迟新增。',['调用顺序测试','异常终止规则'],['已退订项跳过','新订阅下一轮生效'],'快照编号，调用前核对并复制函数。','deep-observer-lifetimes'),stage('03 生命周期接口','完成 Signal，写出单线程和接收者保活契约。',['完整实现','跨线程扩展的在途协议草案'],['综合测试通过','不宣称退订能取消已开始调用'],'把事件源、令牌、接收者三个寿命分开。','deep-observer-lifetimes')],
 contract:['实现 Signal 与嵌套可移动、不可复制的 Connection；connect(function<void(int)>)->Connection、emit(int)、Connection::disconnect()。','连接析构退订；源先销毁安全；按注册顺序派发；本轮开始后新增延迟到下一轮，已退订项跳过。','单线程使用；复制回调到局部后调用；首次异常向上传播并终止本轮。空回调抛 invalid_argument；连接ID不回绕。'],
 tests:[test('作用域与移动','Signal s;int n=0;auto a=s.connect([&](int x){n+=x;});{auto b=s.connect([&](int x){n+=10*x;});s.emit(1);}auto moved=std::move(a);s.emit(2);moved.disconnect();s.emit(8);std::cout<<n;','13','令牌寿命与移动责任决定订阅。'),test('派发中退订','Signal s;std::string order;Signal::Connection b;auto a=s.connect([&](int){order+="A";b.disconnect();});b=s.connect([&](int){order+="B";});s.emit(0);std::cout<<order;','A','调用前重新验证编号。'),test('新增延迟','Signal s;int n=0;bool added=false;std::vector<Signal::Connection> tokens;auto a=s.connect([&](int){if(!added){tokens.push_back(s.connect([&](int){n+=10;}));added=true;}});s.emit(0);std::cout<<n<<" ";s.emit(0);std::cout<<n;','0 10','本轮快照不包含新连接。'),test('异常与源销毁','Signal::Connection c;bool threw=false;{Signal s;c=s.connect([](int){throw std::runtime_error("x");});try{s.emit(1);}catch(const std::runtime_error&){threw=true;}}c.disconnect();std::cout<<threw;','1','异常传播不破坏外部令牌的安全清理。')],sourceRefs:refs('util.smartptr.weak.obs','func.wrap.func','class.dtor','intro.races'),
});

depthFoundations['pimpl-boundaries']=lesson({
 id:'pimpl-boundaries',key:'pimpl',goals:['在不完整类型边界表达独占实现','定义深复制、移动后状态与强异常保证','区分源兼容、二进制兼容和语义兼容'],prerequisites:['掌握 unique_ptr 和 Rule of Five','理解头文件、翻译单元与链接'],
 derivation:[
  step('1 · 从编译依赖识别边界','一个公开 Document 类可能不断增加私有缓存、索引与统计字段。如果全部写在头文件中，调用方会看到实现依赖，私有布局变化也可能迫使大量重编译。Pimpl 将这些字段放进实现类型，公开类只保存拥有实现的指针，减少实现变化传播。','这不是零成本抽象：每个实例通常多一次分配和间接访问，小而频繁使用的值类型可能得不偿失。先确认边界稳定性、构建成本或 ABI 需求，再决定使用它；不要把所有 private 成员机械地搬进堆对象。'),
  step('2 · 在完整类型处定义清理','公开声明只需要知道 Impl 是一个类，unique_ptr<Impl> 可以保存它的地址。但执行默认删除器时必须知道完整类型，因此析构函数在头部声明，在 Impl 定义之后的实现位置定义。移动赋值也可能删除旧实现，通常同样放在完整类型处定义。','本课示例把头部和实现逻辑放在一个独立可运行文件的两段中，便于演示；工程阶段必须真正拆成头文件与源文件，并单独编译只包含公开头的客户端。一个单文件程序编译成功并不能证明不完整类型边界已正确。'),
  step('3 · 先决定值语义再写特殊成员','Document 拥有文本和版本号，本课规定复制产生独立实现，随后修改副本不影响原对象。复制赋值先构造临时副本，再交换实现指针，若分配或字符串复制失败，目标保持原状。自复制赋值直接保持状态，避免多余工作。','移动转移 unique_ptr 所有权，移动后源允许查询为空文本、版本零，也允许再次 replace 重新建立实现。这个约定比只说“可析构但未指定”更强，需要每个公开方法共同遵守。不能在查询时无条件解引用可能为空的 impl。'),
  step('4 · 让修改拥有明确提交点','replace 按值接收新文本，文本大小不得超过六十四字节，版本也不能溢出。参数复制发生在修改对象之前；验证后用 string::swap 提交新内容，再增加版本号。对于被移动的空对象，先成功分配新 Impl，失败则继续保持空状态。','如果改成先清空旧文本再追加新文本，追加失败就会丢失原值。强异常保证要求任何可能失败的准备尽量发生在不可逆修改之前；它不是简单给函数套 try/catch。测试故意使用超限文本，确认拒绝后文本和版本都保持不变。'),
  step('5 · 兼容性不是一个指针的承诺','Pimpl 稳定一部分公开对象布局和编译依赖，但函数签名、名称修饰、调用约定、异常机制与标准库 ABI 仍可能改变二进制兼容。跨编译器或跨标准库发布时，需要明确支持矩阵，不能因为头文件只有指针就承诺任意二进制互通。','工程验收应保留旧客户端对象文件，替换仅修改私有实现的新库，执行链接与行为测试；另做源代码重编译测试和异常契约回归。有限单元测试证明特定版本行为，不替代发布兼容策略，也不能自动保证线程安全；当前 Document 需要外部同步。'),
 ],exampleTitle:'具有值语义的 Pimpl 文档',main:String.raw`int main(){Document a("alpha");Document b=a;b.replace("beta");assert(a.text()=="alpha"&&b.text()=="beta");Document moved(std::move(b));assert(b.text().empty()&&b.revision()==0);b.replace("reused");assert(b.text()=="reused"&&b.revision()==1);auto old=a.revision();try{a.replace(std::string(65,'x'));assert(false);}catch(const std::length_error&){}assert(a.text()=="alpha"&&a.revision()==old);assert(moved.text()=="beta");std::cout<<"alpha beta reused\n";}`,expectedOutput:'alpha beta reused\n',walkthrough:['复制构造创建独立 Impl，修改 b 不影响 a。','移动转移实现，源查询遵守空对象契约。','移动后的源可以再次 replace 并建立新实现。','超限文本在提交前拒绝，原文本和版本保持。'],experiments:[experiment('把复制实现改为共享同一 Impl','修改副本可能改变原对象','共享语义与本课值语义契约不同。'),experiment('text 无条件访问 impl_->text','移动后调用可能解引用空指针','移动后状态需要所有公开方法共同支持。')],
 pitfalls:[pit('头部直接默认析构','~Document()=default;','使用点可能还看不到 Impl 完整定义。','在 Impl 完整定义后定义清理成员。'),pit('浅复制拥有指针','impl_=other.impl_.get();','产生共享释放责任或破坏独占所有权。','深复制实现，或明确选择不同共享语义。'),pit('先破坏旧值再准备新值','impl->text.clear(); impl->text+=input;','追加失败后原值已经丢失。','先准备参数和新实现，验证后交换提交。')],
 stages:[stage('01 实现边界','声明不完整 Impl 并在完整定义处清理。',['头部与实现划分','只含公开头的客户端'],['客户端可单独编译','拥有资源正确释放'],'把析构放到完整类型之后。','scope-exit'),stage('02 值与移动','加入深复制、复制赋值和可重用移动后状态。',['复制独立性测试','移动状态表'],['副本互不影响','移动后源可查询和重用'],'先决定契约再写特殊成员。','deep-pimpl-boundaries'),stage('03 发布边界','完成 Document 并设计私有实现升级验证。',['完整实现','旧客户端链接与行为测试方案'],['综合测试通过','区分三种兼容性'],'Pimpl 不能统一所有工具链 ABI。','deep-pimpl-boundaries')],
 contract:['实现 Document 默认/文本构造、深复制、复制赋值、noexcept移动、text()、revision()、replace(string)。','默认文本空、版本0；成功 replace 版本加1；文本超过64字节抛 length_error 且不修改；文本构造等价默认后replace。','移动后源查询空文本与0，可再次replace；非线程安全。使用 unique_ptr<Impl> 且在完整类型处定义相关成员。'],
 tests:[test('复制独立','Document a("a");Document b=a;b.replace("b");Document c;c=a;c.replace("c");std::cout<<a.text()<<b.text()<<c.text()<<" "<<a.revision()<<b.revision()<<c.revision();','abc 122','复制对象拥有独立实现和版本。'),test('移动后重用','Document a("x");Document b(std::move(a));std::cout<<a.text().empty()<<a.revision()<<" ";a.replace("y");std::cout<<b.text()<<a.text()<<" "<<a.revision();','10 xy 1','移动转移所有权但源仍遵守公开契约。'),test('拒绝保持','Document a("stable");bool rejected=false;try{a.replace(std::string(65,\'x\'));}catch(const std::length_error&){rejected=true;}a=a;std::cout<<rejected<<" "<<a.text()<<" "<<a.revision();','1 stable 1','错误输入与自赋值均不损害旧状态。')],sourceRefs:refs('unique.ptr.single.dtor','unique.ptr.single.asgn','class.copy.ctor','class.copy.assign'),
});

depthFoundations['locks-and-thread-lifetime']=lesson({
 id:'locks-and-thread-lifetime',key:'ledger',goals:['用不变量确定锁的范围和快照语义','识别多锁死锁与线程寿命问题','用同步证明解释测试结果'],prerequisites:['了解线程、共享变量与数据竞争','掌握 RAII 和整数边界检查'],
 derivation:[
  step('1 · 从一次转账定义原子业务','两个账户之间转账既要减少来源余额，也要增加目标余额。业务不变量是两者总和不变、余额不为负，而且旁观者不能看到只扣款尚未入账的中间状态。先定义这个整体操作，再选择锁的范围，避免把“每个字段都加锁”误当成事务已经正确。','如果每次读写都单独锁住一个余额，其他线程可能在两次修改之间读到不完整结果。原子变量也只能保证各自操作的原子性，并不会把两个账户的变化自动合并。这里把两个账户和完整快照共同纳入一次双锁临界区。'),
  step('2 · 建立一致的取锁协议','线程甲先锁账户一再等待账户二，而线程乙先锁账户二再等待账户一，就形成循环等待。使用 scoped_lock 一次取得两个不同的 mutex，或者设计全局统一的锁层级，可以避免这种局部取锁顺序相反的问题；不能靠 sleep 让冲突看起来少发生。','本例始终锁住两个不同的成员 mutex，即使逻辑上是自己转给自己也不会把同一 mutex 传入两次。完整程序还要审查回调、日志和析构是否在持锁状态下取得其他锁；工具只看到一次成功执行，不会替代系统级锁顺序图。'),
  step('3 · 先验证，再一起提交','transfer 在修改前检查账户编号、金额非负、来源足够以及目标加法不溢出。目标边界使用最大值减金额来比较，避免先执行可能有符号溢出的加法。只有所有条件都成立，才连续修改两个整数；被拒绝的请求不改变任何余额。','余额检查必须在锁内，因为另一个转账可能让先前的检查结果过期。非法编号和负金额不依赖共享状态，可以先拒绝以缩短临界区。snapshot 同样取得两把锁，因此每次返回的是某一完整转账之前或之后的一致状态。'),
  step('4 · 让线程寿命服从数据寿命','局部账户先创建，jthread 后创建，逆序析构让线程先结束并 join，随后账户才销毁。若捕获局部引用后 detach，引用可能在线程运行中悬空。jthread 提供自动连接，但它请求停止并不强制中断工作，长任务仍需自己的退出协议。','示例显式 join 后再断言最终余额，join 建立工作完成与后续读取之间的同步关系。测试不假定两个线程的具体交错，只选择无论交错如何都应成立的总额与结果。不要把输出排序或调试器逐步运行当成同步手段。'),
  step('5 · 写出可审查的同步证明','逐个共享字段列出访问位置，确认每次访问都持有相应锁；再证明在锁释放之前两个余额已恢复不变量，后续取得同一锁的线程能看到已经完成的修改。最后证明没有持锁等待 join，因为工作线程也可能需要那把锁才能退出。','有限重复测试可发现遗漏，但不能证明所有调度都无竞态、死锁或饥饿。当前 Windows 评测未运行 ThreadSanitizer，应把工具缺口写进证据。进阶验收需要受支持环境的竞态检测、锁顺序审查和故障路径分析，而非仅增加循环次数。'),
 ],exampleTitle:'有一致快照的账户转账',main:String.raw`int main() {
    AccountPair pair(1000,1000);
    std::jthread first([&] {
        for (int i=0;i<100;++i) {
            bool ok=pair.transfer(0,1,1);
            assert(ok);
        }
    });
    std::jthread second([&] {
        for (int i=0;i<100;++i) {
            bool ok=pair.transfer(1,0,1);
            assert(ok);
        }
    });
    first.join();
    second.join();
    assert((pair.snapshot()==std::pair<int,int>{1000,1000}));
    bool overdraft=pair.transfer(0,1,2000);
    bool self=pair.transfer(0,0,10);
    assert(!overdraft && self);
    std::cout<<"1000 1000\n";
}`,expectedOutput:'1000 1000\n',walkthrough:['两个方向的转账都遵循相同双锁协议。','初始余额足够，任意调度下所有一元转账均可完成。','join 后才验证最终余额，结果不依赖线程顺序。','超额请求被拒绝，自转账不改变余额。'],experiments:[experiment('把 snapshot 改成分别加锁读取','可能读到跨越一次转账的组合','两个独立读取不是一致快照。'),experiment('在持有账户锁时 join 工作线程','可能形成等待循环','线程退出前也需要取得该账户锁。')],
 pitfalls:[pit('检查在锁外','if(balance>=n){ lock(); balance-=n; }','检查结果在加锁前可能过期。','将依赖共享状态的判断放入临界区。'),pit('相反锁序','lock(a); lock(b);','另一线程反向取得会形成循环等待。','联合加锁或严格统一层级。'),pit('认为 jthread 强制停止','request_stop(); destroy_shared_state();','停止只是请求，线程可能仍在访问状态。','确认退出并 join 后再销毁状态。')],
 stages:[stage('01 共享不变量','实现整数转账和一致快照。',['余额不变量','共享字段访问表'],['总额不变','拒绝不修改'],'先决定整体操作边界。','locked-counter'),stage('02 多锁与边界','加入双向并发、溢出与自转账。',['死锁交错反例','所有拒绝条件'],['联合锁协议一致','整数不溢出'],'先验证后提交，检查共享状态时持锁。','deep-locks-and-thread-lifetime'),stage('03 同步论证','完成 AccountPair 并提交线程寿命与同步证明。',['完整实现','锁图与 join 时间线'],['综合测试通过','说明有限测试与 TSan 缺口'],'不要用调度概率代替同步关系。','deep-locks-and-thread-lifetime')],
 contract:['实现 AccountPair(first,second)、transfer(from,to,amount)、snapshot()；账户编号0和1。','余额初始非负，否则抛 invalid_argument。非法编号、负金额、余额不足、目标溢出均返回false不修改；合法自转账不修改。','transfer 和 snapshot 支持并发；snapshot 同时反映两个账户的一致状态。'],
 tests:[test('正常拒绝','AccountPair p(10,20);std::cout<<p.transfer(0,1,3)<<p.transfer(0,1,100)<<p.transfer(0,1,-1)<<" ";auto[a,b]=p.snapshot();std::cout<<a<<" "<<b;','100 7 23','检查必须先于修改。'),test('双向并发','AccountPair p(1000,1000);std::jthread a([&]{for(int i=0;i<300;++i)p.transfer(0,1,1);});std::jthread b([&]{for(int i=0;i<300;++i)p.transfer(1,0,1);});a.join();b.join();auto[x,y]=p.snapshot();std::cout<<x<<" "<<y;','1000 1000','任意合法交错都保持总额与最终余额。'),test('溢出和自转账','AccountPair p(8,std::numeric_limits<int>::max());std::cout<<p.transfer(0,1,1)<<p.transfer(0,0,8)<<p.transfer(2,0,1)<<" ";auto[a,b]=p.snapshot();std::cout<<a<<" "<<(b==std::numeric_limits<int>::max());','010 8 1','边界失败不损坏状态。')],sourceRefs:refs('intro.races','thread.lock.scoped','thread.jthread.cons','thread.thread.member'),
});

depthFoundations['queue-close-protocol']=lesson({
 id:'queue-close-protocol',key:'queue',goals:['由谓词推导不会丢失唤醒的等待','设计有界队列的关闭排空协议','区分运行同步与队列对象寿命'],prerequisites:['会使用 mutex 与 unique_lock','理解条件变量、线程 join 与 optional'],
 derivation:[
  step('1 · 把阻塞接口定义完整','生产者向有限容量队列提交整数，消费者按先入先出取出。容量满时生产者等待，队列空时消费者等待。若接口只有 push 和 pop，服务退出时等待线程可能永远不返回，因此关闭不是额外按钮，而是队列协议必需的第三种操作。','本课约定 close 后拒绝全部新入队，但已经接受的数据仍可消费；只有关闭且为空时 pop 才返回无值。close 可以重复调用。队列构造容量必须大于零，避免把永远无法成功的零容量当成普通背压，导致所有生产者永久等待。'),
  step('2 · 状态有记忆，通知没有','条件变量通知只让等待者获得再次检查的机会，不会保存一个未来必定可消费的事件。线程可能虚假唤醒，也可能在通知发生时尚未等待。真正持久的事实是同一 mutex 保护下的 closed 和 queue 状态，等待谓词必须读取它们。','消费者的谓词是已关闭或非空，生产者的谓词是已关闭或未满。谓词版本 wait 内部循环重新检查，并在释放锁与进入等待之间维持条件变量要求的原子关系。若在锁外检查再单独等待，就会产生检查后通知到达、随后永久睡眠的窗口。'),
  step('3 · 为每个操作确定提交点','push 在锁内看到关闭就拒绝，否则成功将元素放入队列的那一步是接受任务的提交点。pop 在锁内移除头部元素是消费的提交点。close 在锁内将标志置为真是关闭的提交点，因此并发到来的 push 要么完整发生在关闭前，要么被明确拒绝。','完成状态修改后可以先释放锁再通知，减少被唤醒线程立即阻塞在同一锁上的机会。当前整数元素读取和删除不抛出；deque 的入队分配可能抛出，异常时元素未接受，调用者可以据此决定重试。泛型队列需要额外分析移动与构造的异常保证。'),
  step('4 · 关闭必须覆盖两个等待集合','满队列上的生产者正在等待 writable，空队列上的消费者正在等待 readable。关闭改变了双方谓词，因此必须对两个条件变量都 notify_all。只通知消费者可能留下永远等待空位的生产者，即使所有消费者已经正常退出。','关闭后仍要 join 所有生产与消费线程，才能销毁队列、锁和条件变量。队列的 close 本身并不拥有外部线程，因此不能替调用者保证无人继续调用接口。示例使用作用域顺序和显式 join，让资源结束时间与工作结束时间一致。'),
  step('5 · 用协议覆盖测试看不到的交错','测试将生产者输出的固定序列求和，并在 join 后检查结果，使 stdout 不依赖具体调度。额外用 promise 建立测试握手，覆盖关闭与入队竞争；不使用 sleep 假装线程已经到达某一位置，因为运行慢快不是同步证据。','压力循环只能抽样调度，不能证明所有等待者最终退出。必须逐条推演先关闭后等待、先等待后关闭、满队列关闭和关闭后排空四条路径。当前 Windows 未运行 TSan，仍需在受支持环境检测数据竞争，并人工审查协议与资源寿命。'),
 ],exampleTitle:'可关闭的有界生产消费队列',main:String.raw`int main() {
    CloseQueue queue(2);
    int sum=0;
    std::jthread consumer([&] { while (auto x=queue.pop()) sum+=*x; });
    std::jthread producer([&] {
        for (int i=1;i<=5;++i) {
            bool accepted=queue.push(i);
            assert(accepted);
        }
        queue.close();
    });
    producer.join();
    consumer.join();
    assert(sum==15);
    bool accepted=queue.push(9);
    auto ended=queue.pop();
    assert(!accepted && !ended);
    queue.close();
    std::cout<<"sum=15 closed\n";
}`,expectedOutput:'sum=15 closed\n',walkthrough:['消费者可先等待，也可在数据已到达后读取。','生产者超过容量时等待消费释放空间。','关闭禁止新入队，但消费者继续排空五个整数。','join 后读取 sum，验证结束结果与重复关闭。'],experiments:[experiment('close 仅通知 readable','满队列生产者可能不退出','writable 等待者也需要观察 closed。'),experiment('谓词删除 closed 条件','关闭后的空队列消费者可能永久等待','不存在后续数据时必须允许关闭本身终止等待。')],
 pitfalls:[pit('没有谓词','cv.wait(lock); consume();','唤醒不保证数据存在。','循环检查同锁保护的业务条件。'),pit('只唤醒一侧','closed=true; readable.notify_all();','等待空位的生产者可能永远阻塞。','两个等待集合都通知。'),pit('关闭后立即销毁','q.close(); delete q;','外部线程可能仍在调用或等待。','拥有者先关闭，再 join，最后销毁队列。')],
 stages:[stage('01 等待机制','实现单生产单消费与有界容量。',['两个谓词','容量轨迹'],['FIFO 正确','满时不超容量'],'谓词描述状态，不描述通知次数。','blocking-queue'),stage('02 关闭竞争','实现拒绝新任务、排空旧任务及双向唤醒。',['四条关闭交错','重复关闭测试'],['生产消费者均可退出','关闭后不新增'],'关闭是双方等待条件的一部分。','deep-queue-close-protocol'),stage('03 生命周期验收','完成 CloseQueue 并记录资源结束协议。',['完整实现','线程与对象寿命图'],['综合测试通过','不用 sleep 证明同步'],'close 不等于外部线程已经结束。','deep-queue-close-protocol')],
 contract:['实现 CloseQueue(capacity)、阻塞 push(int)->bool、阻塞 pop()->optional<int>、幂等 close()。','容量零抛 invalid_argument；满时 push 等待，关闭后返回 false；pop 排空已接受数据后返回 nullopt。','push/pop/close 支持并发；对象析构前调用者必须停止调用并 join 所有使用线程。'],
 tests:[test('完整生产消费','CloseQueue q(2);int total=0,count=0;std::jthread c([&]{while(auto x=q.pop()){total+=*x;++count;}});for(int i=1;i<=20;++i)q.push(i);q.close();c.join();std::cout<<count<<" "<<total;','20 210','容量受限也能完整传递和结束。'),test('关闭排空','CloseQueue q(2);q.push(4);q.push(5);q.close();q.close();auto a=q.pop(),b=q.pop();std::cout<<q.push(6)<<" "<<a.value_or(-1)<<" "<<b.value_or(-1)<<" "<<q.pop().has_value();','0 4 5 0','关闭拒绝新增但保留已接受元素。'),test('唤醒生产者','CloseQueue q(1);q.push(7);std::promise<void> entered;bool accepted=true;std::jthread p([&]{entered.set_value();accepted=q.push(8);});entered.get_future().wait();q.close();p.join();auto value=q.pop();std::cout<<accepted<<" "<<value.value_or(-1)<<" "<<q.pop().has_value();','0 7 0','不论关闭与实际等待先后如何，生产者都应退出且不新增。'),test('空等待关闭','CloseQueue q(1);bool has=true;std::jthread c([&]{has=q.pop().has_value();});q.close();c.join();std::cout<<has;','0','先等待或先关闭都必须结束。')],sourceRefs:refs('thread.condition.condvar','thread.lock.unique','intro.races'),
});

depthFoundations['executor-results']=lesson({
 id:'executor-results',key:'executor',goals:['建立接受、执行、完成与关闭状态机','用 future 传播结果及任务异常','实现容量拒绝并解释线程池死锁边界'],prerequisites:['完成可关闭队列与线程寿命课','掌握移动语义、lambda 捕获和 packaged_task'],
 derivation:[
  step('1 · 从提交承诺开始设计','执行器接受任务时实际上作出一个承诺：该任务以后会完成、失败或被明确取消，调用者不能无限等待一个被默默丢弃的结果。本课采用排空关闭，不主动取消已接受任务；关闭后或待执行队列已满时，submit 立即抛出拒绝异常。','容量只计算等待队列，不包括已经被工作线程取走的任务。这是必须写清的计量口径，否则用户可能把容量一误解为系统最多只有一个任务。工作线程数固定且必须非零，队列容量也必须非零，避免建立无法履行结果承诺的配置。'),
  step('2 · 让结果状态独立于执行位置','packaged_task 持有可调用对象并把返回值或业务异常写入共享状态，future 则在调用方读取它。它本身不会启动线程，需要被工作线程真正调用。get 等待状态就绪，异常会在调用 get 的线程重新抛出；普通 future 的结果通常只消费一次。','任务只能移动，所以队列选择保存 packaged_task 而不是要求目标可复制的 C++20 std::function<void()>。submit 的输入使用可复制 std::function<int()> 是本课的受限接口，进入内部队列后再封装移动任务；支持任意移动捕获需要进一步设计类型擦除层。'),
  step('3 · 只在锁内操作调度状态','工作线程持锁等待已关闭或队列非空，移出头部任务后立即释放锁，再执行用户代码。若持锁执行，慢任务会阻塞全部提交与领取，回调重入 submit 还可能直接死锁。task 调用把业务异常存入 future，使工作循环能够继续处理后续任务。','submit 在同一把锁下检查关闭和队列容量，再将任务加入队列，这一步是接受的提交点。若创建任务或入队分配抛出，任务尚未被接受，调用方收到异常即可判断失败。只有成功入队才返回连接该任务的 future，不能返回无关的默认 future。'),
  step('4 · 构造失败和关闭都要收尾','线程池构造到一半时创建新线程也可能失败，已启动线程可能正在等待条件变量。构造函数的 catch 必须先设置关闭并通知，再 join 已存在的线程，否则自动销毁 jthread 时可能永久等待。成员尚未完全建立时尤其不能假定析构函数会替你运行。','stop 先在锁内置 closed，释放锁后通知，再在不持锁状态下连接工作线程。工作线程在关闭且队列为空时退出，因此所有已接受任务被排空。当前契约只允许单一外部拥有者调用 stop，不允许工作线程自停或多个 stop 并发操作线程容器。'),
  step('5 · 把背压与依赖等待纳入评审','若每个工作线程都等待一个尚在同池排队的子任务，便没有空闲线程运行那些子任务，形成饥饿死锁。future 不会自动替你执行线程池队列；需要禁止这种等待、使用显式依赖图，或采用具有帮助执行协议的调度器，不能随意增加线程数掩盖问题。','验证用 promise 设置可控任务闸门，稳定制造队列满状态，而不是睡眠猜测调度。有限用例仍不证明所有关闭、异常与依赖组合正确，当前 Windows 未运行 TSan；必须补充同步审查与受支持环境检测。此处也避开已知 MinGW 静态 call_once 异常重试路径。'),
 ],exampleTitle:'带结果通道的有界执行器',main:String.raw`int main() {
    BoundedExecutor pool(2,8);
    auto first=pool.submit([] { return 21; });
    auto failed=pool.submit([]()->int { throw std::runtime_error("boom"); });
    auto last=pool.submit([] { return 34; });
    pool.stop();
    int a=first.get(), c=last.get();
    assert(a==21 && c==34);
    bool threw=false;
    try { failed.get(); }
    catch (const std::runtime_error&) { threw=true; }
    assert(threw);
    try {
        pool.submit([] { return 0; });
        assert(false);
    } catch (const std::runtime_error&) {}
    std::cout<<"results=55 exception=1 closed=1\n";
}`,expectedOutput:'results=55 exception=1 closed=1\n',walkthrough:['提交三个任务，每个有独立共享结果状态。','业务异常由 packaged_task 捕获，不退出工作循环。','stop 排空所有已接受任务并连接线程。','get 在调用线程重新抛出异常，关闭后新提交被拒绝。'],experiments:[experiment('把 task() 放回队列锁作用域','回调重新 submit 时可能死锁','用户代码不能在持有内部调度锁时执行。'),experiment('关闭后不排空而直接退出','某些 future 得到 broken_promise 而非任务结果','这改变了已接受任务的完成契约，必须显式设计取消语义。')],
 pitfalls:[pit('任务在锁内执行','lock_guard lock(m); task();','扩大临界区并引入重入死锁。','移出任务后解锁再运行。'),pit('持锁 join','lock_guard lock(m); workers.clear();','工作线程需要相同锁才能看到关闭。','标记关闭后解锁，再通知和连接。'),pit('同池阻塞等待子任务','submit(child).get();','所有工作线程可能同时等待排队任务。','使用依赖编排或明确禁止这类等待。')],
 stages:[stage('01 结果通道','实现任务执行与 future 值和异常返回。',['状态迁移图','异常传播记录'],['值准确返回','业务异常不终止其他任务'],'packaged_task 负责完成状态。','task-executor'),stage('02 有界关闭','实现容量拒绝、排空关闭和构造失败收尾。',['闸门容量测试','关闭持锁审查'],['满载立即拒绝','已接受任务被排空'],'容量只计排队任务，join 不持锁。','deep-executor-results'),stage('03 执行器契约','完成 BoundedExecutor 并论证外部 stop 与任务依赖边界。',['完整实现','饥饿死锁反例及改进设计'],['综合测试通过','注明 stop 所有者约束'],'线程池不是自动解决依赖的魔法容器。','deep-executor-results')],
 contract:['实现 BoundedExecutor(workers,capacity)、submit(function<int()>)->future<int>、stop()；析构调用 stop。','零线程或零容量抛 invalid_argument；关闭或排队数量达到容量时 submit 抛 runtime_error；已接受任务排空，异常由 future 传播。','stop 只由单一外部拥有者调用，不与另一 stop 并发，不由工作线程调用；任务最终返回，不在池内阻塞等待同池子任务。'],
 tests:[test('结果与异常','BoundedExecutor p(2,8);auto a=p.submit([]{return 7;});auto b=p.submit([]()->int{throw std::runtime_error("x");});p.stop();bool caught=false;try{b.get();}catch(const std::runtime_error&){caught=true;}std::cout<<a.get()<<" "<<caught;','7 1','业务失败通过独立结果通道返回。'),test('确定性背压','BoundedExecutor p(1,1);std::promise<void> entered,release;auto gate=release.get_future().share();auto a=p.submit([&]{entered.set_value();gate.wait();return 1;});entered.get_future().wait();auto b=p.submit([]{return 2;});bool rejected=false;try{p.submit([]{return 3;});}catch(const std::runtime_error&){rejected=true;}release.set_value();p.stop();std::cout<<rejected<<" "<<a.get()+b.get();','1 3','闸门保证一个任务运行、一个排队，再验证拒绝。'),test('排空与关闭','BoundedExecutor p(1,8);std::vector<std::future<int>> f;for(int i=1;i<=4;++i)f.push_back(p.submit([i]{return i;}));p.stop();p.stop();int sum=0;for(auto&x:f)sum+=x.get();bool rejected=false;try{p.submit([]{return 5;});}catch(const std::runtime_error&){rejected=true;}std::cout<<sum<<" "<<rejected;','10 1','关闭排空与重复关闭均遵守契约。')],sourceRefs:refs('futures.task.members','futures.unique.future','thread.jthread.cons','thread.condition.condvar'),
});

depthFoundations['arena-transactions']=lesson({
 id:'arena-transactions',key:'arena',goals:['从地址和剩余空间推导合法对齐分配','建立失败不提交的游标事务','区分检查点回滚、对象析构和借用失效'],prerequisites:['理解 sizeof、alignof 与原始存储','理解 construct_at、destroy_at 和异常路径'],
 derivation:[
  step('1 · 为共同结束的请求选择区域','一次配置解析会创建许多短命对象，它们在请求结束时一起释放。逐个申请可能带来管理成本，因此可以预先持有一片区域并推进游标。但选择 Arena 的依据是共同生命周期，不是认为所有分配都应替换成自己的分配器；任意顺序释放并不适合这种结构。','先把接口限定为提供原始存储，不自动记录对象析构。容量上限为一百二十八字节，对齐支持不超过六十四的二次幂。调用方负责构造、销毁并保证回滚前没有仍需使用的对象。缩小契约让我们能对地址与资源状态做完整推导。'),
  step('2 · 推导地址而不是猜偏移','合法分配必须同时满足起始地址符合 alignment，区间长度至少 bytes，区间完全位于拥有的存储中。仅把偏移向上取整隐含了基地址也满足相应对齐；如果基地址不对齐，这个公式无法修正问题。这里让 std::align 在实际地址与剩余空间上计算。','保存 candidate 和 space 的局部副本后尝试对齐；失败时成员 used 不变。成功时才把新游标提交为对齐后地址偏移加请求字节。std::align 扣除的是前导填充，不是对象大小，所以后续可用空间还要扣掉 bytes；混淆二者会导致重叠分配。'),
  step('3 · 将失败路径写进不变量','初始 used 为零，并始终小于等于 capacity。非法对齐、零字节、容量不足都返回空，不推进游标。先用 capacity-used 得到剩余量，比先算 used+bytes 再比较更容易避免无符号溢出。请求大小即使极大，也不会先执行有风险的加法。','边界测试要同时观察返回值与 used，不能只检查是否收到空指针。若一次失败偷偷消耗了 padding，后续合法请求就会被错误拒绝。真正的失败原子性是调用者能继续从完全相同的区域状态尝试另一种方案。'),
  step('4 · 检查点的有效性也有寿命','Mark 保存偏移与分配周期代数，rewind 只接受当前周期且不超过当前游标的检查点。reset 开启新周期，让旧 Mark 立即失效；代数耗尽时显式报错而不静默回绕。这个约定避免重置后旧检查点看起来仍指向合法偏移。','同一周期回退到较早位置，会使被跨越区域的对象与借用失效。当前练习只接受本 Arena 实际产生、尚未被回退越过的检查点，不支持伪造或跨 Arena 传递；需要更强防误用时可加入所有者身份与栈式检查点登记，而不是仅比较一个数字。'),
  step('5 · 从存储事务扩展为对象事务','分配成功并不意味着对象已经存在：调用 construct_at 后才开始相应生命周期，构造异常时也要考虑是否回退这次预留。多个非平凡对象的批量回滚通常需要析构记录，按逆序销毁已成功构造的对象，再把游标恢复到检查点。','示例只构造一个整数并在回退前显式销毁，输出由断言确认。工程验收应加入带堆资源的对象和构造故障，记录存活数量始终恢复到进入事务前。内存地址被重复使用不证明旧引用仍有效，工具检测与协议审查都不能省略。'),
 ],exampleTitle:'有检查点的对齐分配器',
 main:String.raw`int main() {
    CheckpointArena arena(64);
    auto before=arena.mark();
    void* raw=arena.allocate(sizeof(int),alignof(int));
    assert(raw);
    auto* value=std::construct_at(static_cast<int*>(raw),42);
    assert(*value==42);
    auto used=arena.used();
    void* failed=arena.allocate(1000,8);
    assert(!failed && arena.used()==used);
    std::destroy_at(value);
    bool rewound=arena.rewind(before);
    assert(rewound && arena.used()==0);
    arena.reset();
    bool stale=arena.rewind(before);
    assert(!stale);
    std::cout<<"arena transaction ok\n";
}`,
 expectedOutput:'arena transaction ok\n',walkthrough:['mark 记录本周期游标，不获取对象所有权。','allocate 返回合法存储，construct_at 建立整数对象。','过大申请失败，断言证明 used 没有前进。','先销毁整数再回退，reset 后旧检查点被拒绝。'],experiments:[experiment('把请求对齐改成三','返回空且 used 不变','接口只接受支持范围内的二次幂。'),experiment('reset 后使用旧 Mark','rewind 返回 false','代数区分不同分配周期的身份。')],
 pitfalls:[pit('只对偏移对齐','offset=(offset+a-1)&~(a-1);','忽略基地址与加法溢出前提。','在真实地址和有界剩余空间上求对齐。'),pit('回退等于析构','used=mark;','修改游标不会释放对象的外部资源。','先逆序销毁活对象，再恢复存储。'),pit('失败提前推进','used+=padding; if(no_room)return nullptr;','失败改变后续请求可见的资源。','成功后才提交成员状态。')],
 stages:[stage('01 地址与边界','实现对齐申请并记录 used。',['地址对齐断言','容量不变量'],['地址满足对齐','申请不重叠'],'使用局部 candidate/space。','arena'),stage('02 检查点','实现 mark、rewind、reset 与代数验证。',['旧检查点反例','游标对照'],['非法请求不推进','旧周期检查点失败'],'先写检查点生命周期。','deep-arena-transactions'),stage('03 对象事务','完成 CheckpointArena，再设计非平凡对象析构记录扩展。',['完整实现','异常与逆序析构轨迹'],['综合测试通过','明确检查点有效期'],'裸 offset 不负责对象生命。','deep-arena-transactions')],
 contract:['实现 CheckpointArena(capacity)、allocate(bytes,alignment)、mark()、rewind(Mark)、reset()、used()；Mark 含 offset、generation。','capacity 为 0 至 128，超过抛 invalid_argument；bytes=0 或非法/超过64的对齐返回 nullptr；失败不改 used。','只传本 Arena 产生且未被回退越过的检查点；reset 使旧 Mark 失效。调用方先销毁对象再回退。'],
 tests:[test('对齐与不重叠','CheckpointArena a(128);void*p=a.allocate(3,1);void*q=a.allocate(8,32);std::cout<<(p!=nullptr)<<" "<<(q!=nullptr&&reinterpret_cast<std::uintptr_t>(q)%32==0)<<" "<<(a.used()==40);','1 1 1','基地址按64对齐，第二请求位于偏移32。'),test('失败原子性','CheckpointArena a(16);a.allocate(4,4);auto n=a.used();std::cout<<(a.allocate(1000,8)==nullptr)<<" "<<(a.allocate(1,3)==nullptr)<<" "<<(a.used()==n);','1 1 1','非法对齐和容量失败均不能推进。'),test('周期','CheckpointArena a(32);auto m=a.mark();a.allocate(8,8);std::cout<<a.rewind(m)<<" "<<a.used()<<" ";a.reset();std::cout<<a.rewind(m);','1 0 0','同周期回退有效，旧周期无效。')],sourceRefs:refs('ptr.align','basic.life','specialized.construct'),
});

depthFoundations['pool-object-lifetime']=lesson({
 id:'pool-object-lifetime',key:'pool',extra:record,goals:['分离槽位占用、对象构造和身份','构造失败与重复释放时保持一致','用代数句柄识别复用后的对象'],prerequisites:['理解 placement 构造与析构','理解独占资源责任与移动'],
 derivation:[
  step('1 · 空闲槽位不是默认对象','实体系统可能频繁创建和销毁相同大小的组件，为它们预留槽位可以减少分配次数。槽位开始时仅是一段满足 T 大小与对齐的字节，并没有 T 对象。若使用普通 T 数组，则初始化时已经构造全部元素，与按需创建的目标不是同一种机制。','本课用固定数量的 Slot，每个 Slot 保存原始存储、当前对象指针、代数和退休标志。先采用线性扫描空闲槽位，使正确性与生命周期一目了然；寻找空位的成本为 O(N)，不能因为名字叫 Pool 就宣称分配必定是常数时间。'),
  step('2 · 成功后才登记为存活','emplace 找到空槽后调用 construct_at，只有成功返回才把对象指针写入槽位。若构造函数抛出，完整对象尚未存在，不能调用它的析构；语言负责已构造子对象的展开，池仍将该槽看作空闲，下一次申请可以重试。','将记录指针放在构造之前会产生危险中间状态：异常退出后析构池时会试图销毁不存在的对象。显式的提交顺序让活对象数量与非空指针数量保持一致，是本课最重要的不变量，也直接决定异常清理能否安全执行。'),
  step('3 · 销毁生命但保留存储','erase 先验证句柄确实对应当前活对象，再调用 destroy_at，随后清空指针并更新代数。释放后槽位仍在池中，只是可以再次构造新对象。重复 erase 必须返回 false，不能对同一对象执行第二次析构；池退出时则清理所有剩余活对象。','要求 T 的析构不抛出，才能让池的清理与异常展开可靠完成。示例用静态 alive 计数观察构造与销毁，但计数本身只适用于当前单线程示范。真实对象持有文件、锁或其他资源时，同样依赖这条恰好一次的销毁责任。'),
  step('4 · 为复用身份增加维度','单纯下标会在复用后指向新的对象，旧调用者看起来仍拿着合法编号。Handle 同时保存 index 和 generation，get 必须检查下标范围、代数相等和对象存活。旧句柄即使对应同一物理地址，也无法通过新代数校验。','有限宽度代数终有回绕可能，所以实现到最大值后退休该槽，而不是承诺永远不会冲突。当前接口不接受其他池的句柄；若需要跨池统一身份，可以加入池编号或所有者标记。句柄检测解决身份问题，不自动解决并发回收。'),
  step('5 · 在正确基线上优化','当线性扫描成为可测量瓶颈，可以维护空闲索引栈，使获取空位无需遍历所有槽位。此时构造失败必须归还刚弹出的索引，释放必须防止重复入栈，退出清理也不能把空闲槽当活对象。优化新增的每个状态都需要相应不变量。','进一步共享到多个线程时，单独把空闲头改成 atomic 不足以构成正确无锁池；还要讨论 ABA、对象访问期间的保活与回收时机。先验证本课的状态机、异常和代数，再进入同步协议，可以避免把生命周期错误误诊为内存序问题。'),
 ],exampleTitle:'带代数句柄的对象池',main:String.raw`int main() {
    {
        SlotPool<PoolRecord,1> pool;
        auto first=pool.emplace(7);
        assert(first && PoolRecord::alive==1);
        bool erased=pool.erase(*first);
        bool repeated=pool.erase(*first);
        assert(erased && !repeated);
        auto second=pool.emplace(9);
        assert(second && !pool.get(*first) && pool.get(*second)->value==9);
        try {
            SlotPool<PoolRecord,1> other;
            other.emplace(-1);
            assert(false);
        } catch (const std::runtime_error&) {}
        assert(PoolRecord::alive==1);
    }
    assert(PoolRecord::alive==0);
    std::cout<<"pool lifetime ok\n";
}`,expectedOutput:'pool lifetime ok\n',walkthrough:['第一个对象创建后计数为一。','第一次 erase 销毁对象，重复删除被拒绝。','复用后旧句柄失效，新句柄访问新值。','构造失败不占位，退出时活对象归零。'],experiments:[experiment('删除 generation 比较','旧句柄可能访问新对象','槽位相同但身份已变化。'),experiment('构造开始就增加 alive 再抛出','计数不再恢复','未成功构造的完整对象不会被析构。')],
 pitfalls:[pit('先登记指针再构造','slot.object=p; construct_at(p);','异常后池误判对象存活。','成功得到构造返回值后再提交。'),pit('重复析构','destroy_at(p); destroy_at(p);','第二次访问已结束生命的对象。','删除后撤销指针并校验句柄。'),pit('代数回绕','++generation;','旧身份可能重新匹配。','退休槽位或明确受控重建协议。')],
 stages:[stage('01 对象状态','实现按需构造、访问和销毁。',['状态图','alive 轨迹'],['构造析构成对','退出清理剩余对象'],'分开原始存储与活对象。','slot-pool'),stage('02 失败与旧句柄','增加构造失败恢复和代数校验。',['故障测试','复用反例'],['失败后可重试','旧句柄无法命中新对象'],'提交指针晚于构造。','deep-pool-object-lifetime'),stage('03 可扩展池','完成 SlotPool，设计空闲索引栈及回绕策略。',['模板实现','新增性能不变量'],['综合测试通过','说明当前扫描为 O(N)'],'先证明清理责任再优化。','deep-pool-object-lifetime')],
 contract:['实现 template<class T,size_t N> SlotPool；Handle 含 index、generation；emplace 返回 optional<Handle>，get 返回 T*，erase 返回 bool。','构造异常向上传播且保持槽空闲；用尽返回 nullopt；析构全部活对象；T 的析构不抛出。','单线程、不复制池；只使用本池句柄；代数最大值后退休槽位。'],
 tests:[test('容量与销毁','{SlotPool<PoolRecord,2> p;auto a=p.emplace(1);auto b=p.emplace(2);std::cout<<bool(a)<<bool(b)<<bool(p.emplace(3))<<" "<<PoolRecord::alive<<" ";}std::cout<<PoolRecord::alive;','110 2 0','容量与存活计数相符。'),test('旧身份','SlotPool<PoolRecord,1> p;auto a=p.emplace(1);if(!a){std::cout<<"missing";break;}std::cout<<p.erase(*a)<<p.erase(*a)<<" ";auto b=p.emplace(2);std::cout<<(p.get(*a)==nullptr)<<" "<<(b&&p.get(*b)?p.get(*b)->value:-1);','10 1 2','拒绝重复销毁和旧身份。'),test('构造异常','SlotPool<PoolRecord,1> p;bool failed=false;try{p.emplace(-1);}catch(const std::runtime_error&){failed=true;}auto a=p.emplace(7);std::cout<<failed<<" "<<bool(a)<<" "<<PoolRecord::alive;','1 1 1','失败不占槽位。')],sourceRefs:refs('basic.life','specialized.construct','specialized.destroy','except.ctor'),
});

depthFoundations['pmr-budget']=lesson({
 id:'pmr-budget',key:'budget',goals:['实现有硬预算的资源装饰器','区分请求字节、资源保留和进程内存','证明失败不污染计数与资源寿命正确'],prerequisites:['理解 pmr 容器与资源接口','掌握异常安全和配对释放'],
 derivation:[
  step('1 · 预算是一份资源协议','请求级服务需要限制某次处理消耗的分配资源，而不是只知道容器里有多少元素。vector 的 capacity、字符串分配和辅助节点都可能使实际请求字节超过 size 所暗示的值。将预算放在 memory_resource 边界，可让多个支持 pmr 的容器共享同一计费入口。','本练习预算的是尚未通过同一资源归还的请求字节，并不等于操作系统驻留内存或上游分配器保留的块容量。先明确计量口径，才能解释峰值、释放和限制行为，否则一个看似准确的数字会误导服务容量规划。'),
  step('2 · 包装上游并保留契约','BudgetResource 保存上游资源指针，do_allocate 验证预算后转发 bytes 与 alignment，do_deallocate 按配对参数转发释放。相同字节数但不同对齐不是可随意交换的请求，资源也不能释放来自另一个无关分配器的指针。','资源只借用上游，不拥有它；调用方必须让上游活得比包装资源更久，包装资源又必须活得比使用它的容器更久。按照上游、包装器、容器的顺序声明局部对象，逆序析构自然满足这条链，但返回局部资源关联的容器会破坏它。'),
  step('3 · 真正成功之后才计数','设 current 不超过 limit，先判断 bytes 是否大于 limit-current，避免把 current+bytes 的潜在回绕当成合法预算。预算检查成功后，上游仍可能因内存不足抛出，所以必须等上游实际返回指针后才增加 current、peak 与 allocations。','释放时使用与分配一致的参数，转发完成后扣减 current；peak 是历史最大值，不随释放降低，allocations 是成功申请次数。测试需要分别模拟预算拒绝和上游拒绝，两者都不应增加计数。一般接口前置条件违例不由资源追踪器自动修复。'),
  step('4 · 用容器观察传播路径','pmr::vector<int> 的 allocator 会向指定资源请求缓冲区，因此可以用 current 等于 capacity 乘 sizeof(int) 验证这一简单场景。容器析构后 current 回零，peak 留下高水位。普通 vector 或普通 string 不会因为旁边存在资源就自动使用它。','嵌套容器和元素的资源传播取决于 uses-allocator 构造规则，不能只看外层名字。monotonic_buffer_resource 的单块 deallocate 不回收区域，因此它作为不同层级时，当前请求字节与实际保留字节可能不同；必须分别标注观测的位置。'),
  step('5 · 从局部预算走向监控','当前资源只在一个线程中使用，计数不是原子的，上游也可能没有并发保证。如果跨线程共享，需要以同步协议同时保护预算判断、申请提交和归还；把每个计数单独改为 atomic 仍可能允许两个线程都通过同一个旧余额检查。','评审报告应列出预算单位、失败通道、上游寿命、计数溢出与检测开销，并用固定工作负载复现峰值。有限测试检查几次请求并不证明没有泄漏；退出时未归还字节、对象活跃计数和工具报告应该相互印证，再判断是否真正满足资源边界。'),
 ],exampleTitle:'可计量的硬预算资源',main:String.raw`int main(){BudgetResource resource(64);{std::pmr::vector<int> values(&resource);values.reserve(4);values.push_back(7);assert(resource.current()==values.capacity()*sizeof(int));auto before=resource.current();try{resource.allocate(1000,8);assert(false);}catch(const std::bad_alloc&){}assert(resource.current()==before);}assert(resource.current()==0&&resource.peak()>0&&resource.allocations()==1);std::cout<<"budget accounting ok\n";}`,expectedOutput:'budget accounting ok\n',walkthrough:['资源先构造，容器在内层作用域。','reserve 通过资源入口计入请求字节。','超预算失败不改变已有计数。','容器析构后当前计数清零，峰值保留。'],experiments:[experiment('上游改为 null_memory_resource','非零申请失败，成功次数为零','预算通过不意味着上游可分配。'),experiment('改成普通 vector','资源计数保持零','只有经过此资源的请求才被观测。')],
 pitfalls:[pit('申请前记账','current+=bytes; return upstream.allocate(bytes,a);','上游失败后留下虚假计数。','上游返回后提交。'),pit('加法判断预算','if(current+bytes>limit) reject();','加法可能无符号回绕。','使用 bytes>limit-current。'),pit('悬空资源','return pmr::vector<int>(&local);','资源销毁后容器仍会调用它。','资源所有者必须覆盖容器寿命。')],
 stages:[stage('01 资源转发','实现分配释放配对与对齐传递。',['调用轨迹','寿命图'],['申请释放配对','不销毁借用的上游'],'装饰器只是借用上游。','arena'),stage('02 预算异常','加入 current、peak、allocations。',['两类拒绝测试','溢出说明'],['失败不计数','归还正确下降'],'取得指针后再记账。','deep-pmr-budget'),stage('03 容器级证据','完成 BudgetResource 并验证 pmr 容器生命周期。',['完整实现','内存口径对照'],['综合测试通过','明确单线程限制'],'请求字节不是进程总内存。','deep-pmr-budget')],
 contract:['实现 BudgetResource(limit,upstream=new_delete_resource())，派生 memory_resource，提供 current/peak/allocations。','预算不足抛 bad_alloc；上游失败不更新计数；释放满足标准配对前置条件；空上游抛 invalid_argument。','current 是未归还请求字节，peak 是历史最大值，allocations 是成功次数；单线程且总计数不超 size_t。'],
 tests:[test('计数释放','BudgetResource r(32);void*p=r.allocate(8,8);void*q=r.allocate(16,8);std::cout<<r.current()<<" "<<r.peak()<<" "<<r.allocations()<<" ";r.deallocate(p,8,8);r.deallocate(q,16,8);std::cout<<r.current();','24 24 2 0','区分历史与当前值。'),test('两类失败','BudgetResource r(8);void*p=r.allocate(8,8);bool b=false;try{r.allocate(1,1);}catch(const std::bad_alloc&){b=true;}BudgetResource no(8,std::pmr::null_memory_resource());bool u=false;try{no.allocate(1,1);}catch(const std::bad_alloc&){u=true;}std::cout<<b<<u<<" "<<r.current()<<" "<<no.allocations();r.deallocate(p,8,8);','11 8 0','失败不污染计数。'),test('容器作用域','BudgetResource r(256);{std::pmr::vector<int> v(&r);v.reserve(8);std::cout<<(r.current()==v.capacity()*sizeof(int))<<" ";}std::cout<<r.current()<<" "<<(r.peak()>0);','1 0 1','容器先于资源销毁。')],sourceRefs:refs('mem.res.class','mem.res.private','mem.res.monotonic.buffer','allocator.uses.construction'),
});

depthFoundations['sequence-invariants']=lesson({
 id:'sequence-invariants',key:'ring',
 goals:['由访问模式推导连续存储与环形存储的取舍','写出空、满、绕回状态及失败不变量','区分摊还成本、最坏成本与迭代器有效期'],
 prerequisites:['掌握 vector 的 size、capacity 与下标访问','理解对象构造、移动和异常退出'],
 derivation:[
  step('1 · 从日志窗口提出约束','假设服务只保留最近待处理的三个整数日志，生产端追加，消费端取走最早项。先规定满载时拒绝新增，不覆盖旧数据；空载时返回无值。这个约定决定了用户可观察行为，比先选择某个容器更重要，也让失败路径有了明确答案。','若直接使用 vector 并在头部 erase，每次消费都要移动剩余元素；如果使用链表，则增加节点分配与指针追踪。固定容量环形存储复用已经分配的槽位，使入队出队只改变少量索引，但代价是需要自己维护逻辑顺序与物理位置的映射。'),
  step('2 · 只保存能区分状态的信息','设容量为 C，head 是下一次出队的槽位，size 是活跃元素数量。全程要求零不大于 size，size 不大于 C；当 C 大于零时 head 在合法下标范围内。只保存头尾下标会使相等时无法区分空与满，所以此处显式保存数量，允许用满全部槽位。','第 i 个逻辑元素位于 (head+i)%C，尾部插入位置是 (head+size)%C。表达式只有在容量非零时才可计算：先判满会让零容量直接拒绝，先判空会让零容量出队返回无值。工程中还应控制容量上限，防止理论上的下标加法溢出。'),
  step('3 · 按提交顺序维护不变量','整数赋值不抛出，因此 push 可以先写槽位，再增加 size；pop 先读取整数，再推进 head 和减少 size。失败的 push 必须在任何写入之前返回，失败的 pop 不能修改索引。把每一条早退路径写在状态表里，可以检查是否偷偷覆盖了待处理数据。','泛型容器不能照搬整数版本：未使用槽位可能只是原始存储，构造元素可能抛出。必须先成功构造，再登记该槽位为存活；销毁与移动也有各自异常契约。本课的整数实现刻意缩小机制范围，工程扩展阶段再增加显式生命周期管理。'),
  step('4 · 从轨迹推出正确性','容量三时，依次加入十、二十、三十，head 为零且 size 为三；取走十后，head 为一且 size 为二。再加入四十时写入物理零号槽，逻辑序列却是二十、三十、四十。snapshot 必须按逻辑序列遍历，而不能直接返回底层数组顺序。','归纳证明分为初始状态和状态迁移：空构造满足不变量；非满 push 只增加一个尾部元素；非空 pop 只移除一个头部元素；拒绝操作保持原状态。因此任意有限操作序列都保持先入先出关系。随机测试可以寻找遗漏，但不能代替这个推导。'),
  step('5 · 把接口寿命与成本说清楚','snapshot 返回独立副本，调用者可安全保存；若改成返回 span，绕回可能形成两个区间，而且下一次覆盖或容器销毁会使视图失效。vector 扩容会使旧元素指针失效；仅预留容量也不能消除中间插入、删除带来的失效规则。','本实现 push 和 pop 的内部工作量为常数，snapshot 的时间与输出空间都随活跃元素数线性增长。初始化固定数组仍有容量成本，因此低延迟业务应在启动阶段完成分配。评测检查有限轨迹，复杂度结论还要由实现中循环与分配的位置给出。'),
 ],
 exampleTitle:'实现可绕回的日志窗口',
 main:String.raw`int main() {
    BoundedLog q(3);
    bool a=q.push(10), b=q.push(20), c=q.push(30);
    assert(a && b && c);
    bool overflow=q.push(99);
    assert(!overflow);
    auto first=q.pop();
    assert(first==10);
    bool wrapped=q.push(40);
    assert(wrapped && (q.snapshot()==std::vector<int>{20,30,40}));
    for (int x:q.snapshot()) std::cout<<x<<' ';
    std::cout<<'\n';
}`,
 expectedOutput:'20 30 40 \n',
 walkthrough:['构造时一次性准备三个整数槽，队列从空状态开始。','第四次 push 被拒绝，断言验证原来的三个元素没有被覆盖。','出队推进 head；后续写入绕回物理零号槽。','snapshot 重新按逻辑序列收集元素，输出与物理数组排列不同。'],
 experiments:[experiment('把容量改为零并仅测试 push/pop','push 为 false，pop 无值，程序不进行取模','空满检查必须发生在地址计算之前。'),experiment('删掉 push 的判满分支','新增元素覆盖旧数据且 size 超过容量','失败协议和数量不变量同时被破坏。')],
 pitfalls:[pit('用头尾相等同时表示空满','return head == tail;','同一状态值不能表达两个不同业务状态。','保存 size，或明确保留一个不可使用槽位。'),pit('零容量仍取模','tail=(head+size)%capacity;','模零在边界输入中触发未定义行为。','先验证是否可入队，再计算槽位。'),pit('返回内部连续视图','return span(data, size);','绕回后的逻辑区间可能不连续，后续修改还会改变视图内容。','返回副本、两个区间或带有寿命约束的迭代接口。')],
 stages:[stage('01 最小机制','完成 head/size 模型与整数入队出队。',['状态变量说明','容量三的操作轨迹'],['顺序出队正确','满时不覆盖'], '先让失败路径保持零修改。','ring-buffer'),stage('02 边界与反例','处理零容量、重复绕回与空出队。',['边界测试清单','失败前后的快照'],['零容量无模零','绕回十轮仍保持顺序'],'对每次操作先检查数量。','deep-sequence-invariants'),stage('03 工程化窗口','实现 BoundedLog 的完整接口并论证复杂度，再设计泛型槽位扩展。',['可评测实现','泛型构造失败的提交顺序'],['综合测试通过','说明 snapshot 为线性复制且有独立寿命'],'先写整数机制，再证明扩展需要哪些额外状态。','deep-sequence-invariants')],
 contract:['实现 BoundedLog(capacity)、push(int)、pop()、snapshot()、size()。','满时 push 返回 false 且不改状态；空 pop 返回 nullopt；snapshot 按 FIFO 返回副本。','测试容量为 0 至 1024，元素为 int；单线程使用。'],
 tests:[test('基本 FIFO','BoundedLog q(2);std::cout<<q.push(1)<<q.push(2)<<q.push(3)<<" ";auto a=q.pop(),b=q.pop();std::cout<<a.value_or(-1)<<" "<<b.value_or(-1)<<" "<<q.size();','110 1 2 0','满载拒绝且顺序不变。'),test('绕回','BoundedLog q(3);for(int i=1;i<=3;++i)q.push(i);q.pop();q.pop();q.push(4);q.push(5);for(int x:q.snapshot())std::cout<<x<<" ";','3 4 5','逻辑顺序独立于物理下标。'),test('零容量和空','BoundedLog z(0);BoundedLog q(1);std::cout<<z.push(7)<<z.pop().has_value()<<" ";q.push(8);q.pop();std::cout<<q.pop().has_value()<<q.push(9)<<" "<<q.snapshot().at(0);','00 01 9','拒绝操作不污染后续状态。')],
 sourceRefs:refs('vector.modifiers','vector.capacity','sequence.reqmts'),
});

depthFoundations['index-selection']=lesson({
 id:'index-selection',key:'index',
 goals:['用查询语义和成本模型选择索引','实现去重、有序且支持前缀的查询接口','以键长与结果数补全复杂度分析'],prerequisites:['能使用 map、set 与 unordered_map','理解字典序、比较器和渐进复杂度'],
 derivation:[
  step('1 · 业务操作决定顺序需求','考虑一个命令补全服务：用户提交前缀，系统返回字典序最小的若干不同命令，还要支持动态删除。先区分精确命中、前缀枚举、排序和截断四个要求。只根据“查找快”选择哈希表，会忽略排序与前缀筛选可能需要扫描全部键。','将输入限定为普通字节字符串，前缀比较与字典序使用同一套字节语义，避免把 Unicode 字素、大小写归一和本地化排序混在机制中。空前缀定义为匹配全部键，返回上限为零时定义为空结果，这些都是接口契约的一部分。'),
  step('2 · 比较候选结构而非模式名称','哈希表适合按完整键检索，平均复杂度不等于最坏保证；有序树可以从 lower_bound 定位范围起点。堆只维护最优候选，不能直接高效定位任意前缀；Trie 把公共前缀变成路径，但节点表示与字符集大小决定了额外空间和访问成本。','本课选择 set，以较少代码建立可靠基线：去重由容器负责，lower_bound 找到不小于前缀的第一个键。前缀相同的字符串在字典序中连续，因此可以向后扫描直到首次不匹配或达到上限。这条连续性是算法正确性的关键。'),
  step('3 · 证明循环不会漏掉答案','设查询前缀为 p，任何以 p 开头的字符串在字典序中都不小于 p，因此 lower_bound 不会跳过合法答案。到达第一个不再以 p 开头的字符串后，后方也不可能重新进入同一前缀区间；于是提前终止是基于顺序性质，而不是经验猜测。','每次循环先检查迭代器有效，再比较输出数量，之后测试 starts_with 并复制当前键。重复插入不增加节点，删除不存在的键不改变状态。返回副本使后续索引更新不会使结果悬空；若改为返回 string_view，则需要增加明确的失效协议。'),
  step('4 · 把字符串长度写进成本','有序容器查找需要对数级比较次数，但一次字符串比较可能遍历公共前缀。因而成本分析还要引入键长 L，以及返回数量 K 和复制的总字节数，不能只写一个 O(log n) 就结束。长公共前缀恰好是容易隐藏真实开销的输入。','当查询量大且键稳定时，可以考虑排序 vector 或压缩 Trie，改善局部性与空间；当更新频繁时，重排数组的成本可能更高。评测仅验证有限输入的输出，工程选型还应记录读写比例、数据分布、分配次数和尾延迟。'),
  step('5 · 用实验推翻过早结论','建立三组数据：短且随机的键、长公共前缀的键、数量很大但每次只取一个结果的键。分别测量构建、查询、删除与内存峰值，避免把一次冷缓存运行当作结构的本质。比较实现必须保持相同去重与排序语义，否则没有可比性。','若未来加入大小写不敏感规则，插入、查找和排序必须遵循一致的等价关系。只在查询端转小写会漏查或返回重复语义键。先固定规范化边界，再考虑换结构；数据结构优化不能修复定义不一致的业务语义。'),
 ],exampleTitle:'构建动态前缀索引',
 main:String.raw`int main() {
    PrefixIndex index;
    for (auto s:{"run","render","reset","read","run"}) index.insert(s);
    auto a=index.top("re",2);
    assert((a==std::vector<std::string>{"read","render"}));
    bool removed=index.erase("read");
    assert(removed && index.top("re",1).at(0)=="render");
    for (const auto& s:a) std::cout<<s<<' ';
    std::cout<<'\n';
}`,
 expectedOutput:'read render \n',walkthrough:['set 将重复 run 合并为同一键。','lower_bound 定位 re 区间的第一个候选。','输出只取两个最小键，并持有自己的字符串副本。','删除 read 后后续查询变化，之前返回的副本保持不变。'],experiments:[experiment('把 set 改成 unordered_set 并保留相同循环思路','无法使用 lower_bound，也失去字典序连续区间','哈希组织方式不提供所需排序性质。'),experiment('查询空前缀且上限为一','返回整个索引中的字典序最小键','每个字符串都以空字符串为前缀。')],
 pitfalls:[pit('把平均复杂度当硬上限','lookup = O(1);','哈希冲突与键处理成本被省略。','分别写平均、最坏和字符串处理成本。'),pit('先截断后排序','take(first K); sort(result);','无序候选的前 K 项不一定是全局最小的 K 项。','使用有序范围或维护有证明的前 K 策略。'),pit('返回临时字符串视图','return string_view(local);','函数退出后视图悬空。','返回拥有字符串的结果，或明确绑定稳定所有者。')],
 stages:[stage('01 范围定位','实现唯一键集合和前缀查询。',['连续区间证明','基本查询输出'],['返回顺序正确','重复键仅一次'],'从 lower_bound 开始验证 starts_with。','prefix-trie'),stage('02 边界定义','加入删除、空前缀和上限零。',['删除后查询记录','视图失效分析'],['不存在的键可安全删除','旧结果副本不受后续更新影响'],'不要把结果变成索引内部的借用。','deep-index-selection'),stage('03 索引选型报告','完成 PrefixIndex，并为 set、哈希扫描和 Trie 制定同语义比较。',['综合实现','包含键长和返回字节的成本模型'],['综合测试通过','基准保持相同语义并记录分布'],'复杂度证明与性能数据分别提交。','deep-index-selection')],
 contract:['实现 PrefixIndex::insert(string)、erase(string)、top(prefix,limit)。','insert/erase 返回是否真正改变集合；top 返回去重后的字典序前 limit 个匹配键。','前缀按字节定义；空前缀匹配全部；单线程使用。'],
 tests:[test('去重与排序','PrefixIndex x;for(auto s:{"ab","aa","b","aa"})x.insert(s);for(auto& s:x.top("a",5))std::cout<<s<<" ";','aa ab','前缀结果必须有序去重。'),test('删除与截断','PrefixIndex x;x.insert("render");x.insert("read");std::cout<<x.erase("read")<<x.erase("missing")<<" ";for(auto&s:x.top("re",1))std::cout<<s;','10 render','删除后范围边界需要更新。'),test('空条件','PrefixIndex x;x.insert("");x.insert("b");std::cout<<x.top("",0).size()<<" "<<x.top("x",4).size()<<" "<<x.top("",9).size()<<" "<<x.insert("b");','0 0 2 0','空字符串是合法键且零上限永远为空。')],sourceRefs:refs('associative.reqmts','unord.req','string.starts.with'),
});

depthFoundations['cache-and-dependencies']=lesson({
 id:'cache-and-dependencies',key:'lru',goals:['推导 LRU 双结构的一致性不变量','让新增失败回滚到原状态','区分缓存淘汰顺序与图依赖顺序'],prerequisites:['理解 list 迭代器与 unordered_map','掌握 RAII、异常传播与基本图表示'],
 derivation:[
  step('1 · 先明确两个不同的顺序','缓存需要根据最近访问时间淘汰键，任务调度则需要根据依赖约束决定谁可运行。二者都出现“顺序”，却不是同一种关系：LRU 顺序由访问动态改变，拓扑序由有向边限制。不要用一个通用排序容器掩盖不同的业务不变量。','本课先完成容量固定的整数缓存：get 命中返回值并提升为最新，未命中不改变状态；put 新键可能淘汰最旧项，更新已有键则不增加数量。容量零被定义为始终空。新增失败必须保留所有旧键及其原有新旧顺序。'),
  step('2 · 为每个需求配置一种结构','链表头部保存最新项，尾部保存最旧项；哈希表从键映射到链表节点。必须始终满足两边数量相等、每个键恰好出现一次、哈希表迭代器指向对应链表节点。链表节点稳定，使移动到头部不必重建整个索引。','命中时通过哈希定位节点，使用单节点 splice 重连到头部；同一节点的迭代器仍有效。整数更新不会抛出，因此可以直接更新值。对于一般值类型，赋值可能失败，应另外定义是保持旧值、允许部分修改还是通过新节点完成提交。'),
  step('3 · 找到新增事务的提交点','新增需要先创建链表节点，再为它创建哈希索引；两步都可能分配。若第二步失败而第一步未撤销，就会留下无法查找的幽灵节点。把第二步放进 try 块，异常时删除刚加入的头部节点并重新抛出，就恢复了进入操作时的结构。','淘汰必须放在新键成功建立索引之后，否则失败会先丢失一个旧键。测试提供在索引创建前抛出的故障开关，用于稳定重现这条路径。这个开关只模拟一个失败点，不等于已经覆盖全部分配失败；评审仍应逐条列出可能抛出的操作。'),
  step('4 · 将轨迹与证明相互校验','容量二时加入一和二，顺序为二、一；访问一后变成一、二；再加入三，才应淘汰二。若加入三的索引创建失败，则必须仍是 一、二。把键集合、链表顺序和索引映射同时记录，能识别只检查最终数量无法发现的错误。','LRU 的平均操作成本依赖哈希查找；最坏哈希退化不能被忽略。keys 返回线性副本是诊断接口，不应被误写进每次业务查找的快路径。多线程版本还必须用同一同步协议保护两个结构，单独给链表和索引加锁会暴露不一致中间态。'),
  step('5 · 延伸到依赖图的工程含义','把任务前置条件建模成边时，约定前置指向后继。Kahn 算法将入度为零的任务放入就绪集合，每完成一个节点就减少后继入度；若处理数少于节点数，剩余部分受到环的阻塞，但不一定每个剩余节点本身都在环上。','真实执行器还需要把“依赖已满足”与“任务执行成功”分开：失败任务是否取消后继、重复边是否合并、取消能否再次就绪，都要成为协议。完成拓扑练习只是图算法证据，不能直接证明并发调度器安全，更不能以缓存的访问顺序代替依赖关系。'),
 ],exampleTitle:'带失败回滚的 LRU',main:String.raw`int main() {
    TransactionalLru cache(2);
    cache.put(1,10);
    cache.put(2,20);
    auto first=cache.get(1);
    assert(first==10);
    try {
        cache.put(3,30,true);
        assert(false);
    } catch (const std::runtime_error&) {}
    assert((cache.keys()==std::vector<int>{1,2}));
    cache.put(3,30);
    auto missing=cache.get(2);
    auto hit=cache.get(1);
    assert(!missing && hit==10);
    for (int key:cache.keys()) std::cout<<key<<' ';
    std::cout<<'\n';
}`,expectedOutput:'1 3 \n',walkthrough:['两次新增建立索引与链表的一一对应。','get(1) 把旧节点提升为最新，迭代器无需重建。','故障注入发生在新增节点之后，catch 回滚该节点。','成功新增后才淘汰最旧键；最后访问一改变顺序。'],experiments:[experiment('将淘汰移动到新索引创建之前','故障注入会造成旧键永久丢失','强异常保证要求失败前没有不可逆的旧状态删除。'),experiment('把容量改为零','所有 put 都无效果，get 总是无值','零容量是明确的缓存关闭策略。')],
 pitfalls:[pit('先淘汰再申请','evict(); allocate_new();','申请失败后已无法恢复旧值。','先准备新状态，成功提交后再淘汰。'),pit('复制内部迭代器','auto copied = cache;','默认复制索引中的迭代器仍指向旧链表。','禁止复制，或重建副本自己的索引。'),pit('只锁其中一个容器','lock(indexMutex); update_index();','另一结构的观察者可能看到不一致状态。','将跨容器不变量纳入同一同步协议。')],
 stages:[stage('01 双结构','完成正常命中、提升和淘汰。',['一一对应不变量','容量二轨迹'],['更新同键不增数量','命中改变淘汰顺序'],'使用稳定链表节点。','lru-cache'),stage('02 失败回滚','加入注入失败并保持旧顺序。',['每个可能抛出点','回滚前后快照'],['异常后键集合不变','异常后新旧顺序不变'],'新索引成功前不要淘汰旧节点。','deep-cache-and-dependencies'),stage('03 系统模型','提交 TransactionalLru，并为任务依赖图设计失败传播协议。',['完整缓存实现','DAG 成功与失败状态图'],['综合测试通过','区分环节点与受环阻塞节点'],'算法顺序与业务生命周期分别建模。','deep-cache-and-dependencies')],
 contract:['实现 TransactionalLru(capacity)、get(key)、put(key,value,injectFailure=false)、keys()。','keys 按最新到最旧返回；故障开关仅对非零容量的新键生效，抛 runtime_error 且完全回滚。','整数键和值；不要求复制缓存；单线程使用。'],tests:[test('命中淘汰','TransactionalLru x(2);x.put(1,10);x.put(2,20);x.get(1);x.put(3,30);std::cout<<x.get(2).has_value()<<" "<<x.get(1).value_or(-1);','0 10','提升命中节点决定真正淘汰项。'),test('事务回滚','TransactionalLru x(2);x.put(1,10);x.put(2,20);bool threw=false;try{x.put(3,30,true);}catch(const std::runtime_error&){threw=true;}std::cout<<threw<<" ";for(int k:x.keys())std::cout<<k<<" ";','1 2 1','新增索引失败后旧状态保持。'),test('零容量与更新','TransactionalLru z(0);z.put(1,2);TransactionalLru x(1);x.put(1,2);x.put(1,8);std::cout<<z.keys().size()<<" "<<x.keys().size()<<" "<<x.get(1).value_or(-1);','0 1 8','更新同键不是新增节点。')],sourceRefs:refs('list.ops','unord.req','except.throw'),
});
