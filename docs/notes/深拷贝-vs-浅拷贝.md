---
title: 深拷贝 vs 浅拷贝
---

# C++ 深拷贝 vs 浅拷贝

## 核心结论

**浅拷贝**只复制指针地址,两个对象共享同一块堆内存——析构时**双重释放**,运行期崩溃。**深拷贝**为指针成员重新分配内存,两个对象各自独立,互不影响。**现代 C++ 的最佳实践**是用智能指针(RAII),自动处理深浅拷贝,从根本上避免手写拷贝构造。

| 维度 | 浅拷贝(Shallow) | 深拷贝(Deep) |
|------|----------------|--------------|
| 指针成员 | **复制地址**(共享内存) | 重新分配 + 复制内容 |
| 内存布局 | 共享 | 独立 |
| 析构安全 | **否**(双重释放) | 是 |
| 写时安全 | 否(改一个影响另一个) | 是 |
| 性能 | O(1)(只搬指针) | O(n)(复制内容) |
| 实现 | 编译器默认 | 手动 / 智能指针 |
| Rule of Three 触发 | 必要 | 必要 |

## 一、浅拷贝的致命问题

### 内存模型示意

```cpp
class Bad {
    int* data_;
public:
    Bad() : data_(new int[10]) {}
    ~Bad() { delete[] data_; }  // 析构释放
    // ⚠ 没自定义拷贝构造 → 编译器生成浅拷贝
};

Bad a;        // a.data_ 指向 heap[0..9]
Bad b = a;    // 浅拷贝:b.data_ == a.data_(同一地址)
```

```
栈
┌──────────┐     ┌──────────┐
│  a       │     │  b       │
│  data_ ──┼──┐  │  data_ ──┼──┐
└──────────┘  │  └──────────┘  │
              ▼                ▼
堆
   ┌────────────────────────────┐
   │  int[10]  (共享同一块)     │
   └────────────────────────────┘
```

### 三种崩溃路径

```cpp
// 1. 双重释放(Double Free)
~Bad() { delete[] data_; }  // a 析构
~Bad() { delete[] data_; }  // b 析构,data_ 已无效 → 崩溃

// 2. 悬垂指针(Dangling Pointer)
Bad a;
Bad* p = &a;
a.~Bad();     // a 析构
*p;            // UB:p 指向已析构的栈帧

// 3. 意外修改
Bad a;  a.data_[0] = 1;
Bad b = a;  // b.data_ == a.data_
b.data_[0] = 2;  // 改 b,意外影响 a
```

## 二、Rule of Three(C++11 前)

### 触发条件

**只要定义了以下任一**:
- 析构函数(`~T()`)
- 拷贝构造(`T(const T&)`)
- 拷贝赋值(`T& operator=(const T&)`)

**就必须定义全部三个**。原因:三者的资源管理是耦合的,只处理一个会留 bug。

### 正确实现

```cpp
class Good {
    int* data_;
    size_t size_;
public:
    // 1. 析构
    Good() : data_(new int[10]), size_(10) {}
    ~Good() { delete[] data_; }

    // 2. 拷贝构造(深拷贝)
    Good(const Good& other) : data_(new int[other.size_]), size_(other.size_) {
        std::copy(other.data_, other.data_ + size_, data_);
    }

    // 3. 拷贝赋值(深拷贝,处理自我赋值)
    Good& operator=(const Good& other) {
        if (this != &other) {  // 自赋值检查
            delete[] data_;
            data_ = new int[other.size_];
            size_ = other.size_;
            std::copy(other.data_, other.data_ + size_, data_);
        }
        return *this;
    }
};
```

### 自赋值的陷阱

```cpp
Good a;
a = a;  // 自赋值
// 错误实现(没自赋值检查):
//   delete[] data_;  // 自己的内存释放
//   data_ = new int[a.size_];  // 拷贝已释放的内存 → UB
```

**解法**:先 `if (this != &other)` 检查。

## 三、现代 C++ 的替代:Rule of Zero

### 用智能指针自动处理

```cpp
class Modern {
    std::unique_ptr<int[]> data_;  // RAII 类型
    size_t size_;
public:
    Modern(size_t n) : data_(std::make_unique<int[]>(n)), size_(n) {}
    // 不需要写析构、拷贝构造、拷贝赋值!
    // unique_ptr 自动处理:
    //   析构 → delete[]
    //   拷贝 → 禁止(只能移动)
    //   移动 → 转移所有权
};

Modern a(10);
Modern b = a;             // 错误!unique_ptr 不可拷贝
Modern b = std::move(a);  // OK,移动
```

### `shared_ptr` 允许共享

```cpp
class Shared {
    std::shared_ptr<int[]> data_;
public:
    Shared(size_t n) : data_(std::make_shared<int[]>(n)) {}
};

Shared a(10);
Shared b = a;  // OK,引用计数 +1,共享内存(析构安全)
```

**`shared_ptr` 实现"安全的浅拷贝"**——多个对象共享同一块内存,引用计数归零时统一释放。从根本上避免"浅拷贝 + 双重释放"。

### Rule of Zero 的判定

