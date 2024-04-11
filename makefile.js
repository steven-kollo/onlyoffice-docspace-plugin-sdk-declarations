#!/usr/bin/env node
// @ts-check

import {spawn} from "node:child_process"
import {mkdtemp, rm, mkdir, rmdir} from "node:fs/promises"
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
 * @property {ConfigSource[]} sources
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
  sources: [
    {
      owner: "onlyoffice",
      name: "docspace-plugin-sdk",
      branch: "master",
      entryPoint: "src/index.ts"
    },
    {
      owner: "onlyoffice",
      name: "docspace-plugin-sdk",
      branch: "develop",
      entryPoint: "src/index.ts"
    }
  ]
}

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
