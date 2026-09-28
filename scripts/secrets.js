/* =========================================================
   SECRET SCAN
   ---------------------------------------------------------
   This repository and its Pages site are public. Mission
   Control's private links — ChatGPT conversations, Claude Code
   sessions — belong on one device and nowhere else, and no
   credential or local machine path belongs in source at all.
   This scan is the guarantee.

     node scripts/secrets.js

   It runs inside `npm run verify` (contract 25), so a leaked
   link is a failing check rather than a public URL.

   FIXTURES
   Tests need link-shaped strings. They use obviously fake ones —
   a host under .test, .example or .invalid, or an id that says
   FAKE, FIXTURE or EXAMPLE — and a match containing one of
   those markers is ignored. A real-looking one fails wherever
   it appears, tests included.

   What is scanned: every text file in the working tree except
   .git, node_modules and the git-ignored moodboards. Untracked
   files are included on purpose — this is how one gets caught
   before it is committed.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SELF = ['scripts/secrets.js'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'references']);
const TEXT_EXT = new Set(['.html', '.js', '.json', '.md', '.css', '.webmanifest', '.txt', '.yml', '.yaml']);

const FIXTURE = /FAKE|FIXTURE|EXAMPLE|\.test\b|\.example\b|\.invalid\b/i;

const RULES = [
  { label: 'ChatGPT conversation link',
    re: /\b(?:chatgpt\.com|chat\.openai\.com)\/(?:c|share|g\/[A-Za-z0-9-]+\/c)\/[A-Za-z0-9_-]{6,}/gi },
  { label: 'Claude session link',
    re: /\bclaude\.ai\/(?:code|chat|share|project)\/(?!new\b)[A-Za-z0-9_-]{6,}/gi },
  { label: 'Claude app session link',
    re: /\bclaude:\/\/code\/(?!new\b)[A-Za-z0-9_-]{6,}/gi },
  { label: 'Claude session id',
    re: /\b(?:session|cse)_[A-Za-z0-9]{12,}\b/g },
  { label: 'Anthropic API key',
    re: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { label: 'OpenAI API key',
    re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { label: 'GitHub token',
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { label: 'AWS access key',
    re: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: 'Slack token',
    re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { label: 'private key',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { label: 'bearer token',
    re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/g },
  { label: 'local user path',
    re: /\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s'"`<>]+|(?:^|[\s'"`(=])\/(?:Users|home)\/[A-Za-z0-9._-]+/g }
];

/* Every hit in one piece of text, minus declared fixtures. Exported so a
   contract can prove the rules catch what they claim to. */
function scanText(text){
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    RULES.forEach(r => {
      const re = new RegExp(r.re.source, r.re.flags);
      let m;
      while((m = re.exec(line)) !== null){
        if(!FIXTURE.test(m[0])) hits.push({ line: i + 1, label: r.label, match: m[0] });
        if(m[0].length === 0) re.lastIndex++;
      }
    });
  });
  return hits;
}

function walk(dir, out){
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    if(SKIP_DIRS.has(e.name)) return;
    const full = path.join(dir, e.name);
    if(e.isDirectory()) walk(full, out);
    else out.push(full);
  });
  return out;
}

function run(){
  const files = walk(ROOT, []).filter(f => TEXT_EXT.has(path.extname(f).toLowerCase()));
  const found = [];
  files.forEach(full => {
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if(SELF.indexOf(rel) !== -1) return;
    scanText(fs.readFileSync(full, 'utf8')).forEach(h => found.push(Object.assign({ file: rel }, h)));
  });

  console.log('secret scan — ' + files.length + ' text files');
  if(!found.length){
    console.log('  clean — no private link, credential or local path found');
    return 0;
  }
  /* The finding is reported by position and kind, never echoed in full: a
     report is exactly where a leaked value spreads next. */
  console.error('\n  FAILED — ' + found.length + ' finding(s):\n');
  found.forEach(h => {
    console.error('    ' + h.file + ':' + h.line + '  [' + h.label + ']  ' + h.match.slice(0, 12) + '…');
  });
  console.error('\n  Remove it. Private links belong in the app on your device, not in the repository.');
  return 1;
}

if(require.main === module) process.exit(run());
module.exports = { run, scanText, RULES, FIXTURE };
