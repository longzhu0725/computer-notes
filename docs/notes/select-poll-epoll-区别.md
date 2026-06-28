# select / poll / epoll 区别

## 核心结论

三者都是让**单线程同时监视多个 fd 就绪状态**的机制。核心区别在于:**select** 用位图、有 1024 限制、每次轮询 O(n);**poll** 用数组、去掉数量限制、但仍 O(n) 遍历;**epoll** 用红黑树 + 就绪链表 + 事件回调,只返回活跃 fd,大量连接时性能碾压前两者。

| 维度 | select | poll | epoll |
|------|--------|------|-------|
| 数据结构 | 位图 `fd_set` | `pollfd` 结构体数组 | 红黑树 + 就绪链表 |
| fd 数量限制 | **默认 1024**(`FD_SETSIZE`) | 无硬性限制(系统 ulimit) | 无硬性限制 |
| 每次调用开销 | 重设 fd_set + 拷贝到内核 + 遍历所有 fd | 拷贝整个数组到内核 + 遍历所有 fd | 只取就绪链表,无需遍历 |
| 就绪通知方式 | 返回后需遍历所有 fd 找就绪的 | 返回后需遍历所有 fd 找就绪的 | **`epoll_wait` 直接返回就绪 fd 列表** |
| 时间复杂度 | O(n) | O(n) | **O(活跃连接数)** |
| 触发模式 | 仅水平触发(LT) | 仅水平触发(LT) | 支持 LT 和**边缘触发(ET)** |
| 跨平台 | ✅(POSIX) | ✅(POSIX) | ❌(Linux 特有) |

## 为什么 epoll 在大量连接时碾压 select/poll

select/poll 每次调用都要做三件事:

1. 把所有监控的 fd 从用户态**拷贝到内核态**
2. 内核**遍历所有 fd** 检查就绪状态
3. 返回后用户态再遍历一遍找到就绪的

连接数 1 万时,即使只有 10 个活跃,也要遍历 1 万次——这就是 **O(n)** 的代价。

epoll 的设计完全不同:

- `epoll_ctl` 注册 fd 时就把它挂到内核的**红黑树**上,之后不需要重复拷贝
- 当 fd 就绪时,内核通过**回调**把它加入**就绪链表**
- `epoll_wait` 只需要检查就绪链表是否为空,非空就直接返回里面的 fd
- **不管总共监控了多少连接,开销只和活跃连接数成正比**

## LT 和 ET 的区别

### 水平触发(Level Triggered, LT)— 默认

只要 fd 处于就绪状态,`epoll_wait` 每次都会返回它。

- 编程简单(忘了读下次还能读)
- 但如果不及时处理会反复通知,浪费 CPU

### 边缘触发(Edge Triggered, ET)

只在 fd 状态变化时**通知一次**,之后不再通知。

- 必须一次性读完所有数据(用非阻塞 IO + 循环读到 `EAGAIN`)
- 否则数据会丢
- 减少了 `epoll_wait` 的返回次数,高并发场景性能更好
- 编程复杂度更高

**固定搭配**:ET 模式必须用**非阻塞 IO**。如果 fd 是阻塞的,最后一次 `read` 会卡住(没数据了但还在等),整个事件循环就死了。

## 三者使用场景

| 场景 | 推荐 | 理由 |
|------|------|------|
| 连接数 &lt; 1000 + 跨平台 | **select** | 简单、POSIX 标准 |
| 连接数 100-10000 + 跨平台 | **poll** | 没有 1024 限制 |
| Linux + 高并发(万级以上) | **epoll** | O(1) 就绪通知 |
| macOS/BSD | kqueue | 等价于 epoll |
| Windows | IOCP | 异步 IO 模型 |

**注意**:epoll 是 **Linux 特有**。macOS 用 kqueue,Windows 用 IOCP。如果需要跨平台,代码要用 libuv、Boost.Asio 这类库抽象。

## epoll 的两个 API

```cpp
// 1. 创建 epoll 实例
int epfd = epoll_create(1024);  // size 参数被忽略(只是 hint)

// 2. 注册/修改/删除 fd
struct epoll_event ev;
ev.events = EPOLLIN;            // 关注读事件
ev.data.fd = sockfd;
epoll_ctl(epfd, EPOLL_CTL_ADD, sockfd, &ev);
epoll_ctl(epfd, EPOLL_CTL_MOD, sockfd, &ev);  // 修改
epoll_ctl(epfd, EPOLL_CTL_DEL, sockfd, nullptr);  // 删除

// 3. 等待事件
struct epoll_event events[1024];
int n = epoll_wait(epfd, events, 1024, timeout_ms);
for (int i = 0; i < n; ++i) {
    int fd = events[i].data.fd;
    if (events[i].events & EPOLLIN) {
        // 处理读事件
    }
}
```

