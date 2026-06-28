# struct vs union

## 核心结论

struct 的所有成员各自占用独立内存,sizeof 是所有成员大小之和(加对齐填充)。union 的所有成员**共享同一块内存**,sizeof 等于最大成员的大小,同一时刻只有一个成员有效。struct 支持继承、虚函数、完整的面向对象能力。union 不能继承、不能有虚函数、不能有引用成员,成员永远是 public。**C++17 的 `std::variant` 是类型安全的 union 替代**。

| 维度 | struct | union |
|------|--------|-------|
| 内存布局 | 成员独立排列 | 成员共享同一块内存 |
| sizeof | 所有成员大小之和(加 padding) | 最大成员的大小(加对齐) |
| 同一时刻有效成员 | 全部 | **只有一个** |
| 默认访问 | public(可改) | public(**不能改**) |
| 继承 | 支持 | 不支持 |
| 虚函数 | 支持 | 不支持 |
| 引用成员 | 支持 | **不允许** |
| C++11 后非 POD | 自动构造/析构 | **必须手动** placement new/析构 |
| 类型安全 | 高 | 低(`std::variant` 更好) |

## 内存布局:核心差异

```cpp
struct S {
    int a;       // 4 字节
    double b;    // 8 字节
    char c;      // 1 字节
};
// sizeof(S) = 24(含对齐填充,3 个成员同时存在)

union U {
    int a;       // 4 字节
    double b;    // 8 字节
    char c;      // 1 字节
};
// sizeof(U) = 8(等于最大成员 double 的大小,所有成员共享)
```

**struct** 的成员按声明顺序依次排列,每个成员有自己的地址——**所有成员同时存在、互不干扰**。

**union** 的所有成员从同一个起始地址开始,共享同一块内存——**写入一个成员会覆盖其他成员的值**,同一时刻只有一个成员"活跃"。

## 能力差异

| 能力 | struct | union |
|------|--------|-------|
| 继承 | ✅ | ❌ |
| 被继承 | ✅ | ❌ |
| 虚函数 | ✅ | ❌ |
| 引用成员 | ✅ | ❌ |
| 构造函数 | ✅ | ✅(C++11) |
| 析构函数 | ✅ | ✅(C++11,需谨慎) |
| 模板参数 | ✅ | ✅ |
| 访问控制 | public/protected/private | **强制 public** |
| 静态成员 | ✅ | ✅ |

struct 本质上就是 class(只是默认 public),拥有完整的面向对象能力。union 受限很多:不能继承也不能被继承,不能有虚函数,不能有引用成员,所有成员强制 public。

## union 的 sizeof 计算

**等于最大成员的大小,再按最大对齐要求向上取整**。

```cpp
union U1 { char c; };        // sizeof = 1
union U2 { int i; char c; }; // sizeof = 4(等于 int,加 4 字节对齐)
union U3 { double d; char c; };  // sizeof = 8
union U4 { int i; double d; };  // sizeof = 8
```

不是 `1+8=9`!**所有成员共享同一块内存**。

## C++11 后的 union

C++11 之前 union 只能放 POD 类型(Plain Old Data)。C++11 放开了这个限制,**允许放 `std::string` 这样的非 POD 类型**,但编译器**不会自动调用构造/析构**——因为 union 不知道当前哪个成员活跃。

**必须自己用 placement new 构造、手动调析构函数**,否则就是未定义行为。

```cpp
union U {
    int i;
    std::string s;
public:
    U() : s("hello") {}       // 手动构造
    ~U() { s.~string(); }      // 手动析构
};
```

**这就是为什么 `std::variant` 更好**——它用内部 tag 跟踪活跃类型,自动处理生命周期。

## 现代替代:std::variant(C++17)

`std::variant` 是**类型安全**的 union 替代品:

| 维度 | union | std::variant |
|------|-------|--------------|
| 类型安全 | ❌(UB if 写错) | ✅(访问错误类型抛 std::bad_variant_access) |
| 自动构造/析构 | ❌(需手动) | ✅ |
| 跟踪活跃类型 | ❌ | ✅(内部 tag) |
| 性能 | 略优(无 tag) | 略低(多一个 tag 字段) |
| 序列化/反序列化 | ✅(适合二进制协议) | ❌(不适合) |

