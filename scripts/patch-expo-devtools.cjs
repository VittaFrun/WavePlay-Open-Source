const fs = require('node:fs');
const path = require('node:path');

// Development server only. Avoid OkHttp's deflater close race in older installed clients.
const expoRoot = path.dirname(require.resolve('expo/package.json'));
const cliRoot = path.dirname(require.resolve('@expo/cli/package.json', {paths: [expoRoot]}));
const target = path.join(cliRoot, 'build/src/start/server/metro/debugging/createDebugMiddleware.js');
const marker = 'waveplay:uncompressed-network-inspector';
let source = fs.readFileSync(target, 'utf8');
if (source.includes(marker)) process.exit(0);
const before = /function createNetworkWebsocket\(debuggerWebsocket\) \{([\s\S]*?)perMessageDeflate: true,/;
if (!before.test(source)) throw new Error('Expo CLI cambió el inspector de red; revisa la corrección de compresión WebSocket.');
source = source.replace(before, (_match, prefix) => `function createNetworkWebsocket(debuggerWebsocket) {${prefix}// ${marker}: keep messages and debugging, skip compression only.\n        perMessageDeflate: false,`);
fs.writeFileSync(target, source);