## ET 模式代码示例

```cpp
// ET + 非阻塞:循环读到 EAGAIN
void handle_read(int fd) {
    while (true) {
        char buf[4096];
        ssize_t n = read(fd, buf, sizeof(buf));
        if (n > 0) {
            // 处理数据
        } else if (n == 0) {
            // 连接关闭
            close(fd);
            break;
        } else {  // n < 0
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;  // 读完了
            }
            // 真实错误
            close(fd);
            break;
        }
    }
}
```

## epoll 的 mmap 是怎么回事?

**早期说法**:epoll 用 mmap 让内核和用户态共享内存来避免拷贝。

**现代实现**:实际上 Linux 内核中,`epoll_wait` 返回就绪事件时仍然有一次从内核到用户态的拷贝(`copy_to_user`),但因为**只拷贝就绪的 fd**(而非全部),数据量很小,开销可以忽略。

**真正省的是**:"注册时一次性拷贝 vs 每次调用都拷贝"。

## select 的 1024 限制能改吗?

可以修改 `FD_SETSIZE` 宏重新编译,但**不推荐**。因为 `fd_set` 是固定大小的位图,改大了栈空间开销也大。需要大量 fd 时直接用 **poll 或 epoll**。

## 性能对比数字(经验值)

| 并发连接数 | select | poll | epoll |
|----------|--------|------|-------|
| 100 | 优秀 | 优秀 | 优秀 |
| 1,000 | 良好 | 良好 | 优秀 |
| 10,000 | 差 | 一般 | 优秀 |
| 100,000 | **不可用** | 差 | 优秀 |

**经验阈值**:
- &lt; 1000 连接:三选一无所谓
- 1000-10000:epoll 优势开始显现
- \&gt; 10000:**必须用 epoll**(或同等机制如 kqueue/IOCP)

## 现代 C++ 的网络库

实际项目几乎不直接用 select/poll/epoll,而是用成熟的网络库:

| 库 | 模型 | 底层 |
|------|------|------|
| Boost.Asio | proactor | epoll/kqueue/IOCP |
| libuv | reactor | epoll/kqueue/IOCP |
| muduo | reactor | epoll(Linux only) |
| gRPC | async | 平台抽象 |
| evpp | reactor | epoll |

**学习建议**:

- 面试必须懂 epoll 原理(高频考点)
- 工作用 Boost.Asio 或 libuv(不用重复造轮子)

## 面试高频追问

**Q1: epoll 为什么比 select 高效?三个关键点**
1. **fd 拷贝**:select 每次调用都拷贝所有 fd,epoll 一次性注册(epoll_ctl)就完事
2. **遍历方式**:select 是全量遍历,epoll 只遍历就绪链表
3. **数据拷贝**:epoll 返回的只是活跃 fd,数据量小

**Q2: epoll 是线程安全的吗?**
**epoll 实例本身**不是线程安全的(一个 epfd 不能被多线程同时 epoll_wait)。但**注册到同一个 epfd 的不同 fd**可以被多线程各自处理(因为不同 fd 是独立的)。

**Q3: epoll 的惊群效应是什么?**
多个线程/进程阻塞在同一个 epfd 的 epoll_wait 上,新连接到来时**所有**等待者被唤醒,但只有一个能 accept,其他都"白醒"。

**解决**:Linux 4.5+ 的 `EPOLLEXCLUSIVE` 标志,或 accept 加锁。

**Q4: reactor 和 proactor 模式的区别?**
- **reactor**(epoll):内核通知 fd 就绪,用户态负责 IO(`read`/`write`)
- **proactor**(IOCP):内核完成 IO,用户态只处理结果(Windows 特有)

epoll 是 reactor,IOCP 是 proactor。理论上 proactor 更优(减少用户态 IO 时间),但编程复杂。

## 相关扩展

- [多线程与锁](/notes/多线程与锁.html) - 高并发的基础
- [自旋锁 vs 互斥锁](/notes/自旋锁-vs-互斥锁.html) - 惊群效应的解决方案
- [协程](/notes/协程.html) - 现代 C++ 异步的另一种选择
- [C++11 新特性](/notes/c++11-新特性.html) - std::async、std::future
- [智能指针的线程安全](/notes/智能指针的线程安全.html) - 跨线程传递连接对象