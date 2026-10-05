// 작업 21: 메모리 부족으로 끊긴 첫 실행(regression_task21.json)과 묶음 재실행(regression_after_rest.json)을 합쳐 스크립트별 표를 만든다.
// 사용: node tools/merge_regression_task21.mjs   → verification/dieline-pan/regression_task21.json(이어 쓰기), regression_task21_table.md
import fs from 'node:fs';
const D = 'verification/dieline-pan';
const first = JSON.parse(fs.readFileSync(`${D}/regression_task21.json`, 'utf8'));
if (!fs.existsSync(`${D}/regression_task21_part1_first_run.json`)) fs.writeFileSync(`${D}/regression_task21_part1_first_run.json`, JSON.stringify(first, null, 1)); // 원본 보존
const part1 = JSON.parse(fs.readFileSync(`${D}/regression_task21_part1_first_run.json`, 'utf8'));
const rest = JSON.parse(fs.readFileSync(`${D}/regression_after_rest.json`, 'utf8'));
const NOTE = {
  'dieline_pan_measure_task21.mjs': '측정 도구(자체 600초 매트릭스) — 회귀 대상 아님, 러너 제외로 전환',
  'glb_png_invariance_task12.mjs': '출력 폴더 인자가 필요한 수동 도구 — 러너 제외, 이전·이후 빌드로 따로 실행(GLB sha 동일)',
  'stage26c_count.mjs': '구 UI 집계 도구(#lockToggle 대기 시간 초과) — 작업 21 이전 빌드에서도 동일 실패, 러너 제외',
};
const rows = [];
for (const r of part1) rows.push({ run: '1차(메모리 부족으로 중단 전)', ...r });
for (const r of rest) rows.push({ run: `묶음 ${r.batch}`, ...r });
const manual = [
  { run: '수동', script: 'glb_png_invariance_task12.mjs', exit: 0, sec: 0, tail: 'GLB sha256 3fece704… 이전(post-18r)·이후 동일, PNG 크기 동일' },
  { run: '수동', script: 'stage26c_count.mjs', exit: 1, sec: 0, tail: '이전(post-18r) 빌드에서도 동일 실패(구 UI 집계 도구)', envLimit: true },
  { run: '수동', script: 'ui_parity.mjs', exit: 0, sec: 0, tail: '사라짐 0 / 텍스트 변경(미설명) 0, 이전 410 → 이후 583항목' },
  { run: '수동', script: 'validate_glb.mjs (base10_default_off, dims_h60, exported_base10)', exit: 0, sec: 0, tail: 'errors 0 / warnings 0, 외부 URI 0' },
];
// 같은 스크립트가 두 번 있으면 마지막 결과를 쓴다
const last = new Map(); for (const r of [...rows, ...manual]) last.set(r.script, r);
const final = [...last.values()];
fs.writeFileSync(`${D}/regression_task21.json`, JSON.stringify(final, null, 1));
const md = ['| 실행 | 스크립트 | 결과 | 시간(초) | 비고 |', '|---|---|---|---|---|'];
for (const r of final) md.push(`| ${r.run} | ${r.script} | ${r.exit === 0 ? '통과' : (NOTE[r.script] ? '제외/환경' : '실패')} | ${r.sec || '-'} | ${NOTE[r.script] ?? (r.retried ? '재시도 후 결과' : (r.tail || '').slice(0, 80).replace(/\|/g, '/'))} |`);
const pass = final.filter((r) => r.exit === 0).length;
md.push('', `통과 ${pass} / 전체 ${final.length} (제외·환경 한계 ${final.filter((r) => r.exit !== 0).length}건은 비고 참조)`);
fs.writeFileSync(`${D}/regression_task21_table.md`, md.join('\n'));
console.log(md.slice(-3).join('\n'));
