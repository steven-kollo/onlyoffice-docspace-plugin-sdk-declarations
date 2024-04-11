#!/usr/bin/env node
// @ts-check

import {spawn} from "node:child_process"
import {mkdir, mkdtemp, writeFile, rm, rmdir} from "node:fs/promises"
import {existsSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {argv} from "node:process"
import {fileURLToPath} from "node:url"
import sade from "sade"
import {Application} from "typedoc"
import pack from "./package.json" with {type: "json"}

/**
 * @typedef {Object} Config
 * @property {ConfigMeta} meta
 * @property {ConfigSource[]} sources
 */

/**
 * @typedef {Object} ConfigMeta
 * @property {string} file
 */

/**
 * @typedef {Object} ConfigSource
 * @property {string} owner
 * @property {string} name
 * @property {string} branch
 * @property {string} entryPoint
 */

/** @type {Config} */
const config = {
  meta: {
    file: "meta.json"
  },
  sources: [
    {
      owner: "onlyoffice",
      name: "docspace-plugin-sdk",
      branch: "master",
      entryPoint: "src/index.ts"
    }
  ]
}

/**
 * @typedef {Partial<Record<string, MetaBranch>>} Meta
 */

/**
 * @typedef {Partial<Record<string, string>>} MetaBranch
 */


main()

/**
 * @returns {void}
 */
function main() {
  sade("./makefile.js")
    .command("build")
    .action(build)
    .parse(argv)
}

/**
 * @returns {Promise<void>}
 */
async function build() {
  const latest = await fetchLatestMeta(config)
  const rd = rootDir()
  const dd = distDir(rd)
  if (!existsSync(dd)) {
    await mkdir(dd)
  }

  const td = await createTempDir()

  await Promise.all(config.sources.map(async (s) => {
    const st = join(td, s.branch)
    await mkdir(st)

    await cloneRepo(st, s)

    const sd = join(dd, s.branch)
    if (!existsSync(sd)) {
      await mkdir(sd)
    }

    await generateJSON(
      {
        entryPoints: [join(st, s.entryPoint)],
        tsconfig: tsconfigFile(st)
      },
      join(sd, `${s.name}.json`)
    )

    await rf(st)
  }))

  await rmdir(td)
  await writeMeta(config, dd, latest)
}

/**
 * @param {Config} c
 * @returns {Promise<Meta>}
 */
async function fetchLatestMeta(c) {
  /** @type {Meta} */
  const m = {}
  await Promise.all(c.sources.map(async (s) => {
    let b = m[s.branch]
    if (b === undefined) {
      b = {}
      m[s.branch] = b
    }
    b[s.name] = await fetchSHA(s)
  }))
  return m
}

/**
 * @param {ConfigSource} s
 * @returns {Promise<string>}
 */
async function fetchSHA(s) {
  const u = `https://api.github.com/repos/${s.owner}/${s.name}/branches/${s.branch}`
  const r = await fetch(u)
  if (r.status !== 200) {
    throw new Error(`Failed to fetch commit SHA for ${s.name}`)
  }
  const j = await r.json()
  return j.commit.sha
}


/**
 * @returns {string}
 */
function rootDir() {
  const u = new URL(".", import.meta.url)
  return fileURLToPath(u)
}

/**
 * @param {string} r
 * @returns {string}
 */
function distDir(r) {
  return join(r, "dist")
}

/**
 * @returns {Promise<string>}
 */
function createTempDir() {
  const d = join(tmpdir(), pack.name)
  return mkdtemp(`${d}-`)
}

/**
 * @param {string} d
 * @param {ConfigSource} s
 * @returns {Promise<void>}
 */
function cloneRepo(d, s) {
  return new Promise((res, rej) => {
    const g = spawn("git", [
      "clone",
      "--progress",
      "--depth", "1",
      "--branch", s.branch,
      "--single-branch",
      `https://github.com/${s.owner}/${s.name}.git`,
      d
    ])
    g.on("close", res)
    g.on("error", rej)
  })
}

/**
 * @param {string} d
 * @returns {string}
 */
function tsconfigFile(d) {
  return join(d, "tsconfig.json")
}

/**
 * @param {Parameters<typeof Application.bootstrapWithPlugins>[0]} opts
 * @param {string} f
 * @returns {Promise<void>}
 */
async function generateJSON(opts, f) {
  const a = await Application.bootstrapWithPlugins(opts);
  const p = await a.convert();
  if (p === undefined) {
    throw new Error("Project is missing")
  }
  await a.generateJson(p, f);
}

/**
 * @param {string} p
 * @returns {Promise<void>}
 */
async function rf(p) {
  await rm(p, {recursive: true, force: true})
}

/**
 * @param {Config} c
 * @param {string} d
 * @param {Meta} m
 * @returns {Promise<void>}
 */
async function writeMeta(c, d, m) {
  const f = join(d, c.meta.file)
  await writeFile(f, JSON.stringify(m, undefined, 2))
}
