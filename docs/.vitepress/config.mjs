import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'C++ 学习笔记',
  description: '个人 C++ 知识点整理与在线查阅',
  lang: 'zh-CN',
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '笔记', link: '/notes/' },
      { text: '关于', link: '/about' }
    ],
    search: {
      provider: 'local'
    },
    sidebar: {
      '/notes/': [
        {
          text: 'C++ 基础',
          collapsed: false,
          items: []
        },
        {
          text: '面向对象',
          collapsed: false,
          items: []
        },
        {
          text: 'STL',
          collapsed: false,
          items: []
        },
        {
          text: '内存管理',
          collapsed: false,
          items: []
        },
        {
          text: '现代 C++',
          collapsed: false,
          items: []
        },
        {
          text: '并发与 I/O',
          collapsed: false,
          items: []
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
