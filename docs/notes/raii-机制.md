# RAII 机制

## 核心结论

RAII(Resource Acquisition Is Initialization)不是语法特性,而是 C++ 资源管理的**核心设计哲学**:把资源的生命周期绑定到对象的生命周期——构造函数获取资源,析构函数释放资源。由于 C++ 保证栈上对象离开作用域时析构函数一定被调用(即使发生异常),资源就不可能泄漏。[智能指针](/notes/智能指针.html)和 `lock_guard` 都是 RAII 的标准库实现。

| 资源类型 | RAII 包装 | 释放时机 |
|---------|-----------|---------|
| 堆内存 | `unique_ptr` / `shared_ptr` | 析构时 `delete` |
| 互斥锁 | `lock_guard` / `unique_lock` | 析构时 `unlock` |
| 文件句柄 | `fstream` / 自定义 | 析构时 `close` |
| 事务 | `transaction_guard` | 析构时 commit/rollback |
| 数据库连接 | 自定义连接池对象 | 析构时归还 |

## 为什么 RAII 能保证资源不泄漏

关键在于 C++ 的**确定性析构**:栈上对象离开作用域时,编译器保证调用析构函数,无论是正常执行完毕还是[异常](/notes/异常处理机制.html)导致的栈展开。这和 Java/Go 的 GC 不同——GC 只管内存,不管文件句柄、锁、网络连接等非内存资源;而且 GC 的回收时机不确定,无法保证"离开作用域立即释放"。

RAII 把"何时释放"的决策从程序员手里拿走,交给编译器和作用域规则。程序员只需要保证:

1. 构造时获取
2. 析构时释放
3. 禁止拷贝或正确转移所有权

## 手动管理 vs RAII

```cpp
// 手动管理:5 个泄漏风险点
void risky() {
    auto* p = new int[100];
    if (cond1) return;       // 泄漏 1
    try {
        do_something();
        if (cond2) throw 1;
    } catch (...) {
        delete[] p;          // 记得释放...
        throw;
    }
    delete[] p;              // 又记得释放...
}

// RAII:0 个泄漏风险点
void safe() {
    auto p = std::make_unique<int[]>(100);
    if (cond1) return;       // 自动释放
    do_something();          // 异常也自动释放
}
```

手动管理的问题:如果获取和释放之间有任何提前 return、异常抛出、或者逻辑分支遗漏,资源就泄漏。RAII 把释放逻辑封装在析构函数里,无论中间发生什么,只要对象在栈上,析构就一定执行。

## 标准库中的 RAII 实践

| 资源 | RAII 类 | 所有权模型 |
|------|---------|-----------|
| 独占堆内存 | `unique_ptr` | 独占,可移动 |
| 共享堆内存 | `shared_ptr` | 引用计数 |
| 互斥锁 | `lock_guard` / `unique_lock` | 独占(作用域锁) |
| 文件 | `fstream` | 独占 |
| 线程 | `jthread` (C++20) | join-on-destruction |

`unique_ptr` 管理独占所有权的堆内存,离开作用域自动 `delete`。`shared_ptr` 通过引用计数管理共享所有权,最后一个 `shared_ptr` 析构时释放资源。`lock_guard` 构造时加锁、析构时解锁,保证互斥锁不会因为异常而忘记释放。

## RAII 类的设计要点

### 独占资源:禁拷贝,允移动

```cpp
class FileHandle {
    FILE* fp_;
public:
    explicit FileHandle(const char* path) : fp_(std::fopen(path, "r")) {
        if (!fp_) throw std::runtime_error("open failed");
    }
    ~FileHandle() noexcept { if (fp_) std::fclose(fp_); }
    // 禁拷贝
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;
    // 允移动(转移所有权)
    FileHandle(FileHandle&& other) noexcept : fp_(other.fp_) { other.fp_ = nullptr; }
    FileHandle& operator=(FileHandle&& other) noexcept {
        if (this != &other) {
            if (fp_) std::fclose(fp_);
            fp_ = other.fp_;
            other.fp_ = nullptr;
        }
        return *this;
    }
};
```

