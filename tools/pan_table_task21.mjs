// 작업 21: 칼선 분할 확대·이동 측정 결과(JSON 조각)를 합쳐 전/후 표(마크다운)로 만든다.
// 사용: node tools/pan_table_task21.mjs [verification/dieline-pan] > 표.md
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2] ?? 'verification/dieline-pan';
const load = (label) => {
  const out = { zoom: [], misc: null };
  for (const f of fs.readdirSync(dir).filter((n) => n.startsWith(`pan_measure_${label}_`) && n.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [k, r] of Object.entries(j.images)) {
      for (const z of r.zoomMethods ?? []) out.zoom.push({ img: k, ...z });
      if (f.includes('_misc')) out.misc = { img: k, ...r };
    }
  }
  return out;
};
const rows = (d) => {
  const by = {};
  for (const z of d.zoom) {
    const key = `${z.method}|${Math.round(z.target * 100)}%`;
    const b = (by[key] ??= { n: 0, max: 0, reset: 0, tl: 0, act: 0 });
    b.n++; b.max = Math.max(b.max, z.errImgPx, z.errScreenPx ?? 0); if (z.panReset) b.reset++; if (z.topLeftAnchored) b.tl++; if (z.activeChanged) b.act++;
  }
  return by;
};
const B = load('before'), A = load('after');
const rb = rows(B), ra = rows(A);
const keys = [...new Set([...Object.keys(rb), ...Object.keys(ra)])].sort();
console.log('| 확대 수단 | 시작 배율 | 전: 건수 / 최대 오차 / 이동초기화 / 왼쪽위 기준 / 영역변경 | 후: 건수 / 최대 오차 / 이동초기화 / 왼쪽위 기준 / 영역변경 |');
console.log('|---|---|---|---|');
const f = (b) => (b ? `${b.n} / ${b.max.toFixed(3)}px / ${b.reset} / ${b.tl} / ${b.act}` : '-');
for (const k of keys) { const [m, t] = k.split('|'); console.log(`| ${m} | ${t} | ${f(rb[k])} | ${f(ra[k])} |`); }
const mx = (r) => Math.max(0, ...Object.values(r).map((b) => b.max));
console.log(`\n최대 오차(px): 전 ${mx(rb).toFixed(3)} / 후 ${mx(ra).toFixed(3)}  · 측정 건수: 전 ${B.zoom.length} / 후 ${A.zoom.length}`);
const show = (t, d) => {
  const m = d.misc; if (!m) return;
  console.log(`\n### ${t} (이미지 ${m.img})`);
  console.log('- 초기 화면:', JSON.stringify(m.initial));
  console.log('- 영역이 덮은 곳 빈 드래그:', JSON.stringify(m.regionCover));
  console.log('- 포커스된 버튼 뒤 Space 드래그:', m.focusSpace.map((x) => `${x.button}:${x.panMoved ? '이동됨' : '안 움직임'}${x.resetToFit ? '·맞춤 초기화' : ''}${x.zoomChangedByRelease ? '·배율 바뀜' : ''}`).join(' / '));
  console.log('- 모서리 도달:', JSON.stringify(m.corners));
  console.log('- 핸들 좌표:', JSON.stringify(m.handles));
  console.log('- 시간(ms):', JSON.stringify(m.timing));
};
show('전', B); show('후', A);
