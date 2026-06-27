---
title: C++ 单例模式
type: wiki
stage: compiled
entity_type: pattern
tags:
  - cpp
  - 设计模式
  - 单例
  - 线程安全
  - Magic Static
source: "[raw/2026-06-22_singleton-pattern.md](./raw/2026-06-22_singleton-pattern.md.md)"
source_hash: 80f441904c89aef5e516a8f6c0f0fad0a60050a1cc33e7ca6ea15413211b8f8b
compiled: 2026-06-22
---

# C++ 单例模式

## 核心结论

单例模式确保**类只有一个实例 + 提供全局访问点**。核心手段:构造函数私有化 + 删除拷贝/赋值 + 静态方法返回唯一实例。**现代 C++ 推荐 Magic Static**:

```cpp
class Singleton {
    Singleton() = default;
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
public:
    static Singleton& getInstance() {
        static Singleton inst;  // C++11 保证线程安全
        return inst;
    }
};
```

C++11 标准保证局部 static 变量初始化是**线程安全**的(编译器负责加锁),代码最简洁,自动析构,没有任何坑。

## 四种实现的演进逻辑

| 实现 | 时机 | 线程安全 | 代码复杂度 | 推荐度 |
|------|------|---------|-----------|--------|
| 饿汉式 | 程序启动 | ✅(天然) | 简单 | ⭐⭐(资源浪费) |
| 懒汉式 | 首次调用 | ❌ | 简单 | ⭐(不线程安全) |
| 双检锁 | 首次调用 | ✅(需 C++11 atomic) | 复杂 | ⭐⭐(易写错) |
| **Magic Static** | 首次调用 | ✅(标准保证) | **极简** | ⭐⭐⭐⭐⭐ |

### 饿汉式

程序启动时创建实例(静态成员变量在 main 之前初始化)。天然线程安全,但:

- 单例很重且可能用不到 → **浪费资源**
- 多个饿汉式单例之间的初始化顺序不确定(static initialization order fiasco)

```cpp
class Singleton {
    static Singleton instance_;  // main 之前初始化
public:
    static Singleton& getInstance() { return instance_; }
};
Singleton Singleton::instance_;
```

### 懒汉式

第一次调用 `getInstance()` 时才创建。解决了资源浪费,但:

- 多线程下两个线程同时判断 `instance == nullptr` 会创建两个实例
- **线程不安全**

```cpp
Singleton* getInstance() {
    if (!instance_) {           // 线程 A 和 B 同时到达这里
        instance_ = new Singleton();  // 创建两个实例!
    }
    return instance_;
}
```

### 双检锁(DCLP)

在懒汉式基础上加锁。第一次检查避免每次都加锁(性能),加锁后第二次检查避免重复创建。

**C++11 之前的 bug**:`instance = new Singleton()` 实际上分三步——分配内存、调用构造函数、赋值指针。编译器/CPU 可能重排为:分配内存→赋值指针→调用构造函数。这时另一个线程看到 `instance != nullptr` 就直接返回,但对象还没构造完——**未定义行为**。

C++11 之后需要配合 `std::atomic` 或 `std::call_once`:

```cpp
std::atomic<Singleton*> instance_;
std::mutex mtx_;

Singleton* getInstance() {
    if (!instance_.load(std::memory_order_acquire)) {  // 第一次检查(无锁)
        std::lock_guard<std::mutex> lock(mtx_);
        if (!instance_.load(std::memory_order_relaxed)) {  // 第二次检查(加锁)
            instance_.store(new Singleton(), std::memory_order_release);
        }
    }
    return instance_.load(std::memory_order_acquire);
}
```

代码很复杂,**不如直接用 Magic Static**。

### Magic Static(C++11 推荐)

```cpp
static Singleton& getInstance() {
    static Singleton inst;  // C++11 线程安全 + 自动析构
    return inst;
}
```

