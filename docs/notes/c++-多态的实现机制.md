---
title: C++ 多态的实现机制
---

# C++ 多态的实现机制

## 核心结论

C++ 多态分两种:**编译时多态**靠函数重载和模板,编译期就确定调用谁;**运行时多态**靠 `virtual` 函数 + 继承 + 基类指针/引用,运行时通过 `vptr → vtable → 函数地址` 动态绑定到正确的实现。

| 维度 | 编译时多态 | 运行时多态 |
|------|----------|----------|
| 实现手段 | 函数重载、模板 | 虚函数 + 继承 |
| 绑定时机 | 编译期(静态绑定) | 运行期(动态绑定) |
| 关键机制 | 编译器根据参数类型/模板参数选择 | vptr → vtable → 函数地址 |
| 触发条件 | 直接调用即可 | 必须通过**基类指针或引用**调用 |
| 性能 | 无额外开销,可内联 | 多一次间接寻址,无法内联 |
| 典型场景 | `sort` 的比较函数、`max<T>` | 基类接口统一调度派生类行为 |

## 运行时多态的三个必要条件

1. 基类声明 `virtual` 函数
2. 派生类重写(`override`)该函数
3. 通过**基类指针或引用**调用

**三者缺一不可**——如果用派生类对象直接调用,编译器会静态绑定,不走 vtable。

## 虚函数调用的底层流程

以 `Animal* p = new Dog(); p->speak();` 为例:

```
Animal* p = new Dog();
       │
       ▼
   ┌────────┐
   │  ptr   │──────┐
   └────────┘      │
                   ▼
           ┌──────────────┐
           │  Dog 对象     │
           │ ┌──────────┐ │
           │ │ vptr ──────────────────┐
           │ ├──────────┤ │           │
           │ │ Dog 数据 │ │           │
           │ └──────────┘ │           │
           └──────────────┘           │
                                      ▼
                              ┌──────────────────┐
                              │ Dog::vtable      │
                              │ [0] Animal::~    │
                              │ [1] Animal::name │  → Dog::name
                              │ [2] Dog::speak ──────────► Dog::speak()
                              │ ...              │
                              └──────────────────┘

p->speak() 调用链:
  p ──► Dog 对象 ──► vptr ──► vtable ──► Dog::speak()  (动态绑定)
```

1. **编译器为每个含虚函数的类生成一张 vtable**,表中按声明顺序存放虚函数地址。Dog 的 vtable 中 `speak` 槽位存的是 `Dog::speak` 的地址
2. **每个对象的内存布局最前面藏一个 vptr**,构造时指向本类的 vtable
3. 调用 `p->speak()` 时:通过 p 找到 Dog 对象 → 取 vptr → 在 vtable 中查 `speak` 的偏移 → 跳转执行 `Dog::speak()`

这就是为什么**基类析构函数必须声明为 `virtual`**——否则 `delete p` 时只调基类析构,派生类资源泄漏。

## 编译时多态 vs 运行时多态

### 编译时多态

| 形式 | 示例 |
|------|------|
| 函数重载 | `void f(int); void f(double);` |
| 模板 | `template<typename T> void f(T);` |
| 运算符重载 | `operator+` |
| SFINAE | 类型萃取 |

```cpp
template <typename T>
T max(T a, T b) { return a > b ? a : b; }

max(3, 5);        // 实例化为 max<int>
max(3.0, 5.0);    // 实例化为 max<double>
```

**优点**:零开销,可内联,编译期就确定。
**缺点**:增加编译时间,代码体积可能膨胀。

### 运行时多态

```cpp
class Animal { public: virtual void speak() const = 0; };
class Dog : public Animal { public: void speak() const override { /* 汪 */ } };
class Cat : public Animal { public: void speak() const override { /* 喵 */ } };

void perform(Animal* a) { a->speak(); }  // 运行时决定调哪个

perform(new Dog());  // 汪
perform(new Cat());  // 喵
```

**优点**:运行时决定,灵活。
**缺点**:多一次间接寻址,无法内联。

## 抽象类和纯虚函数的关系

含有**纯虚函数**(`virtual void run() = 0;`)的类就是**抽象类**,不能实例化,只能被继承。派生类必须实现所有纯虚函数才能实例化,相当于强制定义接口规范。

```cpp
class Shape {
public:
    virtual double area() const = 0;  // 纯虚
    virtual void draw() const = 0;    // 纯虚
};
// Shape s;  // 错误:抽象类不能实例化
class Circle : public Shape {
public:
    double area() const override { /* ... */ }
    void draw() const override { /* ... */ }
};
Circle c;  // OK,实现了所有纯虚函数
```

## override 和 final

