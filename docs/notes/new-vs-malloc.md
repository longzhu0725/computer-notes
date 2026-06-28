# C++ `new` vs `malloc`

## 核心结论

`new` 是 C++ 运算符,**做两件事**:调用 `operator new` 分配内存 + 调用构造函数。`malloc` 是 C 库函数,**只做一件事**:分配原始内存,不调构造函数。`new` 失败抛 `bad_alloc` 异常,`malloc` 失败返回 `NULL`。**现代 C++ 应优先用 `make_unique`/`make_shared`,几乎不用 `new`/`malloc`**。

| 维度 | `new` | `malloc` |
|------|-------|----------|
| 语言 | C++ 运算符 | C 标准库函数 |
| 做几件事 | 2 件(分配 + 构造) | 1 件(只分配) |
| 失败行为 | 抛 `std::bad_alloc` | 返回 `NULL` |
| 返回类型 | 具体类型 `T*` | `void*` 需强转 |
| 大小参数 | 编译器算 `sizeof(T)` | 手动 `sizeof(T)` |
| 构造/析构 | ✓ 自动调 | ✗ 不调 |
| 重载 | ✓ 类可以重载 `operator new` | ✗ 不能重载 |
| 类型安全 | ✓ | ✗ 需 cast |

## 一、`new` 到底做了什么

### 完整调用链路

```cpp
MyClass* p = new MyClass(10);

// 1. 编译器算出 sizeof(MyClass)
// 2. 调用 operator new(sizeof(MyClass))   ← 内部通常调 malloc
// 3. operator new 调 malloc(sizeof)       ← 申请原始内存
// 4. malloc 在空闲链表找块
// 5. 没找到 → mmap/brk 系统调用          ← 进内核
// 6. 返回指针
// 7. 在指针上调用 MyClass(int) 构造函数    ← 初始化对象
// 8. 返回 MyClass* 给 p
```

### `delete` 也是两步

```cpp
delete p;

// 1. 调用 p->~MyClass() 析构函数          ← 清理对象(关闭文件/释放成员)
// 2. 调用 operator delete(p)              ← 内部通常调 free
// 3. operator delete 调 free(p)           ← 释放内存
```

**关键**:`new`/`delete` 配对使用,平衡构造/析构 + 分配/释放两步。漏任何一步都是 bug。

## 二、`malloc` 只做分配

```cpp
MyClass* p = (MyClass*)malloc(sizeof(MyClass));
// 1. 申请 sizeof(MyClass) 字节
// 2. 返回 void*,强转为 MyClass*
// 3. 没有调任何构造函数!
// → p 内部的成员变量是垃圾值
// → p 的虚函数表指针(VTable pointer)未设置!
// → 调 p->virtualFunc() 是 UB
```

```cpp
free(p);
// 1. 只释放内存
// 2. 不调析构函数
// → 如果 MyClass 成员里有 string(分配了堆),string 的内存泄漏了
```

## 三、关键差异详解

### 1. 失败处理

```cpp
int* p1 = new int[1000000000000];  // 太大,内存不够
// 抛 std::bad_alloc 异常(可用 try-catch 捕获)

int* p2 = (int*)malloc(1000000000000ULL);
// 返回 NULL(必须检查)
if (p2 == nullptr) {
    // 处理错误
}

// nothrow 版本:不抛异常
int* p3 = new (std::nothrow) int[1000000000000];
if (p3 == nullptr) { /* 处理 */ }
```

### 2. `new[]` / `delete[]` 数组

```cpp
MyClass* arr = new MyClass[10];  // 分配 10 个 MyClass,都调构造函数
delete[] arr;                     // 析构 10 个,再释放
```

**`new[]` 的实现细节**:
```
┌─────────────────────────────┐
│ count = 10 (4 字节)         │ ← 头部记录元素个数
├─────────────────────────────┤
│ MyClass(0)                  │
├─────────────────────────────┤
│ MyClass(1)                  │
├─────────────────────────────┤
│ ...                         │
├─────────────────────────────┤
│ MyClass(9)                  │
└─────────────────────────────┘
```

`delete[]` 读 count = 10,循环调 10 次析构,再释放整块。**如果用 `delete` 代替,只析构 1 个,剩下 9 个的成员泄漏**(POD 类型不崩,资源管理类必崩)。

### 3. 重载自定义分配

```cpp
// 类可以重载 operator new,用自己内存池
class MyClass {
public:
    void* operator new(size_t n) {
        std::cout << "custom allocate\n";
        return ::operator new(n);  // 或从内存池分配
    }
    void operator delete(void* p) {
        std::cout << "custom free\n";
        ::operator delete(p);
    }
};

MyClass* p = new MyClass;  // 输出:custom allocate
delete p;                   // 输出:custom free
```

`malloc` 不能重载(库函数实现,不能改)。

### 4. 类型安全

```cpp
// new:类型安全
MyClass* p = new MyClass(10);  // 返回 MyClass*
p->method();                    // 直接调,无需强转

// malloc:void* 需强转
MyClass* p = (MyClass*)malloc(sizeof(MyClass));  // 必须强转
p->method();                                       // 危险:对象未构造
```

## 四、`placement new`(定位 new)

### 在指定地址上构造

```cpp
// 预分配内存
char buffer[sizeof(MyClass)];
MyClass* p = new (buffer) MyClass(10);  // placement new
//              ↑ 在 buffer 上构造,不再额外分配
// p == buffer
p->method();  // OK
// 析构:必须手动
p->~MyClass();  // 调析构
// buffer 是栈上的,不需 free
```

