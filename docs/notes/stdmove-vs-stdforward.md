---
title: std::move vs std::forward
---

# C++ `std::move` vs `std::forward`

## 核心结论

两者本质都是 **`static_cast`,零运行时开销**,都是编译期类型转换。但**转换策略完全不同**:

- **`std::move`**:无条件转右值引用,语义"**我不要了,你可以搬走**"
- **`std::forward`**:有条件保持原值类别,语义"**你给我什么,我原样传下去**"

| 维度 | `std::move` | `std::forward` |
|------|------------|---------------|
| 转换方式 | **无条件**转右值引用 | **有条件**保持原值类别 |
| 使用场景 | 明确要转移所有权时 | 模板中完美转发参数时 |
| 依赖条件 | 无 | 万能引用 + 引用折叠 + 模板推导 |
| 只能在模板用? | 否(任何地方都能用) | **是**(依赖模板参数推导) |
| 本质 | `static_cast` 去引用加 `&&` | `static_cast` 配合推导结果 |

## 一、`std::move` 的机制

### 实现(简化)

```cpp
template<class T>
constexpr std::remove_reference_t<T>&& move(T&& t) noexcept {
    return static_cast<std::remove_reference_t<T>&&>(t);
}
```

**关键步骤**:
1. `remove_reference_t<T>` 去掉 T 的引用
2. `+ &&` 加上右值引用
3. 不管 T 是什么,结果**一定是右值引用**

### `move` 不移动任何东西

```cpp
std::string s = "hello";
std::string s2 = std::move(s);
// 实际发生:
// 1. std::move(s) 等价于 static_cast<string&&>(s)(类型转换,零开销)
// 2. s2 调 string 的移动构造(真正"搬家")
// 3. s 内部指针被置为 nullptr
```

### `move` 后源对象的状态

```cpp
std::string s = "hello";
std::vector<std::string> v = std::move(s);
// s 进入"有效但未指定"状态(moved-from state)
// 可以做:析构、赋新值
// 不能做:假设它还有原来的内容
s.size();    // 0 或 UB,标准未规定
s = "new";   // OK
```

## 二、`std::forward` 的机制

### 实现(简化)

```cpp
template<typename T>
T&& forward(std::remove_reference_t<T>& t) noexcept {
    return static_cast<T&&>(t);
    // T = int& → 返回 int&(左值引用)
    // T = int  → 返回 int&&(右值引用)
}
```

### 依赖三个规则配合

| 规则 | 作用 |
|------|------|
| **万能引用** `T&&` | 同时接受左值和右值(模板中) |
| **引用折叠** | 自动推导出正确的引用类型 |
| **T 推导** | left→`X&`,right→`X` |

```cpp
template<typename T>
void wrapper(T&& arg) {
    // 调用者传左值:T = int&(折叠为 int&)
    // 调用者传右值:T = int(T&& = int&&)
    target(std::forward<T>(arg));
    // 传左值 → forward 返回 int& → target 看到左值 → 拷贝
    // 传右值 → forward 返回 int&& → target 看到右值 → 移动
}
```

### 只能在模板里用

`forward` 的"有条件"**依赖模板参数推导**。非模板函数参数类型是写死的,没有推导过程,也没有"原始值类别"可以保持:

```cpp
// 错误:非模板函数用 forward 没意义
void f(int&& x) {
    // 没有模板推导,x 类型永远是 int&&
    target(std::forward<int>(x));  // 等价于 std::move,失去意义
}

// 正确:模板函数中 forward 才有意义
template<typename T>
void f(T&& x) {
    target(std::forward<T>(x));
}
```

## 三、核心对比详解

### 决策流程

```
Q: 我要把参数传给另一个函数,我对参数有什么"承诺"?
│
├─ "我不要了,你可以搬走"
│  └─ 用 std::move
│     例:容器 push_back 临时对象
│        return local_object;  // 明确转移所有权
│
└─ "我不知道调用者会传什么,我要原样转发"
   └─ 用 std::forward(在模板里)
      例:make_unique<T>(args...)
         emplace_back(args...)
         包装器函数
```

### 反模式:在模板中用 `move` 代替 `forward`

```cpp
// 错误:用 move 转发 → 破坏调用者预期
template<typename T>
void wrapper(T&& arg) {
    target(std::move(arg));  // 永远转右值,左值也被移动
}

// 调用者本意:传左值,希望内部处理函数也能用左值
std::string s = "hello";
wrapper(s);  // s 是左值,但被 move → target 看到右值 → s 内部资源被搬走
// s 进入 moved-from 状态,调用者再读 s 是 UB!
```

**正确做法**:`std::forward<T>(arg)` 保持原值类别,调用者传什么就转什么。

## 四、典型使用场景

### `std::move` 的场景

