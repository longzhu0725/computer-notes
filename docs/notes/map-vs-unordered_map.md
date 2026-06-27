---
title: map vs unordered_map
---

# C++ `map` vs `unordered_map`

## 核心结论

`map` 底层是**红黑树**,元素按 key 排序,增删查 **O(logN)** 稳定。`unordered_map` 底层是**哈希表**,元素无序,增删查**平均 O(1)**,最坏退化到 O(n)。**需要有序遍历或范围查询用 `map`**,**只关心单点查找速度用 `unordered_map`**。

| 维度 | `map` | `unordered_map` |
|------|-------|-----------------|
| 底层结构 | 红黑树(自平衡 BST) | 哈希表(桶数组 + 链表) |
| 元素顺序 | 按 key 升序 | 无序 |
| 查找/插入/删除 | **O(logN) 稳定** | **O(1) 平均,O(n) 最坏** |
| key 要求 | 支持 `<`(或自定义比较器) | 支持 `hash` + `==` |
| 内存开销 | 每节点 3 指针 + 颜色位,紧凑 | 桶数组有空槽 + 预留扩容空间,较大 |
| 迭代器失效 | 插入不失效,删除只失效被删 | **rehash 时全部失效** |

## 一、底层结构详解

### `map`:红黑树

```
              5(B)
            /     \
         3(R)     8(R)
         /  \     /   \
       1(B) 4(B) 7(B) 9(B)

B = Black, R = Red
约束:从根到叶的路径,黑节点数相同
→ 自平衡,树高 ≤ 2*log2(N+1)
```

**特性**:
- 插入/删除自动旋转保持平衡
- 树高度 O(logN),查找 O(logN)
- 中序遍历得到有序序列
- 每个节点动态分配(堆)

### `unordered_map`:哈希表

```
buckets: [0] [1] [2] [3] [4] [5] [6] [7]
              │                       │
              ▼                       ▼
         ┌─────────┐             ┌─────────┐
         │ K1 → V1 │             │ K5 → V5 │
         └─────────┘             └─────────┘
              │                       │
              ▼                       ▼
         ┌─────────┐             ┌─────────┐
         │ K9 → V9 │             │ K2 → V2 │
         └─────────┘             └─────────┘
          (bucket 3)              (bucket 7)
```

**操作流程**:
1. 计算 `hash(key)` → 桶索引
2. 在桶对应的链表中查找/插入
3. 桶链表用 `==` 比较 key

## 二、关键差异详解

### 1. 顺序性:`map` 有序,`unordered_map` 无序

```cpp
std::map<std::string, int> m;
m["banana"] = 2; m["apple"] = 1; m["cherry"] = 3;
for (const auto& [k, v] : m) std::cout << k << " ";  // apple banana cherry(按字典序)

std::unordered_map<std::string, int> um;
um["banana"] = 2; um["apple"] = 1; um["cherry"] = 3;
for (const auto& [k, v] : um) std::cout << k << " ";  // 顺序不确定
```

**适用场景**:
- 需要**有序遍历**:`map`(遍历 100 万元素,map 是 1 次 O(n),unordered_map 也行但顺序不保证)
- 需要**范围查询**:`map`(用 `lower_bound`/`upper_bound`)
- 只需要**单点查找**:`unordered_map`

### 2. 性能:`map` 稳定,`unordered_map` 平均快

| 数据量 | `map` 查找 | `unordered_map` 查找(平均) | `unordered_map` 查找(最坏) |
|--------|-----------|--------------------------|--------------------------|
| 1K | ~10 次比较 | ~1 次哈希 + 1 次比较 | 1000 次比较(全冲突) |
| 100K | ~17 次比较 | ~1 次哈希 + 1 次比较 | 100K 次比较 |
| 10M | ~23 次比较 | ~1 次哈希 + 1 次比较 | 10M 次比较 |

**实践建议**:
- 元素量 < 1K:两者性能差异不大
- 元素量 > 100K:**`unordered_map` 平均快 10-20 倍**
- 但要保证**哈希函数质量好**

### 3. 内存:`map` 紧凑,`unordered_map` 浪费

```cpp
// map:每个节点 3 指针 + 1 颜色位 ≈ 32 字节
// 100K 元素:100K * 32 = 3.2 MB(纯数据)

// unordered_map:桶数组 + 链表节点
// 桶数 ≈ 元素数(负载因子 1.0),桶 = 指针 ≈ 800KB
// 节点 ≈ 40 字节
// 100K 元素:800KB + 100K * 40 = 4.8 MB
```

`unordered_map` 内存开销比 `map` 大 **30-50%**。

### 4. 迭代器失效

```cpp
// map:插入不失效,删除只失效被删元素
std::map<int, int> m;
auto it = m.find(5);
m[10] = 100;          // ✓ it 仍有效
m.erase(5);             // ✗ it 失效(指向已删除的节点)

// unordered_map:rehash 时所有迭代器失效!
std::unordered_map<int, int> um;
auto it = um.find(5);
um[10] = 100;          // 可能触发 rehash → ✗ it 失效
um.reserve(1000);      // 预分配避免 rehash
um[10] = 100;          // ✓ it 仍有效(没有 rehash)
```

## 三、哈希冲突与负载因子

### 链地址法处理冲突

