---
title: 重载 vs 重写
---

# C++ 重载 vs 重写

## 核心结论

**重载(Overload)**:同一作用域,函数名相同,**参数列表不同**——编译器**编译期**根据参数类型决定调哪个(静态多态)。**重写(Override)**:继承关系,父类虚函数被子类重新实现——**运行期**通过 vtable 决定调哪个版本(动态多态)。**核心区别**:一个在编译期决定,一个在运行期决定。

| 维度 | 重载(Overload) | 重写(Override) |
|------|---------------|---------------|
| 发生位置 | 同一作用域 | 父子类之间 |
| 函数名 | 相同 | 相同 |
| 参数列表 | **必须不同** | **必须相同** |
| 决策时机 | **编译期**(静态绑定) | **运行期**(动态绑定) |
| 多态类型 | 编译期多态 | 运行时多态 |
| 是否需要 virtual | 否 | 是(父类必须 virtual) |
| 关键字 | 无 | `override`(防御) |

## 一、重载(Overload):编译期多态

### 重载条件

```cpp
class Widget {
public:
    void f(int x);           // #1
    void f(double x);        // #2 参数类型不同
    void f(int x, int y);    // #3 参数个数不同
    void f(int y, double x); // #4 参数顺序不同(与 #3 不同)
    // void f(int y);  // ✗ 重复声明(只是参数名不同,类型相同)
};
```

**重载条件**(任一):
- 参数**类型**不同
- 参数**个数**不同
- 参数**顺序**不同

### 不能仅靠返回值区分

```cpp
int  f(int x);
double f(int x);  // 错误!仅返回值不同,不算重载

f(42);  // 编译错误:无法判断调哪个(返回值未使用,看不到)
```

**原因**:调用 `f(42)` 时,编译器能看到参数 `int`,但看不到你要把返回值赋给什么类型变量(甚至可能不用返回值)——无法选函数。

### 重载解析过程

```cpp
void f(int);
void f(double);
void f(long);

f(42L);  // long,精确匹配?没有。走隐式转换:long → int,long → double,选最佳
```

**规则**:精确匹配 > 提升(`char` → `int`) > 标准转换(`int` → `double`) > 用户定义转换。最佳匹配胜出。

## 二、重写(Override):运行期多态

### 重写三前提

```cpp
class Base {
public:
    virtual void f(int x) const;  // 前提 1:virtual
};
class Derived : public Base {
public:
    void f(int x) const override;  // 前提 2:函数名/参数/const 完全一致
                                    // 前提 3:有继承关系
};
```

### virtual 与 override 各自的作用

```cpp
// 父类:不加 virtual 就不是重写
class Base {
public:
    void f();  // 不是 virtual → 子类同名函数是"隐藏"不是"重写"
};
class Derived : public Base {
public:
    void f() override;  // override 编译检查,不是重写(因为父类没 virtual)
    //                  错误:父类 f 不是 virtual
};

// 子类:override 是防御性编程
class Derived2 : public Base {
public:
    void f() const override;  // 错误!拼写错(const)→ 编译期报错
    //                      override 检查签名匹配
};
```

| 关键字 | 位置 | 作用 |
|--------|------|------|
| `virtual` | 父类函数声明 | 告诉编译器"可能被重写,走 vtable" |
| `override` | 子类函数声明 | 告诉编译器"我重写父类虚函数,请检查签名" |

### 不加 override 的风险

```cpp
class Base { public: virtual void f(int x); };
class Derived : public Base {
    void f(double x);  // 错误!本想重写,参数错了 → 实际是新的 f(double)
    // 编译期不报错(没 override 关键字检查)
    // 运行期:Base* p = new Derived; p->f(42); → 调 Base::f(42)(不是 Derived::f(double)!)
    // 多态静默失效
};
```

**`override` 是防御性编程**——加了就强制编译器检查签名匹配,避免静默 bug。

## 三、不加 virtual 的"伪重写":隐藏(Hiding)

