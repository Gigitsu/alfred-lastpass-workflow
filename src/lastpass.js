#!/usr/bin/osascript -l JavaScript
ObjC.import('stdlib')

const global = this
const app = Application.currentApplication()
app.includeStandardAdditions = true

// Entrypoint
function run(argv) {
  if(argv.length) {
    const fnName = _toCamelCase(argv[0].replace(/^_+/, ''))
    const fn = global[fnName]

    const lpass = _init()

    if (typeof fn === 'function') {
      const args = Array.prototype.slice.call(argv, 1)
      if(![signIn].includes(fn)) _checkStatus(lpass)
      return fn.apply(global, args)
    }
  }
}

//---------------------------------------------------------------------------------------------------------------------

// Exposed functions
////////////////////

function signIn() {
  const username = _env('username') || _prompt('Enter username', 'Enter your LastPass username') (_ => _exit()) (_storeAndReturn('username'))
  const password = _prompt('Enter password', 'Enter your LastPass master password', true) (_ => _exit()) (_)

  _returnToAlfred(username + " " + password)
}

function list() {
  // not yet implemented
}

//---------------------------------------------------------------------------------------------------------------------

// Tools
////////

const which = '/usr/bin/which'

function _init() {
  // Check LastPass installation
  return _execute(which, 'lpass') (_ => _returnToAlfred(_installResponse())) (_)
}

function _checkStatus(lpass) {
  // Check is authenticated
  return _execute(lpass, 'status', '-q') (_ => _returnToAlfred(_signinResponse())) (_)
}

// () -> String
function _printHelp() {
  _stdout('Invalid argument passed')
}

function _installResponse() {
  return {items: [_item({title:'Install LastPass CLI', sub:'LastPass CLI is needed to use this workflow', value:'install', icon:'icon_install.png'})]}
}

function _signinResponse() {
  return {items: [_item({title:'SignIn and fetch items', sub:'Authenticate using your master password', value:'sign_in', icon:'icon_configure.png'})]}
}

function _item({title, value, sub = '', icon = 'icon_round.png'}) {
  return {title: title, subtitle: sub, arg: value, icon: {path: icon}}
}

// String -> String
function _toCamelCase(str) {
  return str.toLowerCase().replace(/([-_][a-z])/g, g => g[1].toUpperCase())
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
function _execute(executableUrl, ...args) {
  return _executeWithInput(executableUrl, false, ...args)
}

// Stromg. Stromg|Boolean, String[] -> Either
function _executeWithInput(executableUrl, input, ...args) {
  const task = $.NSTask.alloc.init

  const stdin = $.NSPipe.pipe
  const stdout = $.NSPipe.pipe

  if(input) {
    stdin.fileHandleForWriting.writeData($.NSString.alloc.initWithString(input + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
    stdin.fileHandleForWriting.closeAndReturnError(false)
  }

  task.arguments = args
  task.standardInput = stdin
  task.standardOutput = stdout
  task.executableURL = $.NSURL.alloc.initFileURLWithPath(executableUrl)

  task.launchAndReturnError(false)

  const dataOut = stdout.fileHandleForReading.readDataToEndOfFile
  const stringOut = $.NSString.alloc.initWithDataEncoding(dataOut, $.NSUTF8StringEncoding).js.trimEnd()

  return task.terminationStatus == 0 ?  Right(stringOut) : Left(stringOut)
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
  catch { return false }
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
