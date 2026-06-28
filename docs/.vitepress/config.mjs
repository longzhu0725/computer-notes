import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '计算机学习笔记',
  description: '个人 C++ 与计算机基础知识点整理与在线查阅',
  lang: 'zh-CN',
  lastUpdated: true,
  cleanUrls: false,
  base: '/computer-notes/',
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: 'C++', link: '/notes/' },
      { text: '计算机基础', link: '/computer-basics/' },
      { text: '关于', link: '/about' }
    ],
    search: {
      provider: 'local'
    },
    sidebar: {
      '/notes/': [
        {
          text: '总览',
          items: [
            { text: 'C++ 学习路线(2026)', link: '/notes/c++-学习路线2026' }
          ]
        },
        {
          text: 'C++ 基础',
          collapsed: false,
          items: [
            { text: '变量作用域', link: '/notes/变量作用域' },
            { text: '指针 vs 引用', link: '/notes/指针-vs-引用' },
            { text: 'struct vs class', link: '/notes/struct-vs-class' },
            { text: 'struct vs union', link: '/notes/struct-vs-union' },
            { text: 'static vs const', link: '/notes/static-vs-const' },
            { text: 'sizeof 与 strlen 的区别', link: '/notes/sizeof-与-strlen-的区别' },
            { text: '类型转换', link: '/notes/类型转换' },
            { text: '浮点数比较', link: '/notes/浮点数比较' },
            { text: 'volatile', link: '/notes/volatile' },
            { text: 'extern C', link: '/notes/extern-c' },
            { text: 'inline vs 宏', link: '/notes/inline-vs-宏' },
            { text: 'auto vs decltype', link: '/notes/auto-vs-decltype' }
          ]
        },
        {
          text: '面向对象',
          collapsed: false,
          items: [
            { text: '封装', link: '/notes/封装' },
            { text: '继承', link: '/notes/继承' },
            { text: '多态', link: '/notes/多态' },
            { text: '构造函数', link: '/notes/构造函数' },
            { text: 'this 指针', link: '/notes/this-指针' },
            { text: '深拷贝 vs 浅拷贝', link: '/notes/深拷贝-vs-浅拷贝' },
            { text: '重载 vs 重写', link: '/notes/重载-vs-重写' },
            { text: '虚函数 vs 纯虚函数', link: '/notes/虚函数-vs-纯虚函数' },
            { text: '虚函数实现机制', link: '/notes/虚函数实现机制' },
            { text: '虚析构函数', link: '/notes/虚析构函数' },
            { text: 'C++ 多态的实现机制', link: '/notes/c++-多态的实现机制' },
            { text: '多重继承与菱形继承', link: '/notes/多重继承与菱形继承' },
            { text: '如何禁止类被继承', link: '/notes/如何禁止类被继承' },
            { text: 'C++ 单例模式', link: '/notes/c++-单例模式' }
          ]
        },
        {
          text: 'STL',
          collapsed: false,
          items: [
            { text: 'STL 容器选型', link: '/notes/stl-容器选型' },
            { text: 'vector 底层原理和扩容机制', link: '/notes/vector-底层原理和扩容机制' },
            { text: 'map、deque、list 底层实现', link: '/notes/map_deque_list-底层实现' },
            { text: 'map vs unordered_map', link: '/notes/map-vs-unordered_map' },
            { text: 'unordered_map 的 rehash 机制', link: '/notes/unordered_map-的-rehash-机制' },
            { text: '迭代器失效', link: '/notes/迭代器失效' },
            { text: 'push_back vs emplace_back', link: '/notes/pushback-vs-emplaceback' },
            { text: 'STL Allocator 机制', link: '/notes/stl-allocator-机制' },
            { text: '仿函数 vs lambda 性能', link: '/notes/仿函数-vs-lambda-性能' }
          ]
        },
        {
          text: '内存管理',
          collapsed: false,
          items: [
            { text: '堆 vs 栈', link: '/notes/堆-vs-栈' },
            { text: 'new vs malloc', link: '/notes/new-vs-malloc' },
            { text: 'free 与 delete 的区别', link: '/notes/free-与-delete-的区别' },
            { text: 'placement new', link: '/notes/placement-new' },
            { text: '内存碎片', link: '/notes/内存碎片' },
            { text: '内存碎片与内存溢出', link: '/notes/内存碎片与内存溢出' },
            { text: '内存泄漏、野指针和内存越界', link: '/notes/内存泄漏、野指针和内存越界' },
            { text: 'RAII 机制', link: '/notes/raii-机制' },
            { text: '智能指针', link: '/notes/智能指针' },
            { text: '智能指针实现原理', link: '/notes/智能指针实现原理' },
            { text: '智能指针的线程安全', link: '/notes/智能指针的线程安全' }
          ]
        },
        {
          text: '现代 C++',
          collapsed: false,
          items: [
            { text: 'C++11 新特性', link: '/notes/c++11-新特性' },
            { text: '左值引用 vs 右值引用', link: '/notes/左值引用-vs-右值引用' },
            { text: '移动语义', link: '/notes/移动语义' },
            { text: '完美转发', link: '/notes/完美转发' },
            { text: 'std::move vs std::forward', link: '/notes/stdmove-vs-stdforward' },
            { text: 'lambda 表达式', link: '/notes/lambda-表达式' },
            { text: '异常处理机制', link: '/notes/异常处理机制' },
            { text: '协程', link: '/notes/协程' }
          ]
        },
        {
          text: '并发与 I/O',
          collapsed: false,
          items: [
            { text: '多线程与锁', link: '/notes/多线程与锁' },
            { text: '自旋锁 vs 互斥锁', link: '/notes/自旋锁-vs-互斥锁' },
            { text: 'select、poll、epoll 区别', link: '/notes/select-poll-epoll-区别' }
          ]
        }
      ],
      '/computer-basics/': [
        {
          text: '总览',
          items: [
            { text: '计算机基础首页', link: '/computer-basics/' }
          ]
        },
        {
          text: '操作系统',
          collapsed: false,
          items: [
            { text: '操作系统基础', link: '/computer-basics/os/操作系统基础' },
            { text: '处理机的两种状态', link: '/computer-basics/os/处理机的两种状态' },
            { text: '用户态和内核态', link: '/computer-basics/os/用户态和内核态' },
            { text: '中断与异常', link: '/computer-basics/os/中断与异常' },
            { text: '中断和异常的区别', link: '/computer-basics/os/中断和异常的区别' },
            { text: '中断处理流程', link: '/computer-basics/os/中断处理流程' },
            { text: '进程和线程的区别', link: '/computer-basics/os/进程和线程的区别' },
            { text: '进程调度算法', link: '/computer-basics/os/进程调度算法' },
            { text: '进程调度算法适用场景', link: '/computer-basics/os/进程调度算法适用场景' },
            { text: '作业内存进程调度区别', link: '/computer-basics/os/作业内存进程调度区别' },
            { text: '线程同步方式', link: '/computer-basics/os/线程同步方式' },
            { text: '进程同步与互斥', link: '/computer-basics/os/进程同步与互斥' },
            { text: '进程间通信方式', link: '/computer-basics/os/进程间通信方式' },
            { text: '典型的锁类型', link: '/computer-basics/os/典型的锁类型' },
            { text: '死锁产生的原因', link: '/computer-basics/os/死锁产生的原因' },
            { text: '死锁与避免', link: '/computer-basics/os/死锁与避免' },
            { text: '银行家算法', link: '/computer-basics/os/银行家算法' },
            { text: '内存连续分配方式', link: '/computer-basics/os/内存连续分配方式' },
            { text: '内存分段和分页', link: '/computer-basics/os/内存分段和分页' },
            { text: '虚拟内存', link: '/computer-basics/os/虚拟内存' },
            { text: '虚拟内存与页面置换', link: '/computer-basics/os/虚拟内存与页面置换' },
            { text: '页面置换算法', link: '/computer-basics/os/页面置换算法' },
            { text: '设备管理功能', link: '/computer-basics/os/设备管理功能' },
            { text: '磁盘调度算法', link: '/computer-basics/os/磁盘调度算法' },
            { text: 'IO 控制方式', link: '/computer-basics/os/io控制方式' },
            { text: 'IO 模型', link: '/computer-basics/os/io模型' },
            { text: 'poll 为什么更高效', link: '/computer-basics/os/poll为什么更高效' },
            { text: '程序编译过程', link: '/computer-basics/os/程序编译过程' },
            { text: '硬链接与软链接', link: '/computer-basics/os/硬链接与软链接' }
          ]
        },
        {
          text: '计算机网络',
          collapsed: false,
          items: [
            { text: '从 URL 到页面展示', link: '/computer-basics/network/从url到页面展示' },
            { text: 'DNS 查询过程', link: '/computer-basics/network/dns查询过程' },
            { text: 'HTTP 请求方式', link: '/computer-basics/network/http请求方式' },
            { text: 'GET 与 POST 的区别', link: '/computer-basics/network/get与post的区别' },
            { text: 'HTTP 1.0 与 1.1 的区别', link: '/computer-basics/network/http-10与11的区别' },
            { text: 'HTTP 2.0 的改进', link: '/computer-basics/network/http-20的改进' },
            { text: 'HTTP 常见状态码', link: '/computer-basics/network/http常见状态码' },
            { text: 'HTTP 请求头部字段', link: '/computer-basics/network/http请求头部字段' },
            { text: 'HTTP 多 TCP 连接', link: '/computer-basics/network/http多tcp连接' },
            { text: 'HTTPS 与 HTTP 的区别', link: '/computer-basics/network/https与http的区别' },
            { text: 'HTTPS 工作原理', link: '/computer-basics/network/https工作原理' },
            { text: '强缓存与协商缓存', link: '/computer-basics/network/强缓存与协商缓存' },
            { text: 'Cookie 与 Session 的区别', link: '/computer-basics/network/cookie与session的区别' },
            { text: 'TCP 与 UDP 的区别', link: '/computer-basics/network/tcp与udp的区别' },
            { text: 'TCP 三次握手', link: '/computer-basics/network/tcp三次握手' },
            { text: '为什么是三次握手', link: '/computer-basics/network/为什么是三次握手' },
            { text: 'TCP 四次挥手', link: '/computer-basics/network/tcp四次挥手' },
            { text: 'TIME_WAIT 状态', link: '/computer-basics/network/time_wait状态' },
            { text: 'TCP 连接可靠性', link: '/computer-basics/network/tcp连接可靠性' },
            { text: 'TCP 拥塞控制', link: '/computer-basics/network/tcp拥塞控制' },
            { text: 'TCP Keepalive 与 HTTP Keep-Alive 区别', link: '/computer-basics/network/tcp-keepalive与http-keep-alive区别' }
          ]
        },
        {
          text: '数据库',
          collapsed: false,
          items: [
            { text: 'SQL 查询语句执行流程', link: '/computer-basics/database/sql查询语句执行流程' },
            { text: '基本 SQL 语句', link: '/computer-basics/database/基本sql语句' },
            { text: 'MySQL 存储引擎', link: '/computer-basics/database/mysql存储引擎' },
            { text: 'MySQL 日志文件', link: '/computer-basics/database/mysql日志文件' },
            { text: 'MySQL B+ 树索引', link: '/computer-basics/database/mysql-b树索引' },
            { text: '索引的种类', link: '/computer-basics/database/索引的种类' },
            { text: '创建索引的时机', link: '/computer-basics/database/创建索引的时机' },
            { text: '不创建索引的时机', link: '/computer-basics/database/不创建索引的时机' },
            { text: '索引失效场景', link: '/computer-basics/database/索引失效场景' },
            { text: '事务的四大特性 ACID', link: '/computer-basics/database/事务的四大特性acid' },
            { text: '事务隔离级别', link: '/computer-basics/database/事务隔离级别' },
            { text: '数据库锁类型', link: '/computer-basics/database/数据库锁类型' },
            { text: 'MVCC 机制', link: '/computer-basics/database/mvcc机制' },
            { text: '缓存雪崩穿透击穿', link: '/computer-basics/database/缓存雪崩穿透击穿' },
            { text: 'Redis 数据结构', link: '/computer-basics/database/redis数据结构' },
            { text: 'Redis 持久化 RDB 与 AOF', link: '/computer-basics/database/redis持久化rdb与aof' },
            { text: 'Redis 过期策略', link: '/computer-basics/database/redis过期策略' },
            { text: 'Redis 缓存淘汰策略', link: '/computer-basics/database/redis缓存淘汰策略' },
            { text: 'Redis 主从同步', link: '/computer-basics/database/redis主从同步' },
            { text: 'Redis 分布式锁', link: '/computer-basics/database/redis分布式锁' },
            { text: 'Redis 布隆过滤器', link: '/computer-basics/database/redis布隆过滤器' }
          ]
        },
        {
          text: '计算机组成原理',
          collapsed: false,
          items: [
            { text: 'CPU 与 GPU 的区别', link: '/computer-basics/computer-organization/cpu与gpu的区别' },
            { text: '冯诺依曼与哈佛体系结构', link: '/computer-basics/computer-organization/冯诺依曼与哈佛体系结构' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com' }
    ],
    footer: {
      message: '基于 VitePress 构建',
      copyright: 'Copyright © 2026'
    }
  }
})
