# C++ 左值引用 vs 右值引用

## 核心结论

| 引用类型 | 写法 | 绑定对象 | 主要用途 |
|---------|------|---------|---------|
| 左值引用 | `T&` | 有名字、有地址的持久对象 | 避免拷贝、传参 |
| 常量左值引用 | `const T&` | 几乎所有(左值+右值) | 只读访问、兼容 C++98 传值语义 |
| 右值引用 | `T&&` | 临时对象、将亡值 | 移动语义、完美转发 |
| 万能引用 | `T&&`(模板中) | 取决于推导 | 完美转发的载体 |

**`std::move` 不移动任何东西**——它只是 `static_cast<T&&>(x)`,把左值强转成右值引用,触发移动构造/赋值。

## 一、绑定规则详解

### 引用类型与可绑定对象

```cpp
int x = 42;

int&        r1 = x;               // ✓ 左值引用绑左值
int&        r2 = 42;              // ✗ 编译错误:不能绑字面量
const int&  r3 = 42;              // ✓ const 引用可绑右值(临时对象)
int&&       r4 = 42;              // ✓ 右值引用绑右值
int&&       r5 = x;               // ✗ 编译错误:不能直接绑左值
int&&       r6 = std::move(x);    // ✓ std::move 把 x 强转成右值
```

### `const T&` 的"万能"特性

```cpp
void f(const std::string& s);  // 可接受左值和右值
f("hello");                    // OK:右值 → const T&
std::string s = "world";
f(s);                          // OK:左值 → const T&
```

`const T&` 是 C++11 之前**唯一**能接住临时对象的方式,但它是只读的——没法"偷"资源。C++11 引入 `T&&` 解决了这个问题。

## 二、为什么需要右值引用

### 问题:C++98 的拷贝浪费

```cpp
std::vector<std::string> v;
std::string makeString() { return "expensive string"; }

v.push_back(makeString());
// 流程:
// 1. makeString() 返回临时 string(右值)
// 2. push_back 拷贝构造 vector 内部的新元素 → 深拷贝 O(n)
// 3. 临时 string 析构 → 释放内存
// 浪费:本来可以直接接管临时 string 的内存!
```

### 解法:右值引用 + 移动

```cpp
void push_back(std::string&& s);  // 重载:接收右值
// 内部实现:移动构造 → 接管 s 的内存,s 置空
// 复杂度从 O(n) 降到 O(1)
```

编译器自动选:实参是右值 → 匹配 `push_back(string&&)` → 触发移动。

## 三、`std::move` 的本质

### 只是类型转换

```cpp
template<class T>
constexpr std::remove_reference_t<T>&& move(T&& t) noexcept {
    return static_cast<std::remove_reference_t<T>&&>(t);
}

// 使用
std::string s = "hello";
std::string s2 = std::move(s);
// 等价于:std::string s2 = static_cast<std::string&&>(s);
// 实际移动发生在 std::string 的移动构造中
```

### 移动后源对象状态

```cpp
std::string s = "hello";
std::string s2 = std::move(s);
// s 处于"有效但未指定"状态(valid but unspecified)
// 典型实现:s 内部的指针被置为 nullptr
// 可以:析构 s、给 s 赋新值
// 不能:假设 s 仍有原来的内容
std::cout << s.size();    // UB 或 0,标准未规定
s = "new value";          // OK
```

## 四、引用折叠(Reference Collapsing)

### 模板中的"引用的引用"

```cpp
template<typename T>
void f(T&& arg);  // 万能引用:既可能是 T& 又可能是 T&&

int x = 42;
f(x);   // T = int&,arg 类型 = int& && → 折叠为 int&(左值引用)
f(42);  // T = int,arg 类型 = int&&(右值引用)
```

### 折叠规则

| 组合 | 折叠结果 | 含义 |
|------|---------|------|
| `T& &` | `T&` | 左值引用的左值引用 |
| `T& &&` | `T&` | 左值引用的右值引用 |
| `T&& &` | `T&` | 右值引用的左值引用 |
| `T&& &&` | `T&&` | 右值引用的右值引用 |

**口诀:有左值引用就折叠成左值引用**(只有"双右值"才保持右值引用)。

### typedef 中的折叠

```cpp
using A = int&;       // A 是 int&
using B = A&&;        // B 是 int&(&&) 折叠为 int&(不是右值引用!)

int x = 42;
B b = x;              // b 是 int&,不能绑右值
B b2 = 42;            // 错误:不能绑字面量
```

## 五、万能引用 vs 右值引用

### 写法一样,本质不同

