// 통계청 2013 시군구 경계(southkorea-maps)에서 전북 14개 시군만 골라 SVG 경로로 바꿔 data/geo.js 를 만듭니다.
//   node tools/buildgeo.js
const fs=require('fs');
const path=require('path');
global.window=undefined;
const topojson=require(path.join(__dirname,'topojson-client.min.js'));
const t=JSON.parse(fs.readFileSync(path.join(__dirname,'muni_topo.json'),'utf8'));
const obj=t.objects[Object.keys(t.objects)[0]];
const jb=obj.geometries.filter(g=>String(g.properties.code).startsWith('35'));
const NAME={35011:'전주시',35012:'전주시',35020:'군산시',35030:'익산시',35040:'정읍시',35050:'남원시',35060:'김제시',35310:'완주군',35320:'진안군',35330:'무주군',35340:'장수군',35350:'임실군',35360:'순창군',35370:'고창군',35380:'부안군'};
const groups={};jb.forEach(g=>{const n=NAME[g.properties.code];(groups[n]=groups[n]||[]).push(g);});
const shapes={};
for(const [n,gs] of Object.entries(groups)) shapes[n]=gs.length>1?topojson.merge(t,gs):topojson.feature(t,gs[0]).geometry;
const outline=topojson.merge(t,jb);
// neighbors: other provinces (non-35) as merged per province prefix
const nb={};
obj.geometries.filter(g=>/^(34|36|37|38|33|25)/.test(String(g.properties.code))).forEach(g=>{const p=String(g.properties.code).slice(0,2);(nb[p]=nb[p]||[]).push(g);});
const nbShapes=Object.fromEntries(Object.entries(nb).map(([p,gs])=>[p,topojson.merge(t,gs)]));
// projection
const LAT0=35.72, LNG_MIN=126.30, LAT_MAX=36.13, K=520; // px per degree lat
const C=Math.cos(LAT0*Math.PI/180);
const P=([lng,lat])=>[(lng-LNG_MIN)*C*K,(LAT_MAX-lat)*K];
const W=(127.93-LNG_MIN)*C*K, H=(LAT_MAX-35.28)*K;
function dp(pts,eps){if(pts.length<3)return pts;let dmax=0,idx=0;const [a,b]=[pts[0],pts[pts.length-1]];
  for(let i=1;i<pts.length-1;i++){const p=pts[i];const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1e-9;const d=Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/L;if(d>dmax){dmax=d;idx=i;}}
  if(dmax>eps){const l=dp(pts.slice(0,idx+1),eps),r=dp(pts.slice(idx),eps);return l.slice(0,-1).concat(r);}return [a,b];}
function area(r){let s=0;for(let i=0;i<r.length;i++){const [x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];s+=x1*y2-x2*y1;}return s/2;}
function toPath(geom,eps,minArea,clip){
  const polys=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates;let d='';
  for(const poly of polys){for(const ring of poly){let pts=ring.map(P);
    if(clip&&pts.every(p=>p[0]<-40||p[0]>W+40||p[1]<-40||p[1]>H+40))continue;
    if(Math.abs(area(pts))<minArea)continue;
    {const h=Math.floor(pts.length/2);pts=dp(pts.slice(0,h+1),eps).slice(0,-1).concat(dp(pts.slice(h),eps));}if(pts.length<4)continue;
    d+='M'+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L')+'Z';}}
  return d;}
function centroid(geom){const polys=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates;let best=null,ba=0;
  for(const poly of polys){const r=poly[0].map(P);const a=Math.abs(area(r));if(a>ba){ba=a;best=r;}}
  let cx=0,cy=0,A=0;for(let i=0;i<best.length;i++){const [x1,y1]=best[i],[x2,y2]=best[(i+1)%best.length];const f=x1*y2-x2*y1;cx+=(x1+x2)*f;cy+=(y1+y2)*f;A+=f;}
  return [+(cx/(3*A)).toFixed(1),+(cy/(3*A)).toFixed(1)];}
const out={W:+W.toFixed(1),H:+H.toFixed(1),proj:{LAT0,LNG_MIN,LAT_MAX,K,C},sigun:{},outline:toPath(outline,0.35,1.5),neighbors:{}};
for(const [n,g] of Object.entries(shapes)) out.sigun[n]={d:toPath(g,0.35,1.5),c:centroid(g)};
for(const [p,g] of Object.entries(nbShapes)) out.neighbors[p]=toPath(g,0.8,30,true);
fs.writeFileSync(path.join(__dirname,'..','data','geo.js'),'// 전북 14개 시군 경계 (통계청 2013 행정구역 · southkorea-maps) — tools/buildgeo.js 로 생성\nwindow.JBON=window.JBON||{};\nJBON.geo='+JSON.stringify(out)+';\n');
console.log('W',out.W,'H',out.H,'size',JSON.stringify(out).length);
for(const [n,s] of Object.entries(out.sigun))console.log(n,s.c,s.d.length);
console.log('neighbors',Object.fromEntries(Object.entries(out.neighbors).map(([k,v])=>[k,v.length])));
