// 전북사랑도민증 할인가맹점 목록을 공식 누리집에서 다시 받아 data/merchants.js 로 만듭니다.
//
//   node tools/update-merchants.js            # 목록 수집 + 좌표 찾기 + 파일 생성
//   node tools/update-merchants.js --offline  # 인터넷 검색 없이 저장된 목록·좌표(cache)로 파일만 다시 생성
//
// · 목록: lovecard.jb.go.kr '할인가맹점 현황' 14개 시군 게시판
// · 좌표: 게시판의 네이버지도 링크에 좌표가 있으면 그대로, 없으면 OpenStreetMap Nominatim 검색
//   (Nominatim 이용 규칙에 따라 1초에 1건씩, 결과는 tools/cache/geocache.json 에 저장해 다시 묻지 않음)
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'cache');
fs.mkdirSync(CACHE, { recursive: true });
const OFFLINE = process.argv.includes('--offline');

const BASE = 'https://lovecard.jb.go.kr';
const LIST = (code) => `${BASE}/planweb/board/list.9is?contentUid=52df5b2081b3286d0181cc3845540441&boardUid=52df5b2081b3286d0181cc3572610423&categoryUid3=${code}`;
const CODES = { 4640000: '전주시', 4670000: '군산시', 4680000: '익산시', 4690000: '정읍시', 4700000: '남원시', 4710000: '김제시', 4720000: '완주군', 4730000: '진안군', 4740000: '무주군', 4750000: '장수군', 4760000: '임실군', 4770000: '순창군', 4780000: '고창군', 4790000: '부안군' };
const CAT = { '음식점': 'food', '카페': 'cafe', '문화·체험': 'culture', '휴양·숙박': 'stay', '스포츠·레저': 'leisure', '기타': 'shop', '의료': 'medical', '휴게소': 'rest' };

// lovecard 누리집은 중간 인증서를 보내지 않아 기본 검증에 실패함 → 이 호스트에만 검증 완화
const lovecardAgent = new https.Agent({ rejectUnauthorized: false });
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent: lovecardAgent, headers: { 'User-Agent': 'Mozilla/5.0 (JeonbukON map updater)' } }, (res) => {
      let s = ''; res.setEncoding('utf8');
      res.on('data', (d) => (s += d)); res.on('end', () => resolve(s));
    }).on('error', reject);
  });
}

const clean = (h) => (h || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/[\u200b\ufeff]/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const unbullet = (s) => s.replace(/[\u200b\ufeff]/g, '').replace(/^[○ㆍ·•\-\s]+/, '').replace(/^주\s*소\s*[:：]\s*/, '').trim();

function parseList(html, sigun) {
  const tb = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  const rows = tb.split(/<tr[^>]*>/).slice(1);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cate = (r.match(/class="tc cate">([\s\S]*?)<\/td>/) || [])[1];
    if (!cate) continue;
    const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const extraRaw = rows[i + 1] || '';
    const both = r + extraRaw;
    const ll = both.match(/lng=([\d.]+)&(?:amp;)?lat=([\d.]+)/);
    const links = [...both.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((a) => ({ href: a[1].replace(/&amp;/g, '&'), text: clean(a[2]).join(' ') }));
    const isMap = (h) => /^https?:\/\/(map\.naver\.com|naver\.me|m\.place\.naver\.com|place\.naver\.com|kko\.to|place\.map\.kakao\.com|map\.kakao\.com)/.test(h);
    const mapA = links.find((a) => isMap(a.href));
    const webA = links.find((a) => !isMap(a.href));
    out.push({
      sigun,
      cate: clean(cate).join(' ').replace(/\s*·\s*/g, '·'),
      name: clean((r.match(/class="tc tit">([\s\S]*?)<\/td>/) || [])[1]).join(' '),
      benefit: clean(tds[3]),
      info: clean(tds[4]),
      extra: clean(extraRaw),
      linkTexts: links.map((a) => a.text).filter(Boolean),
      map: mapA ? mapA.href : null,
      web: webA ? webA.href : null,
      lat: ll ? +ll[2] : null,
      lng: ll ? +ll[1] : null,
    });
  }
  return out;
}

function addrPhone(m) {
  const lines = [...m.info, ...m.extra].map(unbullet);
  const short = m.sigun.slice(0, 2);
  let addr = null, phone = null;
  for (const l of lines) for (const part of l.split(/ㆍ/)) {
    const p = unbullet(part);
    if (!addr && (p.includes(m.sigun) || p.includes(short + '시') || p.includes(short + '군') || /(로|길)\s*\d/.test(p)) && /[가-힣]/.test(p) && !/영업|휴무|시간/.test(p)) addr = p;
    const ph = p.match(/(0\d{1,3}[-\s)]?\d{3,4}-\d{4})/);
    if (!phone && ph) phone = ph[1].replace(/\s|\)/g, '-');
  }
  if (addr) addr = addr.replace(/^(전북특별자치도|전라북도|전북)\s*/, '').replace(/\s*\/\s*$/, '');
  if (addr && !addr.includes(m.sigun) && !addr.startsWith(short)) addr = `${m.sigun} ${addr}`;
  return { addr, phone };
}