```cpp
// 1. 具体类型的右值引用
void f(std::string&& s);  // 永远绑右值,普通右值引用

// 2. 模板推导的万能引用
template<typename T>
void f(T&& s);            // 既可能绑左值也可能绑右值
auto&& x = ...;           // 同上(auto 推断)
```

### 区分方法

| 上下文 | 含义 |
|--------|------|
| `T&&` 在模板参数推导中 | **万能引用** |
| `T&&` 在具体类型(如 `std::string&&`) | 普通右值引用 |
| `auto&&` | 万能引用(类型需推导) |

## 六、完美转发(Perfect Forwarding)

### 问题:转发时丢失值类别

```cpp
template<typename T>
void wrapper(T arg) {
    // 传给 inner 时,arg 永远是左值(因为有名字)
    inner(arg);  // 永远调 inner(const T&),无法触发移动
}
```

### 解法:万能引用 + `std::forward`

```cpp
template<typename T>
void wrapper(T&& arg) {
    inner(std::forward<T>(arg));
    // 传进来是左值 → 转发左值(inner 接 T&)
    // 传进来是右值 → 转发右值(inner 接 T&&,触发移动)
}

std::string s = "hello";
wrapper(s);              // arg 是 T&,forward 后还是左值
wrapper(std::move(s));   // arg 是 T&&,forward 后还是右值
wrapper("temp");         // arg 是 T&&,forward 后还是右值
```

### `std::forward` 的本质

```cpp
template<typename T>
T&& forward(std::remove_reference_t<T>& t) noexcept {
    return static_cast<T&&>(t);
}
// T = int& → 返回 int&(左值引用)
// T = int  → 返回 int&&(右值引用)
```

## 七、为什么移动构造要 `noexcept`

### vector 扩容的隐患

```cpp
// vector 扩容:分配新内存 → 搬元素 → 释放旧内存
// 如果搬元素时移动构造抛异常:
//   - 旧元素已部分搬走
//   - 新元素已部分构造
//   - 数据状态不一致,程序崩溃
```

### 标准库的对策

```cpp
// 标准库看移动构造是否 noexcept
class Widget {
public:
    Widget(Widget&&) noexcept { ... }   // 标记 noexcept
    Widget(Widget&&) { ... }            // 没标记 → vector 退化为拷贝
};

std::vector<Widget> v;
v.reserve(100);  // 触发扩容
// noexcept:逐元素 move,O(1) 每元素
// 非 noexcept:逐元素 copy(异常安全),O(n) 每元素
```

**规则**:**所有移动构造/赋值都加 `noexcept`,除非你能证明它真的可能抛异常**。

## 八、面试高频追问

**Q1: 引用折叠规则是什么?**
模板或 typedef 中出现"引用的引用"时,编译器按规则折叠:**有左值引用就折叠成左值引用**。即 `T& &`、`T& &&`、`T&& &` 全部折叠成 `T&`,只有 `T&& &&` 保持 `T&&`。这是万能引用和 `std::forward` 工作的基础。

**Q2: 万能引用和右值引用怎么区分?**
**写法一样**(都是 `T&&`),但**位置不同**:`T&&` 在模板推导上下文(`template<typename T> void f(T&&)`)或 `auto&&` 是万能引用;`T&&` 在具体类型(`std::string&&`)是普通右值引用。万能引用配合 `std::forward` 实现完美转发。

**Q3: 为什么移动构造要 `noexcept`?**
`vector` 扩容时,标记 `noexcept` 的移动构造保证元素搬移不抛异常,vector 才有强异常安全保证;没标记,vector 退化为拷贝(性能损失数倍)。**所有移动操作都加 `noexcept`**,除非确实可能抛异常。

**Q4: 移动后对象还能用吗?**
**能用,但不能假设它的值**。标准保证"有效但未指定状态":可以析构、可以赋新值,不能读内容当有意义数据。实际工程中,move 后最好不要再用源对象,除非是给它赋新值。

**Q5: 移动语义和 RVO 什么关系?**
RVO(Return Value Optimization)是编译器优化,直接在调用方栈帧构造返回值对象,连移动都省了——**零开销**。移动语义是 RVO 失败时的**兜底方案**(C++11 之前没有移动语义,RVO 失败就只能拷贝)。C++17 起某些场景 RVO 强制要求,但多 return 路径 RVO 可能失败,这时移动语义就起作用了。

## 九、相关扩展

- [构造函数](/notes/构造函数.html) — 移动构造/赋值的正确实现方式
- [智能指针](/notes/智能指针.html) — `unique_ptr` 禁止拷贝只允许移动
- [auto vs decltype](/notes/auto-vs-decltype.html) — `auto&&` 是万能引用的常见用法
- [C++11 新特性](/notes/c++11-新特性.html) — 右值引用是 C++11 的核心机制