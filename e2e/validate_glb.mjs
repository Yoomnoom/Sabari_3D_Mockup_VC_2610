// 사용: node e2e/validate_glb.mjs <file.glb>  → gltf-validator 결과 + 임베드 확인
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const validator = require('../frontend/node_modules/gltf-validator');
const file = process.argv[2];
const buf = fs.readFileSync(file);
const report = await validator.validateBytes(new Uint8Array(buf), { uri: file, maxIssues: 50 });
const jl = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const out = {
  file, bytes: buf.length,
  validator: { errors: report.issues.numErrors, warnings: report.issues.numWarnings, infos: report.issues.numInfos, hints: report.issues.numHints },
  messages: report.issues.messages.filter((m) => m.severity <= 1).map((m) => `${m.code} ${m.pointer}`),
  images: (json.images ?? []).map((i) => ({ mime: i.mimeType, embedded: i.bufferView !== undefined && i.uri === undefined })),
  texturedMaterials: (json.materials ?? []).filter((m) => m.pbrMetallicRoughness?.baseColorTexture).map((m) => m.name),
  extensionsUsed: json.extensionsUsed ?? [],
  nodes: json.nodes.map((n) => n.name),
  externalUris: (json.images ?? []).filter((i) => i.uri).length + (json.buffers ?? []).filter((b) => b.uri).length,
};
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(file.replace(/\.glb$/, '_validation.json'), JSON.stringify(out, null, 2));
process.exit(out.validator.errors ? 1 : 0);
