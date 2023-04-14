#!/usr/bin/osascript -l JavaScript
ObjC.import('stdlib')

// Global configurations
////////////////////////
const global = this

const app = Application.currentApplication()
app.includeStandardAdditions = true

const defaultEnv = { 'HOME': _env('HOME'), 'PATH': _env('PATH') }

//---------------------------------------------------------------------------------------------------------------------

// Entrypoint
function run(argv) {
  const lpass = _lpassIsInstalled()

  if (argv.length) {
    const fnName = _toCamelCase(argv[0].replace(/^_+/, ''))
    const fn = global[fnName]

    if (typeof fn === 'function') {
      const args = Array.prototype.slice.call(argv, 1)
      if (![logIn].includes(fn)) _lpassIsLogged(lpass)
      return fn.apply(global, [lpass, ...args])
    }
  }
}

//---------------------------------------------------------------------------------------------------------------------

// Exposed functions
////////////////////

function logIn(lpass, username) {
  const options = _durationToSeconds(_env('agent_timeout')) (_ => { }) (d => ({ 'LPASS_AGENT_TIMEOUT': d }))
  const password = _prompt('Enter password', 'Enter your LastPass master password', true) (_ => _exit()) (_)

  return _lpassLogIn(lpass, username, password, options)
}

function list(lpass) {
  _getCache('items') (_x => {
    const urls = _lpassListing(lpass, '%ai,%al', _env("auto_refresh") === "1")
    const users = new Map(_lpassListing(lpass, '%ai,%au'))
    const names = new Map(_lpassListing(lpass, '%ai,%an'))
    const groups = new Map(_lpassListing(lpass, '%ai,%ag'))

    const items = urls.filter(([_, url]) => 'http://group' != url).map(([id, url]) => _makeLpassItem(id, names.get(id), groups.get(id), users.get(id), url))

    _saveCache('items', items) (_returnToAlfred) (_)

    return _returnToAlfred({ items: items })
  }) (items => {
    _clearCache('items')

    return _returnToAlfred({rerun: 0.1, items: items })
  })
}

function copyPassword(lpass, id) {
  _lpassCopy(lpass, id, 'password')
  _alfredWorkflowResponse('sensitive_data', { msg: `Password copied to clipboard for ${_env('clipboard_timeout')} seconds` })
}

function copyUsername(lpass, id) {
  _lpassCopy(lpass, id, 'username')
  _alfredWorkflowResponse('sensitive_data', { msg: `Username copied to clipboard for ${_env('clipboard_timeout')} seconds` })
}

function open(lpass, id) {
  _returnToAlfred(`open ${id}`)
}

function viewInLastpass(lpass, id) {
  _returnToAlfred(`view ${id}`)
}

//---------------------------------------------------------------------------------------------------------------------

// LastPass CLI integration
///////////////////////////

// () -> String
function _lpassIsInstalled() {
  // Check LastPass installation
  return _exec('/usr/bin/which', 'lpass') (_installResponse) (_)
}

// String -> String
function _lpassIsLogged(lpass) {
  // Check is authenticated
  return _exec(lpass, 'status', '-q') (_loginResponse) (_)
}

// String -> ()
function _lpassLogIn(lpass, username, password, options = {}) {
  const env = { 'LPASS_DISABLE_PINENTRY': 1, ...options }

  return _execWithInputAndEnv(lpass, password, env, 'login', '--trust', username) (_returnToAlfred) (_ => _returnToAlfred('Successfully logged in'))
}

function _lpassListing(lpass, format, sync = false) {
  return _exec(lpass, 'ls', '--sync=' + (sync ? 'auto' : 'no'), '--color=never', '--format', format) (_retryFeetchResponse) (_splitLines)
}

function _lpassCopy(lpass, id, field) {
  return _exec(lpass, 'show', '--sync=auto', '--clip', `--${field}`, id) (_returnToAlfred) (_)
}

//---------------------------------------------------------------------------------------------------------------------

// Alfred integration
/////////////////////

// () -> ()
function _installResponse() {
  return _returnToAlfred({
    items: [{
      title: 'Install LastPass CLI', subtitle: 'LastPass CLI is needed to use this workflow',
      arg: 'install',
      icon: { path: 'icon_install.png' },
    }]
  })
}

// () -> ()
function _loginResponse() {
  return _returnToAlfred({
    items: _env('accounts_list').split(/\r?\n/).map(account => ({
      title: `Log in as ${account}`, subtitle: `Unlock your vault using ${account}'s master password`,
      arg: 'log_in',
      variables: { username: account },
      icon: { path: 'icon_configure.png' },
    }))
  })
}

// () -> ()
function _retryFeetchResponse(err) {
  return _returnToAlfred({
    rerun: 0.1,
    items: [{
      title: 'Unable to fetch items, retrying',
      subtitle: err,
      icon: { path: 'icon_round.png' }
    }]
  })
}

// String, Object -> ()
function _alfredWorkflowResponse(arg, variables = {}) {
  return _returnToAlfred({ alfredworkflow: { arg, variables } })
}

// String,String,String,String,String -> AlfredItem
function _makeLpassItem(id, name, group, username, url) {
  const match = `${name} ${url} ${group}`
  const displayURL = _env('hostnames_only') === "1" ? _getHostname(url) (_ => url) (_) : url
  const [subtitle, type] = url == 'http://sn' ?
    [`Secure note in ${group}`, 'secure_note'] :
    [`${username} | ${displayURL} in ${group}`, 'password']

  return {
    uid: id,
    title: name,
    subtitle: subtitle,
    match: match,
    autocomplete: name,
    arg: id,
    action: { url: url },
    icon: { path: 'icon_round.png' },
    text: { copy: `${group}\\${name}` },
    variables: { id, url, type, username },
  }
}

