// tslint:disable no-floating-promises
// tslint:disable no-console

import * as _ from 'lodash'
import * as path from 'path'
import * as Generator from 'yeoman-generator'
import yosay = require('yosay')

const sortPjson = require('sort-pjson')
const fixpack = require('fixpack')
const debug = require('debug')('generator-anycli')
const {version} = require('../../package.json')

function stringToArray(s: string) {
  const keywords: string[] = []

  s.split(',').forEach((keyword: string) => {
    if (!keyword.length) {
      return false
    }

    return keywords.push(keyword.trim())
  })

  return keywords
}

class App extends Generator {
  options: {
    defaults?: boolean
    mocha: boolean
    'semantic-release': boolean
    typescript: boolean
  }
  args!: {[k: string]: string}
  type: 'single' | 'multi' | 'plugin' | 'base'
  path: string
  pjson: any
  fromScratch!: boolean
  githubUser: string | undefined
  answers!: {
    name: string
    description: string
    version: string
    engines: {node: string}
    github: {repo: string, user: string}
    author: string
    files: string
    license: string
    options: {
      mocha: boolean
      typescript: boolean
      'semantic-release': boolean
    }
  }
  mocha!: boolean
  semantic_release!: boolean
  ts!: boolean
  get _ext() { return this.ts ? 'ts' : 'js' }

  constructor(args: any, opts: any) {
    super(args, opts)

    this.type = opts.type
    this.path = opts.path
    this.options = {
      defaults: opts.defaults,
      mocha: opts.options.includes('mocha'),
      'semantic-release': opts.options.includes('semantic-release'),
      typescript: opts.options.includes('typescript'),
    }
  }

