// 리플렛을 인쇄용 PDF와 SNS용 PNG로 내보냅니다 (Chrome 또는 Edge 필요).
//   node tools/export.js                   # 오늘 기준, 이번 달 축제
//   node tools/export.js 11월              # 오늘 기준, 11월 축제
//   node tools/export.js 11-12월           # 오늘 기준, 11~12월 축제를 한 장에
//   node tools/export.js 2026-10-08 11월   # 그날 기준 (지난 축제는 자동으로 빠짐)
// 결과: out/리플렛_10월_A4_양면.pdf, out/리플렛_10월_앞면.png, out/리플렛_10월_뒷면.png
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const mArg = args.find((a) => /^\d{1,2}([-~]\d{1,2})?월?$/.test(a));
const month = mArg ? mArg.replace(/월$/, '').replace('~', '-') : String(date ? +date.slice(5, 7) : new Date().getMonth() + 1);
const mName = month.replace('-', '~'); // 파일 이름용: 11~12

const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
if (!browser) { console.error('Chrome 또는 Edge를 찾지 못했어요.'); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jbon-'));
const url = (q) => {
  const u = pathToFileURL(path.join(ROOT, 'leaflet.html'));
  const p = new URLSearchParams({ ...q, month }); if (date) p.set('date', date);
  u.search = p.toString();
  return u.href;
};
const run = (args) => execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${profile}`, '--virtual-time-budget=15000', ...args], { stdio: 'ignore' });

const pdf = path.join(OUT, `리플렛_${mName}월_A4_양면.pdf`);
run(['--no-pdf-header-footer', `--print-to-pdf=${pdf}`, url({})]);
console.log('PDF  →', path.relative(ROOT, pdf));

// A4 가로 = 1123×794 CSS px, 2배로 찍어 2246×1588 PNG
for (const [side, name] of [['front', `리플렛_${mName}월_앞면.png`], ['back', `리플렛_${mName}월_뒷면.png`]]) {
  const file = path.join(OUT, name);
  run(['--force-device-scale-factor=2', '--window-size=1123,794', `--screenshot=${file}`, url({ shot: side })]);
  console.log('PNG  →', path.relative(ROOT, file));
}
fs.rmSync(profile, { recursive: true, force: true });
