---
title: 自旋锁 vs 互斥锁
---

# C++ 自旋锁 vs 互斥锁

## 核心结论

**自旋锁**:用户态死循环检测锁状态(忙等待),拿锁延迟极低,但等待期间 CPU 空转。**互斥锁**:通过系统调用让拿不到锁的线程睡眠,延迟高但 CPU 可做别的事。**选型标准**:**临界区执行时间 < 上下文切换开销(1-10μs)用自旋锁**,否则用互斥锁。**单核不能用自旋锁**(B 占着唯一 CPU,A 永远拿不到机会解锁)。

| 维度 | 自旋锁 | 互斥锁 |
|------|--------|--------|
| 等待方式 | 忙等待(CPU 死循环) | 睡眠(内核调度) |
| 系统调用 | **无** | 有(futex) |
| 拿锁延迟 | **极低**(ns 级) | 1-10 μs |
| 等待时 CPU 占用 | 100% | 0% |
| 上下文切换 | 无 | 2 次(用户→内核→用户) |
| 适用临界区 | 极短(ns~10μs) | 较长(>10μs) |
| 单核可用? | ✗(会死锁) | ✓ |
| 活锁风险 | **有** | 无 |
| 饥饿风险 | 看实现 | 看实现 |

## 一、自旋锁原理

### `std::atomic_flag` 实现

```cpp
#include <atomic>
class Spinlock {
    std::atomic_flag flag_ = ATOMIC_FLAG_INIT;
public:
    void lock() {
        // test_and_set:原子地把 flag 设为 true,返回旧值
        // 旧值是 true(别人持锁)→ 继续 spin
        // 旧值是 false(锁空闲)→ 我们拿锁,退出
        while (flag_.test_and_set(std::memory_order_acquire)) {
            // 忙等待:CPU 死循环
        }
    }
    void unlock() {
        flag_.clear(std::memory_order_release);  // 清零,释放锁
    }
};
```

**特点**:
- 整个 lock/unlock 过程**无系统调用**
- 等待时 CPU 核心被完全占用
- 适合**临界区极短**的场景

### C++20 增强

```cpp
// C++20 新增 wait/notify_one
class BetterSpinlock {
    std::atomic<bool> flag_{false};
public:
    void lock() {
        while (flag_.exchange(true, std::memory_order_acquire)) {
            flag_.wait(true, std::memory_order_relaxed);  // 让出 CPU,被 notify 时唤醒
        }
    }
    void unlock() {
        flag_.store(false, std::memory_order_release);
        flag_.notify_one();
    }
};
```

**优势**:`wait()` 让出 CPU(避免死循环烧 CPU),`notify_one()` 唤醒等待者——比纯忙等待更友好,但仍比互斥锁快。

## 二、互斥锁原理

### `std::mutex` 实现

```cpp
#include <mutex>
std::mutex m;
void worker() {
    m.lock();
    // 临界区
    m.unlock();
}

// 或 RAII(推荐)
{
    std::lock_guard<std::mutex> lock(m);
    // 临界区
}  // 析构自动 unlock
```

**内部流程**:
1. 第一次 lock:原子尝试拿锁(类似自旋)
2. 拿不到 → **系统调用 `futex`**(Linux)让线程睡眠
3. 持有者 unlock → 触发 `futex` 唤醒等待线程
4. 等待线程被调度,从系统调用返回
5. 再次原子尝试拿锁,成功则进入临界区

**开销**:**1-10 μs** —— 主要来自两次上下文切换(用户态→内核态→用户态)。

## 三、性能拐点

### 临界区时间 vs 上下文切换

```
临界区时间   │ 推荐
─────────────┼──────────
< 1 μs       │ 自旋锁
1 - 10 μs    │ 看情况(自旋锁接近临界)
> 10 μs      │ 互斥锁
```

**判断**:**临界区执行时间 < 上下文切换开销 → 自旋锁划算**。

### 实测数据(典型)

| 临界区 | 自旋锁 | 互斥锁 | 胜出 |
|--------|--------|--------|------|
| 1 ns(简单变量) | 1 ns | 1-10 μs | 自旋 |
| 1 μs(几次内存读写) | 1 μs | 1-10 μs | 接近 |
| 10 μs(复杂计算) | 10 μs(单核) / 10 μs(其他核继续等) | 10 μs + 1-10 μs 切换 | 互斥 |
| 100 μs(IO) | 烧 CPU 100 μs | 睡眠,其他核做有用功 | 互斥 |

## 四、单核为什么不能用自旋锁

### 死锁场景

```cpp
// 单核 CPU,只有 1 个执行流
void A() {
    spinlock.lock();
    sleep(1s);  // 持锁 1 秒
    spinlock.unlock();
}
void B() {
    spinlock.lock();  // 拿不到,A 占着 CPU
    // B 在 spin,但 A 没法运行 → 永远不释放
    // 死锁!
}
```

**只有单核下不阻塞**才能用自旋锁:
1. 时间片到了强制切换(可抢占内核)
2. B 主动 `yield()` 让出 CPU

**但**:让出 CPU 后,B 不再 spin,自旋锁的优势就没了。