  async prompting() {
    let msg
    switch (this.type) {
      case 'single':
        msg = 'Time to build a single command CLI with anycli!'
        break
      case 'multi':
        msg = 'Time to build a multi command CLI with anycli!'
        break
      default:
        msg = `Time to build a anycli ${this.type}!`
    }
    this.log(yosay(`${msg} Version: ${version}`))

    if (this.path) {
      this.destinationRoot(path.resolve(this.path))
      process.chdir(this.destinationRoot())
    }
    this.githubUser = await this.user.github.username().catch(debug)
    this.pjson = {
      scripts: {},
      engines: {},
      devDependencies: {},
      dependencies: {},
      anycli: {},
      ...this.fs.readJSON('package.json', {}),
    }
    let repository = this.destinationRoot().split(path.sep).slice(-2).join('/')
    if (this.githubUser) repository = `${this.githubUser}/${repository.split('/')[1]}`
    const defaults = {
      name: this.determineAppname().replace(/ /g, '-'),
      version: '0.0.0',
      license: 'MIT',
      author: this.githubUser ? `${this.user.git.name()} @${this.githubUser}` : this.user.git.name(),
      dependencies: {},
      repository,
      ...this.pjson,
      engines: {
        node: '>=8.0.0',
        ...this.pjson.engines,
      },
      options: this.options,
    }
    this.fromScratch = Object.keys(this.pjson.dependencies).length === 0
    if (this.options.defaults) {
      this.answers = defaults
    } else {
      this.answers = await this.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'npm package name',
          default: defaults.name,
          when: !this.pjson.name,
        },
        {
          type: 'input',
          name: 'description',
          message: 'description',
          default: defaults.description,
          when: !this.pjson.description,
        },
        {
          type: 'input',
          name: 'author',
          message: 'author',
          default: defaults.author,
          when: !this.pjson.author,
        },
        {
          type: 'input',
          name: 'version',
          message: 'version',
          default: defaults.version,
          when: !this.pjson.version,
        },
        {
          type: 'input',
          name: 'license',
          message: 'license',
          default: defaults.license,
          when: !this.pjson.license,
        },
        {
          type: 'input',
          name: 'engines.node',
          message: 'node version supported',
          default: defaults.engines.node,
          when: !this.pjson.engines.node,
        },
        {
          type: 'input',
          name: 'github.user',
          message: 'github owner of repository (https://github.com/OWNER/repo)',
          default: defaults.repository.split('/').slice(0, -1).pop(),
          when: !this.pjson.repository,
        },
        {
          type: 'input',
          name: 'github.repo',
          message: 'github name of repository (https://github.com/owner/REPO)',
          default: (answers: any) => (this.pjson.repository ? this.pjson.repository : answers.name).split('/').pop(),
          when: !this.pjson.repository,
        },
        {
          type: 'checkbox',
          name: 'options',
          message: 'components to include',
          choices: [
            {name: 'mocha', checked: this.fromScratch ? false : !!this.pjson.devDependencies.mocha},
            {name: 'typescript', checked: this.fromScratch ? false : !!this.pjson.devDependencies.typescript},
            {name: 'semantic-release', checked: this.fromScratch ? false : !!this.pjson.scripts.commitmsg},
          ],
          filter: ((arr: string[]) => _.keyBy(arr)) as any,
        },
        {
          type: 'string',
          name: 'files',
          message: 'npm files to pack',
          default: (answers: any) => answers.options.typescript ? '/lib' : '/src',
          filter: stringToArray as any,
          when: this.fromScratch,
        },
      ]) as any
    }
    debug(this.answers)
    this.options = this.answers.options
    this.ts = this.options.typescript
    this.mocha = this.options.mocha
    this.semantic_release = this.options['semantic-release']

    this.pjson.name = this.answers.name || defaults.name
    this.pjson.description = this.answers.description || defaults.description
    this.pjson.version = this.answers.version || defaults.version
    this.pjson.engines.node = this.answers.engines ? this.answers.engines.node : defaults.engines.node
    this.pjson.author = this.answers.author || defaults.author
    this.pjson.files = this.answers.files || defaults.files || [(this.ts ? '/lib' : '/src')]
    this.pjson.license = this.answers.license || defaults.license
    this.pjson.repository = this.answers.github ? `${this.answers.github.user}/${this.answers.github.repo}` : defaults.repository
    this.pjson.scripts.test = 'nps test -l warn'
    this.pjson.scripts.precommit = 'nps lint -l warn'
    this.pjson.keywords = defaults.keywords || [this.type === 'plugin' ? 'anycli-plugin' : 'anycli']
    this.pjson.homepage = defaults.homepage || `https://github.com/${defaults.repository}`
    this.pjson.bugs = defaults.bugs || `https://github.com/${defaults.repository}/issues`

    if (this.type !== 'plugin') {
      this.pjson.main = defaults.main || (this.ts ? 'lib/index.js' : 'src/index.js')
      if (this.ts) {
        this.pjson.types = defaults.types || 'lib/index.d.ts'
      }
    }
    if (this.ts) {
      this.pjson.scripts.prepublishOnly = 'nps build'
    }
    if (this.semantic_release) {
      this.pjson.scripts.commitmsg = 'commitlint -x @commitlint/config-conventional -e $GIT_PARAMS'
    }
  }

  writing() {
    this.sourceRoot(path.join(__dirname, '../../templates'))

    switch (this.type) {
      case 'multi':
      case 'plugin':
        this.pjson.anycli = {
          commands: `./${this.ts ? 'lib' : 'src'}/commands`,
          // hooks: {init: `./${this.ts ? 'lib' : 'src'}/hooks/init`},
          ...this.pjson.anycli,
        }
        break
        default:
    }
    if (this.type === 'multi' && !this.pjson.anycli.plugins) {
      this.pjson.anycli.plugins = [
        '@anycli/version',
      ]
    }

    if (this.pjson.anycli && _.isArray(this.pjson.anycli.plugins)) {
      this.pjson.anycli.plugins.sort()
    }

    if (this.ts) {
      this.fs.copyTpl(this.templatePath('tslint.json'), this.destinationPath('tslint.json'), this)
      this.fs.copyTpl(this.templatePath('tsconfig.json'), this.destinationPath('tsconfig.json'), this)
      if (this.mocha) {
        this.fs.copyTpl(this.templatePath('test/tsconfig.json'), this.destinationPath('test/tsconfig.json'), this)
      }
    }
    if (this.mocha) {
      this.fs.copyTpl(this.templatePath('test/helpers/init.js'), this.destinationPath('test/helpers/init.js'), this)
      this.fs.copyTpl(this.templatePath('test/mocha.opts'), this.destinationPath('test/mocha.opts'), this)
    }
    if (this.fs.exists(this.destinationPath('./package.json'))) {
      fixpack(this.destinationPath('./package.json'), require('fixpack/config.json'))
    }
    this.fs.writeJSON(this.destinationPath('./package.json'), sortPjson(this.pjson))
    this.fs.copyTpl(this.templatePath('editorconfig'), this.destinationPath('.editorconfig'), this)
    this.fs.copyTpl(this.templatePath('scripts/test'), this.destinationPath('.circleci/test'), this)
    if (this.semantic_release) {
      this.fs.copyTpl(this.templatePath('scripts/release'), this.destinationPath('.circleci/release'), this)
    }
    this.fs.copyTpl(this.templatePath('scripts/setup_git'), this.destinationPath('.circleci/setup_git'), this)
    this.fs.copyTpl(this.templatePath('README.md.ejs'), this.destinationPath('README.md'), this)
    this.fs.copyTpl(this.templatePath('circle.yml.ejs'), this.destinationPath('.circleci/config.yml'), this)
    this.fs.copyTpl(this.templatePath('appveyor.yml'), this.destinationPath('appveyor.yml'), this)

    // git
    if (this.fromScratch) this.spawnCommandSync('git', ['init'])
    this.fs.copyTpl(this.templatePath('gitattributes'), this.destinationPath('.gitattributes'), this)

    this.fs.write(this.destinationPath('.gitignore'), this._gitignore())
    this.fs.copyTpl(this.templatePath('eslintrc'), this.destinationPath('.eslintrc'), this)
    const eslintignore = this._eslintignore()
    if (eslintignore.trim()) this.fs.write(this.destinationPath('.eslintignore'), this._eslintignore())
    this.fs.copyTpl(this.templatePath('package-scripts.js.ejs'), this.destinationPath('package-scripts.js'), this)

    switch (this.type) {
      case 'single':
        this._writeSingle()
        break
      case 'plugin':
        this._writePlugin()
        break
      case 'multi':
        this._writeMulti()
        break
      default:
        this._writeBase()
    }
  }

  install() {
    const dependencies: string[] = []
    const devDependencies = [
      'nps',
      'nps-utils',
      'husky',
      'eslint',
      'eslint-config-anycli',
    ]
    switch (this.type) {
      case 'base': break
      case 'single':
        dependencies.push(
          '@anycli/config',
          '@anycli/command',
          'cli-ux',
        )
        devDependencies.push(
          '@anycli/engine',
        )
        break
      case 'plugin':
        dependencies.push(
          '@anycli/command',
          'cli-ux',
        )
        devDependencies.push(
          '@anycli/engine',
          '@anycli/config',
        )
        break
      case 'multi':
        dependencies.push(
          '@anycli/engine',
          '@anycli/config',
          '@anycli/command',
          '@anycli/version',
          '@anycli/not-found',
          '@anycli/help',
          'cli-ux',
        )
    }
    if (this.mocha) {
      devDependencies.push(
        'mocha',
        'chai',
      )
      if (this.type !== 'base') devDependencies.push(
        '@anycli/test',
      )
    }
    if (this.ts) {
      devDependencies.push(
        // '@types/ansi-styles',
        '@types/chai',
        '@types/lodash',
        '@types/mocha',
        '@types/nock',
        '@types/node',
        '@types/node-notifier',
        '@types/read-pkg',
        // '@types/strip-ansi',
        // '@types/supports-color',
        'typescript',
        'ts-node',
        '@anycli/tslint',
      )
    }
    if (this.semantic_release) {
      devDependencies.push(
        '@commitlint/cli',
        '@commitlint/config-conventional',
      )
    }
    Promise.all([
      this.yarnInstall(devDependencies, {dev: true, ignoreScripts: true}),
      this.yarnInstall(dependencies),
    ]).then(() => {
      console.log(`\nCreated ${this.pjson.name} in ${this.destinationRoot()}`)
    })
  }

  private _gitignore(): string {
    const existing = this.fs.exists(this.destinationPath('.gitignore')) ? this.fs.read(this.destinationPath('.gitignore')).split('\n') : []
    return _([
      '*-debug.log',
      '*-error.log',
      '/node_modules',
      '/tmp',
      this.ts && '/lib',
    ])
      .concat(existing)
      .compact()
      .uniq()
      .sort()
      .join('\n') + '\n'
  }

  private _eslintignore(): string {
    const existing = this.fs.exists(this.destinationPath('.eslintignore')) ? this.fs.read(this.destinationPath('.eslintignore')).split('\n') : []
    return _([
      this.ts && '/lib',
    ])
      .concat(existing)
      .compact()
      .uniq()
      .sort()
      .join('\n') + '\n'
  }

  private _writeBase() {
    if (!this.fromScratch) return
    this.fs.copyTpl(this.templatePath(`base/src/index.${this._ext}`), this.destinationPath(`src/index.${this._ext}`), this)
    if (this.mocha) {
      this.fs.copyTpl(this.templatePath(`base/test/index.test.${this._ext}`), this.destinationPath(`test/index.test.${this._ext}`), this)
    }
  }

  private _writePlugin() {
    if (!this.fromScratch) return
    let bin = this.pjson.anycli.bin || this.pjson.anycli.dirname || this.pjson.name
    if (bin.includes('/')) bin = bin.split('/').pop()
    const cmd = `${bin} hello`
    const opts = {...this as any, _, bin, cmd}
    this.fs.copyTpl(this.templatePath('plugin/bin/run'), this.destinationPath('bin/run'), opts)
    this.fs.copyTpl(this.templatePath('bin/run.cmd'), this.destinationPath('bin/run.cmd'), opts)
    this.fs.copyTpl(this.templatePath(`src/command.${this._ext}.ejs`), this.destinationPath(`src/commands/hello.${this._ext}`), {...opts, name: 'hello'})
    if (this.ts) {
      this.fs.copyTpl(this.templatePath('plugin/src/index.ts'), this.destinationPath('src/index.ts'), opts)
    }
    if (this.mocha) {
      this.fs.copyTpl(this.templatePath(`test/command.test.${this._ext}.ejs`), this.destinationPath(`test/commands/hello.test.${this._ext}`), {...opts, name: 'hello'})
    }
  }

  private _writeSingle() {
    if (!this.fromScratch) return
    let bin = this.pjson.anycli.bin || this.pjson.anycli.dirname || this.pjson.name
    if (bin.includes('/')) bin = bin.split('/').pop()
    const opts = {...this as any, _, bin, cmd: bin}
    if (this.ts) {
      this.fs.copyTpl(this.templatePath('single/bin/run.ts'), this.destinationPath('bin/run'), opts)
    } else {
      this.fs.copyTpl(this.templatePath('bin/run'), this.destinationPath('bin/run'), opts)
    }
    this.fs.copyTpl(this.templatePath('bin/run.cmd'), this.destinationPath('bin/run.cmd'), opts)
    this.fs.copyTpl(this.templatePath(`src/command.${this._ext}.ejs`), this.destinationPath(`src/index.${this._ext}`), {...opts, name: 'hello'})
    if (this.mocha) {
      this.fs.copyTpl(this.templatePath(`test/command.test.${this._ext}.ejs`), this.destinationPath(`test/index.test.${this._ext}`), {...opts, name: 'hello'})
    }
  }

  private _writeMulti() {
    if (!this.fromScratch) return
    this._writePlugin()
    this.fs.copyTpl(this.templatePath('bin/run'), this.destinationPath('bin/run'), this)
    this.fs.copyTpl(this.templatePath('bin/run.cmd'), this.destinationPath('bin/run.cmd'), this)
    this.fs.copyTpl(this.templatePath(`multi/src/index.${this._ext}`), this.destinationPath(`src/index.${this._ext}`), this)
  }
}

export = App