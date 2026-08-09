import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const firebaseDirectory = path.join(repositoryRoot, '.firebase')
export const localJavaHome = path.join(firebaseDirectory, 'java')

function javaExecutable(javaHome) {
  return path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
}

function inspectJava(command) {
  const result = spawnSync(command, ['-version'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const version = output.match(/(?:java|openjdk) version "?(\d+)/i)?.[1]

  if (result.status !== 0 || !version) return null
  return { command, major: Number(version), output: output.trim() }
}

export function findJava({ requiredMajor = 21 } = {}) {
  const homes = [
    process.env.E2E_JAVA_HOME,
    localJavaHome,
    process.env.JAVA_HOME,
  ].filter(Boolean)
  const candidates = [...new Set(homes.map(javaExecutable)), 'java']
  const inspected = candidates.map(inspectJava).filter(Boolean)
  const compatible = inspected.find((candidate) => candidate.major >= requiredMajor)

  return { compatible, inspected }
}

export function configureJava({ requiredMajor = 21 } = {}) {
  const { compatible, inspected } = findJava({ requiredMajor })

  if (!compatible) {
    const versions = inspected.length
      ? ` Found: ${inspected.map(({ command, major }) => `${command} (Java ${major})`).join(', ')}.`
      : ''
    throw new Error(
      `Firebase E2E requires Java ${requiredMajor} or newer.${versions} ` +
        'Run "npm run e2e:emulators:install" once to install the repository-local runtime.',
    )
  }

  if (path.isAbsolute(compatible.command)) {
    const binDirectory = path.dirname(compatible.command)
    process.env.JAVA_HOME = path.dirname(binDirectory)
    process.env.PATH = `${binDirectory}${path.delimiter}${process.env.PATH ?? ''}`
  }

  return compatible
}
