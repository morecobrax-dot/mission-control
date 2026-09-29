/* =========================================================
   VENDOR THREE.JS
   ---------------------------------------------------------
   The 3D field draws with Three.js, served from this repository
   so the app works offline and nothing is fetched from a CDN.
   The published package ships no minified build (2.1 MB of
   modules), so the field carries a subset: only the classes it
   imports, tree-shaken and minified by esbuild. This script is
   the one way that file is made, so it can be made again:

     node scripts/vendor-three.js

   It needs the network (npm) and is never part of `verify`. It
   downloads the pinned tarball, refuses it unless its integrity
   matches, bundles the subset and writes
     vendor/three/three.min.js     the subset
     vendor/three/LICENSE          three.js's MIT licence
     vendor/three/package.json     provenance: version, tarball
                                   integrity, esbuild version and
                                   options, and the output's sha256
   Contract 30 holds the committed file to that sha256, so a
   hand edit to the vendored code fails the suite.

   To upgrade: change VERSION and INTEGRITY (from
   `npm view three@<v> dist.integrity`), run this, then read the
   release notes for every renamed or removed export in EXPORTS.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'vendor', 'three');
const WORK = path.join(ROOT, '.vendor-build');

const VERSION = '0.186.1';
const INTEGRITY = 'sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==';
const ESBUILD = '0.25.10';
/* es2020 keeps the output free of class static blocks, which Safari only
   parses from 16.4; safari15 lowers what else it needs. */
const ESBUILD_ARGS = ['--bundle', '--format=esm', '--minify', '--target=es2020,safari15', '--legal-comments=none'];

/* Everything field/render3d.js imports, and nothing else. */
const EXPORTS = [
  'REVISION', 'WebGLRenderer', 'Scene', 'PerspectiveCamera', 'Group', 'Mesh',
  'BufferGeometry', 'Float32BufferAttribute',
  'BoxGeometry', 'CylinderGeometry', 'ConeGeometry', 'SphereGeometry', 'TorusGeometry',
  'RingGeometry', 'PlaneGeometry', 'CircleGeometry',
  'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshStandardMaterial', 'MeshBasicMaterial', 'CanvasTexture',
  'Color', 'Vector3', 'Matrix4', 'Euler',
  'HemisphereLight', 'DirectionalLight', 'AdditiveBlending', 'SRGBColorSpace',
  'PCFShadowMap', 'ACESFilmicToneMapping', 'RoundedBoxGeometry'
];

/* One command line, quoting only what needs it: npm and npx are scripts on
   Windows, so they run through a shell either way. */
function run(parts){
  const line = parts.map(p => /^[\w@.=,/:-]+$/.test(p) ? p : JSON.stringify(p)).join(' ');
  return execSync(line, { cwd: WORK, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function main(){
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  try{
    const packed = JSON.parse(run(['npm', 'pack', 'three@' + VERSION, '--json']))[0];
    if(packed.integrity !== INTEGRITY) throw new Error('tarball integrity ' + packed.integrity + ' is not the pinned ' + INTEGRITY);
    run(['tar', '-xzf', packed.filename]);

    const pkg = path.join(WORK, 'package');
    const entry = path.join(WORK, 'entry.js');
    fs.writeFileSync(entry, 'export { ' + EXPORTS.filter(n => n !== 'RoundedBoxGeometry').join(', ') + " } from './package/build/three.module.js';\n" +
      "export { RoundedBoxGeometry } from './package/examples/jsm/geometries/RoundedBoxGeometry.js';\n");

    const banner = '/* three.js ' + VERSION + ' (r' + VERSION.split('.')[1] + '), a subset for Mission Control.' +
      ' MIT License, Copyright 2010-2025 Three.js Authors: see LICENSE. Made by scripts/vendor-three.js. */';
    const outFile = path.join(WORK, 'three.min.js');
    run(['npx', '--yes', 'esbuild@' + ESBUILD, 'entry.js'].concat(ESBUILD_ARGS, ['--alias:three=./package/build/three.module.js', '--outfile=three.min.js', '--banner:js=' + banner]));

    const bytes = fs.readFileSync(outFile);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'three.min.js'), bytes);
    fs.copyFileSync(path.join(pkg, 'LICENSE'), path.join(OUT, 'LICENSE'));
    const provenance = {
      type: 'module',
      name: 'three',
      version: VERSION,
      license: 'MIT',
      source: 'https://registry.npmjs.org/three/-/three-' + VERSION + '.tgz',
      integrity: INTEGRITY,
      build: {
        tool: 'esbuild@' + ESBUILD,
        entry: 'package/build/three.module.js',
        addons: ['package/examples/jsm/geometries/RoundedBoxGeometry.js'],
        aliases: { three: './package/build/three.module.js' },
        args: ESBUILD_ARGS,
        exports: EXPORTS
      },
      file: 'three.min.js',
      bytes: bytes.length,
      sha256: sha256
    };
    fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(provenance, null, 2) + '\n');
    console.log('vendor/three/three.min.js  ' + bytes.length + ' bytes  sha256 ' + sha256);
  } finally {
    fs.rmSync(WORK, { recursive: true, force: true });
  }
}

main();