| 关键字 | 作用 | 解决的问题 |
|--------|------|----------|
| `override` | 告诉编译器"我确实在重写基类虚函数" | 写错函数签名会直接报错,防止"以为重写了其实没有"的 bug |
| `final`(函数) | 禁止派生类继续重写某个虚函数 | 防止下游破坏设计契约 |
| `final`(类) | 禁止某个类被继承 | 表达"这个类不应该被扩展"的设计意图 |

## 虚函数调用比普通函数慢多少?

**多一次指针间接寻址**(取 vptr + 查 vtable),在现代 CPU 上通常只差几纳秒。**真正的性能损失不在寻址本身,而在于虚函数调用无法被内联优化**。

热路径上如果频繁调用小虚函数,可以考虑 **CRTP(编译期多态)**替代:

```cpp
// 运行时多态
class Animal { public: virtual void speak() const = 0; };
class Dog : public Animal { public: void speak() const override { /* ... */ } };

// CRTP(编译期多态,零开销)
template <typename Derived>
class Animal_CRTP {
public:
    void perform() const { static_cast<const Derived*>(this)->speak_impl(); }
};
class Dog_CRTP : public Animal_CRTP<Dog_CRTP> {
public:
    void speak_impl() const { /* ... */ }
};
```

**CRTP 的代价**:派生类不能是基类的兄弟类的兄弟类(没有运行时多态性)。

## 构造函数里能调虚函数吗?

**能调,但不会多态**。构造函数执行时 vptr 指向的是**当前正在构造的类**的 vtable,不是最终派生类的。

```cpp
class Base {
public:
    Base() { speak(); }                // 调 Base::speak,不是 Derived::speak
    virtual void speak() const { std::cout << "Base\n"; }
};
class Derived : public Base {
public:
    void speak() const override { std::cout << "Derived\n"; }
};
Derived d;  // 输出 "Base",不是 "Derived"
```

**原因**:构造函数执行时对象还没完全构造好,派生类的部分可能还没初始化。多态调用派生类的方法可能使用未初始化的成员,会**引发未定义行为**。

## 析构函数里能调虚函数吗?

**能调,但同样不会多态**。析构函数执行时,派生类的部分已经析构完了。

```cpp
class Base {
public:
    virtual ~Base() { speak(); }       // 调 Base::speak
    virtual void speak() const { std::cout << "Base\n"; }
};
class Derived : public Base {
public:
    void speak() const override { std::cout << "Derived\n"; }
    ~Derived() { /* 派生类析构 */ }
};
Derived d;  // 删除时输出 "Base",不是 "Derived"
```

**析构顺序**(自下而上):先调 `~Derived()`,然后调 `~Base()`。在 `~Base()` 中,对象的类型已经退化为 Base,虚函数调用绑定到 Base 版本。

## 虚函数的性能开销

| 操作 | 普通函数 | 虚函数 |
|------|---------|--------|
| 一次调用 | 1-2 ns | 3-5 ns |
| 100 万次调用 | 1-2 ms | 3-5 ms |
| 可内联 | ✅ | ❌(多态时) |
| 可被编译器优化 | 大量 | 受限 |

**经验阈值**:

- 每次调用 < 100ns 的热路径:虚函数开销可忽略
- 每次调用 < 10ns 的极致热路径:考虑 CRTP 或去虚拟化
- I/O 密集型:虚函数开销完全可忽略

## 面试高频追问

**Q1: 静态函数能 virtual 吗?**
**不能**。虚函数需要 this 指针支持动态绑定,静态函数没有 this 指针。

**Q2: 内联函数能 virtual 吗?**
**可以**,但通常**不会真的内联**。如果多态调用,内联失效;如果编译器能确定类型(如 `this` 是当前类),可能内联。

**Q3: 模板函数能 virtual 吗?**
**不能**。虚函数表是按类组织的,模板是按实例化组织,两者机制不兼容。

**Q4: 构造函数能不能 virtual?**
**不能**(前面已解释)。用工厂方法或虚克隆模式实现"虚构造"。

**Q5: 多态调用 vs 函数指针调用哪个快?**
**虚函数调用更快**(编译器可以做去虚拟化优化,识别 final 类后转直接调用)。函数指针是间接调用,编译器几乎无法优化。

## 相关扩展

- [多态](./多态.md) - 多态的基本概念
- [虚函数实现机制](./虚函数实现机制.md) - vtable/vptr 内存布局
- [虚函数 vs 纯虚函数](./虚函数-vs-纯虚函数.md) - 接口设计
- [多重继承与菱形继承](./多重继承与菱形继承.md) - 多重继承的虚函数表
- [如何禁止类被继承](./如何禁止类被继承.md) - final 关键字
- [重载 vs 重写](./重载-vs-重写.md) - 编译期多态
