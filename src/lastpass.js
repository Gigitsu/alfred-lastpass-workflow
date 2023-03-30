#!/usr/bin/osascript -l JavaScript
ObjC.import('stdlib')

const global = this

function run(argv) {
  if(argv.length) {
    _init()

    const fnName = _toCamelCase(argv[0].replace(/^_+/, ''))
    const fn = global[fnName]

    if (typeof fn === 'function') {
      const args = Array.prototype.slice.call(argv, 1)
      return fn.apply(global, args)
    }
  }
}

//---------------------------------------------------------------------------------------------------------------------

// Tools
////////

const which = '/usr/bin/which'

function _init() {
  // Check LastPass installation
  const lpass = OnLeft(_execute(which, 'lpass')) (_ => _returnToAlfred(_installResponse()))

  // Check is authenticated
  OnLeft(_execute(lpass, 'status', '-q')) (_ => _returnToAlfred(_signinResponse()))

  return lpass
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
  _stdout(JSON.stringify(obj))
  $.exit(0)
}

// String -> ()
function _stdout(text) {
  $.NSFileHandle
    .fileHandleWithStandardOutput
    .writeData($.NSString.alloc.initWithString(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
}

// String[] -> Either
function _execute(executableUrl, ...args) {
  const task = $.NSTask.alloc.init
  const stdout = $.NSPipe.pipe

  task.arguments = args
  task.standardOutput = stdout
  task.executableURL = $.NSURL.alloc.initFileURLWithPath(executableUrl)

  task.launchAndReturnError(false)

  const dataOut = stdout.fileHandleForReading.readDataToEndOfFile
  const stringOut = $.NSString.alloc.initWithDataEncoding(dataOut, $.NSUTF8StringEncoding).js.trimEnd()

  return task.terminationStatus == 0 ?  Right(stringOut) : Left(stringOut)
}

// String -> String
function _env(name) {
  return $.NSProcessInfo.processInfo.environment.objectForKey(name).js
}

//---------------------------------------------------------------------------------------------------------------------

// Utilities
////////////

const Left   = x => l => r => l (x)
const Right  = x => l => r => r (x)
const Either = e => l => r => e (l) (r)
const OnLeft = e => l => e (l) (x => x)
const ExitOnLeft = e => l => OnLeft (e) (x => {l(x); $.exit(0)})