### 内存池的标准实现

```cpp
class Pool {
    char* buffer_;
public:
    Pool() : buffer_(new char[1000 * sizeof(MyClass)]) {}
    ~Pool() { delete[] buffer_; }
    
    MyClass* allocate(int val) {
        // 从 buffer_ 中切一块,在上面构造
        return new (buffer_ + ...) MyClass(val);
    }
    void deallocate(MyClass* p) {
        p->~MyClass();  // 手动析构
    }
};
```

**应用场景**:高频小对象、实时系统(避免 `new` 的不可预测延迟)、自定义内存管理。

## 五、`new` 底层一定调 `malloc` 吗

**不一定**。`operator new` 是 C++ 标准要求的接口,标准只规定它返回一块足够大、对齐的内存。**默认实现**调 `malloc`,但**可以重载**:

```cpp
// 重载全局 operator new
void* operator new(size_t n) {
    void* p = mmap(nullptr, n, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0);
    return p;  // 绕过 malloc,直接 mmap
}
```

在高性能场景(高频交易、游戏),重载 `operator new` 是常用优化手段。

## 六、什么时候该用哪个

### 优先用 `new` 的场景

- ✓ C++ 对象(需要调构造函数)
- ✓ 类型安全重要
- ✓ 想用 RAII + 异常处理
- ✓ 现代 C++ 几乎所有场景

### 优先用 `malloc` 的场景

- ✓ 与 C 代码交互(C 没有 `new`)
- ✓ 分配 POD 类型的原始内存块(`char[]` 缓冲区)
- ✓ 实现自定义内存分配器
- ✓ 底层系统编程(设备驱动、内核模块)

### 最佳实践:用 `make_unique` / `make_shared`

```cpp
// 推荐:智能指针工厂
auto p = std::make_unique<MyClass>(10);   // 不用写 new
auto sp = std::make_shared<MyClass>(10);  // 不用写 new

// 内部仍然是 new,但用 RAII 包装,异常安全、自动释放
```

**现代 C++ 的"不用 `new`"不是说不能 `new`,而是用更安全的封装**。直接用裸 `new`/`delete` 是 90 年代 C++ 的写法,现在只在底层(自定义分配器)用。

## 七、`delete[]` 替代 `delete` 的后果

```cpp
class Resource {
    int* data_;
public:
    Resource() : data_(new int[100]) {}     // 分配资源
    ~Resource() { delete[] data_; }          // 释放资源
};

Resource* arr = new Resource[5];  // 分配 5 个,每个 Resource 都有 100 int 的堆
delete arr;  // 错误:用 delete 代替 delete[]
// 后果:
// 1. 只调 arr[0].~Resource() → 释放 arr[0].data_(100 int)
// 2. arr[1..4] 的析构不调 → 4*100=400 int 泄漏
// 3. 整个 arr 块释放 → 表面上"看起来 OK",实际泄漏 400 int
```

**这种 bug 极难调试**:程序可能跑很久才崩,崩溃点远离 bug 点。

## 八、面试高频追问

**Q1: `new` 和 `malloc` 的核心区别?**
- `new`:**两件事**(分配 + 构造),运算符,类型安全,失败抛异常
- `malloc`:**一件事**(只分配),库函数,返回 `void*`,失败返回 NULL
- 配对:`new`↔`delete`,`new[]`↔`delete[]`,`malloc`↔`free`,不能混用

**Q2: `delete[]` 为什么不能用 `delete` 替代?**
`new[]` 在内存块头部多存**元素个数 N**。`delete[]` 读 N,循环 N 次析构,再释放整块。`delete` 只析构 1 个,剩下 N-1 个的析构函数不调,**资源泄漏**(对资源管理类)。POD 类型混用不崩,但属于 UB,不要这么做。

**Q3: `new` 的底层一定调 `malloc` 吗?**
不一定。`operator new` 是标准要求的接口,标准只规定返回对齐内存,不管底层实现。**默认实现**通常调 `malloc`,但可以重载(全局或类作用域),在内存池、mmap、自定义分配器场景下不调 malloc。

**Q4: placement new 是什么?**
`new (ptr) Type(args...)` 在**指定地址 `ptr`** 上构造对象,不分配新内存。用于内存池、嵌入式系统、placement 容器(`std::vector` 扩容时在预分配空间上构造元素)。**必须手动调析构**:`ptr->~Type()`,不要 `delete`。

**Q5: 现代 C++ 还需要 `new`/`malloc` 吗?**
- 90% 场景:**不需要**。用 `make_unique` / `make_shared` / 容器
- 5% 场景(自定义分配器):需要 `new` + placement new
- 5% 场景(底层、C 交互):需要 `malloc`
- **永远不要直接用裸 `new`/`delete`**——这是 C++ 内存 bug 的最大来源

## 九、相关扩展

- [堆 vs 栈](/notes/堆-vs-栈.html) — 堆分配的完整路径
- [深拷贝 vs 浅拷贝](/notes/深拷贝-vs-浅拷贝.html) — 堆对象的拷贝语义
- [内存碎片](/notes/内存碎片.html) — 频繁 `new`/`delete` 的副作用
- [智能指针](/notes/智能指针.html) — `make_unique` / `make_shared` 是 `new` 的现代替代