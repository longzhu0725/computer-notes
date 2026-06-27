---
title: "extern \"C\""
type: wiki
stage: compiled
entity_type: concept
source: "[raw/2026-06-22_extern-c.md](./raw/2026-06-22_extern-c.md.md)"
source_hash: 6e5de4ccbbce6fb031f89b54f3bd6a97f08d72fe2e767d05213779368ff1f8a5
domain: cpp
domains:
  - cpp
confidence: medium
tags:
  - cpp
  - wiki
  - extern
  - ABI
  - 链接
created: 2026-06-22
updated: 2026-06-22
has_counter_arguments: true
---

# extern "C"

`extern "C"` 是 C++ 提供给 C++ 编译器的一条指令：**对这些声明不要做名称修饰（Name Mangling），按 C 的符号命名和调用约定来生成**。它是 C/C++ 互操作、C++ 库被 C 调用、跨语言 FFI（Python/Lua/Java 等）扩展的**基础设施**。理解 extern "C" 真正解决的是什么问题，就能理解 C++ 链接模型的另一半——**ABI（Application Binary Interface）**。

## 简要回答

C++ 为了支持函数重载、命名空间、模板等特性，编译器在生成目标文件时会把**函数名 + 参数类型 + 命名空间**等信息编码进符号名（这个过程叫"名称修饰"，Name Mangling）。例如 `void foo(int)` 在 GCC/Clang 下变成 `_Z3fooi`。但 C 语言的函数名就是符号名本身（`foo`），不做任何修饰。

当 **C++ 代码调用 C 库函数**时，C++ 编译器会去找 `_Z3fooi`，但 C 库里只有 `foo`——**链接器找不到符号，报"undefined reference"错误**。`extern "C"` 就是告诉 C++ 编译器："这些函数按 C 规则处理，**不要做名称修饰**，直接用原始名作为链接符号"。

更深一层：`extern "C"` 还意味着采用 **C 的调用约定**（如 `__cdecl`）——参数压栈方式、栈由谁清理等二进制层面的协议。如果名称对但调用约定错，运行时仍会崩溃。

## 关键原理

### 名称修饰：问题的根源

#### 为什么 C++ 需要

C++ 引入了多个需要"区分同名函数"的特性：

- **函数重载**：`foo(int)` 和 `foo(double)` 必须能区分
- **命名空间**：`std::string` 和 `My::string` 必须能区分
- **类成员函数**：`obj.foo()` 隐含 `this` 指针参数，必须编码进符号
- **模板**：`std::vector<int>` 和 `std::vector<std::string>` 必须能区分

这些特性在源代码层靠**签名**区分，但在**目标文件/库**层必须靠**符号名**区分——所以编译器在生成机器码时把签名信息编码到符号名里。

#### 实际例子

```cpp
namespace ns {
  class Foo {
  public:
    void bar(int x);
    void bar(double x);
  };
}
```

- 符号 `_ZN2ns3Foo3barEi`（GCC 风格）：`_ZN` = 嵌套命名空间 + 类 + 函数名，`i` = int
- 如果改成 `double` 参数，符号尾会变成 `d`（`_ZN2ns3Foo3barEd`）

这个编码规则叫 **Itanium C++ ABI**——GCC、Clang、ICC 等编译器都遵守，是事实标准。MSVC 有自己的 MSVC ABI（编码方式不同），两套 ABI **不直接兼容**。

#### C 为什么不需要

C 不支持函数重载（每个函数名唯一），也不支持类、模板、命名空间——所以**符号名就是源码里的函数名**，没有任何额外编码。`foo` 在 C 编译后符号就是 `foo`。

### 调用约定：常被忽略的另一半

extern "C" 不只是关掉名称修饰，**还隐含切换到 C 调用约定**。调用约定规定：

- 参数从左到右还是从右到右压栈
- 参数由调用者还是被调用者清理栈
- 函数返回值怎么传递（寄存器 vs 栈）
- 函数调用时哪些寄存器需要保存

C 平台默认 `__cdecl`，C++ 平台默认 `__thiscall`（成员函数）。如果 C++ 调用约定下的代码试图调用 C 库函数（不写 extern "C"），**符号可能对上但调用约定错**——链接能过，但运行崩溃（典型的"链接通过、运行段错误"）。

### `__cplusplus` 宏保护

写**同时给 C 和 C++ 用的头文件**时，必须用 `#ifdef __cplusplus` 保护：

```c
// mylib.h - 同时给 C 和 C++ 用
#ifndef MYLIB_H
#define MYLIB_H

#ifdef __cplusplus  // 仅当 C++ 编译器看到时
extern "C" {
#endif

void mylib_init();
int mylib_process(const char* data);

#ifdef __cplusplus
}
#endif

#endif
```

- C 编译器看不到 `__cplusplus`，整个 `extern "C" { }` 被跳过——头文件等价于纯 C 声明
- C++ 编译器看到 `__cplusplus`，把函数声明包在 `extern "C" { }` 里——确保按 C 链接

**这正是 C 标准库、glibc、SQLite、libpng 等 C 库头文件的标准模式**。

### extern "C" 的能力边界

| 用途 | 是否支持 | 说明 |
|---|---|---|
| 修饰自由函数 | ✅ | 最常见用法 |
| 修饰全局变量 | ✅ | `extern "C" int counter;` |
| 修饰类成员函数 | ❌ | 隐含 `this` 指针，依赖 C++ 对象模型 |
| 修饰函数模板 | ❌ | 模板实例化时仍需要名称修饰 |
| 修饰重载函数 | ❌ | 多个同名 `extern "C"` 函数链接器会报重定义 |
| 修饰 `main` 函数 | ❌ | `main` 必须用 C++ 调用约定 |
| 修饰 lambda | ❌ | lambda 是 C++ 闭包，需要类型擦除 |
| 修饰命名空间内函数 | ✅ | `extern "C" namespace ns { void f(); }`（C++11 起） |

