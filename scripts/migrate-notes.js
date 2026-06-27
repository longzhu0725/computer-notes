import fs from 'node:fs'
import path from 'node:path'

const SOURCE_DIR = 'd:/ProgramData/ObsidianProgram/Test/wiki/cpp'
const TARGET_DIR = 'd:/ProgramData/ObsidianProgram/cpp-wiki-site/docs/notes'

function toSlug(name) {
  return name
    .replace(/[()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
}

function convertObsidianLinks(content, slugMap) {
  return content
    // [[标题|显示文本]] -> [显示文本](./slug.md)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (match, link, display) => {
      const slug = slugMap.get(link.trim()) || toSlug(link.trim())
      return `[${display.trim()}](./${slug}.md)`
    })
    // [[标题]] -> [标题](./slug.md)
    .replace(/\[\[([^\]]+)\]\]/g, (match, link) => {
      const trimmed = link.trim()
      const slug = slugMap.get(trimmed) || toSlug(trimmed)
      return `[${trimmed}](./${slug}.md)`
    })
    // ![[图片]] -> ![图片](./images/图片)
    .replace(/!\[\[([^\]]+)\]\]/g, (match, link) => {
      return `![${link}](./images/${link})`
    })
}

function cleanFrontmatter(frontmatter) {
  const allowed = ['title']
  const lines = frontmatter.split('\n')
  const result = []
  let inList = false
  let currentKey = null

  for (const line of lines) {
    const keyMatch = line.match(/^(\w+):/)
    if (keyMatch) {
      inList = false
      currentKey = keyMatch[1]
      if (allowed.includes(currentKey)) {
        result.push(line)
      }
      const rest = line.slice(keyMatch[0].length).trim()
      if (rest === '' || line.endsWith(':')) {
        inList = true
      }
    } else if (inList && line.trim().startsWith('-')) {
      if (allowed.includes(currentKey)) {
        result.push(line)
      }
    } else {
      inList = false
      currentKey = null
    }
  }

  return result.filter(l => l.trim() !== '').join('\n')
}

function processFile(content, slugMap) {
  let processed = content

  if (content.startsWith('---\n')) {
    const end = content.indexOf('\n---\n', 4)
    if (end !== -1) {
      const frontmatter = content.slice(4, end)
      const body = content.slice(end + 5)
      const cleaned = cleanFrontmatter(frontmatter)
      processed = `---\n${cleaned}\n---\n${body}`
    }
  }

  return convertObsidianLinks(processed, slugMap)
}

function migrate() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`)
    process.exit(1)
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true })

  const files = fs.readdirSync(SOURCE_DIR)
    .filter(f => f.endsWith('.md'))

  const slugMap = new Map()

  for (const file of files) {
    const base = path.basename(file, '.md')
    const slug = toSlug(base)
    slugMap.set(base, slug)
  }

  for (const file of files) {
    const base = path.basename(file, '.md')
    const slug = slugMap.get(base)
    const sourcePath = path.join(SOURCE_DIR, file)
    const targetPath = path.join(TARGET_DIR, `${slug}.md`)

    let content = fs.readFileSync(sourcePath, 'utf-8')
    content = processFile(content, slugMap)
    fs.writeFileSync(targetPath, content, 'utf-8')
    console.log(`Migrated: ${file} -> ${slug}.md`)
  }

  console.log(`\nTotal: ${files.length} files migrated to ${TARGET_DIR}`)
}

migrate()
