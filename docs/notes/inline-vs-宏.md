---
title: "inline vs 宏"
type: wiki
stage: compiled
entity_type: comparison
source: "[raw/2026-06-22_inline-vs-macro.md](./raw/2026-06-22_inline-vs-macro.md.md)"
source_hash: 73626d1708b945916979b546bcede03a828734a4acf8aa99f271d870e79eb26f
domain: cpp
domains:
  - cpp
confidence: medium
tags:
  - cpp
  - wiki
  - inline
  - 宏
  - 预处理
  - 对比
created: 2026-06-22
updated: 2026-06-22
has_counter_arguments: true
---

# inline vs 宏

`inline` 函数和 `#define` 宏经常被放在一起比较——都是"避免函数调用开销"的手段，但**处理阶段、类型安全、调试能力**完全不同。核心区别一句话：**宏是预处理器的"傻替换"，inline 是编译器的"聪明函数"**。现代 C++ 的准则是**能 inline 就不要宏**，但有 3 个场景是 inline 无法替代的——预处理器独有的能力。

## 简要回答

| 维度 | `#define` 宏 | `inline` 函数 |
|---|---|---|
| 处理阶段 | 预处理（编译器介入前） | 编译（正常语义分析） |
| 类型检查 | ❌ 无 | ✅ 有 |
| 作用域 | 全局（一旦定义到处生效） | 命名空间 / 类作用域 |
| 多次求值 | 危险（参数每次出现都求值） | 安全（参数只求值一次） |
| 调试 | 极难（看不到宏的"内部"） | 容易（即使是内联代码） |
| 编译器会拒绝内联 | N/A | 可能（函数太大时） |
| 可替代性 | 部分（条件编译、`#`、`##` 不可替代） | 高 |

**核心结论**：现代 C++ 中，**编译期常量用 `constexpr`，"宏函数"用 `inline` 函数或模板，泛型用模板**。宏只用于 inline 做不到的 3 个场景：`#ifdef` 条件编译、`#` 字符串化、`##` 令牌拼接。

## 维度对比

| 维度 | `#define` 宏 | `inline` 函数 |
|---|---|---|
| 处理阶段 | 预处理器（`.i` 文件之前） | 编译器（语义分析） |
| 是否做类型检查 | ❌ 不做 | ✅ 做（参数类型、返回类型） |
| 是否遵守作用域 | ❌ 全局污染 | ✅ 命名空间 / 类作用域 |
| 参数求值次数 | 每次出现都求值 | 只求值一次 |
| 可否重载 | ❌ 不能 | ✅ 可重载 |
| 可否取地址 | ❌ 不行（不是函数） | ✅ 可（`void (*p)(int) = &f;`） |
| 可否递归调用自己 | ✅（但要小心无限展开） | ✅ |
| 调试器支持 | 差（只能看展开后代码） | 好（即使内联也映射源码） |
| 编译器内联决定权 | 100% 展开（无选择） | 建议性质，编译器可拒绝 |
| 主要用途 | 条件编译、字符串化、令牌拼接、平台适配 | 头文件中的小型工具函数、类内成员函数、模板辅助 |

## 关键原理

### 处理阶段的根本差异

```
源代码 → 预处理器 → 编译器 → 汇编器 → 链接器 → 可执行文件
           ↑
           #define 在这里展开
           inline 在这里之后才生效
```

#### 宏的预处理阶段行为

```cpp
#define SQUARE(x) ((x) * (x))

int a = 3;
int b = SQUARE(a++);
```

预处理后变成：

```cpp
int a = 3;
int b = ((a++) * (a++));  // a 自增两次！结果错误
```

**预处理器不懂 C++ 语法**——它只做文本替换，不做类型检查，不知道 `a++` 有副作用，不知道 `+` 的优先级，不知道命名空间。

#### inline 的编译阶段行为

```cpp
inline int square(int x) { return x * x; }

int a = 3;
int b = square(a++);  // a 只自增一次
```

