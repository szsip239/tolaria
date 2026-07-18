import { spawn } from 'node:child_process'
import console from 'node:console'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { DEV_APP_CONFIG_NAMESPACE } from './tauri-cli.mjs'

export { DEV_APP_CONFIG_NAMESPACE }

const repoRoot = path.resolve(import.meta.dirname, '..')
const tauriCliPath = path.join(import.meta.dirname, 'tauri-cli.mjs')

function requireAbsolutePath(value, name) {
  const resolved = path.resolve(value)
  if (!path.isAbsolute(resolved)) {
    throw new Error(`${name} must resolve to an absolute path`)
  }
  return resolved
}

export function parseDesktopDevArgs(args, env = process.env) {
  let vaultPath = env.TOLARIA_DEV_VAULT
  const tauriArgs = []
  const desktopArgs = args[0] === '--' ? args.slice(1) : args

  for (let index = 0; index < desktopArgs.length; index += 1) {
    const arg = desktopArgs[index]
    if (arg === '--') {
      tauriArgs.push(...desktopArgs.slice(index + 1))
      break
    }
    if (arg === '--vault') {
      vaultPath = desktopArgs[index + 1]
      index += 1
      continue
    }
    if (arg.startsWith('--vault=')) {
      vaultPath = arg.slice('--vault='.length)
      continue
    }
    tauriArgs.push(arg)
  }

  if (!vaultPath) {
    throw new Error(
      'Provide --vault <path> or set TOLARIA_DEV_VAULT before starting desktop development.',
    )
  }

  return {
    vaultPath: requireAbsolutePath(vaultPath, 'Development vault'),
    tauriArgs,
  }
}

export function resolveDevConfigDir(
  env = process.env,
  platform = process.platform,
  tempDir = os.tmpdir(),
) {
  if (env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME)) {
    return path.join(env.XDG_CONFIG_HOME, DEV_APP_CONFIG_NAMESPACE)
  }
  if (platform === 'win32' && env.APPDATA && path.isAbsolute(env.APPDATA)) {
    return path.join(env.APPDATA, DEV_APP_CONFIG_NAMESPACE)
  }
  if (env.HOME && path.isAbsolute(env.HOME) && platform !== 'win32') {
    return path.join(env.HOME, '.config', DEV_APP_CONFIG_NAMESPACE)
  }
  return path.join(tempDir, DEV_APP_CONFIG_NAMESPACE)
}

export function devConfigFiles(vaultPath) {
  const label = path.basename(vaultPath) || 'Tolaria Dev Vault'
  return {
    'vaults.json': `${JSON.stringify({
      vaults: [{
        label,
        path: vaultPath,
        mounted: true,
      }],
      active_vault: vaultPath,
      default_workspace_path: null,
      hidden_defaults: [],
    }, null, 2)}\n`,
    'last-vault.txt': vaultPath,
    'settings.json': `${JSON.stringify({
      telemetry_consent: false,
      ai_features_enabled: true,
      ui_language: 'zh-CN',
    }, null, 2)}\n`,
  }
}

export function prepareDesktopDev(vaultPath, env = process.env, platform = process.platform) {
  const resolvedVaultPath = requireAbsolutePath(vaultPath, 'Development vault')
  const stat = fs.statSync(resolvedVaultPath, { throwIfNoEntry: false })
  if (!stat?.isDirectory()) {
    throw new Error(`Development vault is not a directory: ${resolvedVaultPath}`)
  }

  const configDir = resolveDevConfigDir(env, platform)
  fs.mkdirSync(configDir, { recursive: true })
  for (const [fileName, content] of Object.entries(devConfigFiles(resolvedVaultPath))) {
    fs.writeFileSync(path.join(configDir, fileName), content)
  }

  return { configDir, vaultPath: resolvedVaultPath }
}

export function runDesktopDev(args = process.argv.slice(2), env = process.env) {
  const parsed = parseDesktopDevArgs(args, env)
  const prepared = prepareDesktopDev(parsed.vaultPath, env)

  console.log(`Tolaria Dev vault: ${prepared.vaultPath}`)
  console.log(`Tolaria Dev config: ${prepared.configDir}`)

  const child = spawn(
    process.execPath,
    [tauriCliPath, 'dev', ...parsed.tauriArgs],
    {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    },
  )

  child.on('error', (error) => {
    console.error(error)
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })

  return child
}

if (process.argv[1] === import.meta.filename) {
  try {
    runDesktopDev()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
