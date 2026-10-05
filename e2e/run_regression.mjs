// 전체 회귀: e2e/*.mjs 를 하나씩(포그라운드, 순차) 실행해 통과/실패 표를 만든다. 빌드 폴더를 임시 서버로 서빙한다.
// 실행: DIST=<빌드 폴더> node e2e/run_regression.mjs <결과 json 경로> [스크립트 이름 접두 필터...]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const E2E = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.DIST, PORT = 8878, URL = `http://127.0.0.1:${PORT}/`;
const SKIP = new Set(['stage24_common.mjs', 'validate_glb.mjs', 'run_regression.mjs', 'standing_measure.mjs', 'tab_shim.mjs', 'ui_inventory.mjs', 'ui_parity.mjs', 'ui_mockup_shots.mjs', 'ui_shots_task12.mjs', 'shadow_default_sweep.mjs', 'shadow_default_shots.mjs', 'shadow_visibility_matrix.mjs', 'shadow_coverage_task11.mjs', 'floor_shadow_offstates.mjs', 'shadow_probe.mjs', 'png_edge_measure_task14.mjs', 'dieline_pan_measure_task21.mjs', 'glb_png_invariance_task12.mjs']); // 공통 도구·탐색·측정용 // 공통 도구·탐색용
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const f = path.join(DIST, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] ?? 'application/octet-stream');
  res.end(fs.readFileSync(f));
}).listen(PORT);
const out = process.argv[2], only = process.argv.slice(3);
let files = fs.readdirSync(E2E).filter((f) => f.endsWith('.mjs') && !SKIP.has(f)).sort();
if (only.length) files = files.filter((f) => only.some((o) => f.startsWith(o)));
const rows = [];
for (const f of files) {
  const t0 = Date.now();
  // 서버 프로세스를 이 스크립트가 쓰도록 비동기 spawn 대신 별도 프로세스에서 실행 (서버는 이 프로세스의 이벤트 루프가 필요하므로 spawn 사용)
  const r = await new Promise((resolve) => {
    import('node:child_process').then(({ spawn }) => {
      const c = spawn(process.execPath, [path.join(E2E, f)], { env: { ...process.env, NO_TAB_SHIM: (f === 'ui_tabs_task12.mjs' || f === 'ui_dialogs_task17.mjs' || f === 'background_task13.mjs' || f === 'edge_inspect_task14.mjs' || f === 'lighting_task15.mjs' || f === 'template_task16.mjs') ? '1' : '', NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(path.join(E2E, 'tab_shim.mjs')).href}`.trim(), SABARI_URL: URL, STAGE_OUT: process.env.STAGE_OUT ?? 'verification-private/regression' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = ''; c.stdout.on('data', (d) => (log += d)); c.stderr.on('data', (d) => (log += d));
      const timer = setTimeout(() => { c.kill(); log += '\n[TIMEOUT 600s]'; }, 600000);
      c.on('close', (code) => { clearTimeout(timer); resolve({ code, log }); });
    });
  });
  rows.push({ script: f, exit: r.code, sec: Math.round((Date.now() - t0) / 1000), tail: r.log.trim().split('\n').slice(-3).join(' | ').slice(0, 300) });
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'} ${f} ${rows.at(-1).sec}s`);
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));
}
srv.close();