**典型错误**：试图 `extern "C"` 修饰成员函数——编译器会报错。如果要让 C 代码调用 C++ 类的功能，写一个**包装函数**：

```cpp
// myclass.h
class MyClass {
public:
  int process(int x);
};

// myclass_capi.h - 给 C 用的接口
#ifdef __cplusplus
extern "C" {
#endif

typedef void* MyClassHandle;

MyClassHandle myclass_create();
void myclass_destroy(MyClassHandle h);
int myclass_process(MyClassHandle h, int x);

#ifdef __cplusplus
}
#endif

// myclass_capi.cpp
#include "myclass.h"
#include "myclass_capi.h"

extern "C" MyClassHandle myclass_create() { return new MyClass(); }
extern "C" void myclass_destroy(MyClassHandle h) { delete static_cast<MyClass*>(h); }
extern "C" int myclass_process(MyClassHandle h, int x) {
  return static_cast<MyClass*>(h)->process(x);
}
```

这是 **C++ 库导出 C 接口的标准模式**（Boost.Python、Qt C-API、Wt 等都这样）。

### ABI 兼容性的延伸：动态库导出

extern "C" 解决的是**符号名匹配**。但要让 C++ 库**作为动态库被 C 或其他语言加载**，还需要：

| 工具链 | 可见性控制 | 导出语法 |
|---|---|---|
| GCC/Clang (Linux/macOS) | 默认隐藏所有符号，需显式导出 | `__attribute__((visibility("default")))` |
| MSVC (Windows) | 默认所有符号可见（性能差） | `__declspec(dllexport)` |
| 跨平台宏 | Boost / Qt 等库封装的宏 | `MYLIB_EXPORT` |

完整方案：

```cpp
#if defined(_WIN32)
  #define MYLIB_API __declspec(dllexport)
#elif defined(__GNUC__)
  #define MYLIB_API __attribute__((visibility("default")))
#endif

extern "C" {
  MYLIB_API int mylib_process(const char* data);
}
```

`extern "C"` 解决**名字**，`__attribute__((visibility))` 解决**可见性**——两者缺一不可。

## 应用与实例

### 场景 1：C++ 调用 C 库

假设你有一个 C 库 `libfoo`：

```c
// foo.h
#ifndef FOO_H
#define FOO_H
void foo_init();
int foo_compute(int x);
#endif
```

C++ 代码调用：

```cpp
// main.cpp
extern "C" {
  #include "foo.h"  // 告诉 C++ 编译器：foo_init/foo_compute 是 C 链接
}

int main() {
  foo_init();
  return foo_compute(42);
}
```

或者更安全的做法——用 `extern "C"` 包裹**声明**而不是 `#include`：

```cpp
extern "C" {
  void foo_init();
  int foo_compute(int x);
}

int main() {
  foo_init();
  return foo_compute(42);
}
```

### 场景 2：C++ 库导出 C 接口（FFI 桥接）

Python 调用 C++ 库的标准模式——见上面的 `MyClass` 例子。这是 **pybind11 之前的标准做法**，pybind11 出现后很多项目仍用这种方式确保 ABI 稳定性。

### 场景 3：嵌入式 / 系统编程

C 和汇编混编、C 内核模块加载、bootloader 等场景下，C++ 代码必须用 `extern "C"` 导出函数让 C 启动代码调用。

## 与其他概念的关系

- [cpp/多态](./cpp/多态.md)：C++ 的虚函数依赖 vtable（一种 RTTI 数据结构），C 调用约定无法处理 vtable 查找——所以 **extern "C" 不能修饰虚函数**
- [cpp/继承](./cpp/继承.md)：vtable 是 C++ 类的"运行时类型信息"，跨语言接口时 C 无法看到这些，所以**所有 C 接口只能是自由函数 + void* 句柄**
- [cpp/指针 vs 引用](./cpp/指针-vs-引用.md)：extern "C" 接口通常用 `void*` 或 `intptr_t` 句柄传引用，而不是真正的 C++ 引用（C 无法直接处理）
- [cpp/struct vs class](./cpp/struct-vs-class.md)：与 C 互操作的 struct 必须保持 C 风格（无成员函数、无继承、无访问控制）
- [cpp/类型转换](./cpp/类型转换.md)：`static_cast` 在跨 extern "C" 边界时是必要的（`void*` ↔ `T*`）
- [cpp/static vs const](./cpp/static-vs-const.md)：`static const` 全局变量在跨翻译单元访问时也需要 `extern "C"` 保持符号一致

## 来源与延伸阅读

- [raw/2026-06-22_extern-c](./raw/2026-06-22_extern-c.md) — 原始资料（卡码笔记 C++ 面试题系列，2026-05-23）
- 推荐：[Itanium C++ ABI](https://itanium-cxx-abi.github.io/cxx-abi/abi.html)（GCC/Clang 使用的 C++ ABI 规范）
- 推荐：cppreference [Linkage specifications](https://en.cppreference.com/w/cpp/language/language_linkage)
- 推荐：cppreference [storage class specifiers](https://en.cppreference.com/w/cpp/language/storage_duration)（extern 在 C++ 中的语义）
- 推荐：《深入理解计算机系统》第 7 章（链接的详细机制）
