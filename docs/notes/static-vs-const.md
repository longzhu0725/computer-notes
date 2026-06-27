---
title: "static vs const"
type: wiki
stage: compiled
entity_type: comparison
source: "[raw/2026-06-22_static-vs-const.md](./raw/2026-06-22_static-vs-const.md.md)"
source_hash: 6395862f1d74d1b290522ea1d621f4210df385057ab209f8e4e741cf08fc6295
domain: cpp
domains:
  - cpp
confidence: medium
tags:
  - cpp
  - wiki
  - static
  - const
  - 对比
created: 2026-06-22
updated: 2026-06-22
has_counter_arguments: true
---

# static vs const

`static` 和 `const` 是 C++ 中最常被同时使用的两个关键字，但它们**正交**——一个控制"在哪活多久"（生命周期和可见性），一个控制"能不能改"（可修改性）。理解这一点比分别记忆每个用法更重要。当面试官追问"它们修饰同一个东西时语义怎么叠加"，答不清的原因通常是没把**存储期**（static）和**constness**（const）作为两个独立维度思考。

## 简要回答

- **`static`**：让一个名字**在整个程序期间**存在（延长生命周期）、或**只在当前翻译单元可见**（限制链接性）、或**被所有同类对象共享**（类成员独立于对象）。
- **`const`**：给一个名字加上"**只读**"承诺。违反承诺会在编译期或运行期报错。

两者**可以同时使用且语义独立**：`static const int MAX_USERS = 100;` 既是"程序运行期间一直存在的、类共享的"名字，又是"不可修改"的值。

## 维度对比

| 维度 | static | const |
|---|---|---|
| 核心语义 | 生命周期 + 链接性 + 共享性 | 只读承诺（不可修改） |
| 修饰局部变量 | 生命周期延长到程序结束 | 变量值不可修改 |
| 修饰全局变量 | 限制为**内部链接**（文件私有） | 内部链接（默认） + 只读 |
| 修饰类成员变量 | **所有对象共享同一份** | 必须在初始化列表中初始化 |
| 修饰类成员函数 | 无 this 指针，可用 `类名::函数名()` 调用 | 不修改非 mutable 成员，const 对象可调用 |
| 修饰指针 | 不直接修饰（指针本身没有生命周期问题） | `const int*`（值不可改）/ `int* const`（指向不可改） |
| 修饰引用 | 不直接修饰 | `const T&` 是"绑定到 const 对象的引用" |
| 默认链接性（C++） | 内部（文件私有） | 内部（文件私有） |
| 线程安全（C++11+） | 局部 static 的初始化由 magic statics 保证线程安全 | 不涉及 |

## 关键原理

### static 的四种用法

#### 1. 局部静态变量

```cpp
void counter() {
  static int n = 0;  // 第一次调用时初始化，之后保留值
  ++n;
  std::cout << n << "\n";
}
counter();  // 1
counter();  // 2
counter();  // 3
```

**存储期**：程序运行期间（不是函数调用期间）
**作用域**：函数内部（不可见）
**初始化**：第一次执行到这一行时（lazy initialization）

**C++11 起的"magic statics"**：编译器保证多线程并发首次调用时只有一个线程执行初始化，其他线程阻塞等待——**初始化线程安全，但初始化后的读写仍需加锁**。这是 Meyer's Singleton 的理论依据：

```cpp
Singleton& getInstance() {
  static Singleton instance;  // 第一次调用时构造，线程安全
  return instance;
}
```

#### 2. 文件作用域的 static

```cpp
// file1.cpp
static int private_counter = 0;  // 内部链接，file2.cpp 不可见
```

让全局符号变成**文件私有**——其他 `.cpp` 文件用 `extern` 也看不到。这是实现"翻译单元私有"的标准方式。

**注意**：C++ 鼓励用**匿名命名空间**替代 `static` 全局：

```cpp
// 推荐
namespace { int private_counter = 0; }
```

效果一样，但匿名命名空间能**阻止名字被意外导入其他文件**（`static` 在 C 中还能通过声明穿透，匿名命名空间是 C++ 唯一安全的"文件私有"机制）。

#### 3. 类的静态成员变量

```cpp
class Account {
public:
  static int total_count;  // 声明：所有 Account 对象共享这一个
};
int Account::total_count = 0;  // 必须类外定义（C++17 前）
```

**C++17 起的简化**：

```cpp
class Account {
public:
  static inline int total_count = 0;  // 类内直接定义（inline static）
};
```

`inline static` 消除了"必须在 .cpp 文件里找定义"的麻烦——这正是 [cpp/封装](./cpp/封装.md) 在**编译期实现**上的简化。

#### 4. 类的静态成员函数

```cpp
class Math {
public:
  static int add(int a, int b) { return a + b; }
};

int x = Math::add(1, 2);  // 不需要对象
```

没有 `this` 指针 → **不能访问非静态成员**，但**可以访问静态成员**。常用于工具函数（`std::move`、`std::forward` 实际就是函数模板而不是类成员函数）。

