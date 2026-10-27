// Independently authored, bounded teaching models. They do not embed upstream source.
const model=(source,fault,evolution,cases)=>({source,fault,evolution,cases});
export const studyModels={
'async-log':model(String.raw`
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>
class AsyncLog {
    std::mutex mutex_;
    std::condition_variable ready_;
    std::deque<int> queue_;
    std::size_t capacity_;
    bool closing_ = false;
    std::function<void(int)> sink_;
    std::thread worker_;
    void consume() {
        for (;;) {
            int value;
            {
                std::unique_lock lock(mutex_);
                ready_.wait(lock, [&] { return closing_ || !queue_.empty(); });
                if (closing_ && queue_.empty()) return;
                value = queue_.front(); queue_.pop_front();
            }
            sink_(value); // Never call user code under the queue lock.
        }
    }
public:
    AsyncLog(std::size_t capacity, std::function<void(int)> sink)
        : capacity_(capacity), sink_(std::move(sink)), worker_([this]{ consume(); }) {}
    bool submit(int value) {
        { std::lock_guard lock(mutex_);
          if (closing_ || queue_.size() >= capacity_) return false;
          queue_.push_back(value); }
        ready_.notify_one(); return true;
    }
    void close() {
        { std::lock_guard lock(mutex_); closing_ = true; }
        ready_.notify_all();
    }
    void shutdown() {
        close();
        if (worker_.joinable()) worker_.join();
    }
    ~AsyncLog() { shutdown(); }
};
`,['if (closing_ && queue_.empty()) return;','if (closing_) return; // DEFECT: accepted records may be discarded.'],['if (closing_ || queue_.size() >= capacity_) return false;','if (closing_) return false; // TODO: enforce the new memory budget.'],{
contract:String.raw`std::latch entered(1),release(1);std::atomic<int> sum{0}; AsyncLog log(64,[&](int n){if(n==1){entered.count_down();release.wait();}sum+=n;});log.submit(1);entered.wait();for(int i=2;i<=8;++i)require(log.submit(i),"unexpected rejection");log.close();release.count_down();log.shutdown();require(sum==36,"shutdown must drain every accepted log record");`,
lifetime:String.raw`std::atomic<int> count{0};{AsyncLog log(64,[&](int){++count;});require(log.submit(1),"unexpected rejection");}require(count==1,"destruction lost accepted record");`,
boundary:String.raw`AsyncLog log(1,[](int){}); log.shutdown(); require(!log.submit(7),"submit after shutdown must reject"); log.shutdown();`,
evolution:String.raw`std::latch entered(1),release(1); std::atomic<int> calls{0}; AsyncLog log(2,[&](int){if(calls.fetch_add(1)==0){entered.count_down();release.wait();}}); log.submit(0); entered.wait(); bool a=log.submit(1),b=log.submit(2),c=log.submit(3); release.count_down(); log.shutdown(); require(a&&b&&!c,"a blocked sink must not allow an unbounded queue");`
}),
'expression':model(String.raw`
#include <array>
template<class Derived> struct Expr {
    int operator[](std::size_t i) const { return static_cast<const Derived&>(*this).at(i); }
};
struct Vector : Expr<Vector> {
    std::array<int,4> data{};
    int at(std::size_t i) const { return data.at(i); }
};
struct Reverse : Expr<Reverse> {
    const Vector& source;
    explicit Reverse(const Vector& v):source(v){}
    int at(std::size_t i) const { return source[3-i]; }
};
struct Add : Expr<Add> {
    const Vector& source;
    int delta;
    Add(const Vector& v,int d):source(v),delta(d){}
    int at(std::size_t i) const { return source[i]+delta; }
};
template<class E> void assign(Vector& target,const Expr<E>& expression) {
    std::array<int,4> candidate{};
    for(std::size_t i=0;i<4;++i) candidate[i]=expression[i];
    target.data=candidate;
}
`,['for(std::size_t i=0;i<4;++i) candidate[i]=expression[i];','for(std::size_t i=0;i<4;++i) { target.data[i]=expression[i]; candidate[i]=target.data[i]; } // DEFECT: aliases observe partial writes.'],['target.data=candidate;','for(std::size_t i=0;i<3;++i) target.data[i]=candidate[i]; // TODO: preserve the whole vector when adapting the evaluator.'],{
contract:String.raw`Vector a; a.data={1,2,3,4}; Vector b; assign(b,Add(a,10)); require(b.data==std::array<int,4>{11,12,13,14},"expression evaluation produced wrong values");`,
lifetime:String.raw`Vector a; a.data={1,2,3,4}; Reverse r(a); assign(a,r); require(a.data==std::array<int,4>{4,3,2,1},"assignment must handle source/destination aliasing");`,
boundary:String.raw`Vector a; a.data={1,2,3,4}; Reverse r(a); assign(a,r); assign(a,Reverse(a)); require(a.data==std::array<int,4>{1,2,3,4},"two reversals must restore original data");`,
evolution:String.raw`Vector a; a.data={8,9,10,11}; assign(a,Add(a,2)); require(a.data[3]==13,"new evaluator must commit every coefficient");`
}),
'async-lifetime':model(String.raw`
#include <deque>
#include <memory>
#include <functional>
struct Loop {
    std::deque<std::function<void()>> work;
    void post(std::function<void()> fn) { work.push_back(std::move(fn)); }
    void run() { while(!work.empty()){auto f=std::move(work.front());work.pop_front();f();} }
};
struct Session : std::enable_shared_from_this<Session> {
    inline static int alive=0;
    unsigned generation=0; int value=0; bool cancelled=false;
    Session(){++alive;} ~Session(){--alive;}
    void cancel(){cancelled=true;++generation;}
    void restart(){cancelled=false;++generation;}
    void request(Loop& loop,int result) {
        std::weak_ptr<Session> weak=shared_from_this();
        auto ticket=generation;
        loop.post([weak,ticket,result]{
            if(auto self=weak.lock()) {
                if(self->cancelled || self->generation!=ticket) return;
                self->value=result;
            }
        });
    }
};
`,['if(self->cancelled || self->generation!=ticket) return;','if(self->cancelled) return; // DEFECT: an old completion can overwrite a new session.'],['void cancel(){cancelled=true;++generation;}','void cancel(){++generation;} // TODO: cancellation also has observable state.'],{
contract:String.raw`Loop loop; auto s=std::make_shared<Session>(); s->request(loop,42); loop.run(); require(s->value==42,"valid completion must publish the result");`,
lifetime:String.raw`Loop loop; {auto s=std::make_shared<Session>();s->request(loop,9);} require(Session::alive==0,"queued work must not retain a dead session");loop.run(); require(Session::alive==0,"expired completion must be harmless");`,
boundary:String.raw`Loop loop; auto s=std::make_shared<Session>();s->request(loop,7);s->cancel();s->restart();s->value=99;loop.run();require(s->value==99,"stale generation overwrote replacement session");`,
evolution:String.raw`Loop loop;auto s=std::make_shared<Session>();s->request(loop,3);s->cancel();loop.run();require(s->cancelled&&s->value==0,"cancelled session must remain cancelled without a late result");`
}),
'memory-budget':model(String.raw`
#include <cstddef>
#include <stdexcept>
struct MemoryBudget {
    std::size_t limit,cache=0,write_buffer=0,pinned=0;
    explicit MemoryBudget(std::size_t bytes):limit(bytes){}
    std::size_t total() const {return cache+write_buffer+pinned;}
    bool acquire(std::size_t& category,std::size_t bytes) {
        const auto used=total();
        if(used>limit || bytes>limit-used) return false;
        category+=bytes;return true;
    }
    void release(std::size_t& category,std::size_t bytes) {
        if(bytes>category) throw std::logic_error("release exceeds ownership");
        category-=bytes;
    }
    bool resize(std::size_t bytes) {
        if(bytes<total()) return false;
        limit=bytes;return true;
    }
};
`,['const auto used=total();','const auto used=cache; // DEFECT: other owners are invisible to admission control.'],['if(bytes<total()) return false;','if(bytes<cache) return false; // TODO: live pinned and write memory constrain reconfiguration.'],{
contract:String.raw`MemoryBudget b(100);require(b.acquire(b.cache,40),"initial reservation failed");require(b.acquire(b.write_buffer,50),"write reservation failed");require(!b.acquire(b.pinned,20),"global budget exceeded across categories");require(b.total()==90,"failed reservation must be atomic");`,
lifetime:String.raw`MemoryBudget b(100);b.acquire(b.cache,40);b.acquire(b.pinned,50);b.release(b.cache,40);require(b.total()==50,"cache eviction cannot release separately pinned ownership");require(b.acquire(b.write_buffer,50),"released budget must be reusable");`,
boundary:String.raw`MemoryBudget b(20);require(!b.acquire(b.cache,std::numeric_limits<std::size_t>::max()),"overflowing reservation accepted");require(b.total()==0,"overflow mutated counters");`,
evolution:String.raw`MemoryBudget b(100);b.acquire(b.pinned,80);require(!b.resize(60),"cannot shrink below live allocations");require(b.limit==100,"rejected config change must preserve old limit");`
}),
'event-lifetime':model(String.raw`
#include <functional>
#include <memory>
#include <vector>
struct Signal {
    struct Slot {std::size_t id;std::weak_ptr<int> receiver;std::function<void()> fn;bool active=true;};
    std::vector<std::shared_ptr<Slot>> slots;
    std::size_t next=1;
    std::size_t connect(std::shared_ptr<int> receiver,std::function<void()> fn){auto id=next++;slots.push_back(std::make_shared<Slot>(Slot{id,receiver,std::move(fn),true}));return id;}
    void disconnect(std::size_t id){for(auto& s:slots)if(s->id==id)s->active=false;}
    void publish(){
        const auto snapshot=slots;
        for(auto& slot:snapshot){
            if(!slot->active || slot->receiver.expired()) continue;
            auto keep=slot->receiver.lock();
            slot->fn();
        }
    }
};
`,['if(!slot->active || slot->receiver.expired()) continue;','if(slot->receiver.expired()) continue; // DEFECT: disconnect during dispatch is ignored.'],['const auto snapshot=slots;\n        for(auto& slot:snapshot){','for(std::size_t index=0;index<slots.size();++index){auto slot=slots[index]; // TODO: new subscriptions belong to the next dispatch round.'],{
contract:String.raw`Signal bus;auto receiver=std::make_shared<int>(1);int n=0;auto id=bus.connect(receiver,[&]{++n;});bus.publish();bus.disconnect(id);bus.publish();require(n==1,"disconnect must suppress subsequent invocation");`,
lifetime:String.raw`Signal bus;int n=0;{auto receiver=std::make_shared<int>(1);bus.connect(receiver,[&]{++n;});}bus.publish();require(n==0,"expired receiver must never be invoked");`,
boundary:String.raw`Signal bus;auto r=std::make_shared<int>(1);int n=0;std::size_t second=0;bus.connect(r,[&]{bus.disconnect(second);});second=bus.connect(r,[&]{++n;});bus.publish();require(n==0,"a callback disconnected a later callback in the same round");`,
evolution:String.raw`Signal bus;auto r=std::make_shared<int>(1);int n=0;bool added=false;bus.connect(r,[&]{if(!added){added=true;bus.connect(r,[&]{++n;});}});bus.publish();require(n==0,"new callbacks must wait for the next round");bus.publish();require(n==1,"new callback missing on next round");`
}),
'container-cost':model(String.raw`
#include <array>
#include <vector>
struct SmallSequence {
    std::array<int,8> local{};
    std::vector<int> heap;
    std::size_t count=0,allocations=0;
    void push(int value){
        if(count<local.size() && heap.empty()){local[count++]=value;return;}
        if(heap.empty()){heap.reserve(16);++allocations;heap.assign(local.begin(),local.end());}
        if(heap.size()==heap.capacity()){heap.reserve(heap.capacity()*2);++allocations;}
        heap.push_back(value);++count;
    }
    int at(std::size_t i) const {if(i>=count)throw std::out_of_range("index");return heap.empty()?local.at(i):heap.at(i);}
    std::size_t reservedBytes() const {return sizeof(local)+heap.capacity()*sizeof(int);}
};
`,['if(heap.size()==heap.capacity()){heap.reserve(heap.capacity()*2);++allocations;}','{auto capacity=heap.capacity();heap.reserve(heap.size()+1);if(heap.capacity()!=capacity)++allocations;} // DEFECT: linear growth requests defeat amortization.'],['if(count<local.size() && heap.empty())','if(count+1<local.size() && heap.empty())'],{
contract:String.raw`SmallSequence s;for(int i=0;i<100;++i)s.push(i);for(int i=0;i<100;++i)require(s.at(i)==i,"spill changed element values");require(s.count==100,"size mismatch");`,
lifetime:String.raw`SmallSequence s;for(int i=0;i<7;++i)s.push(i);require(s.allocations==0,"common small sequences must not allocate on heap");`,
boundary:String.raw`SmallSequence s;for(int i=0;i<1000;++i)s.push(i);require(s.allocations<12,"growth policy introduced one reservation per insertion");require(s.at(999)==999,"growth lost final element");`,
evolution:String.raw`SmallSequence s;for(int i=0;i<8;++i)s.push(i);require(s.allocations==0,"inline capacity must include its last slot");require(s.at(7)==7,"inline boundary corrupted");`
}),
'rpc-contract':model(String.raw`
#include <map>
#include <string>
struct RpcService {
    struct Reply{int value;unsigned expires;};
    std::map<std::string,Reply> replies;
    int balance=0;
    std::size_t capacity=2;
    int charge(const std::string& key,int amount,unsigned now,unsigned deadline){
        if(now>=deadline) throw std::runtime_error("deadline exceeded before commit");
        for(auto it=replies.begin();it!=replies.end();)if(it->second.expires<=now)it=replies.erase(it);else ++it;
        if(auto found=replies.find(key);found!=replies.end()) return found->second.value;
        if(replies.size()>=capacity) throw std::runtime_error("dedupe capacity exhausted");
        balance+=amount;
        replies.emplace(key,Reply{balance,now+10});
        return balance;
    }
};
`,['if(auto found=replies.find(key);found!=replies.end()) return found->second.value;','if(auto found=replies.find(key);false && found!=replies.end()) return found->second.value; // DEFECT: retried request repeats a committed side effect.'],['if(replies.size()>=capacity) throw std::runtime_error("dedupe capacity exhausted");','/* TODO: bound live deduplication records without repeating committed work. */'],{
contract:String.raw`RpcService s;require(s.charge("one",7,0,100)==7,"first charge failed");require(s.charge("one",7,1,100)==7,"retry must return original result");require(s.balance==7,"retry duplicated side effect");`,
lifetime:String.raw`RpcService s;s.charge("one",4,0,100);s.charge("two",5,1,100);require(s.replies.size()==2,"dedupe entries missing");s.charge("new",1,11,100);require(s.replies.size()==1,"expired entries must be collected");`,
boundary:String.raw`RpcService s;bool rejected=false;try{s.charge("late",9,5,5);}catch(const std::runtime_error&){rejected=true;}require(rejected&&s.balance==0,"expired request committed a side effect");`,
evolution:String.raw`RpcService s;s.charge("a",1,0,100);s.charge("b",1,0,100);bool rejected=false;try{s.charge("c",1,0,100);}catch(const std::runtime_error&){rejected=true;}require(rejected&&s.balance==2,"memory pressure must reject before committing new work");`
}),
'ecs-identity':model(String.raw`
#include <cstdint>
#include <vector>
struct Entity{std::size_t index;std::uint64_t generation;};
struct World {
    struct Slot{std::uint64_t generation=1;bool alive=false;int position=0;};
    std::vector<Slot> slots;
    std::vector<Entity> destroy_later;
    Entity create(int value){for(std::size_t i=0;i<slots.size();++i)if(!slots[i].alive){slots[i].alive=true;slots[i].position=value;return {i,slots[i].generation};}slots.push_back({1,true,value});return {slots.size()-1,1};}
    bool valid(Entity e)const{return e.index<slots.size()&&slots[e.index].alive&&slots[e.index].generation==e.generation;}
    int get(Entity e)const{if(!valid(e))throw std::runtime_error("stale entity");return slots[e.index].position;}
    void destroy(Entity e){if(valid(e)){slots[e.index].alive=false;++slots[e.index].generation;}}
    void deferDestroy(Entity e){destroy_later.push_back(e);}
    void commit(){for(auto e:destroy_later)destroy(e);destroy_later.clear();}
};
`,['slots[e.index].alive&&slots[e.index].generation==e.generation','slots[e.index].alive /* DEFECT: slot identity confused with entity identity. */'],['void deferDestroy(Entity e){destroy_later.push_back(e);}','void deferDestroy(Entity e){destroy(e);} // TODO: structural changes belong at the frame boundary.'],{
contract:String.raw`World w;auto a=w.create(3);require(w.get(a)==3,"component value mismatch");w.destroy(a);require(!w.valid(a),"destroyed entity remains valid");`,
lifetime:String.raw`World w;auto a=w.create(3);w.destroy(a);auto b=w.create(8);require(a.index==b.index,"test requires slot reuse");require(!w.valid(a)&&w.valid(b),"old handle aliases a replacement entity");`,
boundary:String.raw`World w;auto a=w.create(4);w.destroy(a);w.destroy(a);auto b=w.create(6);bool rejected=false;try{(void)w.get(a);}catch(const std::runtime_error&){rejected=true;}require(rejected&&w.get(b)==6,"stale access or double destroy corrupted replacement");`,
evolution:String.raw`World w;auto a=w.create(2);w.deferDestroy(a);require(w.valid(a),"deferred destruction changed the current frame");w.commit();require(!w.valid(a),"frame commit did not apply structural changes");`
}),
'resource-streaming':model(String.raw`
#include <deque>
#include <map>
#include <string>
struct AssetCache {
    struct Request{std::string path;unsigned version;std::size_t bytes;};
    struct Asset{unsigned version;std::size_t bytes;};
    std::map<std::string,unsigned> versions;
    std::map<std::string,Asset> live;
    std::deque<Request> completed;
    std::size_t budget=100,used=0;
    Request request(std::string path,std::size_t bytes){return {path,++versions[path],bytes};}
    void complete(Request request){completed.push_back(std::move(request));}
    void frameCommit(){
        while(!completed.empty()){
            auto request=std::move(completed.front());completed.pop_front();
            if(versions[request.path]!=request.version) continue;
            const auto found=live.find(request.path);
            const auto previous=found==live.end()?0:found->second.bytes;
            if(request.bytes>budget || used-previous>budget-request.bytes) continue;
            live[request.path]={request.version,request.bytes};used=used-previous+request.bytes;
        }
    }
};
`,['if(versions[request.path]!=request.version) continue;','/* DEFECT: completion order is treated as request order. */'],['if(request.bytes>budget || used-previous>budget-request.bytes) continue;','/* TODO: commit must preserve the scene memory budget. */'],{
contract:String.raw`AssetCache c;auto r=c.request("hero",30);c.complete(r);require(c.live.empty(),"background completion mutated active scene");c.frameCommit();require(c.used==30&&c.live.at("hero").version==r.version,"frame commit failed");`,
lifetime:String.raw`AssetCache c;auto old=c.request("hero",20),fresh=c.request("hero",30);c.complete(fresh);c.complete(old);c.frameCommit();require(c.live.at("hero").version==fresh.version&&c.used==30,"late old request replaced a hot-reloaded resource");`,
boundary:String.raw`AssetCache c;auto a=c.request("hero",30);c.complete(a);c.frameCommit();auto b=c.request("hero",40);c.complete(b);c.frameCommit();require(c.used==40,"reload double-counted or leaked the previous resource");`,
evolution:String.raw`AssetCache c;auto a=c.request("scene",80);c.complete(a);c.frameCommit();auto b=c.request("texture",30);c.complete(b);c.frameCommit();require(c.used==80&&!c.live.contains("texture"),"over-budget completion was published into active scene");`
}),
'framegraph':model(String.raw`
#include <vector>
struct Resource{int first,last;std::size_t bytes;int format;};
struct FramePlanner {
    static bool canAlias(const Resource& a,const Resource& b){
        bool disjoint=a.last<b.first || b.last<a.first;
        return disjoint && a.format==b.format;
    }
    static std::size_t pairBytes(const Resource& a,const Resource& b){return canAlias(a,b)?std::max(a.bytes,b.bytes):a.bytes+b.bytes;}
    static std::vector<int> order(const std::vector<std::vector<int>>& dependencies){
        std::vector<int> output,state(dependencies.size(),0);
        std::function<void(int)> visit=[&](int id){if(id<0||static_cast<std::size_t>(id)>=state.size())throw std::runtime_error("invalid pass");if(state[id]==1)throw std::runtime_error("cycle");if(state[id]==2)return;state[id]=1;for(int dep:dependencies[id])visit(dep);state[id]=2;output.push_back(id);};
        for(std::size_t i=0;i<state.size();++i)visit(static_cast<int>(i));
        return output;
    }
};
`,['bool disjoint=a.last<b.first || b.last<a.first;','bool disjoint=a.last<=b.first || b.last<=a.first; // DEFECT: shared boundary pass still needs both resources.'],['return disjoint && a.format==b.format;','return disjoint; // TODO: resource compatibility must constrain reuse.'],{
contract:String.raw`Resource a{0,1,64,1},b{2,3,32,1};require(FramePlanner::pairBytes(a,b)==64,"disjoint compatible storage should be reusable");`,
lifetime:String.raw`Resource a{0,2,64,1},b{2,3,32,1};require(!FramePlanner::canAlias(a,b),"a read and write in the same pass overlap in lifetime");require(FramePlanner::pairBytes(a,b)==96,"live resource budget understated");`,
boundary:String.raw`auto order=FramePlanner::order({{},{0},{1}});require(order==std::vector<int>{0,1,2},"dependency order broken");bool rejected=false;try{FramePlanner::order({{1},{0}});}catch(const std::runtime_error&){rejected=true;}require(rejected,"cyclic pass graph accepted");`,
evolution:String.raw`Resource color{0,1,64,1},depth{2,3,64,2};require(FramePlanner::pairBytes(color,depth)==128,"different formats were assigned the same physical allocation");`
})
};
