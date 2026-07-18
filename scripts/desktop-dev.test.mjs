import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DEV_APP_CONFIG_NAMESPACE,
  devConfigFiles,
  parseDesktopDevArgs,
  resolveDevConfigDir,
} from './desktop-dev.mjs'

test('uses an explicit vault path and preserves remaining Tauri arguments', () => {
  const parsed = parseDesktopDevArgs([
    '--vault',
    '/tmp/review-vault',
    '--',
    '--no-watch',
  ], {})

  assert.deepEqual(parsed, {
    vaultPath: '/tmp/review-vault',
    tauriArgs: ['--no-watch'],
  })
})

test('accepts the pnpm argument separator before desktop options', () => {
  const parsed = parseDesktopDevArgs([
    '--',
    '--vault',
    '/tmp/review-vault',
  ], {})

  assert.deepEqual(parsed, {
    vaultPath: '/tmp/review-vault',
    tauriArgs: [],
  })
})

test('falls back to TOLARIA_DEV_VAULT when no vault argument is present', () => {
  const parsed = parseDesktopDevArgs([], {
    TOLARIA_DEV_VAULT: '/tmp/env-vault',
  })

  assert.equal(parsed.vaultPath, '/tmp/env-vault')
  assert.deepEqual(parsed.tauriArgs, [])
})

test('rejects a missing development vault', () => {
  assert.throws(
    () => parseDesktopDevArgs([], {}),
    /Provide --vault/,
  )
})

test('uses the isolated Tolaria development namespace', () => {
  const homeDir = path.join(path.sep, 'Users', 'test')

  assert.equal(
    resolveDevConfigDir({ HOME: homeDir }, 'darwin'),
    path.join(homeDir, '.config', DEV_APP_CONFIG_NAMESPACE),
  )
})

test('creates a single-vault development registry without onboarding prompts', () => {
  const vaultPath = path.join(path.sep, 'tmp', 'review-vault')
  const files = devConfigFiles(vaultPath)

  assert.deepEqual(JSON.parse(files['vaults.json']), {
    vaults: [{
      label: 'review-vault',
      path: vaultPath,
      mounted: true,
    }],
    active_vault: vaultPath,
    default_workspace_path: null,
    hidden_defaults: [],
  })
  assert.equal(files['last-vault.txt'], vaultPath)
  assert.deepEqual(JSON.parse(files['settings.json']), {
    telemetry_consent: false,
    ai_features_enabled: true,
    automatic_update_checks_enabled: false,
    ui_language: 'zh-CN',
  })
})

test('brands the development app separately from the installed Tolaria app', () => {
  const configPath = path.join(import.meta.dirname, '..', 'src-tauri', 'tauri.dev.conf.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

  assert.equal(config.productName, 'Knowledge Tolaria Dev')
  assert.equal(config.identifier, 'club.refactoring.tolaria.dev')
  assert.equal(config.bundle.createUpdaterArtifacts, false)
  assert.equal(config.bundle.macOS.infoPlist, 'Info.dev.plist')
  assert.deepEqual(config.plugins['deep-link'].desktop.schemes, ['knowledge-tolaria-dev'])
  assert.deepEqual(config.plugins.updater.endpoints, [])

  const infoPlistPath = path.join(import.meta.dirname, '..', 'src-tauri', config.bundle.macOS.infoPlist)
  const infoPlist = fs.readFileSync(infoPlistPath, 'utf8')
  assert.match(infoPlist, /<key>TOLARIA_APP_CONFIG_NAMESPACE<\/key>\s*<string>com\.tolaria\.app\.dev<\/string>/)
})

test('uses the operating system temp directory when HOME is unavailable', () => {
  assert.equal(
    resolveDevConfigDir({}, 'darwin'),
    path.join(os.tmpdir(), DEV_APP_CONFIG_NAMESPACE),
  )
})
