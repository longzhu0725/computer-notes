# C++ this 指针

## 核心结论

`this` 不是神秘机制,就是**编译器隐式传给每个非静态成员函数的第一个参数**,类型是 `T* const`。`obj.func(x)` 编译后等价于 `func(&obj, x)`。x86 thiscall 用 `ecx` 寄存器传 `this`,不占栈空间。**静态成员函数没有 this**——它属于类而不属于任何对象,无法"指向当前对象"。

| 上下文 | this 类型 | 含义 |
|--------|----------|------|
| 普通成员函数 | `T* const` | 可改成员,不能改 this 指向 |
| const 成员函数 | `const T* const` | 都不能改 |
| mutable 成员 | 通过 `T* const` 仍可改 | 突破 const 限制 |
| 静态成员函数 | **不存在** | 不绑定任何对象 |
| 构造函数 | `T* const`(构造中) | vptr 指向当前正在构造的类 |

## 一、this 的本质:隐藏的第一个参数

### 编译器的转换

```cpp
class Widget {
    int x_;
public:
    void set(int v) { x_ = v; }
};

Widget w;
w.set(42);

// 编译器内部翻译为:
void Widget_set(Widget* this, int v) {  // 多一个 this 参数
    this->x_ = v;
}
Widget_set(&w, 42);  // 显式传 &w 作为第一个实参
```

**这意味着**:
- `this` **不存**在对象里(对象里只有成员变量)
- `this` **不存**在任何运行时结构里(就是函数参数)
- `this` 走调用约定(寄存器或栈)

### 类比 C 函数

```cpp
// 原始 C 写法
struct Widget { int x; };
void Widget_set(Widget* self, int v) { self->x = v; }
Widget_set(&w, 42);

// C++ "成员函数" 就是这种全局函数 + 隐式 this 的语法糖
```

## 二、this 的类型

### 普通成员函数

```cpp
class T {
    int x_;
public:
    void f() {
        // this 类型: T* const
        // 1. 指针本身是 const(不能让 this 指向别的对象)
        // 2. 指向的对象不是 const(可以修改 x_)
        this->x_ = 42;  // OK
        this = nullptr; // 错误!this 本身是 const
    }
};
```

### const 成员函数

```cpp
class T {
    int x_;
public:
    void f() const {
        // this 类型: const T* const
        // 1. 指针本身是 const
        // 2. 指向的对象是 const
        this->x_ = 42;  // 错误!x_ 是 const
        // 唯一例外:mutable 成员可改
    }
};
```

### mutable 突破 const

```cpp
class Cache {
    mutable std::map<int, int> cache_;  // 即使在 const 函数里也能改
public:
    int get(int k) const {
        cache_[k] = 42;  // OK,mutable
        return cache_[k];
    }
};
```

**mutable 的合理用法**:缓存、互斥锁、访问计数等不影响对象"逻辑状态"的内部数据。

## 三、this 的存储位置

### 调用约定

| 平台/约定 | this 传参方式 |
|----------|------------|
| x86 MSVC thiscall | `ecx` 寄存器 |
| x86 Itanium C++ ABI(其他) | 寄存器或栈(平台相关) |
| x64 | 寄存器(`rcx`) |
| ARM AAPCS | 寄存器(`r0`) |
| 优化器需要更多寄存器 | 溢出到栈 |

**要点**:
- this **通常在寄存器里**(x86/x64/ARM 主流约定)
- 函数内部需要取 this 的地址时(罕见),编译器溢出到栈
- 零额外开销(本来就是函数参数)

## 四、静态成员函数为什么没有 this

```cpp
class T {
    int x_;
public:
    static void f() {
        x_ = 42;  // 错误!没有 this,无法定位 x_
    }
};
T::f();  // 不需要对象
```

**根因**:静态函数属于类,不属于对象。调用 `T::f()` 时,编译器没有对象地址可传,也就没有 this。

**推论**:
- 静态函数**不能**访问非静态成员(无 this)
- 静态函数**不能**是 const、volatile、virtual(无 this 谈不到修饰)
- 静态函数**不能**调用非静态成员函数(没 this)

## 五、`return *this` 与链式调用

### 原理

```cpp
class Builder {
    int val_;
public:
    Builder& set(int v) { val_ = v; return *this; }
};

Builder b;
b.set(1).set(2).set(3);  // 链式调用
// 每次返回 b 的引用,可以继续调
```

### 底层

```cpp
b.set(1);  // Builder_set(&b, 1) → *this = b → return Builder&
// .set(2)  ← 在返回的引用上继续调
```

