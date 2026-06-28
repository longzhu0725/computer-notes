# unordered_map 的 rehash 机制

## 核心结论

`std::unordered_map` 底层是**哈希表**(桶数组 + 链表/红黑树)。**负载因子 = `size() / bucket_count()`**,衡量桶的拥挤程度。当插入元素导致负载因子超过 `max_load_factor()`(默认 1.0)时,自动触发 **rehash**:分配更大的桶数组,对所有元素重新计算哈希并分配到新桶,时间复杂度 **O(n)**。rehash 后**所有迭代器失效**,但元素的**引用和指针不失效**(节点式容器,节点本身不搬移)。可以用 **`reserve(n)` 提前预分配足够的桶**,避免插入过程中多次 rehash 导致性能抖动。

| 概念 | 公式/默认值 | 作用 |
|------|------------|------|
| 负载因子(load factor) | `size() / bucket_count()` | 衡量桶的拥挤程度 |
| `max_load_factor()` | 默认 1.0 | rehash 触发阈值 |
| `bucket_count()` | 桶数组大小 | 哈希分布的目标 |
| `rehash(n)` | 设置桶数至少为 n | 强制重哈希 |
| `reserve(n)` | 保证插入 n 个元素不 rehash | 预分配 |

## 负载因子:rehash 的触发条件

负载因子 = 当前元素数 / 桶数量。**负载因子越高,每个桶里的链表越长,查找从 O(1) 退化为 O(n)**。所以 unordered_map 设了一个上限 `max_load_factor()`,默认 1.0。每次插入后,如果 `load_factor() > max_load_factor()`,就自动 rehash。

## rehash 的过程

1. 分配一个新的、更大的桶数组(通常是原来的 **2 倍左右**,取下一个素数)
2. 遍历旧桶数组中所有节点
3. 对每个节点的 key 重新计算 `hash(key) % new_bucket_count`,挂到新桶上
4. 释放旧桶数组

整个过程是 **O(n)**,n 是元素数量。这就是为什么 unordered_map 的插入是"**均摊 O(1)**"而不是"严格 O(1)"——大部分插入是 O(1),但偶尔一次插入会触发 O(n) 的 rehash。

## 迭代器失效规则

| 容器操作 | 迭代器 | 引用/指针 |
|---------|--------|----------|
| **rehash** | **全部失效** | **不失效** |
| insert | 全部不失效 | 不失效 |
| erase(被删元素) | 被删元素失效 | 被删元素失效 |
| clear | 全部失效 | 全部失效 |

**为什么引用和指针不失效?** 因为 unordered_map 是**节点式容器**,rehash 只是把节点从旧桶摘下来挂到新桶,**节点本身的内存地址不变**。这和 vector 扩容不同(vector 扩容后引用也失效)。

## reserve 和 rehash 的区别

| API | 视角 | 行为 | 使用场景 |
|-----|------|------|---------|
| `rehash(n)` | 桶数量 | 直接设置桶数量至少为 n | 知道目标桶数 |
| `reserve(n)` | 元素数量 | 保证插入 n 个元素前不 rehash | **知道要插入多少元素(推荐)** |

```cpp
// reserve 内部调用 rehash(ceil(n / max_load_factor()))
umap.reserve(1000);  // 保证插入 1000 个元素不触发 rehash
// 等价于
umap.rehash(1000);   // 设置桶数至少为 1000
```

**实际使用中,如果你知道要插入多少元素,用 `reserve` 更直观**。

## 为什么默认 max_load_factor 是 1.0?

这是**空间和时间的权衡**:

- 负载因子越小,桶越空,查找越快,但浪费内存越多
- 1.0 意味着平均每个桶一个元素,是一个比较平衡的选择
- Java 的 HashMap 默认是 **0.75**,更偏向性能

```cpp
umap.max_load_factor(0.5);  // 自定义:更多桶、更快查找、更费内存
```

## 调整 max_load_factor 的影响

| max_load_factor | 桶密度 | 查找速度 | 内存占用 | rehash 频率 |
|----------------|--------|---------|---------|-----------|
| 0.5 | 稀疏 | 快 | 多 | 少 |
| 1.0(默认) | 中等 | 中 | 中 | 中 |
| 2.0 | 拥挤 | 慢(冲突多) | 少 | 多 |

**经验值**:
- 一般应用:默认 1.0 即可
- 性能敏感:调到 0.5-0.75
- 内存敏感:调到 1.5-2.0

## rehash 会改变元素的相对顺序吗?

**会**。rehash 后元素在桶中的分布完全重新计算,**遍历顺序会变**。这也是为什么 `unordered_map` 叫"**无序**"——不保证任何遍历顺序,甚至两次遍历之间如果发生了 rehash,顺序都可能不同。