编译器看到 `a++` 是有副作用的表达式，**只在调用前求值一次**（作为参数），然后把结果传给函数——不会有重复求值的问题。

### 多次求值：宏的致命陷阱

```cpp
#define MAX(a, b) ((a) > (b) ? (a) : (b))

int x = 1, y = 2;
int z = MAX(x++, y++);  // 展开后 x 和 y 都可能自增两次
```

展开：

```cpp
int z = ((x++) > (y++) ? (x++) : (y++));
```

实际行为未定义（同一表达式中多次修改同一变量）。inline 函数的 `inline int max(int a, int b)` 不会有这个问题——`a++` 和 `b++` 各执行一次，结果作为参数传入。

### `inline` 关键字的真正作用

这是**现代 C++ 的关键点**——`inline` 在 C++17 后**主要作用是"允许在头文件中定义函数而不触发 ODR（One Definition Rule）违规"**，而不是"建议编译器内联"。

```cpp
// utils.h
inline int add(int a, int b) { return a + b; }  // OK：每个 .cpp 包含后是同一个函数
int sub(int a, int b) { return a - b; }          // 错误：多个 .cpp 包含会重复定义
```

如果没有 `inline`，头文件里的函数定义被多个 `.cpp` 包含后链接时会报"multiple definition"错误。加上 `inline` 后，**多个翻译单元可以有相同的定义**，链接器会合并成一个符号。

**这才是 `inline` 在头文件库（如 STL）里大量使用的原因**——性能优化是次要的，**避免 ODR 违规**是主要的。

### 编译器对内联有最终决定权

```cpp
inline void huge_function() {
  // 1000 行代码
  for (int i = 0; i < 1000; i++) { ... }
}
```

编译器**可能拒绝内联**——内联大函数会**膨胀代码体积**（每个调用点都复制一份），反而可能降低 cache 命中率。编译器的决策依据：

- 函数体大小（典型阈值：几百行后拒绝）
- 是否包含循环、递归
- 优化级别（`-O0` 基本不内联，`-O2` 积极内联）
- 是否有取地址操作（`&func` 会阻止内联，因为函数必须有地址）

**反之也成立**：没标 inline 的小函数在 `-O2` 下也可能被自动内联（如 getter / setter）。`inline` 关键字对编译器的约束力**很弱**。

### 宏的不可替代性

3 个场景**只有预处理器能做**：

#### 1. 条件编译

```cpp
#ifdef _WIN32
  #define PATH_SEP '\\'
#else
  #define PATH_SEP '/'
#endif
```

inline 函数做不到——函数体在编译时确定，无法"根据平台改变定义"。

#### 2. 字符串化（`#` 运算符）

```cpp
#define ASSERT(cond) \
  do { if (!(cond)) { \
    std::cerr << "Assertion failed: " #cond " at " __FILE__ ":" __LINE__ << "\n"; \
    std::abort(); \
  } } while (0)

ASSERT(x > 0);  // 展开后打印 "Assertion failed: x > 0"
```

`#cond` 把参数名变成字符串字面量——inline 函数无法做到（函数参数是值，没有"参数名"的概念）。

#### 3. 令牌拼接（`##` 运算符）

```cpp
#define DECLARE_GETTER(type, name) \
  type get_##name() const { return name##_; }

DECLARE_GETTER(int, id)     // 生成 get_id() { return id_; }
DECLARE_GETTER(std::string, name)  // 生成 get_name() { return name_; }
```

`##` 把两个 token 拼接成一个新标识符——inline 函数做不到（函数定义在源码中已经存在，不能动态生成新函数名）。

### 宏的字符串化与日志

```cpp
#define LOG(level) \
  std::cout << "[" #level "] " << __FILE__ << ":" << __LINE__ << " "

LOG(INFO) << "server started on port " << port << "\n";
// 打印: [INFO] main.cpp:42 server started on port 8080
```