| 成员 | 是否需要自定义拷贝? |
|------|------------------|
| `int`、`double` 等值类型 | ✗ 默认即可 |
| `std::vector`、`std::string` | ✗ RAII,自动 |
| `std::unique_ptr<T>` | ✗ 禁止拷贝,只能移动 |
| `std::shared_ptr<T>` | ✗ 共享,引用计数管理 |
| **裸 `T*` 指针** | **✓ 必须** |
| C 风格资源(`FILE*`、`int fd`) | **✓ 必须** |

**经验**:**类里有裸指针 + 手动 `new` → 必须深拷贝**;其他情况依赖 RAII 类型,无需手动。

## 四、STL 容器与拷贝

### 容器是值语义

```cpp
std::vector<Good> v;
v.push_back(good_obj);  // 触发拷贝构造(深拷贝,O(n))
v.emplace_back(args);  // 直接在容器内构造,无拷贝
```

### 浅拷贝的容器灾难

```cpp
std::vector<Bad> v;       // Bad 有浅拷贝 bug
Bad b;
v.push_back(b);            // 浅拷贝:容器内外的 b 共享内存
// ... 容器扩容,v2 = v 时,旧元素被拷贝到新位置(浅拷贝),所有元素共享内存
// 析构时:所有元素都 delete 同一块内存 → 崩溃
```

**解法**:
1. **存智能指针**:`vector<unique_ptr<Bad>>` v
2. **用 `emplace` 避免拷贝**:`v.emplace_back(args...)`
3. **存正确实现深拷贝的类**:`vector<Good>`

## 五、写时复制(COW)

### 概念

```cpp
// 拷贝:先浅拷贝(共享),引用计数 = 2
// 修改:检查引用计数
//   - 计数 == 1(独占):直接改
//   - 计数 > 1(共享):先深拷贝,再改
std::string s1 = "hello";
std::string s2 = s1;  // 浅拷贝,引用计数 = 2
s2[0] = 'H';           // 触发深拷贝(因为计数 > 1)
// s1 还是 "hello",s2 是 "Hello",独立
```

### 历史与现状

- C++11 之前 `std::string` 实现普遍用 COW
- C++11 之后标准库**不再使用 COW**,改 SSO(Small String Optimization)+ 移动语义
- **原因**:多线程下,COW 的引用计数需要原子操作,反而比普通复制慢

## 六、深浅拷贝的运行时调试

### 典型的浅拷贝崩溃栈

```
#0 0x00007f in operator delete(void*, unsigned long)
#1 0x00007f in Good::~Good()  // 析构
#2 0x00007f in main()
#3 __libc_start_main
```

**特征**:
- 崩溃在 `operator delete`
- 栈顶是析构函数
- 没有"自己写 `delete`"的代码 → 自动变量析构触发

**调试步骤**:
1. 启用 ASan(Address Sanitizer)自动检测
2. 看哪个析构崩溃 → 找对应的对象来源
3. 追溯到拷贝构造/赋值的位置
4. 修复:实现深拷贝 / 用智能指针

## 七、面试高频追问

**Q1: 什么时候必须写深拷贝?**
**只要类里有裸指针(`T*`)且这个指针指向的内存是类自己 `new` 出来的,就必须写深拷贝**。判断标准:**如果你写了析构里有 `delete`,那就要写拷贝构造和赋值运算符**(Rule of Three)。**有智能指针或纯值类型成员,编译器默认就够**。

**Q2: STL 容器存自定义对象有什么坑?**
容器是值语义,`push_back` 触发拷贝构造。如果类有裸指针但没写深拷贝,容器里外共享内存——容器扩容时旧元素析构会释放内存,新元素指针悬空,直接崩溃。**解法**:实现深拷贝 / 用智能指针 / 存指针而非对象。

**Q3: COW 写时复制是什么?和深拷贝什么关系?**
COW 是**优化策略**:拷贝时先浅拷贝(共享),只有修改时才真正深拷贝。用引用计数跟踪共享数,修改前检查计数 → 大于 1 先复制再改。早期 `std::string` 用 COW,后因多线程下原子引用计数开销太大,**C++11 起标准库不再用**,改 SSO + 移动语义。

**Q4: 移动语义和深拷贝什么关系?**
移动是**第三种选择**——既不是浅拷贝(共享资源)也不是深拷贝(复制内容),而是**转移资源所有权**。移动构造把源对象指针"偷过来",源对象置空,O(1) 完成。**当你不再需要源对象时,移动比深拷贝高效得多**(比如函数返回临时对象)。

**Q5: 拷贝赋值和拷贝构造的区别?**
- **拷贝构造**:用已有对象初始化新对象(`Good b = a;`)
- **拷贝赋值**:已有对象赋值给另一个已有对象(`b = a;`)
- 拷贝赋值要处理**自赋值**和**旧资源释放**(先 delete 自己的,再 deep copy 新的)
- 拷贝构造不用,因为新对象还没资源

## 八、相关扩展

- [构造函数](./构造函数.md) — Rule of Three/Five/Zero
- [智能指针](./智能指针.md) — 替代深拷贝的现代方案
- [移动语义](./移动语义.md) — 第三种选择:O(1) 资源转移
- [堆 vs 栈](./堆-vs-栈.md) — 拷贝涉及堆对象的所有权问题
