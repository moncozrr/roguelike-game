// 개발 전용 기능(XP 테스트 키 등)이 프로덕션 빌드에 들어가지 않는지 확인한다.
// 임시 폴더에 실제로 프로덕션 빌드를 만들어 번들 안의 문자열을 검사한다(dist/는 건드리지 않는다).
// 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('프로덕션 빌드에는 개발 전용 키(X, G), 개발 HUD, 테스트용 개발 핸들이 포함되지 않고, 보상 선택 키는 포함된다', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'nine-borders-prod-'));
  try {
    const build = spawnSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', outDir, '--emptyOutDir'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    const assetsDir = join(outDir, 'assets');
    const js = readdirSync(assetsDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(assetsDir, f), 'utf8'))
      .join('\n');
    assert.ok(js.length > 1000, '번들을 읽지 못했습니다');
    assert.ok(js.includes('Digit1'), '보상 선택 키(1/2/3)는 프로덕션에도 있어야 합니다');
    assert.ok(!js.includes('KeyX'), 'XP 테스트 키(KeyX)가 프로덕션 번들에 있습니다');
    assert.ok(!js.includes('KeyG'), '게임 오버 개발 키(KeyG)가 프로덕션 번들에 있습니다');
    assert.ok(!js.includes('+10xp'), '개발 HUD 문구가 프로덕션 번들에 있습니다');
    assert.ok(!js.includes('__nineBorders'), '통합 테스트용 개발 핸들이 프로덕션 번들에 있습니다');
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
