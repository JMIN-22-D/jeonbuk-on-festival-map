// index.html(웹 지도)과 leaflet.html(인쇄용 리플렛)이 함께 쓰는 도우미
(function () {
  const J = (window.JBON = window.JBON || {});
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  // ?date=2026-10-20 처럼 주소에 날짜를 붙이면 그날 기준으로 미리 볼 수 있음
  function today() {
    const q = new URLSearchParams(location.search).get('date');
    const d = q ? parseDate(q) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const dayMs = 86400000;
  const diffDays = (a, b) => Math.round((b - a) / dayMs);

  function md(d) { return `${d.getMonth() + 1}.${d.getDate()}`; }
  function mdw(d) { return `${md(d)}(${DOW[d.getDay()]})`; }
  function range(f, withDow = true) {
    const s = parseDate(f.start), e = parseDate(f.end);
    const fmt = withDow ? mdw : md;
    if (s.getMonth() === e.getMonth() && !withDow) return `${md(s)}–${e.getDate()}`;
    return `${fmt(s)} – ${fmt(e)}`;
  }
  // 축제 기간이 그달(year, month 1~12)에 하루라도 걸치는지
  function inMonth(f, year, month) {
    const a = new Date(year, month - 1, 1), b = new Date(year, month, 0);
    return parseDate(f.start) <= b && parseDate(f.end) >= a;
  }
  function days(f) { return diffDays(parseDate(f.start), parseDate(f.end)) + 1; }

  function status(f, t = today()) {
    const s = parseDate(f.start), e = parseDate(f.end);
    if (t > e) return { key: 'ended', label: '종료' };
    if (t >= s) return { key: 'live', label: +t === +e ? '오늘 마지막 날' : '진행 중' };
    const n = diffDays(t, s);
    return { key: 'soon', label: n === 1 ? '내일 개막' : `D-${n}`, n };
  }

  function project(lat, lng) {
    const p = J.geo.proj;
    return [(lng - p.LNG_MIN) * p.C * p.K, (p.LAT_MAX - lat) * p.K];
  }
  function km(a, b) {
    const R = 6371, r = (x) => (x * Math.PI) / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtKm(d) { return d < 1 ? `약 ${Math.max(100, Math.round(d * 10) * 100)}m` : `약 ${d.toFixed(1)}km`; }

  const CATS = {
    food: { label: '음식점', color: '#D9612B', tag: '#FFF0C6' },
    cafe: { label: '카페', color: '#9A6B45', tag: '#F4E8DC' },
    culture: { label: '문화·체험', color: '#7457C2', tag: '#ECE6FF' },
    stay: { label: '숙박·휴양', color: '#2F7FB5', tag: '#E8F0FF' },
    leisure: { label: '스포츠·레저', color: '#21915F', tag: '#DDF6EC' },
    shop: { label: '쇼핑·기타', color: '#6B6B6B', tag: '#F0F0EC' },
    medical: { label: '의료', color: '#1E9A9A', tag: '#DDF3F3' },
    rest: { label: '휴게소', color: '#8D8A2E', tag: '#F1F1DA' },
  };
  const SIGUN = ['전주시', '군산시', '익산시', '정읍시', '남원시', '김제시', '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군'];

  // 시군 이름 위치 미세 조정 (축제 표시와 겹치지 않게) — 중심점 기준 [x, y] 이동
  const LBL = { '전주시': [-4, 26], '군산시': [30, 16], '익산시': [-8, -6], '임실군': [-18, 22], '부안군': [10, -14], '고창군': [8, 6], '정읍시': [-10, -18], '남원시': [30, 12], '진안군': [6, 20], '순창군': [-30, -12], '김제시': [8, 10], '완주군': [0, -16] };

  // 위치가 건물/장소 단위로 확인된 가맹점만 거리 계산·지도 점에 사용
  const PRECISE = new Set(['official', 'exact', 'poi', 'road']);
  const hasPos = (m) => m.lat != null && PRECISE.has(m.prec);

  // 축제장 주변 가맹점: ① 축제장 안(venueKeys) ② 좌표로 잰 직선거리 maxKm 이내
  // ③ 좌표는 없지만 축제장과 같은 읍·면(areas) — 순서대로 정렬
  function nearby(f, maxKm = f.nearKm || J.config.nearKm) {
    const keys = f.venueKeys || [], areas = f.areas || [];
    const out = [];
    for (const m of J.merchants) {
      const a = m.addr || '';
      if (keys.some((k) => a.includes(k) || m.name.includes(k))) { out.push({ m, d: 0, rank: 0, label: '축제장 안', short: '축제장 안' }); continue; }
      if (hasPos(m)) {
        const d = km(f, m);
        if (d <= maxKm) out.push({ m, d, rank: 1, label: `축제장에서 ${fmtKm(d)}`, short: fmtKm(d) });
        continue;
      }
      const ar = m.sigun === f.sigun && areas.find((x) => a.split(/\s+/).includes(x));
      if (ar) out.push({ m, d: null, rank: 2, label: `축제장과 같은 ${ar}`, short: ar });
    }
    return out.sort((x, y) => (x.m.closed - y.m.closed) || x.rank - y.rank || (x.d || 0) - (y.d || 0) || x.m.name.localeCompare(y.m.name, 'ko'));
  }

  // 카카오맵 길찾기 (키 없이 쓰는 공식 링크: map.kakao.com/link/to/이름,위도,경도)
  // 건물·장소 단위로 위치가 확인된 곳만 바로 길찾기, 나머지는 도로명주소로 카카오맵 검색을 열어 거기서 길찾기
  const DIRECT = new Set(['official', 'exact', 'poi']);
  const kname = (s) => s.replace(/[,/]/g, ' ').replace(/\s+/g, ' ').trim();
  const kTo = (name, lat, lng) => `https://map.kakao.com/link/to/${encodeURIComponent(kname(name))},${lat},${lng}`;
  const kSearch = (q) => `https://map.kakao.com/link/search/${encodeURIComponent(q)}`;
  function kakaoTo(m) {
    if (m.lat != null && DIRECT.has(m.prec)) return kTo(m.name, m.lat, m.lng);
    const road = (m.addr || '').match(/^(.*?(?:로|길)\s*\d+(?:-\d+)?)/);
    return kSearch(road ? road[1] : m.addr || `${m.sigun} ${m.name}`);
  }
  // 축제장: 좌표가 대략값인 곳은 festivals.js 의 kq(장소명·주소)로 검색
  function kakaoFest(f) {
    return f.kq ? kSearch(f.kq) : kTo(f.venue.split(' (')[0].split(' · ')[0].replace(/ 일원$/, ''), f.lat, f.lng);
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // qrcode-generator → SVG 문자열
  function qrSvg(text, { px = 4, margin = 2, color = '#1f1f1f' } = {}) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount(), size = (n + margin * 2) * px;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${(c + margin) * px} ${(r + margin) * px}h${px}v${px}h-${px}z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR 코드"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`;
  }

  // 축제 사진 (위키미디어 공용). 사진이 없거나 못 불러오면 그림 타일로 대신함
  const PH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6Z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="10.5" cy="6.8" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/></svg>';
  function photo(f, { cls = '', cap = '' } = {}) {
    const p = f.photo;
    if (!p) return `<figure class="ph none ${cls}" role="img" aria-label="${esc(f.name)}">${PH_ICON}${cap}</figure>`;
    return `<figure class="ph ${cls}"><img src="${esc(p.src)}" alt="${esc(p.caption)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">${p.ref ? '<span class="ref">참고 이미지</span>' : ''}${cap}</figure>`;
  }
  function credit(p, html = true) {
    const t = `${p.caption}${p.ref ? ' (참고 이미지)' : ''} · ${p.by} · ${p.license}`;
    return html ? `사진: <a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(t)}</a> · 위키미디어 공용` : `${t}`;
  }

  // 화면에 보이는 축제에 날짜순 번호 매기기
  function numbered(list) {
    return [...list].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.name.localeCompare(b.name, 'ko'));
  }

  J.u = { inMonth, photo, credit, LBL, today, parseDate, diffDays, md, mdw, range, days, status, project, km, fmtKm, CATS, SIGUN, hasPos, nearby, kakaoTo, kakaoFest, esc, qrSvg, numbered, DOW };
})();
