'use strict';
// Deterministic local source propagation; no network or runtime dependency.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared/ha-tools-ui.js'), 'utf8');
const runtime = source.split('// Node tests use the canonical factory;')[0].trimEnd();
const digest = crypto.createHash('sha256').update(source).digest('hex');
const start = '// BEGIN HA TOOLS UI V3';
const end = '// END HA TOOLS UI V3';
const block = `${start} source-sha256=${digest}\n${runtime}\n${end}`;
let card = fs.readFileSync(path.join(root, 'ha-config-auditor.js'), 'utf8');
const first = card.indexOf(start);
if (first >= 0) {
  const last = card.indexOf(end, first);
  if (last < 0) throw new Error('Incomplete UI block; refusing to replace source');
  card = card.slice(0, first) + block + card.slice(last + end.length);
} else {
  const anchor = "(function() {\n'use strict';";
  if (!card.includes(anchor)) throw new Error('Consumer closure not found');
  card = card.replace(anchor, `${anchor}\n\n${block}`);
}
const files = ['ha-config-auditor.js', 'custom_components/ha_config_auditor/www/ha-config-auditor.js'];
for (const file of files) {
  const target = path.join(root, file);
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8') !== card) throw new Error(`UI/source parity mismatch: ${file}`);
  } else fs.writeFileSync(target, card);
}
