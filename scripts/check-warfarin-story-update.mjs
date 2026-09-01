#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const language = process.env.STORY_LANGUAGE || 'cn'
const repository = process.env.GITHUB_REPOSITORY || 'yabo083/koishi-plugin-miyako-intel'
const releaseTag = process.env.STORY_RELEASE_TAG || 'warfarin-story-latest'
const delayHours = Math.max(0, Number(process.env.STORY_SOURCE_UPDATE_DELAY_HOURS || 0))
const timeoutMs = Number(process.env.STORY_UPDATE_TIMEOUT_MS || 30000)
const nowMs = process.env.STORY_NOW ? Date.parse(process.env.STORY_NOW) : Date.now()
const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
const manifestUrl = `https://github.com/${repository}/releases/download/${releaseTag}/warfarin-story-${language}.manifest.json`

const sourceUpdatedAt = await fetchSourceUpdatedAt()
const manifest = await fetchJson(manifestUrl).catch(() => null)
const seed = await readSeedMetadata()
const result = determineBuild({ manifest, seed, sourceUpdatedAt })

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `needs_build=${result.needsBuild}\nreason=${result.reason}\n`)
}
console.log(JSON.stringify({ ...result, sourceUpdatedAt, previousSourceUpdatedAt: manifest?.sourceUpdatedAt || null }, null, 2))

function determineBuild({ manifest, seed, sourceUpdatedAt }) {
  if (process.env.STORY_FORCE_UPDATE === '1' || process.env.STORY_FORCE_DEEP_CHECK === '1') {
    return { needsBuild: true, reason: 'forced' }
  }
  if (!manifest) return { needsBuild: true, reason: 'manifest-unavailable' }
  if (String(manifest.language || language) !== language) return { needsBuild: true, reason: 'language-changed' }
  if (Number(manifest.parserVersion || 0) < seed.parserVersion) return { needsBuild: true, reason: 'parser-outdated' }
  if (Number(manifest.count || 0) < seed.count) return { needsBuild: true, reason: 'bundle-outdated' }
  if (manifest.sourceUpdatedAt === sourceUpdatedAt) return { needsBuild: false, reason: 'source-unchanged' }

  if (delayHours && String(sourceUpdatedAt) > String(manifest.sourceUpdatedAt || '')) {
    const sourceMs = Date.parse(`${sourceUpdatedAt}T00:00:00.000Z`)
    if (Number.isFinite(sourceMs) && Number.isFinite(nowMs) && nowMs - sourceMs < delayHours * 60 * 60 * 1000) {
      return { needsBuild: false, reason: 'source-update-delayed' }
    }
  }
  return { needsBuild: true, reason: 'source-updated' }
}

async function readSeedMetadata() {
  const [seedSource, builderSource] = await Promise.all([
    readFile(new URL('../src/services/warfarin-story-seed.ts', import.meta.url), 'utf8'),
    readFile(new URL('./build-warfarin-story-bundle.mjs', import.meta.url), 'utf8'),
  ])
  const parserVersion = Number(builderSource.match(/const parserVersion\s*=\s*(\d+)/)?.[1])
  const count = Number(seedSource.match(/bundledStorySeedCount\s*=\s*(\d+)/)?.[1])
  if (!parserVersion || !count) throw new Error('Could not read Warfarin story bundle metadata.')
  return { parserVersion, count }
}

async function fetchSourceUpdatedAt() {
  const html = process.env.STORY_HTML_FETCHER === 'fetch'
    ? await fetchText(`https://warfarin.wiki/${language}`)
    : await fetchTextWithChrome(`https://warfarin.wiki/${language}`)
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  const match = text.match(/最后更新\s*[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/)
    || text.match(/Last updated\s*[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i)
  if (!match) throw new Error('Could not find Warfarin source update date on homepage.')
  return match[1]
}

async function fetchJson(url) {
  if (process.env.STORY_GITHUB_FETCHER === 'curl') return JSON.parse(await runCommand('curl', ['-fsSL', '--retry', '2', '--max-time', String(Math.ceil(timeoutMs / 1000)), url]))
  return JSON.parse(await fetchText(url))
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': browserUserAgent, Accept: 'text/html,application/json,*/*', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    })
    if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}`)
    return response.text()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchTextWithChrome(url) {
  const candidates = process.env.STORY_CHROME_BIN
    ? [process.env.STORY_CHROME_BIN]
    : ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']
  const errors = []
  for (const bin of candidates) {
    try {
      return await runCommand(bin, ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', '--no-sandbox', '--lang=zh-CN', `--user-agent=${browserUserAgent}`, '--dump-dom', url])
    } catch (error) {
      errors.push(`${bin}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`Could not fetch ${url} with headless Chrome. ${errors.join(' | ')}`)
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0 && stdout.trim()) return resolve(stdout)
      reject(new Error(`exited ${code}${stderr ? `: ${stderr.trim().slice(0, 300)}` : ''}`))
    })
  })
}
