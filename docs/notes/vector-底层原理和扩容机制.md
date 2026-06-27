---
title: vector 底层原理和扩容机制
---

# vector 底层原理和扩容机制

## 核心结论

`std::vector` 底层是一块**连续内存**,通过三个指针管理:`_start` 指向首元素,`_finish` 指向最后一个有效元素的**下一个位置**,`_end_of_storage` 指向已分配内存的末尾。当 `size() == capacity()` 时插入新元素触发**扩容**——分配一块更大的内存(通常 2 倍),把旧元素拷贝/移动过去,释放旧内存。**整个扩容过程中,所有迭代器、指针、引用全部失效**。

| 操作 | 时间复杂度 | 备注 |
|------|-----------|------|
| 随机访问 `v[i]` | O(1) | 连续内存直接算偏移 |
| 尾部插入 `push_back` | **均摊 O(1)** | 单次扩容 O(n),但频率指数递减 |
| 中间插入/删除 | O(n) | 需要移动后续所有元素 |
| 首部插入/删除 | O(n) | 几乎总要移动全部元素 |
| 查找 | O(n) | 无序,只能线性扫 |

## 三个指针的含义

vector 内部维护三个指针(实际是 `T*`),所有操作都围绕它们展开:

```
+---------------------------------+
| _start                          | begin() 返回
|                                 |
| [0] [1] [2] [3] [4] [_] [_] [_] |
|                       ^         ^
|                    _finish   _end_of_storage
+---------------------------------+
   size() = _finish - _start
   capacity() = _end_of_storage - _start
```

- `_start`:指向数组首元素,`begin()` 返回的就是它
- `_finish`:指向最后一个**有效元素**的下一个位置,`end()` 返回它,`size() = _finish - _start`
- `_end_of_storage`:指向已分配内存块的**末尾**,`capacity() = _end_of_storage - _start`

当 `_finish == _end_of_storage` 时,说明已有空间用完了,下一次 `push_back` 就会触发扩容。

## 扩容的完整流程

```cpp
// GCC libstdc++ 简化伪代码
void push_back(const T& x) {
    if (_finish != _end_of_storage) {       // 1. 容量够
        construct(_finish, x);              //    原地构造
        ++_finish;
    } else {                                 // 2. 容量不够,触发扩容
        const size_type new_cap = _finish - _start == 0 ? 1 : 2 * (_finish - _start);
        T* new_start = alloc.allocate(new_cap);  // 2.1 分配新内存(2 倍)
        T* new_finish = new_start;
        try {
            for (T* p = _start; p != _finish; ++p) {  // 2.2 移动/拷贝旧元素
                construct(new_finish, std::move_if_noexcept(*p));
                ++new_finish;
            }
        } catch (...) {
            // 异常安全:回滚,释放新内存
            while (new_finish != new_start) alloc.destroy(--new_finish);
            alloc.deallocate(new_start, new_cap);
            throw;
        }
        // 2.3 销毁旧元素,释放旧内存
        for (T* p = _start; p != _finish; ++p) alloc.destroy(p);
        alloc.deallocate(_start, capacity());
        // 2.4 更新指针
        _start = new_start;
        _finish = new_finish;
        _end_of_storage = new_start + new_cap;
    }
}
```

**关键点**:

1. 分配新内存通常是原来的 **2 倍**(GCC libstdc++),**MSVC 是 1.5 倍**
2. 旧元素用**移动构造**优先(如果 noexcept),否则拷贝
3. 整个过程有异常安全保证(发生异常时回滚)
4. **旧内存地址失效**,所有指向旧元素的迭代器、指针、引用全部失效

## 为什么选倍数扩容而不是固定增量?

| 扩容策略 | 拷贝次数(插入 n 个) | 分摊复杂度 |
|---------|---------------------|----------|
| 固定增量 +k | O(n²/k) | O(n) |
| 1.5 倍 | O(n) | O(1) |
| 2 倍 | O(n) | O(1) |

倍数扩容的分摊复杂度是 O(1),每个元素平均只被拷贝常数次。固定增量(如每次 +100)的分摊复杂度是 O(n),总拷贝次数和元素数量成正比——性能差。

## reserve 和 resize 的区别

