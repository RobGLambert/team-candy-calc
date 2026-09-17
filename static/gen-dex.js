// Generates static/pokemon-data.js from static/pokemon.json.
// Shipping the dex as a script tag instead of a fetch() removes every
// runtime failure mode (Jekyll, MIME types, caching, file:// URLs).
const fs = require('fs');
const dex = JSON.parse(fs.readFileSync('static/pokemon.json', 'utf8'));
const map = {};
for (const slug in dex) map[dex[slug].name] = dex[slug].experience_group;

const out = '/* Generated from pokemon.json by gen-dex.js — do not edit by hand. */\n'
  + 'window.POKEMON_DATA = ' + JSON.stringify(map) + ';\n';
fs.writeFileSync('static/pokemon-data.js', out);
console.log('wrote static/pokemon-data.js —', Object.keys(map).length, 'species,',
  (out.length/1024).toFixed(1) + 'KB');