### 共享资源:引用计数

参考 `shared_ptr` 实现:用控制块保存引用计数,拷贝 +1,析构 -1,降到 0 时释放资源。

### 析构函数不抛异常

析构中释放资源失败,只能记日志,不能抛,否则栈展开时会 `terminate`。

## 构造函数抛异常的 RAII 行为

如果构造函数抛异常,对象没有构造完成,析构函数不会被调用。但 C++ 保证:**已经构造完成的成员变量会被正确析构**。

```cpp
class ConnectionPool {
    std::unique_ptr<Socket> sock_;   // 成员1
    std::unique_ptr<ThreadPool> tp_; // 成员2
public:
    ConnectionPool() : sock_(new Socket), tp_(new ThreadPool) {
        // 如果 ThreadPool 构造抛异常,sock_ 会被自动析构
        // 前提是 sock_ 本身是 RAII 管理的(unique_ptr)
    }
};
```

这就是为什么推荐"**RAII 套 RAII**"的设计:成员用 RAII 类型,就能保证构造函数异常路径下不会泄漏。

## 堆上的 RAII 对象能用吗?

**不能**。`new` 出来的对象如果没有 `delete`,析构函数不会被调用。

```cpp
auto* p = new FileHandle("data.txt");  // 错误:析构可能不被调用
delete p;

auto h = std::make_unique<FileHandle>("data.txt");  // 正确:unique_ptr 在栈上
```

正确用法:把对象放在栈上,或者用智能指针管理堆上的对象——智能指针本身在栈上,它的析构会 `delete` 堆上的对象。裸 `new` 是 RAII 的天敌。

## RAII vs Go defer / Python with

| 特性 | RAII | Go `defer` | Python `with` |
|------|------|------------|---------------|
| 释放方式 | 隐式(析构自动调用) | 显式 defer | 显式 `__enter__`/`__exit__` |
| 是否需要写释放代码 | 否(写在析构里) | 是 | 是 |
| 异常处理 | 自动(栈展开) | 手动 | 自动(`__exit__` 接异常) |
| 所有权转移 | 支持(移动语义) | 不支持 | 不支持 |
| 跨函数传递 | 编译期检查 | 运行时检查 | 运行时检查 |

`defer` 和 `with` 是语法糖,需要程序员显式写释放逻辑。RAII 是**隐式**的——只要类设计正确,使用者完全不需要关心释放。

## 面试高频追问

**Q1: RAII 类怎么处理拷贝?**
看资源语义:
- 独占资源(文件句柄、锁)→ 禁止拷贝,允许移动
- 共享资源 → 引用计数(shared_ptr 模式)
- 值语义资源(字符串、容器) → 深拷贝

选错了会导致 double free 或者资源泄漏。

**Q2: RAII 的"获取"是构造时,那"释放"是析构时,那中间用 swap 行不行?**
可以。`std::swap` 对 RAII 类的实现要求是 noexcept + 高效——很多 RAII 类通过 swap 实现强异常安全保证(操作前 swap 到临时对象,异常则原状态保留)。

**Q3: RAII 和 finalizer / destructor 的区别?**
finalizer(Java `finalize`、Python `__del__`)由 GC 调用,时机不确定;RAII 的析构由编译器在作用域结束时调用,时机确定。这是 C++ 资源管理可靠性的根本来源。

## 相关扩展

- [智能指针](/notes/智能指针.html) - RAII 在堆内存管理上的三种实现
- [异常处理机制](/notes/异常处理机制.html) - RAII 解决异常路径下的资源泄漏
- [移动语义](/notes/移动语义.html) - RAII 的所有权转移机制
- [构造函数](/notes/构造函数.html) - 构造函数异常时的成员析构顺序
- [内存泄漏、野指针和内存越界](/notes/内存泄漏野指针和内存越界.html) - RAII 防止内存泄漏的具体实践