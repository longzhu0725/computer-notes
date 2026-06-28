# struct vs class

C++ 中 `struct` 和 `class` **语法能力完全等价**——能在 struct 上做的所有事，class 都能做，反之亦然。两者的真实差异只有**两个默认值**（成员访问权限、默认继承权限）和**一个语法规定**（模板参数不能用 `struct` 关键字）。但工程实践中，struct 和 class 承担了不同的**语义角色**——struct 用于"纯数据聚合"，class 用于"有封装行为的不变量持有者"。Google C++ Style Guide、LLVM Coding Standards 等主流规范都把这种语义区分写进了强制条款。

## 简要回答

| 维度 | struct | class |
|---|---|---|
| 成员默认访问 | public | private |
| 默认继承权限 | public | private |
| 模板参数 | 不能写 `template<struct T>` | `template<class T>` |
| 语法能力 | 完全等价 | 完全等价 |
| 工程惯例 | 纯数据聚合、POD 类型 | 有封装行为的对象 |

两者可以互相替换——`struct Foo { private: int x; };` 合法，`class Bar { public: int x; };` 也合法——但**违反工程惯例**会让代码读者困惑。

## 维度对比

| 维度 | struct | class |
|---|---|---|
| 成员默认访问 | public（任何位置都可直接访问） | private（必须通过公开接口） |
| 默认继承权限 | `struct D : B` 是 public 继承 | `class D : B` 是 private 继承 |
| 模板参数声明 | 不可：`template<struct T>` 编译错误 | 可：`template<class T>` 或 `template<typename T>` |
| 虚函数 | 支持 | 支持 |
| 成员函数 | 支持 | 支持 |
| 访问控制（`public`/`private`/`protected`） | 支持 | 支持 |
| 友元 | 支持 | 支持 |
| 运算符重载 | 支持 | 支持 |
| 派生类 | 支持 | 支持 |
| 与 C 的 ABI 兼容 | 天然兼容（C 风格 struct） | 需要 `extern "C"` 配合 |
| 内存布局 | 默认是 standard-layout（成员按声明顺序） | 默认可能是 non-standard-layout（如有访问控制切换） |
| `sizeof` | 等于成员大小之和（无 padding 优化） | 可能因 padding 不同 |

## 关键原理

### 默认值的真正含义

`struct S { int x; };` 等价于 `struct S { public: int x; };`。这个"默认"只在你**没显式写访问修饰符**时才生效。一旦写了 `private:`，后续成员都按 private 处理，直到下一个访问修饰符。

```cpp
struct Mixed {
  int a;          // public
  void f() {}     // public
private:
  int b;          // private
};

class Mixed2 {
  int a;          // private
  void f() {}     // private
public:
  int b;          // public
};
```

`Mixed` 和 `Mixed2` **完全等价**——只是访问修饰符的初始位置不同。

### 默认继承权限的实际影响

`struct D : B` 等价于 `struct D : public B`——基类的 public 成员在 D 中仍为 public。
`class D : B` 等价于 `class D : private B`——基类的 public 成员在 D 中变为 private（外部不可见）。

**为什么这个差异在实践中几乎不重要**：因为现代 C++ 编码规范都**强制要求显式写继承权限**（Effective C++ Item 32、ISO C++ Core Guidelines C.135），依赖默认值会被静态检查工具警告。真正需要 private 继承的场景很少（通常用组合替代）。

### POD 类型契约

raw 资料提到的 **POD（Plain Old Data）** 是 C++ 早期的一个关键概念——表示"内存布局与 C 兼容、可以用 `memcpy` 安全拷贝"的类型。POD 类型的两个组成条件：

1. `std::is_trivial<T>`：没有用户定义的构造/析构/拷贝/赋值，所有成员同类
2. `std::is_standard_layout<T>`：所有非静态成员访问权限相同、没有虚基类、第一个非静态成员与类型本身访问权限相同