## 五、活锁(Livelock)

### 惊群效应

```cpp
// 4 个线程同时自旋同一把锁
void worker(int id) {
    while (flag_.test_and_set()) {
        // 4 个核心都在自旋,但都拿不到
    }
}
```

**活锁**:虽然线程没死锁(都"在运行"),但都没拿到锁,系统空转。

### 解法

```cpp
// 1. 指数退避
while (flag_.test_and_set()) {
    int delay = rand() % 1000;  // 随机退避
    std::this_thread::sleep_for(std::chrono::microseconds(delay));
}

// 2. 票据锁(ticket lock):保证公平
class TicketLock {
    std::atomic<int> next_{0};     // 下一个分配的票号
    std::atomic<int> serving_{0};  // 当前服务的票号
public:
    void lock() {
        int my_ticket = next_.fetch_add(1);
        while (serving_.load() != my_ticket) {
            // 等待自己的票号
        }
    }
    void unlock() {
        serving_.fetch_add(1);  // 服务下一票
    }
};
// 公平 FIFO,避免活锁

// 3. MCS 锁(减少缓存行争用)
```

## 六、自适应自旋:实际工程的折中

```cpp
class HybridLock {
    std::atomic_flag flag_;
    int spin_count_ = 0;
public:
    void lock() {
        // 1. 先自旋 1.5-2 倍上下文切换时间
        for (int i = 0; i < 10; ++i) {
            if (!flag_.test_and_set()) return;  // 拿到锁
            // 让出 CPU
        }
        // 2. 还没拿到 → 退化为互斥锁(睡眠)
        futex_lock();
    }
};
```

**实践**:
- **Java `synchronized`**:JVM 在 monitor enter 时自适应自旋(默认 10 次)
- **Linux kernel `mutex_lock`**:先自旋,后睡眠
- **C++ 标准库**:`std::mutex` 默认是互斥锁(无自旋优化)

## 七、C++ 标准库有自旋锁吗

**没有**。C++ 标准库提供:
- `std::mutex` / `std::recursive_mutex`(互斥锁)
- `std::shared_mutex`(读写锁)
- `std::atomic_flag`(可实现自旋锁)
- `std::atomic<T>::wait()`(C++20,更友好)

**实际工程中需要自旋锁**:用平台实现:
- Linux: `pthread_spinlock_t`
- Windows: `CRITICAL_SECTION`(自适应自旋)
- 或用 `std::atomic_flag` 自己实现

## 八、选型决策流程

```
Q: 临界区有多长?多核还是单核?
│
├─ 单核
│  └─ std::mutex(自旋锁会死锁)
│
├─ 多核 + 临界区 < 1μs
│  └─ 自旋锁(拿锁极快)
│
├─ 多核 + 临界区 1-10μs
│  ├─ 高争用(经常拿不到)
│  │  └─ 互斥锁(避免烧 CPU)
│  └─ 低争用(很少拿不到)
│     └─ 自旋锁(避免上下文切换)
│
└─ 多核 + 临界区 > 10μs
   └─ std::mutex(必须让出 CPU)
```

## 九、面试高频追问

**Q1: 自旋锁 vs 互斥锁的核心区别?**
- 自旋锁:**忙等待**,无系统调用,延迟极低,等待时 CPU 100% 占用
- 互斥锁:**睡眠 + 内核调度**,延迟高(1-10μs),等待时 CPU 0% 占用
- 选型:**临界区 < 上下文切换开销用自旋锁**

**Q2: 性能拐点在哪里?**
**临界区 < 1-10 μs** 用自旋锁,更长用互斥锁。临界区很短时,互斥锁的两次上下文切换开销(1-10μs)比自旋锁的忙等待更大;临界区长时,自旋锁让等待线程白白烧 CPU,反而更慢。

**Q3: 单核为什么不能用自旋锁?**
单核 CPU 只有一个执行流。B 在自旋时占着唯一 CPU,A 没法运行解锁 → **永久死锁**。除非是可抢占内核(时间片到强制切换)或 B 主动 yield,但 yield 后自旋锁的优势(零上下文切换)就没了。

**Q4: 自旋锁会不会活锁?**
**会**。多个线程同时自旋争用同一把锁时,可能出现"惊群效应"——所有线程都拿不到锁,系统空转。**解法**:随机退避、票据锁、MCS 锁。

**Q5: C++ 标准库有自旋锁吗?**
**没有专门类**。可以用 `std::atomic_flag` 的 `test_and_set` + `clear` 自己实现。C++20 新增 `std::atomic_flag::wait()` 和 `notify_one()`,可实现更高效的"自旋+让出"。实际项目通常用平台实现(Linux `pthread_spinlock_t`、Windows `CRITICAL_SECTION`)。

## 十、相关扩展

- [多线程与锁](./多线程与锁.md) — 互斥锁 / 条件变量 / 原子操作
- [内存碎片](./内存碎片.md) — 高并发下自旋锁的缓存影响
- [C++11 新特性](./c++11-新特性.md) — `std::atomic_flag` 是 C++11 引入