| 方法 | 改变 size | 改变 capacity | 创建/销毁元素 | 用途 |
|------|----------|---------------|-------------|------|
| `reserve(n)` | 否 | 是(可能) | 否 | **预分配空间避免扩容** |
| `resize(n)` | 是 | 是(可能) | 是 | 改变元素数量 |
| `shrink_to_fit()` | 否 | 请求缩小 | 销毁多余元素 | 归还多余内存 |

```cpp
std::vector<int> v;
v.reserve(1000);              // capacity >= 1000,size = 0
for (int i = 0; i < 1000; ++i) v.push_back(i);  // 不再触发扩容

v.resize(500);                // size = 500,后 500 个元素被销毁
v.resize(2000, 42);           // size = 2000,新增元素值为 42
```

**经验**:预知元素数量时,先 `reserve` 再 `push_back`,可避免多次扩容带来的拷贝开销。

## 扩容后能不能把多余内存还回去?

C++11 提供了 `shrink_to_fit()`,请求把 capacity 缩到和 size 一样大:

```cpp
std::vector<int> v = {1, 2, 3};
v.reserve(1000);              // capacity = 1024(2倍)
v.shrink_to_fit();            // 请求 capacity = 3
```

注意 `shrink_to_fit()` 是**非绑定请求**,实现可以忽略。另一个经典做法是 `vector<int>(v).swap(v)`:

```cpp
std::vector<int>(v).swap(v);  // 强制归还多余内存
```

这通过创建一个临时 vector(精确 size),然后交换,旧的大 buffer 在临时对象析构时被释放。是 C++11 之前的"强制 shrink"惯用法,现在仍偶尔使用。

## vector 和 deque 扩容策略的不同

| 维度 | vector | deque |
|------|--------|-------|
| 内存布局 | 完全连续 | 分段连续(中控 map + 多个 buffer) |
| 扩容成本 | 整体搬迁 O(n) | 加新 buffer O(1) |
| 头尾插入 | 头 O(n),尾均摊 O(1) | 头尾都是 O(1) |
| 引用失效 | 扩容时全部失效 | 头尾插入不失效,中间插入失效 |
| 随机访问 | O(1) 单次计算 | O(1) 但两次计算(块+块内) |
| 缓存性能 | 优(完全连续) | 较好(块内连续) |
| 与 C API 互操作 | 兼容(连续内存) | 不兼容 |

deque 不做整体搬迁,用分段连续内存,扩容时只需加一个新 buffer,**不用拷贝已有元素**。所以 deque 头尾插入都不会让已有元素的引用失效,但中间插入仍然失效(需要移动块内元素)。

## 面试高频追问

**Q1: vector 扩容时元素移动的优先级?**
编译器会尝试用 `noexcept` 的移动构造,如果元素类型没有 noexcept 移动构造(比如未显式标记 noexcept),就用拷贝构造代替,保证异常安全。这是为什么**大型对象的类应该显式标记 `noexcept` 移动构造**——直接影响 vector push_back 性能。

**Q2: 扩容后 reserve 的地址和原地址有关系吗?**
无关。扩容时分配全新内存,旧内存释放,原地址可能被分配器重复利用。代码不能假设"扩容后地址 = 原地址 + delta"。

**Q3: vector<bool> 有什么特殊性?**
**不要用**。`vector<bool>` 是特化版,用 bit packing(每个 bool 占 1 bit)节省空间,但**不是真正的容器**——返回的是 `vector<bool>::reference` 代理对象,不是 `bool&`,导致大量 C++ 模板代码无法编译。需要位存储用 `std::bitset<N>` 或 `boost::dynamic_bitset`。

**Q4: vector 和 array 的区别?**
- `vector`:动态大小,堆分配,支持 push_back/resize
- `array<T, N>`:固定大小 N,**栈分配**,无动态操作,完全兼容 C 数组
- array 没有性能开销,但不能用 push_back

## 相关扩展

- [STL 容器选型](./stl-容器选型.md) - 选型全景
- [迭代器失效](./迭代器失效.md) - 各种容器失效规则
- [map vs unordered_map](./map-vs-unordered_map.md) - 红黑树 vs 哈希表
- [移动语义](./移动语义.md) - 扩容时的移动优化
- [完美转发](./完美转发.md) - emplace_back 的底层
- [堆 vs 栈](./堆-vs-栈.md) - vector 数据存储位置
- [深拷贝 vs 浅拷贝](./深拷贝-vs-浅拷贝.md) - 拷贝与移动的区别
