# C++ `push_back` vs `emplace_back`

## 核心结论

**`push_back` 接受已构造好的对象**(拷贝/移动进容器)。**`emplace_back` 接受构造函数参数**,在容器内存上**原地构造**,跳过临时对象。**性能差异**:emplace_back 省一次构造+一次析构。**最佳实践**:**从参数直接构造用 emplace**,**已有对象用 push_back**。

| 维度 | `push_back` | `emplace_back` |
|------|------------|----------------|
| 参数 | 已构造的对象 | 构造函数参数 |
| 内部动作 | 拷贝/移动到容器 | placement new 原地构造 |
| 临时对象 | 1 个(传参时) | 0 |
| 参数数量 | 1 个(对象) | 变参 |
| 异常安全 | 强 | 强(强异常安全) |
| 可读性 | 高(语义清晰) | 中(隐式构造) |

## 一、核心差异:在哪构造

### `push_back`:在外面做好,搬进去

```cpp
std::vector<MyClass> v;

// push_back(const T&) 版本:拷贝
MyClass obj(10, "hello");
v.push_back(obj);  // 拷贝构造 obj 进容器

// push_back(T&&) 版本:移动
v.push_back(MyClass(10, "hello"));  // 构造临时对象,移动进容器
// 流程:
// 1. 构造临时 MyClass(10, "hello")  ← 1 次构造
// 2. 移动构造到容器内存              ← 1 次移动
// 3. 析构临时对象                    ← 1 次析构
// 总计:1 构 + 1 移 + 1 析
```

### `emplace_back`:直接在容器内做

```cpp
std::vector<MyClass> v;

// emplace_back 直接在容器内构造
v.emplace_back(10, "hello");  // 完美转发参数给 MyClass 构造函数
// 流程:
// 1. 在容器已分配内存上 placement new 构造 MyClass(10, "hello")
// 总计:1 次构造
```

**少了一次移动 + 一次析构**——构造函数开销大(分配内存、IO)时,差距显著。

## 二、性能差异的真实场景

### 场景 1:从参数直接构造(emplace 优势明显)

```cpp
class Widget {
    std::string name_;
    std::vector<int> data_;
public:
    Widget(std::string name, size_t n) 
        : name_(std::move(name)), data_(n) {  // 涉及堆分配
    }
};

std::vector<Widget> v;

// push_back 路径(2 次构造 + 1 析构)
v.push_back(Widget("hello", 100));
// 1. 构造临时 Widget(分配 string 内存 + vector 内存)
// 2. 移动到 v(窃取 string + vector 内部指针)
// 3. 析构临时 Widget(string 已被移走,析构空对象)

// emplace_back 路径(1 次构造)
v.emplace_back("hello", 100);
// 1. 在 v 内部直接 placement new 构造
//    - 分配 string 内存
//    - 分配 vector 内存
// 总节省:1 次临时构造 + 1 次析构
```

### 场景 2:已有现成对象(两者等价)

```cpp
Widget w("hello", 100);
v.push_back(w);     // 拷贝构造:从 w 复制
v.emplace_back(w);  // 拷贝构造:从 w 复制(走 const T& 重载)
```

**这个场景下 emplace_back 没有任何优势**——它内部就是 push_back。

## 三、emplace_back 的更多优势

### 1. 变参:支持任意构造函数

```cpp
std::map<std::string, int> m;

// push_back 风格:先构造 pair
std::pair<std::string, int> p("key", 42);
m.insert(p);
// 或 m.insert({"key", 42});

// emplace 风格:直接传 pair 的构造参数
m.emplace("key", 42);  // 完美转发给 pair(string, int) 构造
// 省一次临时 pair 的构造
```

### 2. 显式构造意图

```cpp
std::vector<std::vector<int>> v;
v.emplace_back(3, 10);  // 直接构造 vector<int>(3, 10) — 3 个元素,每个 10
// vs
v.push_back(std::vector<int>(3, 10));  // 同样的效果,但更冗长
```

## 四、`push_back` 反而更好的场景

### 1. 已有现成对象(语义清晰)

```cpp
Widget w(...);
v.push_back(w);     // 意图:把 w 复制一份到 v
v.emplace_back(w);  // 意图:用 w 构造一个新 Widget 在 v 里?
//                    实际也是复制,但读起来不太直观
```

### 2. 避免意外的隐式构造

```cpp
class Vector {
public:
    Vector(size_t n);          // 单参构造
    Vector(std::initializer_list<int>);  // initializer_list 构造
};

std::vector<Vector> v;
v.emplace_back(10);  // 调 Vector(10)?还是 Vector({10})?可能引发歧义
v.push_back(Vector(10));  // 明确:构造 Vector(10)
```

**陷阱**:`emplace_back(0)` 可能意外调用单参构造;`push_back` 类型检查更严格(需要显式类型)。

## 五、扩容时的性能

**重要**:`emplace_back` 不能省"扩容搬迁"的开销。

```cpp
std::vector<MyClass> v;
for (int i = 0; i < 1000000; ++i) {
    v.emplace_back(i);  // 每次:触发扩容时所有元素移动
}
```

- 每次 `emplace_back` 触发扩容:分配新内存 + 移动所有旧元素
- 这部分开销**与 push_back / emplace_back 无关**
- **优化**:`v.reserve(1000000);` 预分配,避免扩容

## 六、异常安全对比

两者**都是强异常安全**(构造函数异常时容器状态不变):

```cpp
v.emplace_back(args);  // 构造函数抛异常 → emplace_back 失败
                        //   v 大小不变,旧元素未受影响

v.push_back(Widget(args));  // 构造临时 Widget 抛异常
                            //   临时对象析构,v 不变
```

**唯一区别**:如果元素类型**移动构造不是 noexcept**,扩容时搬迁可能抛异常——`std::vector` 会退化为拷贝(性能损失)。这条规则和 push_back/emplace_back 选择无关。

## 七、面试高频追问

**Q1: emplace_back 为什么更高效?**
直接接收构造函数参数,通过完美转发在容器已分配内存上 placement new 构造对象。**省掉了临时对象的构造 + 析构**。当构造函数开销大(分配堆、IO)时,差异明显。

**Q2: 已有对象时,emplace_back 还能省吗?**
**不能**。`v.emplace_back(w)` 等价于 `v.push_back(w)`——都是走 const T& 重载的拷贝构造。emplace_back 的优势只在"从参数直接构造"的场景。

**Q3: 什么时候 push_back 更好?**
- 已有现成对象:`push_back(w)` 语义更清晰
- 避免意外隐式转换:`push_back(Widget(10))` 比 `emplace_back(10)` 类型更明确
- 一般短小的入参:`push_back(obj)` 也可读

**Q4: emplace_back 扩容时也能省吗?**
**不能省"扩容搬迁"**——这部分和 push_back/emplace_back 无关。**优化**:`v.reserve(N)` 预分配,避免扩容。

**Q5: 实际工程怎么选?**
**简单原则**:
- 从参数直接构造 → `emplace_back`
- 已有现成对象 → `push_back`
- 性能关键路径(高频、大对象)优先 emplace
- 普通代码优先可读性,两者皆可

## 八、相关扩展

- [lambda 表达式](/notes/lambda-表达式.html) — 配合 lambda 的 STL 算法
- [移动语义](/notes/移动语义.html) — emplace_back 性能优势的来源
- [完美转发](/notes/完美转发.html) — emplace_back 内部机制
- [C++11 新特性](/notes/c++11-新特性.html) — emplace 系列是 C++11 引入