```cpp
struct Point {  // 默认是 POD
  double x;
  double y;
};

class Counter {  // 也是 POD（如果不写任何成员函数）
public:
  int value;
};
```

`struct` 因为默认 public、惯例上不写成员函数，**天然容易成为 POD**。但 class 满足条件时也是 POD。**C++20 起 `std::is_pod` 已被 deprecated**——直接用 `std::is_trivial` 和 `std::is_standard_layout` 分别检查。

### C 的 struct vs C++ 的 struct

C 语言的 `struct` **只能有成员变量**，不能有成员函数、不能有访问控制、不能继承。C++ 为了兼容 C 保留了 `struct` 关键字，但**扩展成了和 class 几乎等价**的东西——这是历史包袱，不是设计意图。

**实际影响**：
- C 头文件里的 `struct` 在 C 编译器看来是"纯数据"，C++ 编译器看成"可能有方法的类"
- 用 `extern "C"` 混编时，**共享的结构体定义要保持 C 兼容**（不加成员函数、不加访问控制、不继承）——见 [cpp/extern C](/notes/extern-c.html)

## 选择指南

### 用 struct

- **纯数据聚合**：所有成员 public，没有不变量需要维护
- **POD 类型**：与 C 互操作、可以用 `memcpy` 拷贝
- **配置项/参数包**：`struct Config { int port; std::string host; };`
- **坐标点/几何**：`struct Point { double x, y; };`
- **网络协议包头**：固定内存布局，便于序列化
- **值类型（value type）**：可以用 `==` 比较整个结构体内容

### 用 class

- **有封装需求**：内部状态需要通过接口维护不变量
- **业务对象**：`User`、`Order`、`Account`
- **资源管理器**：`File`、`Connection`、`Socket`（RAII）
- **带构造/析构逻辑**：`std::string`、`std::vector`（虽然标准库实现常用 struct 技巧，但用户代码用 class）
- **继承体系**：多态、抽象基类、策略模式
- **有 const 成员函数**：`bool empty() const;` 暗示这是 class

### 团队规范建议

- **Lint 规则**：用 clang-tidy 的 `readability-redundant-access-specifiers` 等检查
- **Code Review**：看到 `class` 但所有成员 public 就要问"为什么不用 struct"；看到 `struct` 出现 `private:` 就要问"为什么不用 class"
- **第三方库**：遵守库的惯例——Boost 用 class 表示有行为的类型，Qt 用 struct 表示值类型

## 与其他概念的关系

- [cpp/封装](/notes/封装.html)：class 的核心价值所在，struct 是"主动放弃封装的 class"
- [cpp/继承](/notes/继承.html)：struct vs class 的默认继承权限差异正是继承语义的延伸
- [cpp/多态](/notes/多态.html)：多态必须用 class（或含虚函数的 struct，但惯例是 class）
- [cpp/指针 vs 引用](/notes/指针-vs-引用.html)：struct 通常按值传递（透明数据），class 通常按 const 引用传递
- [cpp/extern C](/notes/extern-c.html)：与 C 互操作时，共享的 struct 定义必须保持 C 风格
- [cpp/static vs const](/notes/static-vs-const.html)：struct 成员默认 public 常和 static/const 配合定义命名常量

## 来源与延伸阅读

- raw/2026-06-22_struct-vs-class — 原始资料（卡码笔记 C++ 面试题系列，2026-05-23）
- 推荐：《Effective C++》Item 32（public 继承的语义必须是 is-a）
- 推荐：[ISO C++ Core Guidelines C.1-C.2](https://isocpp.github.io/CppCoreGuidelines/C.html)（组织相关声明的规则）
- 推荐：[Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html#Structs_vs_Classes)（明确推荐"用 struct 仅当所有成员 public 且无构造函数"）
- 推荐：cppreference [POD types](https://en.cppreference.com/w/cpp/named_req/PODType)（已 deprecated 的概念背景）