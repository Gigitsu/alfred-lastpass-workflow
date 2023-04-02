#!/usr/bin/osascript -l JavaScript
ObjC.import('stdlib')

// Global configurations
////////////////////////
const global = this

const app = Application.currentApplication()
app.includeStandardAdditions = true

const defaultEnv = {'HOME': _env('HOME')}

//---------------------------------------------------------------------------------------------------------------------

// Entrypoint
function run(argv) {
  if(argv.length) {
    const fnName = _toCamelCase(argv[0].replace(/^_+/, ''))
    const fn = global[fnName]

    const lpass = _checkInstallation()

    if (typeof fn === 'function') {
      const args = Array.prototype.slice.call(argv, 1)
      if(![signIn].includes(fn)) _checkStatus(lpass)
      return fn.apply(global, [lpass, ...args])
    }
  }
}

//---------------------------------------------------------------------------------------------------------------------

// Exposed functions
////////////////////

function signIn(lpass, username) {
  const password = _prompt('Enter password', 'Enter your LastPass master password', true) (_ => _exit()) (_)

  const env = {'LPASS_DISABLE_PINENTRY': 1, ...defaultEnv}
  _durationToSeconds(_env('agent_timeout'))(_)(d => env['LPASS_AGENT_TIMEOUT'] = d)

  _execWithInputAndEnv(lpass, password, env, 'login', '--trust', username) (err => _returnToAlfred(err)) (_ => _returnToAlfred('Successfully logged in'))
}

function list() {
  // not yet implemented
}

//---------------------------------------------------------------------------------------------------------------------

// Tools
////////

const which = '/usr/bin/which'

function _checkInstallation() {
  // Check LastPass installation
  return _exec(which, 'lpass') (_ => _returnToAlfred(_installResponse())) (_)
}

function _checkStatus(lpass) {
  // Check is authenticated
  return _execWithEnv(lpass, {}, 'status', '-q') (_ => _returnToAlfred(_signinResponse())) (_)
}

function _installResponse() {
  return {items: [_item({title: 'Install LastPass CLI', sub: 'LastPass CLI is needed to use this workflow', value: 'install', icon: 'icon_install.png'})]}
}

function _signinResponse() {
  const items = []

  for(const account of _env('accounts_list').split(/\r?\n/)) {
    items.push(_item({title: `SignIn as ${account}`, sub: `Authenticate using ${account} master password`, value: 'sign_in', icon: 'icon_configure.png', variables: {username: account}}))
  }

  return {items: items}
}

function _item({title, value, sub = '', variables = {}, icon = 'icon_round.png'}) {
  return {title: title, subtitle: sub, arg: value, variables: variables, icon: {path: icon}}
}

// String -> String
function _toCamelCase(str) {
  return str.toLowerCase().replace(/([-_][a-z])/g, g => g[1].toUpperCase())
}

function _durationToSeconds(duration) {
  const matches = duration.match(/(?<quantity>\d+\s*)(?<um>\w+)/)

  if(matches) {
    const um = matches[2]
    let result = parseInt(matches[1].trimEnd())
    if(['s', 'second', 'seconds'].includes(um)) return Right(result)

    result *= 60
    if(['m', 'minute', 'minutes'].includes(um)) return Right(result)

    result *= 60
    if(['h', 'hour', 'hours'].includes(um)) return Right(result)

    result *= 24
    if(['d', 'day', 'days'].includes(um)) return Right(result)

    result *= 7
    if(['w', 'week', 'weeks'].includes(um)) return Right(result)
  }

  return Left()
}

// Object -> ()
function _returnToAlfred(obj) {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj)
  _stdout(str)
  _exit(0)
}

function _prompt(title, msg, hidden=false) {
  const options = {
    buttons: ['OK', 'Cancel'], defaultButton: 'OK', cancelButton: 'Cancel',
    defaultAnswer: "", hiddenAnswer: hidden,
    withIcon: Path('./icon_configure.icns'), withTitle: title,
  }

  try { return Right(app.displayDialog(msg, options).textReturned) }
  catch { return Left() }
}

// String -> ()
function _stdout(text) {
  $.NSFileHandle
    .fileHandleWithStandardOutput
    .writeData($.NSString.alloc.initWithString(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
}

// String, String[] -> Either
function _exec(executableUrl, ...args) {
  return _execWithInputAndEnv(executableUrl, false, false, ...args)
}

// String, Object, String[] -> Either
function _execWithEnv(executableUrl, env, ...args) {
  return _execWithInputAndEnv(executableUrl, false, env, ...args)
}

// String, String, String[] -> Either
function _execWithInput(executableUrl, input, ...args) {
  return _execWithInputAndEnv(executableUrl, input, false, ...args)
}

// Stromg, String|Boolean, String[] -> Either
function _execWithInputAndEnv(executableUrl, input, env, ...args) {
  const task = $.NSTask.alloc.init

  const stdin = $.NSPipe.pipe
  const stderr = $.NSPipe.pipe
  const stdout = $.NSPipe.pipe

  if(input) {
    stdin.fileHandleForWriting.writeData($.NSString.alloc.initWithString(input).dataUsingEncoding($.NSUTF8StringEncoding))
    stdin.fileHandleForWriting.closeAndReturnError(false)
  }

  if(env) {
    task.environment = env
  }

  task.arguments = args
  task.standardInput = stdin
  task.standardError = stderr
  task.standardOutput = stdout
  task.executableURL = $.NSURL.alloc.initFileURLWithPath(executableUrl)

  task.launchAndReturnError(false)

  const outMsg = stdout.fileHandleForReading.readDataToEndOfFileAndReturnError(false)
  const errMsg = stderr.fileHandleForReading.readDataToEndOfFileAndReturnError(false)

  return task.terminationStatus == 0 ?
    Right($.NSString.alloc.initWithDataEncoding(outMsg, $.NSUTF8StringEncoding).js.trimEnd()) :
    Left($.NSString.alloc.initWithDataEncoding(errMsg, $.NSUTF8StringEncoding).js.trimEnd())
}

// String -> String -> String
function _storeAndReturn(key) {
  return value => _store(key, value) || value
}

function _store(key, value) {
  Application('com.runningwithcrayons.Alfred')
    .setConfiguration(key, {toValue: value, inWorkflow: _env('alfred_workflow_bundleid')});
}

// String -> String|Boolean
function _env(name) {
  try { return $.getenv(name) }
  catch { return '' }
}

function _exit(code = 0) {
  $.exit(code)
}

//---------------------------------------------------------------------------------------------------------------------

// Utilities
////////////
const _           = x => x
const Left        = x => l => r => l (x)
const Right       = x => l => r => r (x)
const OnLeft      = e => l => e (l) (x => x)
const ExitOnLeft  = e => l => OnLeft (e) (x => {l(x); _exit(0)})