```cpp
class Base {
public:
    void f(int x);  // 没 virtual
};
class Derived : public Base {
public:
    void f(double x);  // 不是重写,是"隐藏"父类 f
};

Derived d;
d.f(42);    // OK,调 Derived::f(double)
d.f(42L);   // OK,调 Derived::f(double)(long → double)
d.f(42.0);  // OK,调 Derived::f(double)

Base* p = &d;
p->f(42);   // 调 Base::f(int)(不是 Derived::f(double))
// 父类 f 被隐藏,通过父类指针只能看到父类版本
```

**关键**:没有 `virtual`,子类同名函数不会触发多态,通过父类指针只能调到父类版本。

## 四、协变返回类型(特殊情况)

```cpp
class Base {
public:
    virtual Base* clone() const { return new Base(*this); }
};
class Derived : public Base {
public:
    Derived* clone() const override {  // 协变:返回 Derived*(Base 的子类)
        return new Derived(*this);
    }
};
```

**规则**:返回值可以是**基类虚函数返回类型的派生类**。这是 C++ 对返回类型的唯一"放宽"。

## 五、重载与重写能同时存在吗

**能**,两者是正交概念:

```cpp
class Base {
public:
    virtual void f(int x);     // 虚函数,待重写
};
class Derived : public Base {
public:
    void f(int x) override;    // 重写基类 f(int)
    void f(double x);          // 重载:增加 f(double) 成员
};
```

`f(int)` 是重写,`f(double)` 是新增加的重载——同一类内多态与重载并存。

## 六、C++ 的"第三种"同名:名字隐藏(Name Hiding)

```cpp
class Base {
public:
    void f(int);
    void f(double);
};
class Derived : public Base {
public:
    void f(int);  // 隐藏 Base 的所有 f(即使参数不同)
};

Derived d;
d.f(42);    // OK,Derived::f(int)
d.f(3.14);  // 错误!Base::f(double) 被隐藏,看不到
```

**规则**:**子类定义同名函数(不管参数),所有父类同名函数都被隐藏**。要访问父类版本,显式 `using Base::f;` 或 `Base::f(...)`。

## 七、面试高频追问

**Q1: 重载能靠返回值区分吗?**
**不能**。C++ 标准规定重载只看参数列表,不看返回值。原因:调用 `func(42)` 时,编译器看不到你要把返回值赋给什么类型,无法选函数。**返回值**只是函数"出口",不参与调用决策。

**Q2: 重写的返回值必须完全一样吗?**
**99% 情况必须一样**,但有一个例外:**协变返回类型**(covariant return type)——如果父类虚函数返回 `Base*`,子类重写时可以返回 `Derived*`(Derived 是 Base 的子类)。指针/引用类型才允许协变。

**Q3: 不加 `virtual` 子类同名函数会怎样?**
**不是重写,是"隐藏"**。通过父类指针调用时**永远调父类版本**——多态静默失效。这是面试最常踩的坑,99% 的"多态失效" bug 都来自这里。**修复**:
1. 父类加 `virtual`(推荐)
2. 不用多态,改成 `static` 调用
3. 重构代码避免这种情况

**Q4: `override` 关键字到底有什么用?**
**编译期检查签名匹配**。告诉编译器"我打算重写父类的虚函数",编译器检查函数名/参数/const/返回值是否完全匹配。不匹配**编译错误**。**防御性编程**——避免拼写错误、参数错的"伪重写"bug。

**Q5: 重载和重写能同时存在吗?**
**能**。一个类可以既有从父类继承的虚函数(被自己重写),又有自己的同名重载。两者正交,不冲突。例如:Derived 重写 `f(int)`,同时也定义 `f(double)`——前者和父类 Base 的 `f(int)` 形成重写,后者是 Derived 内的新重载。

## 八、相关扩展

- [虚函数实现机制](./虚函数实现机制.md) — 重写的运行机制(vtable)
- [封装](./封装.md) — 重载的访问控制
- [继承](./继承.md) — 重写的继承体系
- [多态](./多态.md) — 重写实现运行时多态
