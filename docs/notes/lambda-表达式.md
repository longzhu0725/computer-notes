# C++ Lambda 表达式

## 核心结论

Lambda 本质是**编译器生成的匿名仿函数类**。语法 `[捕获列表](参数) { 函数体 }` 被翻译成:捕获的变量变成**成员变量**,函数体变成 `operator()` 的实现。**值捕获** = 拷贝为成员,**引用捕获** = 引用成员,**无捕获** = 空类(可转函数指针)。

| 捕获 | 含义 | 性能 | 生命周期 |
|------|------|------|---------|
| `[x]` 值捕获 | 拷贝一份 | O(n) 拷贝 | 副本独立 |
| `[&x]` 引用捕获 | 引用,零拷贝 | O(1) | 依赖外部 |
| `[=]` 全部值 | 所有用到的变量 | O(n) | 副本独立 |
| `[&]` 全部引用 | 引用,零拷贝 | O(1) | 依赖外部 |
| `[x, &y]` 混合 | 部分值,部分引用 | — | — |

## 一、编译器转换原理

### Lambda 拆解

```cpp
auto add = [threshold](int x) { return x > threshold; };
add(42);

// 编译器内部翻译为:
struct __lambda_1 {
    int threshold;  // 值捕获 → 成员变量(拷贝)
    bool operator()(int x) const {  // 默认 const
        return x > threshold;
    }
};

__lambda_1 add{ /* threshold = ... */ };  // 用外部 threshold 初始化
add(42);  // 等价于 add.operator()(42)
```

**关键洞察**:Lambda 就是有 `operator()` 的对象——和手写仿函数(functor)完全等价。

## 二、捕获列表详解

### 四种基础捕获

```cpp
int a = 1, b = 2, c = 3;

// 1. 值捕获:拷贝一份,独立
auto f1 = [a]() { return a * 2; };
// 成员: int a
// f1.a 修改不影响外部 a

// 2. 引用捕获:零拷贝,绑引用
auto f2 = [&b]() { return b * 2; };
// 成员: int& b
// 修改 f2.b 会影响外部 b

// 3. 全部值捕获(隐式)
auto f3 = [=]() { return a + b + c; };
// 用到的所有变量都按值捕获

// 4. 全部引用捕获(隐式)
auto f4 = [&]() { return a + b + c; };
// 用到的所有变量都按引用捕获
```

### 混合捕获

```cpp
// 显式列出:意图清晰,推荐
auto f5 = [a, &b, c]() { ... };
// a 按值,b 按引用,c 按值

// 组合(全部值,但 b 用引用)
auto f6 = [=, &b]() { ... };

// 组合(全部引用,但 a 用值)
auto f7 = [&, a]() { ... };
```

**最佳实践**:**显式列出要捕获的变量**(避免 `[=]`/`[&]` 的隐式捕获带来的意外)。

### 值捕获 vs 引用捕获

| 维度 | 值捕获 `[x]` | 引用捕获 `[&x]` |
|------|-------------|---------------|
| 性能 | O(n) 拷贝 | O(1) |
| 安全性 | 安全(独立副本) | 危险(可能悬空) |
| 修改影响 | 不影响外部 | 影响外部 |
| 适用场景 | 长生命周期 lambda(异步、存起来) | 短生命周期 lambda(同步用) |

**原则**:
- lambda 比被捕获变量活得久 → **值捕获**(避免悬空)
- lambda 作用域内立即用 → **引用捕获**(避免拷贝)

## 三、`mutable` 关键字

### 默认 operator() 是 const

```cpp
int x = 10;
auto f = [x]() { x = 20; };  // 错误!operator() 是 const,x 是 const 成员
auto f = [x]() mutable { x = 20; };  // OK,mutable 去掉 const
```

**注意**:`mutable` 修改的是**副本**(值捕获的拷贝),**不影响外部** `x`。

```cpp
int x = 10;
auto f = [x]() mutable {
    x = 20;  // 改的是 f 内部的 x
    return x;  // 20
};
f();
std::cout << x;  // 10,外部 x 不变
```

## 四、无捕获 lambda 与函数指针

### 标准规定:无捕获 lambda 可转函数指针

```cpp
auto f = []() { return 42; };
int (*fp)() = f;  // 隐式转换 OK
fp();              // 42

// 用于 C 风格回调
int arr[10];
std::qsort(arr, 10, sizeof(int), 
    [](const void* a, const void* b) {  // 无捕获
        return *(const int*)a - *(const int*)b;
    });
```

### 有捕获 lambda 不能转

