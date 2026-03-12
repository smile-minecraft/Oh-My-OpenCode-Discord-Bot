'use strict';

// Comprehensive regex for ANSI escape sequences including:
// - Color codes (\x1b[31m, \x1b[0m)
// - Cursor movement (\x1b[2A, \x1b[10C)
// - Erase functions (\x1b[2J, \x1b[K)
// - OSC sequences (\x1b]0;title\x07)
// - Alternative CSI using \x9b
const ANSI_ESCAPE_PATTERN = '[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]';
const ANSI_PATTERN = new RegExp(ANSI_ESCAPE_PATTERN, 'g');

const PATTERNS = {
  escape: /\x1b\[[0-9;]*[a-zA-Z]/g,
  color256: /\x1b\[(38|48);5;[0-9]{1,3}m/g,
  trueColor: /\x1b\[(38|48);2;[0-9]{1,3};[0-9]{1,3};[0-9]{1,3}m/g,
  cursor: /\x1b\[[0-9]*[A-Za-z]/g,
  erase: /\x1b\[[0-9]*[JK]/g,
  osc: /\x1b\][0-9];.*?\x07|\x1b\][0-9];.*?\x1b\\/g,
  csi: /\x9b[0-9;]*[a-zA-Z]/g,
  bell: /\x07/g,
  carriageReturn: /\r/g,
};

function stripAnsi(str) {
  if (typeof str !== 'string') {
    return str;
  }
  return str.replace(ANSI_PATTERN, '');
}

function stripAnsiByType(str, types) {
  if (typeof str !== 'string') {
    return str;
  }
  
  let result = str;
  for (const type of types) {
    if (PATTERNS[type]) {
      result = result.replace(PATTERNS[type], '');
    }
  }
  return result;
}

function hasAnsi(str) {
  if (typeof str !== 'string') {
    return false;
  }
  return ANSI_PATTERN.test(str);
}

module.exports = {
  ANSI_ESCAPE_PATTERN,
  ANSI_PATTERN,
  PATTERNS,
  stripAnsi,
  stripAnsiByType,
  hasAnsi,
};
