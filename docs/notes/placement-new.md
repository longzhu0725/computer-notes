# C++ Placement new

## 核心结论

Placement new 把"**内存分配**"和"**对象构造**"拆开——普通 `new` 同时做两件事,placement new 只在**你给定的地址**上调构造函数。语法是 `new (ptr) Type(args)`,**不能**用 `delete` 释放(它会试图 `operator delete`,而这块内存可能不是 `new` 分配的,UB)。必须手动 `obj->~Type()`,再用原始方式释放。

| 维度 | 普通 `new` | Placement new |
|------|----------|---------------|
| 分配内存 | ✓ | ✗ |
| 调构造函数 | ✓ | ✓ |
| 语法 | `T* p = new T(args)` | `T* p = new (ptr) T(args)` |
| 释放 | `delete p` | **手动 `p->~T()`** + 原始方式 |
| 失败处理 | 抛 `bad_alloc` | `noexcept`(只是返回指针) |
| 典型场景 | 普通 C++ 对象 | 内存池、STL `vector`/`optional`/`variant` |

## 一、为什么需要 placement new

### 拆解"分配 + 构造"两步

```cpp
// 普通 new:两步一起做
T* p = new T(args);
// 1. operator new(sizeof(T))   ← 分配
// 2. 在 p 上调 T(args)        ← 构造
```

某些场景下,我们想**自己控制内存来源**(内存池、共享内存、栈上 `char[]`),只让编译器帮忙调构造函数——placement new 就是为此而生。

### 底层实现:零开销转发

```cpp
// 标准库的 placement new 重载
inline void* operator new(std::size_t, void* ptr) noexcept {
    return ptr;  // 什么都不做,直接返回调用者提供的指针
}
```

Placement new 的"分配"实际上**不存在**——`operator new(size, void*)` 直接返回传入的指针,只有构造函数真正运行。零运行时开销(除构造函数本身)。

## 二、正确用法

### 完整生命周期

```cpp
// 1. 准备一块对齐的内存
alignas(MyClass) char buffer[sizeof(MyClass)];  // 栈上,alignas 保证对齐

// 2. Placement new 构造
MyClass* p = new (buffer) MyClass(10);
//   ↑ buffer 是构造地址
//   p 指向 buffer
//   MyClass 构造函数已运行

// 3. 使用
p->method();

// 4. 手动析构(不能用 delete!)
p->~MyClass();

// 5. 内存是栈上的,自动回收
```

### 错误的释放方式

```cpp
// 错误 1:用 delete → UB!
delete p;  // delete 试图调 operator delete(p) 释放内存
// 但 buffer 是栈上的,operator delete 不知道,会乱释放

// 错误 2:忘记析构 → 资源泄漏
// 如果 MyClass 有 string 成员(管理堆),忘记 ~MyClass() 会泄漏 string 内的堆
```

**规则**:
- placement new → 手动 `obj->~T()`
- 不要 `delete`(让原内存拥有者按原方式释放)

## 三、内存对齐要求

### 为什么必须对齐

```cpp
// 错误示例:char 数组可能不对齐
char buffer[sizeof(MyClass)];  // 警告:对齐可能不满足 alignof(MyClass)
MyClass* p = new (buffer) MyClass();
// 某些架构(ARM、Sparc)硬件异常,某些架构(x86)性能严重下降
```

### 三种解决方式

```cpp
// 1. C++11:alignas(推荐)
alignas(MyClass) char buffer[sizeof(MyClass)];

// 2. union 技巧(老式 C++03)
union MaxAlign {
    char data[sizeof(MyClass)];
    long long dummy;       // 8 字节对齐
    long double bigger;    // 16 字节对齐
};
MaxAlign buf;
MyClass* p = new (&buf) MyClass();

// 3. C++23:std::aligned_alloc
void* mem = std::aligned_alloc(alignof(MyClass), sizeof(MyClass));
MyClass* p = new (mem) MyClass(10);
// ... 用完
p->~MyClass();
std::free(mem);  // aligned_alloc 配 free

// C++17 之前的 std::aligned_storage
typename std::aligned_storage<sizeof(MyClass), alignof(MyClass)>::type storage;
MyClass* p = new (&storage) MyClass(10);
```

## 四、典型应用场景

### 1. `std::vector` 扩容

```cpp
template<typename T>
class vector {
    T* data_;
    size_t size_, capacity_;
public:
    void resize(size_t new_cap) {
        T* new_data = (T*)::operator new(new_cap * sizeof(T));
        // 移动构造旧元素到新内存
        for (size_t i = 0; i < size_; ++i) {
            new (&new_data[i]) T(std::move(data_[i]));  // placement new
        }
        // 析构旧元素
        for (size_t i = 0; i < size_; ++i) {
            data_[i].~T();
        }
        ::operator delete(data_);
        data_ = new_data;
        capacity_ = new_cap;
    }
};
```

### 2. `std::optional`