```cpp
// STL unordered_map 内部结构
struct Node {
    Key key_;
    Value value_;
    Node* next_;        // 同桶链表
};

// 插入:K1 和 K5 都哈希到 bucket 3
// buckets[3] → K1 → K5 → null
```

冲突越多,链越长,查找越慢。

### 负载因子控制 rehash

```cpp
load_factor = 元素数 / 桶数;  // STL 默认阈值 1.0
if (load_factor > 1.0) rehash();  // 桶数翻倍,所有元素重哈希
```

**rehash 是 O(n) 的一次性开销**,之后查找又恢复 O(1)。

**最佳实践:预分配**:
```cpp
std::unordered_map<int, int> um;
um.reserve(100000);   // 预分配 100K 桶,避免中途 rehash
// 后续 100K 次 insert 不会触发 rehash
```

## 四、选型决策

### 用 `map` 的场景

- ✓ 需要按 key **有序遍历**
- ✓ 需要**范围查询**(`lower_bound`/`upper_bound`)
- ✓ key 类型**没有好的哈希函数**(如 `std::pair`、自定义复合 key)
- ✓ 需要**稳定的 O(logN)** 性能(无最坏 O(n) 退化)
- ✓ 元素量小,差异不明显

### 用 `unordered_map` 的场景

- ✓ 只关心**单点查找速度**
- ✓ 元素量大(> 100K)
- ✓ **插入频繁**(rehash 后摊销 O(1))
- ✓ 有**好的哈希函数**(整数、字符串、内置类型)
- ✓ 不需要顺序,不在意迭代器失效

### 选型流程

```
Q: 你的需求是什么?
│
├─ 需要有序遍历 / 范围查询
│  └─ map
│
├─ 只需要单点查找
│  ├─ key 有好的哈希函数?
│  │  └─ unordered_map
│  └─ key 没有好的哈希
│     └─ map
│
└─ 元素量 < 1000
   └─ 任意(map 更简单)
```

## 五、自定义 key

### `map` 的 key

```cpp
struct Point {
    int x, y;
    bool operator<(const Point& other) const {
        return std::tie(x, y) < std::tie(other.x, other.y);
    }
};
std::map<Point, int> m;  // OK,只要实现 operator<
```

### `unordered_map` 的 key

```cpp
struct Point {
    int x, y;
    bool operator==(const Point& other) const {
        return x == other.x && y == other.y;
    }
};

// 1. 提供 hash 特化
namespace std {
template<> struct hash<Point> {
    size_t operator()(const Point& p) const noexcept {
        return std::hash<int>()(p.x) ^ (std::hash<int>()(p.y) << 1);
    }
};
}

std::unordered_map<Point, int> um;  // OK
```

**为什么 `unordered_map` 更麻烦**:需要同时实现 `==` 和 `hash`,且 hash 函数的质量决定性能。

## 六、多线程场景

### 两者都不线程安全

| 容器 | 并发读 | 并发读写 |
|------|--------|---------|
| `map` | 安全(只要没有写) | 需外部加锁 |
| `unordered_map` | 安全 | 需外部加锁,且 rehash 时所有迭代器失效 |

### 实践方案

```cpp
// 读多写少:shared_mutex
std::shared_mutex mtx;
std::map<int, int> m;

int read(int k) {
    std::shared_lock lock(mtx);
    return m[k];
}
void write(int k, int v) {
    std::unique_lock lock(mtx);
    m[k] = v;
}

// 高并发:并发容器
tbb::concurrent_unordered_map<int, int> cm;  // 内部细粒度锁
```

## 七、面试高频追问

**Q1: `unordered_map` 哈希冲突怎么处理?**
C++ STL 用**链地址法**——同一个桶里的元素串成链表。插入时挂链尾,查找时先算哈希定位桶,再遍历链表用 `==` 比较 key。冲突越多链越长,性能越差(实际工程通过好哈希函数和合理负载因子避免)。

**Q2: 为什么最坏是 O(n)?**
极端情况所有 key 哈希到同一个桶,整个表退化成一条链表,查找变成线性扫描。**实际工程中**:
1. 用好哈希函数(均匀分布)
2. 合理负载因子(STL 默认 1.0)
3. 提前 `reserve()` 预分配

**Q3: 负载因子和 rehash 是什么?**
- 负载因子 = 元素数 / 桶数,衡量哈希表拥挤程度
- STL 默认阈值 1.0,超过就触发 rehash
- rehash:分配更大桶数组,所有元素重新哈希,O(n) 一次性开销
- **最佳实践**:`reserve(N)` 预分配,避免中途 rehash

**Q4: 多线程场景怎么选?**
两者**都不线程安全**。`map` 结构稳定,适合读多写少配 `shared_mutex`。`unordered_map` 并发写容易出问题(rehash 让所有迭代器失效),要么分桶加锁,要么用 TBB 的 `concurrent_unordered_map`。

**Q5: 100 万数据怎么选?**
- 需要有序/范围查询 → `map`(O(logN) 稳定,无最坏退化)
- 只需单点查找 → `unordered_map`(O(1) 平均快 10-20 倍,但要 `reserve(1000000)` 避免 rehash)

## 八、相关扩展

- [封装](./封装.md) — `map`/`unordered_map` 的封装细节
- [内存碎片](./内存碎片.md) — `unordered_map` rehash 的内存影响
- [C++11 新特性](./c++11-新特性.md) — `emplace` 系列函数避免临时对象