// Object -> ()
function _returnToAlfred(obj) {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj)
  _stdout(str)
  _exit(0)
}

function _saveCache(name, data) {
  try { return Right(_writeJSON(`${_env("alfred_workflow_cache")}/${name}.json`, data)) }
  catch (err) { return Left(err) }
}

function _getCache(name) {
  const path = `${_env("alfred_workflow_cache")}/${name}.json`

  if(_fileExists(path)) return Right(_readJSON(path))
  else return Left(`File ${path} don't exists`)
}

function _clearCache(name) {
  _removeFile(`${_env("alfred_workflow_cache")}/${name}.json`)
}

// String, String -> ()
function _storeConfig(key, value) {
  Application('com.runningwithcrayons.Alfred')
    .setConfiguration(key, { toValue: value, inWorkflow: _env('alfred_workflow_bundleid') });
}

//---------------------------------------------------------------------------------------------------------------------

// macOS integration
////////////////////

// String, String, Boolean -> Either
function _prompt(title, msg, hidden = false) {
  const options = {
    buttons: ['OK', 'Cancel'], defaultButton: 'OK', cancelButton: 'Cancel',
    defaultAnswer: "", hiddenAnswer: hidden,
    withIcon: Path('./icon_configure.icns'), withTitle: title,
  }

  try { return Right(app.displayDialog(msg, options).textReturned) }
  catch { return Left() }
}

// String -> [Object]
function _readJSON(path) {
  return JSON.parse(_readFile(path))
}

// String, [String] -> ()
function _writeJSON(path, data) {
  _mkpath($(path).stringByDeletingLastPathComponent.js)
  _writeFile(path, JSON.stringify(data))
}

// String -> ()
function _mkpath(path) {
  $.NSFileManager
    .defaultManager
    .createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, true, undefined, undefined)
}

// String -> String
function _readFile(path) {
  const data = $.NSFileManager
    .defaultManager
    .contentsAtPath(path)

  return $.NSString
    .alloc
    .initWithDataEncoding(data, $.NSUTF8StringEncoding).js
}

// String, String -> ()
function _writeFile(path, content) {
  $.NSString
    .alloc
    .initWithUTF8String(content)
    .writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null)
}

// String -> ()
function _removeFile(path) {
  $.NSFileManager
    .defaultManager
    .removeItemAtPathError(path, null)
}

// String -> Boolean
function _fileExists(path) {
  return $.NSFileManager
    .defaultManager
    .isReadableFileAtPath(path)
}

// String -> ()
function _stdout(text) {
  $.NSFileHandle
    .fileHandleWithStandardOutput
    .writeData($.NSString.alloc.initWithString(`${text}\n`).dataUsingEncoding($.NSUTF8StringEncoding))
}

// String -> ()
function _stderr(text) {
  $.NSFileHandle
    .fileHandleWithStandardError
    .writeData($.NSString.alloc.initWithString(`${text}\n`).dataUsingEncoding($.NSUTF8StringEncoding))
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

  if (input) {
    stdin.fileHandleForWriting.writeData($.NSString.alloc.initWithString(input).dataUsingEncoding($.NSUTF8StringEncoding))
    stdin.fileHandleForWriting.closeAndReturnError(false)
  }

  task.environment = { ...env, ...defaultEnv }

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

// String -> String|Boolean
function _env(name) {
  try { return $.getenv(name) }
  catch { return '' }
}

// Integer -> ()
function _exit(code = 0) {
  $.exit(code)
}

//---------------------------------------------------------------------------------------------------------------------

// Utilities
////////////

const _ = x => x
const Left = x => l => r => l(x)
const Right = x => l => r => r(x)
const OnLeft = e => l => e(l) (x => x)
const ExitOnLeft = e => l => OnLeft(e) (x => { l(x); _exit(0) })

// String -> String
const _toCamelCase = str => str.toLowerCase().replace(/([-_][a-z])/g, g => g[1].toUpperCase())

// String -> String
const _capitalize = str => `${str.charAt(0).toUpperCase()}${str.slice(1)}`

const _splitLines = str => str.split(/\r?\n/).map(i => i.split(/,(.*)/s).slice(0, 2))

// String -> String
const _withScheme = url => /^(http|https):\/\//.test(url) ? url : `https://${url}`

// String -> Either
function _getHostname(url) {
  try { return Right($.NSURL.URLWithString(_withScheme(url)).host.js) }
  catch (err) { return Left(err) }
}

// String -> Integer
function _durationToSeconds(duration) {
  const matches = duration.match(/(?<quantity>\d+\s*)(?<um>\w+)/)

  if (matches) {
    const um = matches[2]
    let result = parseInt(matches[1].trimEnd())
    if (['s', 'second', 'seconds'].includes(um)) return Right(result)

    result *= 60
    if (['m', 'minute', 'minutes'].includes(um)) return Right(result)

    result *= 60
    if (['h', 'hour', 'hours'].includes(um)) return Right(result)

    result *= 24
    if (['d', 'day', 'days'].includes(um)) return Right(result)

    result *= 7
    if (['w', 'week', 'weeks'].includes(um)) return Right(result)
  }

  return Left()
}
