const fs = require('node:fs');
const root = __dirname + '/runtime/host/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai';
const modules = __dirname + '/runtime/host/resources/app.asar/dsh/node_modules';
console.log('yaml', fs.existsSync(modules + '/yaml/package.json'));
console.log(fs.readFileSync(modules + '/@deepseek-ai/dsh-base/cordis.patch.yml', 'utf8').split('\n').filter((line, i, lines) => /llm-pi-ai/.test(line) || /llm-pi-ai/.test(lines[i+1] || '')).join('\n'));
const src = fs.readFileSync(root + '/lib/index.js', 'utf8');
for (const needle of ['const ModelSchema', 'const Config =', 'inputModalities:']) { const i=src.indexOf(needle); console.log(src.slice(Math.max(0,i-70),i+1800)); }
