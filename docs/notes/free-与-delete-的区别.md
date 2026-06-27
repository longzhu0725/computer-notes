---
title: free 与 delete 的区别
---

# free 与 delete 的区别

## 核心结论

`free` 是 C 语言函数,配合 `malloc` 使用,**只做一件事——把内存还给系统**,不关心内存里存的是什么,不调用任何析构函数。`delete` 是 C++ 运算符,配合 `new` 使用,**做两件事——先调用对象的析构函数(释放对象内部管理的资源),再释放对象本身占用的内存**。

> **一句话总结**:`free` 只管内存,`delete` 管对象(析构 + 内存)。

| 维度 | `free` | `delete` |
|------|--------|---------|
| 语言 | C 标准库 | C++ 运算符 |
| 配对 | `malloc` | `new` |
| 调用析构函数 | ❌ | ✅ |
| 调用构造 | ❌(malloc 不构造) | ✅(new 构造) |
| 数组支持 | 无 | `delete[]` |
| 释放 nullptr | ✅(no-op) | ✅(no-op) |
| 底层实现 | `free(p)` | `p->~T(); operator delete(p);` |

## delete 的底层实现

`delete p` 本质上做了两步:

1. 调用 `p->~T()`(析构函数)
2. 调用 `operator delete(p)`(释放内存)

`operator delete` 的默认实现就是调用 `free`。所以:

> **delete = 析构 + free**

`new p` 也是两步:

1. 调用 `operator new(sizeof(T))`(分配内存,默认实现就是 `malloc`)
2. 在这块内存上调用构造函数

> **new = malloc + 构造**

## 为什么不能混用

### 用 new 创建,free 释放(危险)

```cpp
std::string* s = new std::string("hello");
free(s);  // 不调用 ~string(),内部 buffer 泄漏!
```

如果对象内部管理了资源(`new` 了其他内存、打开了文件、持有锁),这些资源就泄漏了。

### 用 malloc 分配,delete 释放(未定义行为)

```cpp
void* p = malloc(sizeof(int));
delete static_cast<int*>(p);  // UB:malloc 的内存上没有正确构造的对象
```

`delete` 会试图调用析构函数——但这块内存上根本没有正确构造的对象,调用析构函数就是**未定义行为**。

## delete 和 delete[] 的区别

`new T[n]` 分配数组时,会在内存块前面**偷偷记录元素个数**。`delete[]` 读取这个数字,逐个调用每个元素的析构函数,然后释放整块内存。

如果用 `delete` 释放数组:

- 它不知道有多少个元素
- 只析构第一个
- 剩下的全部泄漏
- 而且因为内存布局不匹配(数组头部有元素数),可能直接**堆崩溃**

```cpp
int* arr = new int[10];
delete arr;     // 错误!只析构 arr[0],后面 9 个泄漏,且可能崩溃
delete[] arr;   // 正确
```

| 操作 | 配对 | 析构调用 | 释放起始地址 |
|------|------|---------|------------|
| `new T` | `delete p` | 1 次 | p |
| `new T[n]` | `delete[] p` | n 次 | p(头部已知 n) |

## free 的底层实现

`free(p)` 过程:

1. 找到 `p` 前面的 metadata(malloc 分配时偷偷加的头部,记录了这块内存的大小)
2. 标记为已释放
3. 尝试和相邻空闲块合并(减少碎片)
4. 如果这块内存很大(通常 > 128KB),直接 `munmap` 还给内核
5. 否则放入空闲链表,等下次 `malloc` 复用

## delete nullptr 安全吗?

**完全安全**。C++ 标准明确规定对 `nullptr` 调用 `delete` 是合法的**空操作**(no-op)。所以释放前不需要判空。

`free(NULL)` 同样安全——C 标准也规定了这一点。

```cpp
T* p = nullptr;
delete p;  // OK
free(p);   // OK
```

## 现代 C++ 还需要手动 new/delete 吗?

**尽量不要**。现代 C++ 推荐:

- 用智能指针(`unique_ptr`、`shared_ptr`)管理堆内存
- 用容器(`vector`、`string`)管理动态数组

手动 new/delete 容易:

- 忘记释放 → 内存泄漏
- 重复释放 → 程序崩溃
- 异常路径下没释放 → 泄漏

智能指针通过 [RAII 机制](./raii-机制.md)自动管理生命周期,从根本上避免这些问题。

## operator new 和 operator delete 能重载吗?

**能**。可以全局重载,也可以类内重载。

| 用途 | 说明 |
|------|------|
| 自定义内存池 | 减少 malloc 开销(高频交易、游戏服务器) |
| 内存泄漏检测 | 记录每次分配(地址、大小、调用栈) |
| 对齐分配 | 满足 SIMD 要求(`alignas(64)`) |
| 内存统计 | 实时统计分配次数/字节数 |
| 内存隔离 | 把不同模块的分配隔离到不同的 arena |

**注意**:`operator new` 只负责分配内存,构造函数由编译器自动调用;`operator delete` 只负责释放内存,析构函数也是编译器自动调用。

## 面试高频追问

**Q1: malloc/free 和 new/delete 的底层关系?**
默认实现下:`new` = `operator new`(内部 `malloc`) + 构造,`delete` = 析构 + `operator delete`(内部 `free`)。但两者是两套独立的机制,元数据不兼容,**绝对不能混用**。

**Q2: delete[] 怎么知道要析构多少次?**
`new T[n]` 在内存块头部(通常是 `[p - sizeof(size_t)]` 位置)存储元素个数,`delete[]` 读取这个数字。GCC 用 cookie 模式,MSVC 也有类似机制。

**Q3: 为什么 free 不需要大小?**
`malloc` 在分配时把大小存在 metadata 里(头部),`free` 读 metadata 知道大小。**不能假设 metadata 在 p 前面某个固定位置**——不同分配器布局不同。

**Q4: free/delete 失败的概率?**
**现代系统下基本不会失败**。它们只是把内存归还空闲链表,不需要和内核通信(大块 munmap 除外)。即使失败,也无能为力——C 标准规定 `free` 不返回值。所以**没有** try-free 这种异常。

## 相关扩展

- [new vs malloc](./new-vs-malloc.md) - 两种分配机制的细节
- [智能指针](./智能指针.md) - 替代手动 new/delete
- [RAII 机制](./raii-机制.md) - 自动资源管理
- [内存泄漏、野指针和内存越界](./内存泄漏、野指针和内存越界.md) - 释放错误的代价
- [深拷贝 vs 浅拷贝](./深拷贝-vs-浅拷贝.md) - new[] 数组的拷贝
- [placement new](./placement-new.md) - 另一种 new 形式