```cpp
template<typename T>
class optional {
    alignas(T) char storage_[sizeof(T)];
    bool has_value_;
public:
    optional& operator=(T&& v) {
        if (has_value_) {
            *reinterpret_cast<T*>(storage_) = std::move(v);
        } else {
            new (storage_) T(std::move(v));  // placement new
            has_value_ = true;
        }
        return *this;
    }
    ~optional() {
        if (has_value_) {
            reinterpret_cast<T*>(storage_)->~T();
        }
    }
};
```

### 3. `std::variant`

```cpp
// variant 在同一块内存上存不同类型,切换类型时:
// 1. 调旧类型的 ~T() 析构
// 2. placement new 构造新类型
// 都靠 placement new
```

### 4. 自定义内存池

```cpp
class MemoryPool {
    char* buffer_;
    size_t offset_, capacity_;
public:
    MemoryPool(size_t cap) : buffer_(new char[cap]), offset_(0), capacity_(cap) {}
    
    template<typename T, typename... Args>
    T* allocate(Args&&... args) {
        // 1. 检查容量 + 对齐
        offset_ = (offset_ + alignof(T) - 1) & ~(alignof(T) - 1);
        if (offset_ + sizeof(T) > capacity_) throw std::bad_alloc();
        
        // 2. 在池中切一块 + 构造
        void* ptr = buffer_ + offset_;
        T* obj = new (ptr) T(std::forward<Args>(args)...);
        offset_ += sizeof(T);
        return obj;
    }
};
```

## 五、`memcpy` 替代 placement new 是不行的

```cpp
// 错误:用 memcpy 拷贝对象
MyClass src;
char buffer[sizeof(MyClass)];
memcpy(buffer, &src, sizeof(MyClass));
// 问题:
// 1. 没调构造函数 → 虚函数表指针未设置(有虚函数的类)
// 2. 没调构造函数 → string/vector 成员内部指针未初始化
// 3. 析构 src 时,src 的成员"释放"了,buffer 里的指针变成悬垂

// 正确:用 placement new 调移动构造
new (buffer) MyClass(std::move(src));
// 移动构造接管 src 的内部指针,src 置空 → 安全
```

**只有 POD 类型**(无构造函数、无虚函数、无 RAII 成员)才能用 memcpy——但既然是 POD,何必用 placement new 呢?直接拷贝值就行。

## 六、placement new 不会失败,但构造函数可能

```cpp
// placement new 本身:不分配内存,只是返回指针
void* operator new(size_t, void* ptr) noexcept { return ptr; }
// 永远不抛异常

// 但如果 Type 的构造函数抛异常:
struct Throwing {
    Throwing() { throw std::runtime_error("ctor fail"); }
};

char buffer[sizeof(Throwing)];
try {
    Throwing* p = new (buffer) Throwing();
} catch (const std::exception& e) {
    // 异常被捕获
    // 重要:不要调 p->~Throwing()!
    //   构造函数失败,对象没有被成功构造
    //   析构未构造的对象是 UB
}
// buffer 仍然有效,按原方式释放
```

**关键规则**:**如果构造函数抛了,对象没有被构造,不要调析构**。只有构造成功的对象才需要析构。

## 七、面试高频追问

**Q1: 为什么 placement new 不能用 `delete` 释放?**
`delete` 调 `operator delete` 释放内存,但 placement new 构造的对象的内存可能来自栈上 `char[]`、内存池、共享内存——这些不是 `new` 分配的。对它们调 `operator delete` 行为未定义(通常直接崩溃)。**正确做法**:手动 `obj->~T()` 析构,再用原内存拥有者对应方式释放。

**Q2: 内存对齐怎么处理?**
placement new 要求目标地址满足 `alignof(T)`。不满足时,某些架构硬件异常(ARM、Sparc),某些架构性能严重下降(x86)。**解法**:
- C++11: `alignas(T) char buf[sizeof(T)]`
- C++17: `std::aligned_storage<sizeof(T), alignof(T)>::type`
- C++23: `std::aligned_alloc(alignof(T), sizeof(T))`

**Q3: 同一块内存上能反复构造吗?**
可以,这是典型用法。先调析构销毁旧对象,再 placement new 构造新对象。`std::variant` 切换类型、`std::optional` 重新赋值都这么做。**前提**:新对象的大小和对齐不能超过原内存容量。

**Q4: 标准库哪里用了 placement new?**
- `std::vector` 扩容:在新内存上移动构造元素
- `std::optional`:内部有 `aligned_storage`,有值时构造
- `std::variant`:同一块内存存不同类型
- `std::any`(类似 variant)
- 所有内存池/对象池的标准实现

**Q5: placement new 和内存池什么关系?**
内存池"预分配大块内存,按需切割使用"。**切割出的小块上构造对象靠 placement new**,销毁对象靠手动 `~T()`。**避免了频繁 malloc/free 的开销和碎片问题**——游戏引擎、数据库、高频交易系统大量使用。

## 八、相关扩展

- [new vs malloc](/notes/new-vs-malloc.html) — placement new 是 new 家族的特殊成员
- [构造函数](/notes/构造函数.html) — placement new 直接调构造函数
- [智能指针](/notes/智能指针.html) — `make_shared` 内部用 placement new
- [堆 vs 栈](/notes/堆-vs-栈.html) — placement new 跨过普通 new 的分配层