import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REPO_ROOT = path.resolve(__dirname, '../../Test')
const SITE_ROOT = path.resolve(__dirname, '..')

const MIGRATIONS = [
  {
    source: path.join(REPO_ROOT, 'wiki/cpp'),
    target: path.join(SITE_ROOT, 'docs/notes'),
    urlPrefix: '/notes'
  },
  {
    source: path.join(REPO_ROOT, 'wiki/计算机基础/操作系统'),
    target: path.join(SITE_ROOT, 'docs/computer-basics/os'),
    urlPrefix: '/computer-basics/os'
  },
  {
    source: path.join(REPO_ROOT, 'wiki/计算机基础/数据库'),
    target: path.join(SITE_ROOT, 'docs/computer-basics/database'),
    urlPrefix: '/computer-basics/database'
  },
  {
    source: path.join(REPO_ROOT, 'wiki/计算机基础/计算机组成原理'),
    target: path.join(SITE_ROOT, 'docs/computer-basics/computer-organization'),
    urlPrefix: '/computer-basics/computer-organization'
  },
  {
    source: path.join(REPO_ROOT, 'wiki/计算机基础/计算机网络'),
    target: path.join(SITE_ROOT, 'docs/computer-basics/network'),
    urlPrefix: '/computer-basics/network'
  }
]

const ASSETS_SOURCE = path.join(REPO_ROOT, 'assets')
const ASSETS_TARGET = path.join(SITE_ROOT, 'docs/public/assets')

function toSlug(name) {
  return name
    .replace(/\s+/g, '-')
    .replace(/[()（）]/g, '')
    .replace(/[^\w\u4e00-\u9fa5\-+#]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function baseNameFromLink(link) {
  let s = link.trim()
  if (s.includes('|')) s = s.split('|')[0].trim()
  if (s.includes('/')) s = s.split('/').pop()
  s = s.replace(/\.md$/, '')
  return s
}

function collectSourceFiles(dir) {
  const result = []
  if (!fs.existsSync(dir)) return result
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      result.push(...collectSourceFiles(path.join(dir, entry.name)))
    } else if (entry.name.endsWith('.md')) {
      result.push(path.join(dir, entry.name))
    }
  }
  return result
}

function escapeCppTemplates(text) {
  const lines = text.split('\n')
  let inCodeBlock = false
  let inInlineCode = false
  const out = []
  for (const rawLine of lines) {
    let line = rawLine
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      out.push(line)
      continue
    }
    if (inCodeBlock) {
      out.push(line)
      continue
    }
    let result = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '`') {
        inInlineCode = !inInlineCode
        result += ch
        continue
      }
      if (inInlineCode) {
        result += ch
        continue
      }
      if (ch === '<' && !line.slice(i).startsWith('<!--')) {
        result += '&lt;'
      } else if (ch === '>') {
        result += '&gt;'
      } else {
        result += ch
      }
    }
    out.push(result)
  }
  return out.join('\n')
}

function transformMarkdown(content, fileSlugMap, currentUrlPrefix) {
  let text = content

  text = text.replace(/\r\n/g, '\n')

  text = text.replace(/^---\n[\s\S]*?\n---\n?/, '')

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    let newSrc = src
    if (newSrc.startsWith('../../../assets/')) {
      newSrc = newSrc.replace('../../../assets/', '/assets/')
    } else if (newSrc.startsWith('../../assets/')) {
      newSrc = newSrc.replace('../../assets/', '/assets/')
    } else if (newSrc.startsWith('../assets/')) {
      newSrc = newSrc.replace('../assets/', '/assets/')
    } else if (newSrc.startsWith('assets/')) {
      newSrc = '/' + newSrc
    }
    return `![${alt}](${newSrc})`
  })

  text = text.replace(/\[\[([^\]]+)\]\]/g, (match, inner) => {
    const displayText = inner.includes('|') ? inner.split('|')[1].trim() : inner.trim()
    const rawTarget = inner.includes('|') ? inner.split('|')[0].trim() : inner.trim()

    if (rawTarget.startsWith('raw/') || rawTarget.startsWith('index/')) {
      return displayText
    }

    const base = baseNameFromLink(rawTarget)

    if (base === '卡码笔记计算机基础总览') {
      return `[${displayText}](/computer-basics/)`
    }

    const target = fileSlugMap.get(base)
    if (target) {
      return `[${displayText}](${target.url}.html)`
    }
    return displayText
  })

  text = escapeCppTemplates(text)

  return text.trim()
}

function copyAssets() {
  if (!fs.existsSync(ASSETS_SOURCE)) return
  fs.mkdirSync(ASSETS_TARGET, { recursive: true })
  const entries = fs.readdirSync(ASSETS_SOURCE, { withFileTypes: true })
  for (const entry of entries) {
    const src = path.join(ASSETS_SOURCE, entry.name)
    const dest = path.join(ASSETS_TARGET, entry.name)
    if (entry.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true, force: true })
    } else {
      fs.copyFileSync(src, dest)
    }
  }
  console.log(`Copied assets: ${ASSETS_SOURCE} -> ${ASSETS_TARGET}`)
}

function cleanTargetDir(dir, preserveIndex = true) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      cleanTargetDir(full, false)
      if (fs.readdirSync(full).length === 0) {
        fs.rmdirSync(full)
      }
    } else if (entry.name.endsWith('.md')) {
      if (preserveIndex && entry.name === 'index.md') continue
      fs.unlinkSync(full)
    }
  }
}

function main() {
  copyAssets()

  const fileSlugMap = new Map()
  const migrationInfos = []

  for (const migration of MIGRATIONS) {
    const files = collectSourceFiles(migration.source)
    for (const file of files) {
      const name = path.basename(file, '.md')
      const slug = toSlug(name)
      const url = `${migration.urlPrefix}/${slug}`
      fileSlugMap.set(name, { migration, file, slug, url })
    }
    migrationInfos.push({ ...migration, files })
  }

  for (const migration of migrationInfos) {
    fs.mkdirSync(migration.target, { recursive: true })
    cleanTargetDir(migration.target, true)
  }

  let total = 0
  for (const migration of migrationInfos) {
    for (const file of migration.files) {
      const name = path.basename(file, '.md')
      const slug = toSlug(name)
      const targetFile = path.join(migration.target, `${slug}.md`)
      const content = fs.readFileSync(file, 'utf-8')
      const transformed = transformMarkdown(content, fileSlugMap, migration.urlPrefix)
      fs.writeFileSync(targetFile, transformed, 'utf-8')
      total++
    }
  }

  console.log(`Migrated ${total} notes.`)
}

main()
