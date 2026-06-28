# sizeof 与 strlen 的区别

## 核心结论

`sizeof` 是**编译期运算符**,看的是**类型信息**,返回类型/变量占用的字节数(包含 `'\0'`)。`strlen` 是**运行时函数**,看的是**内存内容**,从头遍历到第一个 `'\0'` 停止,返回字符个数(不包含 `'\0'`)。两者对同一个字符数组 `char s[] = "hello"` 的结果分别是 **6** 和 **5**。

| 维度 | `sizeof` | `strlen` |
|------|---------|---------|
| 本质 | 运算符(operator) | 标准库函数(`<cstring>`) |
| 执行时机 | **编译期** | **运行时** |
| 计算内容 | 类型/变量占用的字节数 | `'\0'` 前的字符个数 |
| `'\0'` | **包含** | **不包含** |
| 适用类型 | 任意类型 | 仅限 `char*` / `char[]` |
| 时间复杂度 | **O(1)**(编译期确定) | **O(n)**(运行时遍历) |

## 经典陷阱

### 陷阱一:指针 vs 数组

```cpp
char arr[] = "hello";    // 类型:char[6]
char* ptr = "hello";     // 类型:char*(字符串字面量)

sizeof(arr);  // 6(数组总大小,包含 '\0')
sizeof(ptr);  // 8(64 位系统上指针大小)
strlen(arr);  // 5
strlen(ptr);  // 5
```

`sizeof` 看的是**类型**——`arr` 的类型是 `char[6]`,`ptr` 的类型是 `char*`。`strlen` 不看类型,只看内容。

### 陷阱二:数组退化

数组作为函数参数传递时,**退化为指针**:

```cpp
void foo(char arr[]) {
    sizeof(arr);  // 8!不是数组大小
}

char s[100];
foo(s);  // s 退化为 char*
```

如果需要在函数内知道数组长度,必须额外传参数或用**模板推导**:

```cpp
template <size_t N>
void foo(char (&arr)[N]) {
    sizeof(arr);  // N+1!包含 '\0'
}
```

### 陷阱三:中间 `'\0'`

```cpp
char s[] = {'a', '\0', 'b', 'c'};
sizeof(s);   // 4(数组真实大小)
strlen(s);   // 1(碰到第一个 '\0' 就停)
```

`strlen` 完全不关心数组有多大,只关心**第一个 `'\0'` 在哪**。

### 陷阱四:循环中的 strlen

```cpp
// 错误:O(n²)
for (int i = 0; i < strlen(s); i++) {
    // 每次循环都重新遍历整个字符串
}

// 正确:提前缓存
size_t len = strlen(s);
for (int i = 0; i < len; i++) {
    // ...
}
```

这是 C/C++ 代码中**最常见的性能 bug 之一**。

## sizeof 的本质

`sizeof` 是**编译期运算符**,不是函数调用。它在编译时就确定了结果,完全是**0 运行时开销**。这就是为什么:

- `int arr[sizeof(long)];` 合法(编译期常量)
- `std::array<T, sizeof(U)>` 合法
- `static_assert(sizeof(T) == 8)` 合法

C99 引入了**变长数组(VLA)**,此时 `sizeof` 会退化为运行时计算。**C++ 不支持 VLA**,所以 C++ 中 `sizeof` 始终是编译期常量。

## strlen 的本质

`strlen(const char* s)` 在运行时:

1. 从 `s[0]` 开始遍历
2. 遇到 `'\0'` 停止
3. 返回走过的字符数

**没有传长度参数**(因为 C 字符串以 `'\0'` 结尾),所以**必须遍历**才能知道长度。

## 现代 C++ 还需要 strlen 吗?

**不需要**。如果用 `std::string`,直接调 `.size()` 或 `.length()`,**O(1)** 复杂度(string 内部维护了长度)。

```cpp
std::string s = "hello";
s.size();  // 5,O(1)
```

只有处理 C 风格字符串(`char*`)时才需要 `strlen`。**现代 C++ 推荐尽量用 `std::string` 避免这类问题**。

## sizeof 的高级用法

| 场景 | 用法 | 说明 |
|------|------|------|
| 数组元素个数 | `sizeof(arr) / sizeof(arr[0])` | C 风格 |
| 数组元素个数(C++17) | `std::size(arr)` | 类型安全 |
| 编译期判断 | `static_assert(sizeof(int) >= 4)` | 平台验证 |
| 模板参数 | `std::array<T, N>` | 编译期大小 |
| 结构体大小 | `sizeof(struct)` | 包含 padding |
| 联合体大小 | `sizeof(union)` | 等于最大成员 |
| 类大小 | `sizeof(class)` | 包含 vptr |
| 空类大小 | `sizeof(class{})` | 1 字节(C++ 规定) |

## strlen 的坑汇总

1. **未初始化指针**:`strlen(p);` 如果 p 没有 `'\0'` 结尾,可能越界
2. **循环中调用**:O(n²) 性能
3. **const 字符串字面量**:`char* p = "hello"; strlen(p);` 正常,但**不要**修改 p 指向的内容
4. **多线程下**:`strlen` 本身不修改 s,只读访问安全
5. **空字符串**:`strlen("")` 返回 0,合法

## 面试高频追问

**Q1: sizeof 对空类为什么是 1?**
C++ 规定**任何完整对象的大小至少为 1 字节**,以确保不同对象有不同地址。否则空类数组 `Empty[10]` 的所有元素都在同一地址,违反"对象唯一性"原则。

**Q2: sizeof 对虚函数类的影响?**
虚函数增加 vptr(4 或 8 字节)。如果有多个虚函数,vptr 仍只有一个(多个 vtable entries)。

```cpp
class Base { virtual void f(); virtual void g(); };  // 8 字节(只有 1 个 vptr)
class Derived : public Base { virtual void f(); };   // 仍 8 字节
```

**Q3: sizeof 对继承的影响?**
派生类 = 自己的成员 + 基类部分。空基类优化(EBO)允许空基类占 0 字节。

**Q4: sizeof 对位域(bitfield)怎么算?**
按底层类型对齐。例如 `int a : 3; int b : 5;` 整体占 4 字节(int 的大小)。

## 相关扩展

- [指针 vs 引用](/notes/指针-vs-引用.html) - sizeof 指针 vs 引用
- [sizeof 与 strlen 的区别](/notes/sizeof-与-strlen-的区别.html) - 数组在函数参数中的退化
- [C++11 新特性](/notes/c++11-新特性.html) - std::array、std::string 的大小
- [堆 vs 栈](/notes/堆-vs-栈.html) - 不同内存区域的对象 sizeof 相同(类型信息一致)
- [类型转换](/notes/类型转换.html) - sizeof 与类型推导
- [auto vs decltype](/notes/auto-vs-decltype.html) - sizeof 与类型推导配合