`#level` 把 `INFO` 变成字符串 `"INFO"`，`__FILE__` 和 `__LINE__` 是编译器预定义宏（inline 函数也用不了这些）。这是**日志宏的经典模式**。

## 选择指南

### 用 inline 函数

- 头文件里的小型工具函数（模板库的辅助函数）
- 类内定义的成员函数（默认 inline）
- 需要类型安全、需要调试、参数有副作用
- 范围 for 循环里的 lambda（`for_each` 接收的 lambda 本质上常被内联）

### 用 constexpr（C++11 起）

- 编译期常量（替代 `#define MAX 100`）
- 编译期可计算的函数（替代 `#define SQUARE(x) ((x)*(x))`）

```cpp
constexpr int max_val = 100;               // 替代 #define
constexpr int square(int x) { return x*x; } // 替代宏函数，有类型检查
```

### 用模板

- 类型参数化的"宏函数"（`std::min`、`std::max` 是模板而不是宏）
- 泛型算法（`std::sort`）

### 仍要用 `#define` 宏

- 条件编译（`#ifdef`、`#if defined(...)`）
- 包含头文件（`#include`）
- 字符串化（`#x`）
- 令牌拼接（`a##b`）
- 平台/编译器特定开关（`#pragma`、`__attribute__` 宏包装）
- 调试日志（需要 `__FILE__`、`__LINE__`、`__func__`）

## 现代 C++ 的替代方案

| 旧宏                                                 | 现代 C++ 替代                                             | 优势          |
| -------------------------------------------------- | ----------------------------------------------------- | ----------- |
| `#define PI 3.14`                                  | `constexpr double PI = 3.14;`                         | 类型安全、作用域、调试 |
| `#define MAX(a,b) ...`                             | 模板 `template<T> const T& max(const T& a, const T& b)` | 类型安全、自动推导   |
| `#define SAFE_DELETE(p) delete p; p = nullptr;`    | RAII 智能指针 `std::unique_ptr`                           | 自动管理、异常安全   |
| `#define FOREACH(it, c) for (it = c.begin(); ...)` | C++11 范围 for `for (auto& x : c)`                      | 简洁、安全       |
| `#define DISALLOW_COPY(Class) ...`                 | `= delete` 声明（C++11）                                  | 类型安全、明确意图   |

**结论**：能不用宏就不用宏。除非你要用 `#ifdef`、`#`、`##` 或编译器预定义宏（`__FILE__`、`__LINE__`）。

## 与其他概念的关系

- [cpp/extern C](./cpp/extern-c.md)：C 头文件常带 `inline` 函数；C99 起 inline 是 C 标准的正式特性
- [cpp/static vs const](./cpp/static-vs-const.md)：`inline static const` 组合常用于头文件中的编译期常量
- [cpp/类型转换](./cpp/类型转换.md)：宏可包装复杂的类型转换逻辑（如 `INT_TO_PTR`），但 `static_cast` 更安全
- [cpp/struct vs class](./cpp/struct-vs-class.md)：类内成员函数默认 inline，是 inline 关键字的最常见应用
- [cpp/变量作用域](./cpp/变量作用域.md)：宏无视作用域是它最大的隐患之一，与 C++ 的作用域概念冲突
- [cpp/volatile](./cpp/volatile.md)：调试宏可能用 `volatile` 防止编译器优化

## 来源与延伸阅读

- [raw/2026-06-22_inline-vs-macro](./raw/2026-06-22_inline-vs-macro.md) — 原始资料（卡码笔记 C++ 面试题系列，2026-05-23）
- 推荐：《Effective C++》Item 2（用 const/enum/inline 替代 #define）
- 推荐：《C++ Coding Standards》Rule 22（用内联函数代替宏函数）
- 推荐：cppreference [inline specifier](https://en.cppreference.com/w/cpp/language/inline)
- 推荐：cppreference [function-like macros](https://en.cppreference.com/w/cpp/preprocessor/replace)