```cpp
// 1. 容器接收临时对象
std::vector<std::string> v;
std::string s = "expensive";
v.push_back(std::move(s));           // 明确转移 s 的资源

// 2. 函数返回局部对象
std::unique_ptr<int> make() {
    auto p = std::make_unique<int>(42);
    return p;  // NRVO 或移动;也可用 std::move(p) 显式触发

// 3. 转移成员变量所有权
class Holder {
    std::unique_ptr<Big> p_;
public:
    std::unique_ptr<Big> release() {
        return std::move(p_);  // 明确转移
    }
};

// 4. swap 实现
template<typename T>
void swap(T& a, T& b) {
    T tmp = std::move(a);
    a = std::move(b);
    b = std::move(tmp);
}
```

### `std::forward` 的场景

```cpp
// 1. make_unique 实现
template<typename T, typename... Args>
std::unique_ptr<T> make_unique(Args&&... args) {
    return std::unique_ptr<T>(new T(std::forward<Args>(args)...));
}

// 2. emplace_back 实现
template<typename T>
class vector {
    template<typename... Args>
    T& emplace_back(Args&&... args) {
        return *new (data_ + size_++) T(std::forward<Args>(args)...);
    }
};

// 3. 回调包装器
template<typename Func, typename... Args>
auto call(Func&& f, Args&&... args) {
    return std::forward<Func>(f)(std::forward<Args>(args)...);
}
```

## 五、特殊场景

### 对 const 对象 `move` 会怎样

```cpp
const std::string s = "hello";
std::string s2 = std::move(s);
// 不会报错,但结果令人失望:
// 1. std::move(s) 返回 const string&&(const 右值引用)
// 2. string 的移动构造接收 string&&(非 const)
// 3. const&& 匹配不上移动构造
// 4. 退化为拷贝构造(性能没有任何提升)
```

**结论**:`move` 不会消除 const 属性,对 const 对象 `move` 等于白 move。

### `forward<const T>` 永远得到 const

```cpp
template<typename T>
void f(T&& arg) {
    // forward<T>(arg) 保留 const 属性
    // T = const int → forward 返回 const int&&(还是 const)
    target(std::forward<T>(arg));  // target 看到 const,可能退化
}
```

## 六、`move` 之后还能用吗

```cpp
std::vector<int> v = {1, 2, 3};
std::vector<int> v2 = std::move(v);
// v 处于 moved-from 状态
// 标准库容器通常变成空容器(v.size() == 0),但这不是标准保证
//
// 可以:
//   v = {4, 5, 6};     // 重新赋值
//   v.clear();          // 显式清空
//   析构 v;             // 析构(空容器析构是安全的)
//
// 不能:
//   假设 v 还有原来的内容
//   v[0];               // UB(v.size() == 0)
```

**最佳实践**:`move` 之后**不要再用源对象**,除非是给它赋新值。

## 七、面试高频追问

**Q1: `move` 和 `forward` 的核心区别?**
- `move`:**无条件**转右值,语义"我不要了"
- `forward`:**有条件**保持原值类别,语义"你给我什么我原样传"
- 两者本质都是 `static_cast`,零运行时开销
- 区别在于**转换策略**,不是性能

**Q2: `forward` 为什么只能在模板里用?**
`forward` 的"有条件"依赖**模板参数推导**。非模板函数参数类型写死,没有推导过程,没有"原始值类别"可以保持。非模板函数里用 `forward<T>(x)` 等价于 `std::move(x)`,失去 forward 的意义。

**Q3: 对 const 对象 `move` 会怎样?**
- `std::move(const T)` 返回 `const T&&`(const 右值引用)
- 移动构造/赋值接收 `T&&`(非 const)
- const&& 匹配不上,退化为**拷贝构造**
- 结论:`move` 不会消除 const,白 move

**Q4: `move` 之后还能用吗?**
标准说 moved-from 对象处于"有效但未指定"状态。实践:只能析构或重新赋值,不能读内容。标准库容器 move 后通常变成空容器(但不是标准保证)。**最佳实践**:move 后**不要再用源对象**。

**Q5: 什么时候用 `move`,什么时候用 `forward`?**
- 明确要转移所有权(`std::move`):容器 push_back 临时对象、return 局部对象、swap
- 模板中转发参数(`std::forward`):make_unique、emplace_back、回调包装器
- **不能在模板中用 `move` 代替 `forward`**:会破坏调用者预期(左值也被移动)

## 八、相关扩展

- [移动语义](./移动语义.md) — `std::move` 触发移动构造/赋值
- [完美转发](./完美转发.md) — `std::forward` 的典型应用
- [左值引用 vs 右值引用](./左值引用-vs-右值引用.md) — 引用折叠是 `forward` 的基础
- [C++11 新特性](./c++11-新特性.md) — 两者都是 C++11 的核心机制
