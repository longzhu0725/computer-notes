# STL Allocator 机制

## 核心结论

Allocator 是 STL 中负责**内存管理**的组件,核心作用是把容器的**数据结构逻辑**和**底层内存操作**解耦。它有四个职责:**allocate**(分配原始内存)、**deallocate**(释放内存)、**construct**(在已有内存上构造对象)、**destroy**(析构对象但不释放内存)。这四步把"内存的生命周期"和"对象的生命周期"彻底分开。

| 阶段 | 操作 | 作用 |
|------|------|------|
| 1 | `allocate(n)` | 分配能容纳 n 个对象的原始内存,**不调用构造函数** |
| 2 | `construct(p, args...)` | 在地址 p 上用 placement new 构造对象 |
| 3 | `destroy(p)` | 调用析构函数,**不释放内存** |
| 4 | `deallocate(p, n)` | 释放之前 allocate 的内存 |

## 为什么需要把内存和对象分开

`new`/`delete` 把内存分配和对象构造绑死了,容器没法分开控制:

```cpp
// new: 分配 + 构造 一气呵成
T* p = new T(args...);
// delete: 析构 + 释放 一气呵成
delete p;
```

容器经常需要"**先占一块内存,等需要时再构造对象**":

```cpp
std::vector<T> v;
v.reserve(1000);            // 分配 1000 个 T 的内存,但不构造
v.push_back(t1);           // 在第 0 个位置构造
v.push_back(t2);           // 在第 1 个位置构造
// size = 2, capacity = 1000, 还有 998 个"空槽"
```

`reserve(1000)` 不会调用 1000 次构造函数,只是分配内存。这就是 allocator 提供的分离能力。

## allocator 的四大核心职责

```cpp
template <typename T>
class allocator {
public:
    // 1. 分配 n 个 T 的原始内存(不构造)
    T* allocate(size_t n) {
        return static_cast<T*>(::operator new(n * sizeof(T)));
    }
    // 2. 释放(不析构)
    void deallocate(T* p, size_t n) {
        ::operator delete(p);
    }
    // 3. 在地址 p 上构造(placement new)
    template <typename... Args>
    void construct(T* p, Args&&... args) {
        ::new ((void*)p) T(std::forward<Args>(args)...);
    }
    // 4. 析构(不释放)
    void destroy(T* p) {
        p->~T();
    }
};
```

这四步把"**内存的生命周期**"和"**对象的生命周期**"彻底分开了。容器可以先分配一大块内存(reserve),后面需要时再逐个构造对象,不用每次都 new/delete。

## 设计理念:策略模式解耦

容器只关心**数据结构**(怎么组织元素),allocator 只关心**内存**(从哪里拿内存、怎么还回去)。两者通过模板参数绑定,**互不侵入**。

```cpp
std::vector<int, MyPoolAllocator<int>> v;  // 用内存池分配
std::vector<int, std::allocator<int>> v;   // 用默认分配器
```

想换内存策略(比如从堆分配换成内存池),只需要换 allocator 类型,**容器代码一行不改**。

## rebind 机制

容器内部不只分配用户指定类型的内存。比如 `list<int>` 内部需要分配的是节点 `_Node<int>`,不是 `int`。rebind 就是让 `allocator<int>` 能"**重新绑定**"为 `allocator<_Node<int>>`,这样容器内部的各种辅助结构也能用同一套内存策略。

```cpp
// 旧式接口:每个容器用 rebind 拿到节点分配器
template <typename T>
struct list {
    using Node = _Node<T>;
    typename Alloc::template rebind<Node>::other node_alloc_;
};
```

C++11 后通过 **`allocator_traits`** 简化了这个机制。容器直接 `typename allocator_traits<Alloc>::template rebind_alloc<Node>` 即可。

## 为什么不直接用 new/delete?

| 维度 | new/delete | allocator |
|------|-----------|-----------|
| 内存分配 | ✅ | ✅ |
| 对象构造 | 自动 | 显式 |
| 内存对象分离 | ❌ | ✅ |
| 自定义内存池 | ❌ | ✅(注入策略) |
| 共享内存 | ❌ | ✅ |
| 性能优化空间 | 小 | 大(可换分配策略) |

容器需要"先占内存,后构造对象"的语义,new 没法表达。allocator 正是干这个的。