```cpp
std::unordered_map<int, int> m;
m[3] = 30; m[1] = 10; m[2] = 20;
for (auto& [k, v] : m) std::cout << k;  // 输出顺序:无序
```

## 如何避免 rehash 带来的性能抖动?

**预估元素数量,在插入前调用 `reserve(n)`**。这样一次性分配足够的桶,后续插入都不会触发 rehash。

```cpp
// 性能优化前
std::unordered_map<int, Data> m;
for (int i = 0; i < 10000; ++i) m[i] = data;  // 多次 rehash

// 性能优化后
std::unordered_map<int, Data> m;
m.reserve(10000);                              // 一次性分配
for (int i = 0; i < 10000; ++i) m[i] = data;  // 不再 rehash
```

对于**实时系统或延迟敏感**的场景,这是必须做的优化。rehash 的 O(n) 突然卡顿可能造成超时。

## unordered_map vs map 怎么选

| 维度 | unordered_map | map |
|------|--------------|-----|
| 底层 | 哈希表 | 红黑树 |
| 查找 | **均摊 O(1)** | O(log n) |
| 插入 | **均摊 O(1)** | O(log n) |
| 删除 | **均摊 O(1)** | O(log n) |
| 有序 | ❌ | ✅ |
| 范围查询 | ❌ | ✅ |
| 迭代器失效 | rehash 时全部失效 | 删除当前才失效 |
| 最坏情况 | O(n)(哈希冲突) | O(log n) |
| 常数因子 | 大(哈希计算) | 小(指针操作) |

**选择标准**:

- 只需要**快速查找/插入** → `unordered_map`
- 需要**有序遍历/范围查询** → `map`
- **数据量小**(&lt; 1000)→ `map` 可能更快(常数因子小)
- **数据量大**(&gt; 10000)→ `unordered_map` 优势明显
- **延迟敏感** → `unordered_map` + `reserve`

## 桶结构演进(性能优化)

| C++ 标准 | 单桶结构 | 性能影响 |
|---------|---------|---------|
| C++11 | 链表 | 大量哈希冲突时退化为 O(n) |
| C++11+ | 链表(实际实现多如此) | 同上 |
| **C++20 起** | 链表或红黑树(实现可选) | 大量冲突时退化为 O(log n) |

**GCC libstdc++ 实现**:
- 早期:链表
- C++20 起:链表(暂未升级到红黑树)

**MSVC STL 实现**:链表

## 面试高频追问

**Q1: hash 函数有什么要求?**
- 确定性:相同 key 永远返回相同 hash
- 均匀性:不同 key 的 hash 尽量均匀分布
- 高效:计算 hash 不能太慢(否则失去 O(1) 优势)

**Q2: 哈希冲突怎么解决?**
两种经典方法:
- **链地址法**(separate chaining):同一桶的元素用链表串起来(unordered_map 用的)
- **开放地址法**(open addressing):冲突时探测下一个空槽(Redis 用)

**Q3: unordered_map 的 rehash 与 vector 的扩容有什么区别?**
| 维度 | unordered_map::rehash | vector::reserve/扩容 |
|------|---------------------|---------------------|
| 触发 | 负载因子 &gt; 1.0 | size == capacity |
| 复杂度 | O(n) | O(n) |
| 迭代器失效 | 全部失效 | 全部失效 |
| 引用失效 | **不失效**(节点不动) | **失效**(搬迁) |

**Q4: 哈希表的桶数量为什么常取素数?**
为了减少**哈希聚集(hash clustering)**。如果桶数是合数且与哈希函数的值有公因子,某些 key 会聚集到固定的几个桶。素数让分布更均匀。

**Q5: 为什么 C++20 起 std::unordered_map 单桶可以用红黑树?**
应对**哈希攻击**(Hash DoS 攻击)——攻击者构造大量哈希冲突的 key,让单桶链表退化为 O(n)。**Java 8+ 的 HashMap 早已采用单桶红黑树**;GCC/Clang 也在跟进。

## 相关扩展

- [map vs unordered_map](/notes/map-vs-unordered_map.html) - 全方位对比
- [STL 容器选型](/notes/stl-容器选型.html) - 选型全景
- [STL Allocator 机制](/notes/stl-allocator-机制.html) - 自定义分配器
- [迭代器失效](/notes/迭代器失效.html) - 各容器失效规则
- [C++11 新特性](/notes/c++11-新特性.html) - unordered_map 的引入
- [unordered_map 的 rehash 机制](/notes/unordered_map-的-rehash-机制.html) - 节点式容器优化