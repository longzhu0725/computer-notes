---
title: 虚函数 vs 纯虚函数
---

# 虚函数 vs 纯虚函数

## 核心结论

虚函数用 `virtual` 声明,**有默认实现**,派生类**可以选择性重写**,类**可以实例化**。纯虚函数在声明后加 `= 0`,**没有默认实现**,派生类**必须重写**,类**不能实例化**(成为抽象类)。

> 一句话:**虚函数**是"我有默认行为,你可以改";**纯虚函数**是"我只定规范,你必须自己实现"。

| 维度 | 虚函数 | 纯虚函数 |
|------|--------|---------|
| 声明 | `virtual void f() {}` | `virtual void f() = 0;` |
| 默认实现 | 有(基类函数体) | 无(`= 0` 只是声明) |
| 派生类是否必须重写 | 否(可不重写,继承基类实现) | 是(否则派生类也是抽象类) |
| 类能否实例化 | 能 | 不能(抽象类) |
| 设计意图 | 提供默认行为,允许定制 | 定义接口规范,强制实现 |
| 典型场景 | 大多数派生类行为相同,少数需定制 | 每个派生类行为都不同 |

## 虚函数:提供默认行为,允许覆盖

用 `virtual` 声明后,通过基类指针/引用调用时走动态绑定,运行时根据对象实际类型决定调哪个版本。派生类可以 override 也可以不 override,不 override 就用基类的默认实现。类本身可以正常实例化。

```cpp
class Animal {
public:
    virtual void speak() const { std::cout << "..." << std::endl; }  // 默认:沉默
};

class Dog : public Animal {
    // 不重写 speak,继承 Animal::speak,实例说话就是"..."
};
```

## 纯虚函数:定义接口,强制实现

声明时加 `= 0`,告诉编译器"这个函数没有默认实现,派生类必须自己写"。包含纯虚函数的类**自动变成抽象类**,不能直接 `new` 出来。设计意图是定义接口规范——基类只规定"要做什么",具体"怎么做"由派生类决定。

```cpp
class Shape {
public:
    virtual double area() const = 0;       // 纯虚:必须实现
    virtual void draw() const = 0;         // 纯虚:必须实现
};
// Shape s;  // 错误:cannot allocate object of abstract type

class Circle : public Shape {
    double r_;
public:
    Circle(double r) : r_(r) {}
    double area() const override { return 3.14159 * r_ * r_; }
    void draw() const override { /* 画圆 */ }
};
```

## 核心区别(展开)

### 声明语法

| 形式 | 含义 |
|------|------|
| `virtual void f();` | 普通虚函数(无默认实现,但允许不重写) |
| `virtual void f() {}` | 虚函数 + 默认实现 |
| `virtual void f() = 0;` | 纯虚函数(必须重写) |
| `void f() override;` | 派生类重写(非虚函数隐式变成虚函数) |
| `void f() final;` | 禁止派生类重写(编译期检查) |

### 设计意图

- **虚函数**:模板方法模式(Template Method)的钩子函数——基类定义算法骨架,某些步骤留给派生类定制
- **纯虚函数**:接口契约——Java 的 `interface` 在 C++ 中的对应物,只定义规范不提供实现

### 抽象类

```cpp
class AbstractBase {
public:
    virtual void f() = 0;        // 纯虚 → 抽象类
    virtual void g() {}          // 普通虚函数
    void h() {}                  // 普通成员函数
};

// 包含纯虚函数 → AbstractBase 是抽象类
// AbstractBase ab;  // 错误:不能实例化

// 派生类必须实现所有纯虚函数,否则也是抽象类
class Concrete : public AbstractBase {
public:
    void f() override {}  // 必须实现
};
Concrete c;  // OK,可以实例化
```

## 构造函数能不能是虚函数?

**不能**。虚函数调用依赖 vptr,而 vptr 是在构造函数里才被设置的。构造函数的工作是"把对象建出来",虚函数机制需要"对象已经存在",**顺序矛盾**。

