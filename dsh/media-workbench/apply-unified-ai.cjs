const path = require('node:path');
const fs = require('node:fs');
const ai = require('./unified-ai.cjs');
const { establishSession } = require('./local-session.cjs');
(async () => {
  const data = path.join(__dirname, 'data');
  const config = ai.read(data);
  const session = await establishSession({ baseURL: 'http://127.0.0.1:18081', identityFile: path.join(data, 'canvas-identity.json') });
  const clipPort = Number(fs.readFileSync(path.join(data, 'autoclip/backend.port'), 'utf8'));
  console.log(await ai.synchronize(config, { canvasCookie: session.value, clipPort }));
  ai.prepareDsh(__dirname, data, config);
  console.log('Unified AI configuration applied');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