`return *this` 返回**当前对象的引用**,类型是 `T&`,可以接着调它的方法。

## 六、this 能为 nullptr 吗

### 语法上能构造,行为是 UB

```cpp
class T {
public:
    void f() {
        // 没访问任何成员
        std::cout << "hello\n";
    }
};

((T*)nullptr)->f();
// 语法上合法
// 实际行为:
//   - 某些平台可能不崩(f 不访问成员,this 无用)
//   - 但如果 f 访问任何成员 → 段错误
//   - 标准说这是 UB,不能依赖
```

**警告**:**永远不要在生产代码中故意传 nullptr 给成员函数**。即使不崩,也是 UB。

## 七、this 与智能指针

### 错误的做法

```cpp
class Widget : public std::enable_shared_from_this<Widget> {
public:
    std::shared_ptr<Widget> getptr() {
        return std::shared_ptr<Widget>(this);  // 错误!
        // 创建独立的引用计数 → 双重释放
    }
};
```

`this` 是裸指针,不管理生命周期。用 `shared_ptr<T>(this)` 创建的是**独立**的引用计数,和外部管理该对象的 `shared_ptr` 不互通——析构时 double free。

### 正确做法

```cpp
class Widget : public std::enable_shared_from_this<Widget> {
public:
    std::shared_ptr<Widget> getptr() {
        return shared_from_this();  // 与外部共享同一引用计数
    }
};
// 前提:Widget 必须已经被 shared_ptr 管理
// (否则 shared_from_this 抛 std::bad_weak_ptr)
```

## 八、构造中的 this:不能调虚函数

```cpp
class Base {
public:
    Base() { init(); }  // 调虚函数
    virtual void init() { std::cout << "Base::init\n"; }
};
class Derived : public Base {
public:
    Derived() {}  // 此时 Base 构造体已执行完
    void init() override { std::cout << "Derived::init\n"; }
};

Derived d;  // 输出 "Base::init",不是 "Derived::init"
```

**根因**:
- 构造 `Derived` 时,先构造 `Base`,此时 vptr 指向 `Base` vtable
- `Base()` 体内的 `init()` 调的是 `Base::init`(查 vtable 找到的就是 `Base` 版本)
- 构造完 `Base` 成员后,vptr 才切换到 `Derived` vtable
- 然后才构造 `Derived` 部分

**两阶段初始化原则**:构造函数只做成员初始化,业务逻辑放在显式 `init()` 中,初始化时 vptr 已就绪,可正常多态。

## 九、面试高频追问

**Q1: this 是什么?存在哪里?**
- this 是**编译器隐式传给非静态成员函数的第一个参数**,类型 `T* const`
- 存在哪取决于调用约定:x86 MSVC 用 `ecx`,x64 用 `rcx`,ARM 用 `r0`——**通常在寄存器里**,零开销
- `this` **不**存放在对象里(对象里只有成员变量)

**Q2: 静态成员函数为什么没有 this?**
静态函数属于类不绑定任何对象,调用 `T::f()` 没有对象地址可传。没有 this 就无法访问非静态成员(没有 this → 不知道 x_ 在哪)。**推论**:静态函数不能访问非静态成员、不能是 virtual/const/volatile。

**Q3: `return *this` 是什么?**
解引用 this 得到当前对象本身(类型 `T&`),返回它就是返回对象的引用。**链式调用** `obj.set(1).set(2).set(3)` 靠每个方法 `return *this` 实现——每次返回的都是同一个对象的引用,可以继续调它的方法。

**Q4: this 能为 nullptr 吗?**
**语法上可以构造**(`((T*)nullptr)->f()`),**行为是 UB**。如果 f 不访问任何成员,某些平台不崩,但纯属巧合。**任何通过空 this 访问成员的操作都会段错误**。**永远不要这么用**。

**Q5: 构造函数中能调虚函数吗?**
能调,但**不会多态**。构造时 vptr 指向当前正在构造的类,虚函数被静态绑定到当前类版本。构造 `Derived` 时调虚函数,实际执行的是 `Base` 的版本(因为 `Base` 正在构造,vptr 指向 `Base` 的 vtable)。**最佳实践**:构造函数内不调虚函数,用两阶段初始化。

## 十、相关扩展

- [封装](/notes/封装.html) — this 是 C++ 封装的关键机制
- [智能指针](/notes/智能指针.html) — `enable_shared_from_this` 用 this 安全获取 shared_ptr
- [构造函数](/notes/构造函数.html) — 构造期间 this 指向的对象"还不完整"
- [虚析构函数](/notes/虚析构函数.html) — 析构时 vptr 跟随析构进度切换