```cpp
int x = 10;
auto f = [x]() { return x; };
int (*fp)() = f;  // 错误!有捕获的 lambda 不能转函数指针
```

**原因**:有捕获的 lambda 有状态(成员变量),需要对象承载,函数指针是无状态的纯地址。

## 五、各版本增强

| 版本 | 新特性 | 用途 |
|------|--------|------|
| C++11 | 基础 lambda,捕获列表,mutable | 函数式编程 |
| C++14 | 泛型 lambda(`auto` 参数)、初始化捕获 | 移动捕获 `[x = std::move(obj)]` |
| C++17 | constexpr lambda | 编译期求值 |
| C++20 | 模板 lambda、出现在未求值上下文 | 更强的泛型支持 |

```cpp
// C++14 泛型 lambda
auto generic = [](auto x, auto y) { return x + y; };
generic(1, 2);         // 3(int)
generic(1.0, 2.0);     // 3.0(double)

// C++14 初始化捕获(移动捕获)
auto p = std::make_unique<int>(42);
auto f = [p = std::move(p)]() { return *p; };
// 把 unique_ptr 移入 lambda

// C++20 模板 lambda
auto tpl = []<typename T>(T x) { return x * 2; };
```

## 六、lambda 什么时候不该用

### 1. 函数体太长

```cpp
// 不好:lambda 内 50 行
auto f = [data]() {
    // 50 行逻辑
};

// 好:提取为命名函数
auto processData(Data& data) {
    // 50 行逻辑
}
auto f = [&]() { processData(data); };
```

### 2. 需要多处复用

```cpp
// 不好:每个调用点都写一遍 lambda
sort(v.begin(), v.end(), [](int a, int b) { return a < b; });
sort(w.begin(), w.end(), [](int a, int b) { return a < b; });

// 好:定义一个具名比较器
auto ascending = [](int a, int b) { return a < b; };
sort(v.begin(), v.end(), ascending);
```

### 3. 需要递归

```cpp
// 错误:lambda 不能直接递归(自己未声明完不能引用)
auto fact = [](int n) { return n <= 1 ? 1 : n * fact(n - 1); };
// 编译错误:fact 未定义

// 解法 1:std::function(有类型擦除开销)
std::function<int(int)> fact = [&fact](int n) {
    return n <= 1 ? 1 : n * fact(n - 1);
};

// 解法 2:Y-combinator 或 named lambda(C++23)
```

## 七、lambda 与函数指针的差异

| 维度 | lambda | 函数指针 |
|------|--------|----------|
| 本质 | 编译器生成的类实例 | 纯地址 |
| 状态 | 可以捕获变量(有状态) | 无状态 |
| 内联 | 可以(类型唯一,编译器知道) | 间接调用,通常不能内联 |
| 转函数指针 | 无捕获 ✓,有捕获 ✗ | — |
| 性能 | 高(可内联) | 较低(间接调用) |

## 八、面试高频追问

**Q1: lambda 的本质是什么?**
**编译器生成的匿名仿函数类**。捕获列表变成员变量,函数体变 `operator()`。和手写仿函数完全等价,只是语法糖让代码更简洁。

**Q2: 值捕获和引用捕获怎么选?**
- **值捕获**安全但有拷贝,副本独立(长生命周期 lambda 推荐,如异步回调)
- **引用捕获**零拷贝但有悬空风险(短生命周期 lambda 推荐,同步使用)
- **原则**:lambda 比被捕获变量活得久 → 值捕获;同步立即用 → 引用捕获

**Q3: mutable 关键字为什么需要?**
lambda 的 `operator()` 默认是 `const`,值捕获的成员不能修改(因为是 const 成员函数里的成员)。`mutable` 去掉 const 限定,允许修改值捕获的**副本**(不影响外部)。

**Q4: 无捕获 lambda 为什么能转函数指针?**
**C++ 标准规定**。无捕获的 lambda 没有状态(空类),等价于一个普通函数,类型可隐式转换到对应签名的函数指针。**有捕获的不行**——它有状态(成员变量),需要对象承载。

**Q5: lambda 什么时候不该用?**
- 函数体超过 5-10 行(可读性差)
- 需要多处复用同一逻辑(应定义普通函数)
- 需要递归(lambda 不能直接递归,需要 `std::function` 包装)

## 九、相关扩展

- [C++11 新特性](/notes/c++11-新特性.html) — lambda 是 C++11 核心特性
- [完美转发](/notes/完美转发.html) — lambda 配合 `std::function` 可实现通用包装
- [封装](/notes/封装.html) — lambda 内的状态是天然封装