### const 的四种用法

#### 1. 修饰普通变量

```cpp
const int x = 10;
x = 20;  // 编译错误
```

最简单形式——只读变量。**和 `#define` 的区别**是 const 有类型、有作用域、可以被引用。

#### 2. 修饰指针

这是 const 面试最常考的：

| 写法 | 含义 | 改值 | 改指向 |
|---|---|---|---|
| `const int* p`（或 `int const* p`） | 指向 const 值的指针 | ❌ | ✅ |
| `int* const p` | const 指针 | ✅ | ❌ |
| `const int* const p` | 双 const | ❌ | ❌ |

**口诀**：**const 在 `*` 左边修饰指向的值，在 `*` 右边修饰指针本身**。

#### 3. 修饰引用

```cpp
const int& ref = x;
ref = 20;  // 编译错误：不能通过 ref 改 x
```

`const` 修饰引用时，**修饰的是被引用对象**而不是引用本身（引用本来就不能改绑定）。所以"const 引用"实际是"绑定到 const 对象的引用"。

**重要应用**：函数参数 `void f(const T&)` 避免拷贝又承诺不修改——见 [cpp/指针 vs 引用](./cpp/指针-vs-引用.md)。

#### 4. 修饰成员函数

```cpp
class Counter {
public:
  int get() const { return value_; }  // 承诺不修改对象
  void inc() { ++value_; }            // 非 const，可修改
private:
  int value_;
};

const Counter c{42};
c.get();  // ✅ OK
c.inc();  // ❌ 编译错误：const 对象不能调用非 const 成员函数
```

const 成员函数里所有**非 mutable 成员**都按 const 处理。`mutable` 是"逻辑 const"逃逸门——见 [cpp/封装](./cpp/封装.md)。

### 正交性

static 和 const 是**完全正交**的两个维度。一个名字可以是：

| 组合 | 含义 | 典型用途 |
|---|---|---|
| (无修饰) | 局部变量，自动存储期 | 函数内临时变量 |
| `static` | 延长生命周期 / 内部链接 / 共享 | 计数器、文件私有状态、类计数器 |
| `const` | 只读 | 配置常量、函数参数 |
| `static const` | 长寿命 + 只读 | 编译期常量、配置项 |
| `static constexpr` | 编译期常量 + 长寿命 | 数组大小、模板参数（C++17 起 constexpr 隐含 inline） |
| `const static` | 同 `static const`，顺序可换 | 同上 |
| `mutable`（仅类成员） | 在 const 函数中可修改 | 缓存、互斥锁 |

**记忆要点**：看到 `static` 想"在哪活多久"，看到 `const` 想"能不能改"，两者可以独立思考。

## 选择指南

### 用 static

- 状态需要在多次函数调用间保持（如计数器、缓存）
- 不希望被其他文件访问（文件私有）
- 类的元数据（与对象无关的常量、计数器、单例）
- 工具函数（`Math::abs(x)` 形式）

### 用 const

- 任何不该被修改的值（默认 const，例外才去掉）
- 函数参数（避免拷贝 + 表达"不修改"）
- 成员函数（表达"不修改对象状态"）
- 指针/引用参数（表达"通过该路径不改"）

### 同时用 static const / constexpr

- 类的编译期常量：`static constexpr double PI = 3.14159;`
- 全局配置：`static const int MAX_CONN = 100;`
- 数学常量：`static const int DAYS_IN_WEEK = 7;`

## 与其他概念的关系

- [cpp/变量作用域](./cpp/变量作用域.md)：static 局部变量、全局变量是该文的核心话题
- [cpp/指针 vs 引用](./cpp/指针-vs-引用.md)：const 修饰指针/引用的层次关系直接相关
- [cpp/封装](./cpp/封装.md)：const 成员函数是"对外承诺不修改"的接口机制；mutable 是其内部实现细节
- [cpp/类型转换](./cpp/类型转换.md)：`const_cast` 是 const 的"反向"工具，但有严格使用条件
- [cpp/extern C](./cpp/extern-c.md)：跨语言接口必须用 `extern "C"` 包裹常量和函数，确保 ABI 兼容
- [cpp/struct vs class](./cpp/struct-vs-class.md)：struct 成员默认 public 经常和 const 配合定义"值类型"（如 `struct Point { const double x; const double y; };`）

## 来源与延伸阅读

- [raw/2026-06-22_static-vs-const](./raw/2026-06-22_static-vs-const.md) — 原始资料（卡码笔记 C++ 面试题系列，2026-05-23）
- 推荐：《Effective C++》Item 2（用 const/enum/inline 替代 #define）
- 推荐：《Effective Modern C++》Item 17（理解特殊成员函数的生成）
- 推荐：cppreference [storage duration](https://en.cppreference.com/w/cpp/language/storage_duration)（存储期分类）
- 推荐：cppreference [constexpr](https://en.cppreference.com/w/cpp/language/constexpr)（比 const 更强的"编译期常量"机制）