## 什么时候需要自定义 allocator?

**四种典型场景**:

1. **内存池**:避免频繁 malloc/free 的开销(游戏服务器、高频交易)
2. **共享内存**:进程间通信,把容器放共享内存段
3. **GPU 内存**:异构计算,在 GPU 显存上分配容器
4. **内存监控**:调试内存泄漏,统计每次分配的大小

日常开发中**默认 allocator 够用**,只有性能敏感或特殊硬件场景才需要自定义。

## 自定义 allocator 的坑

主要四个:

### 1. 异常安全

```cpp
T* allocate(size_t n) {
    if (n > max_size()) throw std::bad_alloc();  // 分配失败要抛 bad_alloc
    return static_cast<T*>(::operator new(n * sizeof(T)));
}
```

### 2. 对齐要求

```cpp
T* allocate(size_t n) {
    // C++17 提供 aligned_alloc
    return static_cast<T*>(::operator new(n * sizeof(T), std::align_val_t(alignof(T))));
}
```

### 3. 容器交换/移动的传播语义

```cpp
template <typename T>
class MyAlloc {
public:
    using propagate_on_container_copy_assignment = std::true_type;
    using propagate_on_container_move_assignment = std::true_type;
    using propagate_on_container_swap = std::true_type;
};
```

### 4. 线程安全

多线程环境下的分配器状态需要同步(加锁、原子计数等)。

## C++17 对 allocator 的改动

C++17 **废弃了 construct/destroy 成员函数**,统一由 `allocator_traits` 代劳:

```cpp
// C++17 之前:自定义 allocator 必须提供 construct/destroy
// C++17 之后:自定义 allocator 只需要 allocate/deallocate
//             construct/destroy 由 allocator_traits<MyAlloc> 默认实现
```

这大大简化了自定义 allocator 的编写——只需要关心内存分配/释放,不用再写 construct/destroy 的样板代码。

## 简化版自定义 allocator 示例

```cpp
// C++17 简化版:只关心 allocate/deallocate
template <typename T>
class PoolAllocator {
    static char pool_[1024 * 1024];
    static size_t offset_;
public:
    T* allocate(size_t n) {
        size_t bytes = n * sizeof(T);
        if (offset_ + bytes > sizeof(pool_)) throw std::bad_alloc();
        T* p = reinterpret_cast<T*>(pool_ + offset_);
        offset_ += bytes;
        return p;
    }
    void deallocate(T*, size_t) noexcept {
        // 内存池,不真正释放
    }
};
```

## 面试高频追问

**Q1: vector 的 reserve 真的不构造对象吗?**
是的。`reserve(n)` 只调用 `allocate(n)`,不调用 `construct` 构造对象。`resize(n)` 会调用 `construct` 创建元素,直到 `size() == n`。

**Q2: allocator 能直接调用 construct 吗?**
历史可以(成员函数),C++17 后推荐 `std::construct_at(p, args...)` 或 `std::allocator_traits<Alloc>::construct(a, p, args...)`。前者是默认实现,后者允许 allocator 自定义 construct 行为。

**Q3: 为什么 list 的 size() 实现是 O(1)?**
C++11 之前,list 没有 size 字段,`size()` 需要遍历计数 O(n)。C++11 强制要求 `size()` 是 O(1),所以标准库实现都在 list 里维护了 size 计数器。

**Q4: 智能指针用 allocator 吗?**
**不直接用**。`shared_ptr`/`unique_ptr` 用的是内部控制块,与 STL allocator 无关。`make_shared<T>(args...)` 会用 `::new`,而 `allocate_shared<T>(alloc, args...)` 才接受 allocator 参数。

## 相关扩展

- [STL 容器选型](/notes/stl-容器选型.html) - 选型决策
- [vector 底层原理和扩容机制](/notes/vector-底层原理和扩容机制.html) - allocator 在 vector 扩容时的角色
- [map vs unordered_map](/notes/map-vs-unordered_map.html) - 节点式容器的内存管理
- [placement new](/notes/placement-new.html) - allocator.construct 的实现机制
- [内存碎片](/notes/内存碎片.html) - 大量分配释放导致的问题
- [new vs malloc](/notes/new-vs-malloc.html) - 与底层分配的关系