但有几种"间接多态构造"方式:

- **工厂方法**:基类的静态方法返回基类指针,实际指向派生类对象
- **虚克隆**:`virtual Base* clone() const = 0;` 由派生类返回自己的拷贝
- **CRTP**:编译期多态,不需要 vtable

## 纯虚函数能不能有实现体?

**能**。语法上 `= 0` 只是说"派生类必须重写",不是说"基类不能提供实现"。基类可以在类外给纯虚函数写实现体,派生类通过 `Base::f()` 显式调用。

典型用途是提供一个"默认实现"让派生类选择性复用:

```cpp
class Base {
public:
    virtual void f() = 0;  // 纯虚
};
void Base::f() { std::cout << "default impl\n"; }  // 仍然可以有实现体

class D : public Base {
public:
    void f() override { Base::f(); /* 额外的派生类逻辑 */ }
};
```

这种用法很少见,只在需要为"罕见的派生类"提供默认实现时使用。

## override 和 final 的作用

| 关键字 | 作用 | 解决的痛点 |
|--------|------|----------|
| `override` | 告诉编译器"我确实在重写基类虚函数" | 写错函数签名(参数类型、常量性)导致**隐式隐藏**而非重写 |
| `final` | 告诉编译器"到此为止,不允许再重写" | 防止下游破坏设计契约 |
| `final`(类) | 禁止任何类继承 | 表达"这个类不应该被扩展"的设计意图 |

```cpp
class Base {
public:
    virtual void f() const = 0;
};

class Derived : public Base {
public:
    void f() override { /* OK */ }      // override 告诉编译器:我真的要重写
    // void f() { /* 错误:没有 override,但签名略变会变成隐式隐藏 */ }
};
```

## 什么时候该用纯虚函数?

**当基类只规定"要做什么"但不知道"怎么做"时**。例如:

- `Shape::draw()` —— 每个形状画法都不同,没有合理的默认实现 → **纯虚**
- `Shape::area()` —— 不同形状面积公式不同 → **纯虚**
- `Animal::speak()` —— 大部分动物会发声但有少数例外 → **普通虚 + 默认"..."**

**经验法则**:

- 派生类行为**大多数相同**只有少数不同 → 普通虚函数给默认实现
- 每个派生类行为**都不同**或**必须实现** → 纯虚函数

## 面试高频追问

**Q1: 析构函数为什么通常要 virtual?**
通过基类指针 `delete` 派生类对象时,如果基类析构函数非虚,只会调用基类析构,不会调用派生类析构,导致派生类部分资源泄漏。这是 C++ 的经典陷阱,**基类析构函数几乎总是应该 virtual**。

**Q2: 抽象基类的析构函数要不要实现?**
**要**。即使类不能实例化,析构函数仍会在派生类析构时被调用(从最派生类开始向上)。纯虚析构函数必须提供实现:

```cpp
class Abstract {
public:
    virtual ~Abstract() = 0;
};
Abstract::~Abstract() {}  // 必须有定义
```

**Q3: 普通成员函数可以 virtual 吗?**
可以。virtual 只要求是成员函数且有非 static 语义。static 成员函数不能 virtual(没有 this 指针)。

**Q4: 虚函数和 inline 冲突吗?**
不冲突,但 inline 会被忽略:

- 虚函数调用通过 vptr,通常是间接调用,编译器无法内联
- 如果编译器能通过**去虚拟化**确定具体类型(如 final 类),仍然可以内联

## 相关扩展

- [多态](./多态.md) - 虚函数是 C++ 多态的基石
- [虚函数实现机制](./虚函数实现机制.md) - vtable/vptr 内存布局
- [继承](./继承.md) - 虚函数在继承中的传递性
- [多重继承与菱形继承](./多重继承与菱形继承.md) - 多个虚函数表
- [如何禁止类被继承](./如何禁止类被继承.md) - final 关键字
- [C++11 新特性](./c++11-新特性.md) - override、final 的引入
