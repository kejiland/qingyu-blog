#!/usr/bin/env node
// 轻量压缩脚本：保留 public/*.js、public/*.css 为可读源文件，
// 生成 *.min.js / *.min.css 供线上加载（零构建哲学：只在需要发版时手动跑一次）。
//
// 用法：node scripts/minify.mjs
// 依赖：自动通过 npx 拉取 terser 与 clean-css-cli；首次运行需联网。

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

const files = [
  ['config.js', 'config.min.js', 'js'],
  ['posts.js', 'posts.min.js', 'js'],
  ['i18n.js', 'i18n.min.js', 'js'],
  ['app.js', 'app.min.js', 'js'],
  ['music-player.js', 'music-player.min.js', 'js'],
  ['bg-anim.js', 'bg-anim.min.js', 'js'],
  ['admin.js', 'admin.min.js', 'js'],
  ['style.css', 'style.min.css', 'css'],
  ['music-player.css', 'music-player.min.css', 'css'],
  ['admin.css', 'admin.min.css', 'css'],
];

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function quote(a) {
  return '"' + String(a).replace(/"/g, '\\"') + '"';
}

function run(cmd, args) {
  // Windows 下 .cmd 必须交给 shell 执行；这里拼成单条命令行避免 shell+数组的弃用告警。
  const command = process.platform === 'win32' ? cmd + ' ' + args.map(quote).join(' ') : [cmd, ...args].join(' ');
  const r = spawnSync(command, { stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}

for (const [src, dest, kind] of files) {
  const srcPath = join(pub, src);
  const destPath = join(pub, dest);
  if (!existsSync(srcPath)) {
    console.log(`跳过缺失源文件：${src}`);
    continue;
  }
  if (kind === 'js') {
    run(NPX, ['--yes', 'terser', srcPath, '-c', '-m', '-o', destPath]);
  } else {
    run(NPX, ['--yes', 'clean-css-cli', '-o', destPath, srcPath]);
  }
  console.log(`✔ ${src} → ${dest}`);
}
console.log('\n完成。记得同步 bump public/index.html 里的 ?v= 版本号。');