// ── 좌표 ──
const UA = 'JeonbukON-festival-map/1.0 (volunteer promo map)';
const cacheF = path.join(CACHE, 'geocache.json');
const geocache = fs.existsSync(cacheF) ? JSON.parse(fs.readFileSync(cacheF, 'utf8')) : {};
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function nom(q) {
  if (geocache[q] !== undefined) return geocache[q];
  if (OFFLINE) return [];
  const w = last + 1050 - Date.now(); if (w > 0) await sleep(w); last = Date.now();
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=kr&accept-language=ko&q=' + encodeURIComponent(q);
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) { const j = await r.json(); geocache[q] = j; fs.writeFileSync(cacheF, JSON.stringify(geocache)); return j; }
    } catch (e) { /* 재시도 */ }
    await sleep(3000);
  }
  return [];
}
const POI = new Set(['building', 'amenity', 'shop', 'tourism', 'leisure', 'office', 'historic', 'craft', 'healthcare', 'man_made', 'club']);
const km = (a, b) => { const R = 6371, t = (x) => (x * Math.PI) / 180; const h = Math.sin(t(b.lat - a.lat) / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

async function geocode(m) {
  if (m.lat) return { lat: m.lat, lng: m.lng, prec: 'official' };
  const addr = m.addr || '';
  // '평동로 11길 23' → '평동로11길 23' (도로명 띄어쓰기 통일)
  const road = (addr.replace(/(로|길)\s+(\d+번?길)/, '$1$2').match(/^(.*?(?:로|길)\s*\d+(?:-\d+)?)/) || [])[1];
  const sgIn = addr.includes(m.sigun) ? '' : m.sigun + ' ';
  let roadHit = null, poiHit = null;
  if (road) {
    const hit = (await nom(sgIn + road)).find((x) => x.display_name.includes(m.sigun));
    if (hit) roadHit = { lat: +hit.lat, lng: +hit.lon, prec: POI.has(hit.class) || hit.type === 'house' ? 'exact' : hit.class === 'highway' ? 'road' : 'area' };
  }
  if (!roadHit || roadHit.prec !== 'exact') {
    const nm = m.name.replace(/\(.*?\)/g, '').replace(/(주식회사|농업회사법인|영농조합법인|협동조합|의료법인|\(주\)|\(유\))/g, '').trim();
    if (nm.length >= 2) {
      const hit = (await nom(nm + ' ' + m.sigun)).find((x) => x.display_name.includes(m.sigun) && !['highway', 'boundary', 'place'].includes(x.class));
      if (hit) { const p = { lat: +hit.lat, lng: +hit.lon, prec: 'poi' }; if (!roadHit || km(p, roadHit) < 4) poiHit = p; }
    }
  }
  let g = roadHit && roadHit.prec === 'exact' ? roadHit : poiHit || roadHit;
  if (!g) {
    const em = addr.match(/([가-힣]+(?:읍|면))\s/);
    const hit = (await nom(m.sigun + (em ? ' ' + em[1] : '')))[0];
    if (hit) g = { lat: +hit.lat, lng: +hit.lon, prec: em ? 'area' : 'sigun' };
  }
  // 'OO로' 같은 큰길은 OSM이 길의 한 구간만 돌려줘서 실제 위치와 수 km 어긋날 수 있음 → 거리 계산에서 제외
  if (g && g.prec === 'road' && road && !/길\s*\d/.test(road)) g.prec = 'approx';
  return g;
}

(async () => {
  let raw = [];
  const rawF = path.join(CACHE, 'merchants_raw.json');
  if (OFFLINE && fs.existsSync(rawF)) raw = JSON.parse(fs.readFileSync(rawF, 'utf8'));
  else {
    for (const [code, sg] of Object.entries(CODES)) {
      const items = parseList(await get(LIST(code)), sg);
      console.log(`${sg} ${items.length}곳`);
      raw.push(...items);
    }
    fs.writeFileSync(rawF, JSON.stringify(raw, null, 1));
  }

  const out = [];
  let n = 0;
  for (const m of raw) {
    n++;
    Object.assign(m, addrPhone(m));
    m.geo = await geocode(m);
    if (n % 50 === 0) console.log(`좌표 ${n}/${raw.length}`);
  }
  // 같은 건물(같은 도로명주소)에 있는 가게는 가장 정확한 좌표를 함께 씀
  const RANK = { official: 0, exact: 1, poi: 2, road: 3, approx: 4, area: 5, sigun: 6 };
  const key = (m) => (m.addr || '').match(/^(.*?(?:로|길)\s*\d+(?:-\d+)?)/)?.[1]?.replace(/\s+/g, '');
  const best = {};
  for (const m of raw) { const k = key(m); if (k && m.geo && (!best[k] || RANK[m.geo.prec] < RANK[best[k].prec])) best[k] = m.geo; }
  for (const m of raw) { const k = key(m); if (k && best[k] && (!m.geo || RANK[best[k].prec] < RANK[m.geo.prec])) m.geo = best[k]; }

  const closedRe = /휴관\s*중|휴업\s*중|휴관기간|폐업|운영\s*중단|영업\s*중단/;
  raw.forEach((m, i) => {
    const text = [...m.info, ...m.extra, ...m.benefit].join(' ');
    // 안내(영업시간 등)만 남기고 주소·전화·링크 글자·상호 반복은 뺌
    const digits = (s) => s.replace(/[^0-9]/g, '');
    const noAddrPrefix = (s) => s.replace(/^(전북특별자치도|전라북도|전북)\s*/, '');
    const drop = (x) => !x || x === m.name || (m.linkTexts || []).includes(x) || /네이버\s*지도|^자세한\s*정보/.test(x)
      || (m.web && /^(홈페이지|자세한\s*정보)\s*(참고|참조|확인)?$/.test(x))
      || (m.addr && (m.addr === noAddrPrefix(x) || m.addr.includes(noAddrPrefix(x)) || noAddrPrefix(x).includes(m.addr)))
      || (m.phone && digits(x) === digits(m.phone));
    const note = [...m.info, ...m.extra].map(unbullet)
      .map((l) => l.split(/ㆍ/).map((x) => unbullet(x.trim())).filter((x) => !drop(x)).join(' '))
      .filter((l) => !drop(l)).join('\n');
    out.push({
      id: i + 1,
      sigun: m.sigun,
      cat: CAT[m.cate] || 'shop',
      name: m.name,
      benefit: m.benefit.map(unbullet).filter(Boolean),
      addr: m.addr,
      phone: m.phone,
      note: note || undefined,
      map: m.map || undefined,
      web: m.web || undefined,
      lat: m.geo ? +m.geo.lat.toFixed(6) : null,
      lng: m.geo ? +m.geo.lng.toFixed(6) : null,
      prec: m.geo ? m.geo.prec : null,
      closed: closedRe.test(text),
    });
  });

  const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(ROOT, 'data', 'merchants.js'),
    `// 전북사랑도민증 할인가맹점 ${out.length}곳 — lovecard.jb.go.kr '할인가맹점 현황'에서 ${stamp} 수집\n` +
    `// tools/update-merchants.js 로 다시 만들 수 있어요. prec: official(누리집 지도링크) · exact/poi/road(OSM 확인) · approx/area/sigun(대략, 거리 계산 제외)\n` +
    `window.JBON=window.JBON||{};\nJBON.merchants=${JSON.stringify(out)};\n`);
  const c = {}; out.forEach((m) => (c[m.prec] = (c[m.prec] || 0) + 1));
  console.log(`완료: ${out.length}곳`, c, '휴관·휴업', out.filter((m) => m.closed).map((m) => m.name));
})();
