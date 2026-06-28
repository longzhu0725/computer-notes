---
title: 计算机基础
sidebar: false
---

# 计算机基础笔记

这里整理了操作系统、计算机网络、数据库和计算机组成原理的核心知识点，面向面试与工程实践。

## 快速开始

- 想了解操作系统全貌，从 [操作系统基础](/computer-basics/os/操作系统基础) 开始
- 准备网络面试，推荐 [TCP 三次握手](/computer-basics/network/tcp三次握手)、[HTTP 与 HTTPS 的区别](/computer-basics/network/https与http的区别)
- 准备数据库面试，推荐 [MVCC 机制](/computer-basics/database/mvcc机制)、[索引的种类](/computer-basics/database/索引的种类)

## 按主题浏览

### 操作系统

- [操作系统基础](/computer-basics/os/操作系统基础)
- [处理机的两种状态](/computer-basics/os/处理机的两种状态)
- [用户态和内核态](/computer-basics/os/用户态和内核态)
- [中断与异常](/computer-basics/os/中断与异常)
- [中断和异常的区别](/computer-basics/os/中断和异常的区别)
- [中断处理流程](/computer-basics/os/中断处理流程)
- [进程和线程的区别](/computer-basics/os/进程和线程的区别)
- [进程调度算法](/computer-basics/os/进程调度算法)
- [进程调度算法适用场景](/computer-basics/os/进程调度算法适用场景)
- [作业内存进程调度区别](/computer-basics/os/作业内存进程调度区别)
- [线程同步方式](/computer-basics/os/线程同步方式)
- [进程同步与互斥](/computer-basics/os/进程同步与互斥)
- [进程间通信方式](/computer-basics/os/进程间通信方式)
- [典型的锁类型](/computer-basics/os/典型的锁类型)
- [死锁产生的原因](/computer-basics/os/死锁产生的原因)
- [死锁与避免](/computer-basics/os/死锁与避免)
- [银行家算法](/computer-basics/os/银行家算法)
- [内存连续分配方式](/computer-basics/os/内存连续分配方式)
- [内存分段和分页](/computer-basics/os/内存分段和分页)
- [虚拟内存](/computer-basics/os/虚拟内存)
- [虚拟内存与页面置换](/computer-basics/os/虚拟内存与页面置换)
- [页面置换算法](/computer-basics/os/页面置换算法)
- [设备管理功能](/computer-basics/os/设备管理功能)
- [磁盘调度算法](/computer-basics/os/磁盘调度算法)
- [IO 控制方式](/computer-basics/os/io控制方式)
- [IO 模型](/computer-basics/os/io模型)
- [poll 为什么更高效](/computer-basics/os/poll为什么更高效)
- [程序编译过程](/computer-basics/os/程序编译过程)
- [硬链接与软链接](/computer-basics/os/硬链接与软链接)

### 计算机网络

- [从 URL 到页面展示](/computer-basics/network/从url到页面展示)
- [DNS 查询过程](/computer-basics/network/dns查询过程)
- [HTTP 请求方式](/computer-basics/network/http请求方式)
- [GET 与 POST 的区别](/computer-basics/network/get与post的区别)
- [HTTP 1.0 与 1.1 的区别](/computer-basics/network/http-10与11的区别)
- [HTTP 2.0 的改进](/computer-basics/network/http-20的改进)
- [HTTP 常见状态码](/computer-basics/network/http常见状态码)
- [HTTP 请求头部字段](/computer-basics/network/http请求头部字段)
- [HTTP 多 TCP 连接](/computer-basics/network/http多tcp连接)
- [HTTPS 与 HTTP 的区别](/computer-basics/network/https与http的区别)
- [HTTPS 工作原理](/computer-basics/network/https工作原理)
- [强缓存与协商缓存](/computer-basics/network/强缓存与协商缓存)
- [Cookie 与 Session 的区别](/computer-basics/network/cookie与session的区别)
- [TCP 与 UDP 的区别](/computer-basics/network/tcp与udp的区别)
- [TCP 三次握手](/computer-basics/network/tcp三次握手)
- [为什么是三次握手](/computer-basics/network/为什么是三次握手)
- [TCP 四次挥手](/computer-basics/network/tcp四次挥手)
- [TIME_WAIT 状态](/computer-basics/network/time_wait状态)
- [TCP 连接可靠性](/computer-basics/network/tcp连接可靠性)
- [TCP 拥塞控制](/computer-basics/network/tcp拥塞控制)
- [TCP Keepalive 与 HTTP Keep-Alive 区别](/computer-basics/network/tcp-keepalive与http-keep-alive区别)

### 数据库

- [SQL 查询语句执行流程](/computer-basics/database/sql查询语句执行流程)
- [基本 SQL 语句](/computer-basics/database/基本sql语句)
- [MySQL 存储引擎](/computer-basics/database/mysql存储引擎)
- [MySQL 日志文件](/computer-basics/database/mysql日志文件)
- [MySQL B+ 树索引](/computer-basics/database/mysql-b+树索引)
- [索引的种类](/computer-basics/database/索引的种类)
- [创建索引的时机](/computer-basics/database/创建索引的时机)
- [不创建索引的时机](/computer-basics/database/不创建索引的时机)
- [索引失效场景](/computer-basics/database/索引失效场景)
- [事务的四大特性 ACID](/computer-basics/database/事务的四大特性acid)
- [事务隔离级别](/computer-basics/database/事务隔离级别)
- [数据库锁类型](/computer-basics/database/数据库锁类型)
- [MVCC 机制](/computer-basics/database/mvcc机制)
- [缓存雪崩穿透击穿](/computer-basics/database/缓存雪崩穿透击穿)
- [Redis 数据结构](/computer-basics/database/redis数据结构)
- [Redis 持久化 RDB 与 AOF](/computer-basics/database/redis持久化rdb与aof)
- [Redis 过期策略](/computer-basics/database/redis过期策略)
- [Redis 缓存淘汰策略](/computer-basics/database/redis缓存淘汰策略)
- [Redis 主从同步](/computer-basics/database/redis主从同步)
- [Redis 分布式锁](/computer-basics/database/redis分布式锁)
- [Redis 布隆过滤器](/computer-basics/database/redis布隆过滤器)

### 计算机组成原理

- [CPU 与 GPU 的区别](/computer-basics/computer-organization/cpu与gpu的区别)
- [冯诺依曼与哈佛体系结构](/computer-basics/computer-organization/冯诺依曼与哈佛体系结构)