```cpp
std::variant<int, std::string> v = 42;
v = "hello";
std::get<std::string>(v);  // OK
std::get<int>(v);          // 抛 std::bad_variant_access
```

**结论**:除非有极致的内存/性能需求,或需要二进制兼容性,现代 C++ 应该优先用 `std::variant`。

## union 的实际用途

**两个经典场景**:

### 1. 二进制协议解析

把一块 buffer 按不同字段解释(网络包头、硬件寄存器):

```cpp
struct PacketHeader {
    uint32_t type;
    uint32_t length;
    union {
        struct { uint32_t src_ip; uint32_t dst_ip; } ipv4;
        struct { uint8_t src[16]; uint8_t dst[16]; } ipv6;
    } addr;
};
```

### 2. 节省内存

当多个字段不会同时使用时共享空间(嵌入式、高性能场景):

```cpp
union Value {
    int i;
    float f;
    void* p;
};
```

但现代 C++ 中这两个场景都有更安全的替代:

- 二进制协议:`std::bit_cast<T>(buffer)`(C++20)
- 类型安全 union:`std::variant`(C++17)

## 为什么 union 里放 string 需要手动管理?

因为 union **不知道当前哪个成员活跃**,无法在析构时决定调谁的析构函数。

```cpp
union U {
    std::string s;
    int i;
public:
    U() {}                      // 不初始化任何成员
    void set_s(const std::string& v) { new (&s) std::string(v); }
    void destroy_s() { s.~string(); }
    ~U() { /* 不知道该不该调 s.~string() */ }
};
```

- 如果写入了 string 但没手动调 `s.~string()`,就会**内存泄漏**
- 如果当前活跃的不是 string 却去调它的析构,就是**未定义行为**

`std::variant` 完美解决——内部有 tag 跟踪活跃类型,析构时根据 tag 自动调用正确的析构。

## 默认访问权限

| 类型 | 默认访问 |
|------|---------|
| struct | public(可改成 private/protected) |
| class | private(可改成 public/protected) |
| union | **强制 public**(不能加访问控制修饰符) |

struct 和 class 是同一类东西,只是默认访问不同。union 成员永远 public,这是**语法强制**的。

## 面试高频追问

**Q1: struct 和 class 有什么本质区别?**
**没有本质区别**。struct 默认 public 继承、public 成员;class 默认 private 继承、private 成员。其他完全一样——都可以有虚函数、模板、成员函数等。**风格上**:struct 用于"数据集合"(无行为),class 用于"有行为的对象"。

**Q2: union 能有构造函数吗?**
**能**(C++11 起)。但如果 union 包含非 POD 成员,需要手动调用 placement new 构造,析构函数也需要手动管理活跃成员。

**Q3: anonymous union 是什么?**
**匿名 union**:没有类型名,成员直接出现在作用域中:

```cpp
struct S {
    union { int i; float f; };  // 匿名 union
};
S s;
s.i = 42;  // 直接访问,不需要 s.u.i
```

**限制**:匿名 union 只能有 public 成员,且不能有函数(C++11 放宽)。

**Q4: C++ 中 union 的类型双关(type punning)安全吗?**
**未定义行为**(标准角度),但**实际可用**(GCC/Clang/MSVC 都支持)。类型双关就是用 union 把一种类型的位模式重新解释为另一种类型。**C++20 提供 `std::bit_cast` 作为类型安全的替代**:

```cpp
float f = 3.14f;
int i = std::bit_cast<int>(f);  // 安全的位转换
```

## 相关扩展

- [struct vs class](/notes/struct-vs-class.html) - 几乎没区别
- [C++11 新特性](/notes/c++11-新特性.html) - 放宽了 union 的限制
- [struct vs union](/notes/struct-vs-union.html) - std::variant 的引入
- [struct vs union](/notes/struct-vs-union.html) - 对齐与 padding
- [类型转换](/notes/类型转换.html) - reinterpret_cast 与类型双关
- [placement new](/notes/placement-new.html) - union 手动构造的实现
- [深拷贝 vs 浅拷贝](/notes/深拷贝-vs-浅拷贝.html) - union 的拷贝语义