**为什么是线程安全的**:C++11 标准规定"如果多个线程同时初始化同一个 static 变量,只有一个线程会执行初始化,其他线程阻塞等待",编译器用 **double-checked locking pattern** 内部实现。

**为什么代码简洁**:没有手动锁、没有指针、没有内存泄漏(程序结束时自动析构)。

**唯一的"缺点"**:不能控制销毁顺序。但绝大多数场景不需要。

## 单例模式的缺点

单例本质是**全局状态**,会导致:

1. **单元测试困难**:全局状态难隔离,测试之间相互影响
2. **隐藏依赖关系**:调用方看不出依赖了单例
3. **违反单一职责**:既管业务又管自己的生命周期

如果可以用**依赖注入**替代,优先不用单例。真正适合的场景:

- 日志器
- 配置管理器
- 线程池
- 连接池
- 缓存管理器

这些天然是**全局唯一且生命周期贯穿整个程序**的。

## 饿汉式的初始化顺序问题

如果单例 A 的构造函数里用到了单例 B,而 B 还没初始化(不同编译单元的 static 变量初始化顺序未定义),就会崩溃。

```cpp
// FileA.cpp
SingletonA SingletonA::instance_;  // 构造里调用 B::getInstance()
```

```cpp
// FileB.cpp
SingletonB SingletonB::instance_;  // 可能先也可能后初始化
```

**Magic Static 天然避免这个问题**——谁先被调用谁先初始化,顺序由调用链决定。

## 单例的正确销毁

| 实现方式 | 销毁机制 |
|---------|---------|
| Magic Static | **程序结束时自动析构** |
| 指针式(饿汉/懒汉/双检锁) | 需要额外机制(`atexit` 注册回调),否则内存泄漏 |

这是推荐 Magic Static 的另一个原因。

## 替代方案:依赖注入

```cpp
// 不用单例:通过构造函数注入
class Service {
    Logger& logger_;
    Config& config_;
public:
    Service(Logger& l, Config& c) : logger_(l), config_(c) {}
    // ...
};

// 容器/测试代码决定怎么传入 logger 和 config
```

好处:

- 测试时可以注入 mock 对象
- 依赖关系明确
- 可以有多个 logger/config 实例

## 面试高频追问

**Q1: 单例模式怎么防止反射 / 序列化攻击?**
C++ 没有反射机制(目前),序列化攻击也罕见。如果确实需要防御:

- 用 `std::call_once` 替代手动 lock
- 把构造函数包在 `private` 嵌套类中,外部无法直接构造
- 用 `final` 修饰单例类,防止有人继承并增加成员

**Q2: 单例和 namespace 函数的区别?**
- 单例:有状态(成员变量),有生命周期(构造/析构)
- namespace 函数:无状态,纯函数式

如果只需要一组函数,用 `namespace`。如果需要维护状态(连接池、配置),用单例。

**Q3: 单例继承怎么实现?**
不推荐(违反单一职责),但技术上可以:

```cpp
class Base { /* 私有构造 */ protected: Base() = default; };
class Derived : public Base { /* ... */ };
Derived& getInstance() { static Derived inst; return inst; }
```

**Q4: 多线程下 Magic Static 真的安全吗?**
**C++11 之后安全**。标准规定函数局部 static 的初始化是线程安全的,编译器内部用 DCLP + 内存屏障实现。**C++11 之前不安全**(只是函数内 static,没有同步保证)。

## 相关扩展

- [智能指针的线程安全](./智能指针的线程安全.md) - 共享状态的同步
- [自旋锁 vs 互斥锁](./自旋锁-vs-互斥锁.md) - DCLP 用的互斥锁
- [多线程与锁](./多线程与锁.md) - 锁的细节
- [C++ 单例模式](./c++-单例模式.md) - 单例/工厂/观察者等
- [C++11 新特性](./c++11-新特性.md) - Magic Static 是 C++11 引入
- [C++ 学习路线(2026)](./c++-学习路线2026.md) - 私有构造是封装的应用
