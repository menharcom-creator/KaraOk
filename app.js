const $=s=>document.querySelector(s);
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
// Set DEFAULT_CATALOG to your GitHub Pages catalog URL, or leave 'songs.json' if the app and songs live in the same repo.
const DEFAULT_CATALOG='songs.json';
const S=Object.assign({catalog:DEFAULT_CATALOG,volume:1,lyricSize:36,autoplay:true,theme:'neon'},LS.get('kset',{}));
let songs=[],queue=LS.get('kq',[]),recent=LS.get('krecent',[]),hist=[],cur=null,cat='All',shown=24,query='',lrc=[],rep=false,shuf=false,base=location.href;
const vid=$('#vid'),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const R=u=>u?new URL(u,base).href:'';
const byId=id=>songs.find(s=>s.id===id);
const fmt=t=>isFinite(t)?Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0'):'0:00';
const status=m=>$('#status').textContent=m||'';
document.documentElement.dataset.theme=S.theme;

async function load(force){
  status('Loading songs…');
  try{
    base=new URL(S.catalog,location.href).href;
    const r=await fetch(base,{cache:force?'reload':'no-cache'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();LS.set('kcache',{base,j});songs=j.songs||[];status('');
  }catch(e){
    const c=LS.get('kcache',null);
    if(c){base=c.base;songs=c.j.songs||[];status('Offline or catalog unreachable ('+e.message+') — showing cached library.')}
    else{songs=[];status('Could not load the song catalog: '+e.message+'. Check the catalog URL in Settings.')}
  }
  songs=songs.filter(s=>s&&s.id&&s.title&&(s.videoUrl||s.qualities));
  if(!songs.length&&!$('#status').textContent)status('The catalog has no songs yet. Add songs to songs.json on GitHub, then press Refresh.');
  renderChips();render();
}
function renderChips(){
  const cats=['All',...new Set(songs.map(s=>s.category).filter(Boolean))];
  $('#chips').innerHTML=cats.map(c=>`<button class="${c===cat?'on':''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
}
const card=s=>`<div style="position:relative"><button class="card" data-p="${esc(s.id)}">${s.thumbnailUrl?`<img loading="lazy" src="${esc(R(s.thumbnailUrl))}" alt="" onerror="this.outerHTML='<div class=ph>🎵</div>'">`:'<div class="ph">🎵</div>'}<div class="t"><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></div></button><button class="add" data-a="${esc(s.id)}" aria-label="Add to queue">＋</button></div>`;
function render(){
  const q=query.toLowerCase(),f=songs.filter(s=>(cat==='All'||s.category===cat)&&(!q||(s.title+' '+s.artist).toLowerCase().includes(q)));
  let h='';
  if(!q&&cat==='All'){
    const rs=recent.map(byId).filter(Boolean),fs=songs.filter(s=>s.featured);
    if(rs.length)h+=`<h3>Recently played</h3><div class="grid">${rs.slice(0,6).map(card).join('')}</div>`;
    if(fs.length)h+=`<h3>Featured</h3><div class="grid">${fs.slice(0,6).map(card).join('')}</div>`;
  }
  h+=`<h3>${q?'Results':cat==='All'?'All songs':esc(cat)} (${f.length})</h3><div class="grid">${f.slice(0,shown).map(card).join('')}</div>`;
  if(f.length>shown)h+='<button id="more">Load more</button>';
  $('#home').innerHTML=h;
}
$('#home').onclick=e=>{
  const a=e.target.closest('[data-a]'),p=e.target.closest('[data-p]');
  if(a){queue.push(a.dataset.a);saveQ();status('Added to queue');setTimeout(()=>status(''),1500)}
  else if(p)play(p.dataset.p);
  else if(e.target.id==='more'){shown+=24;render()}
};
$('#chips').onclick=e=>{const b=e.target.closest('[data-c]');if(b){cat=b.dataset.c;shown=24;renderChips();render()}};
$('#search').oninput=e=>{query=e.target.value;shown=24;render()};
$('#bRefresh').onclick=()=>load(true);

function saveQ(){LS.set('kq',queue);$('#qc').textContent=queue.length;renderQ()}
function renderQ(){
  $('#ql').innerHTML=(cur?`<p>▶ Now playing: <b>${esc(cur.title)}</b></p>`:'')+(queue.map((id,i)=>{const s=byId(id);return s?`<div class="qi"><span>${i+1}. ${esc(s.title)} — ${esc(s.artist)}</span><button data-u="${i}">↑</button><button data-d="${i}">↓</button><button data-r="${i}">✕</button></div>`:''}).join('')||'<p>Queue is empty.</p>');
}
$('#ql').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.r!==undefined)queue.splice(+d.r,1);
  else if(d.u!==undefined&&+d.u>0){const i=+d.u;[queue[i-1],queue[i]]=[queue[i],queue[i-1]]}
  else if(d.d!==undefined&&+d.d<queue.length-1){const i=+d.d;[queue[i+1],queue[i]]=[queue[i],queue[i+1]]}
  saveQ();
};
const toggleQ=v=>{$('#queue').hidden=v===undefined?!$('#queue').hidden:!v;if(!$('#queue').hidden){renderQ();($('#ql button')||$('#bQx')).focus()}};
$('#bQueue').onclick=$('#bQ2').onclick=()=>toggleQ();$('#bQx').onclick=()=>toggleQ(false);
$('#bClr').onclick=()=>{queue=[];saveQ()};

function parseLRC(t){
  const out=[];
  for(const line of t.split(/\r?\n/)){
    const tags=[...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)],txt=line.replace(/\[[^\]]*\]/g,'').trim();
    if(txt)tags.forEach(m=>out.push({t:+m[1]*60+ +m[2],x:txt}));
  }
  return out.sort((a,b)=>a.t-b.t);
}
async function play(id,fromQueue){
  const s=byId(id);if(!s)return;
  if(cur&&!fromQueue)hist.push(cur.id);else if(cur)hist.push(cur.id);
  cur=s;recent=[id,...recent.filter(x=>x!==id)].slice(0,12);LS.set('krecent',recent);
  $('#player').hidden=false;$('#err').hidden=true;$('#pt').textContent=s.title;$('#pa').textContent='— '+s.artist;
  const q=s.qualities&&Object.keys(s.qualities);
  const qs=$('#qual');
  if(q&&q.length>1){qs.innerHTML=q.map(k=>`<option>${esc(k)}</option>`).join('');qs.hidden=false}else qs.hidden=true;
  setSrc(q&&q.length?s.qualities[q[q.length-1]]:s.videoUrl);if(!qs.hidden)qs.value=q[q.length-1];
  lrc=[];$('#lyrics').innerHTML='';
  if(s.lyricsUrl){try{const r=await fetch(R(s.lyricsUrl));if(r.ok)lrc=parseLRC(await r.text())}catch{}}
  renderQ();$('#bPlay').focus();
}
function setSrc(u,at){
  vid.src=R(u);vid.volume=S.volume;$('#vol').value=S.volume;
  vid.onloadedmetadata=()=>{if(at)vid.currentTime=at};
  vid.play().catch(()=>{$('#bPlay').textContent='▶'});
}
$('#qual').onchange=e=>{const t=vid.currentTime;setSrc(cur.qualities[e.target.value],t)};
vid.onerror=()=>{const e=$('#err');e.hidden=false;e.textContent='Could not play "'+(cur?.title||'')+'". Check that the video file exists on GitHub, the URL is correct, and it is MP4 (H.264/AAC). Skipping is possible with ⏭.'};
vid.onplay=()=>$('#bPlay').textContent='⏸';vid.onpause=()=>$('#bPlay').textContent='▶';
vid.onended=()=>{if(S.autoplay)next(true);else $('#bPlay').textContent='▶'};
vid.ontimeupdate=()=>{
  $('#tc').textContent=fmt(vid.currentTime);$('#td').textContent=fmt(vid.duration);
  if(vid.duration)$('#seek').value=vid.currentTime/vid.duration*1000;
  if(!lrc.length)return;let i=-1;for(let k=0;k<lrc.length&&lrc[k].t<=vid.currentTime;k++)i=k;
  $('#lyrics').style.fontSize=S.lyricSize+'px';
  $('#lyrics').innerHTML=i<0?'':`<div class="o">${esc(lrc[i-1]?.x)}</div><div class="c">${esc(lrc[i].x)}</div><div class="o">${esc(lrc[i+1]?.x)}</div>`;
};
$('#seek').oninput=e=>{if(vid.duration)vid.currentTime=e.target.value/1000*vid.duration};
$('#vol').oninput=e=>{vid.volume=+e.target.value};
$('#bPlay').onclick=()=>vid.paused?vid.play().catch(()=>{}):vid.pause();
function next(auto){
  if(auto&&rep&&cur)return play(cur.id);
  if(queue.length){const id=queue.shift();saveQ();return play(id,true)}
  if(shuf&&songs.length)return play(songs[Math.random()*songs.length|0].id);
  if(auto){closePlayer()}
}
$('#bNext').onclick=()=>next(false);
$('#bPrev').onclick=()=>{if(vid.currentTime>3||!hist.length){vid.currentTime=0}else{hist.pop();const id=hist.pop();if(id)play(id)}};
$('#bRep').onclick=e=>{rep=!rep;e.target.style.background=rep?'var(--ac)':''};
$('#bShuf').onclick=e=>{shuf=!shuf;e.target.style.background=shuf?'var(--ac)':''};
$('#bA-').onclick=()=>{S.lyricSize=Math.max(20,S.lyricSize-4);LS.set('kset',S)};
$('#bA+').onclick=()=>{S.lyricSize=Math.min(80,S.lyricSize+4);LS.set('kset',S)};
$('#bFs').onclick=()=>{const p=$('#player');
  if(document.fullscreenElement)document.exitFullscreen();
  else if(p.requestFullscreen)p.requestFullscreen().catch(()=>{});
  else if(vid.webkitEnterFullscreen)vid.webkitEnterFullscreen();
  try{screen.orientation.lock('landscape').catch(()=>{})}catch{}};
function closePlayer(){vid.pause();vid.removeAttribute('src');vid.load();$('#player').hidden=true;cur=null;toggleQ(false);if(document.fullscreenElement)document.exitFullscreen()}
$('#bClose').onclick=closePlayer;

const openSet=()=>{$('#sCat').value=S.catalog;$('#sTheme').value=S.theme;$('#sVol').value=S.volume;$('#sLy').value=S.lyricSize;$('#sAuto').checked=S.autoplay;$('#settings').hidden=false;$('#sCat').focus()};
$('#bSet').onclick=openSet;$('#sX').onclick=()=>{$('#settings').hidden=true};
$('#sSave').onclick=()=>{Object.assign(S,{catalog:$('#sCat').value.trim()||DEFAULT_CATALOG,theme:$('#sTheme').value,volume:+$('#sVol').value,lyricSize:+$('#sLy').value,autoplay:$('#sAuto').checked});LS.set('kset',S);document.documentElement.dataset.theme=S.theme;$('#settings').hidden=true;load(true)};
$('#sClear').onclick=()=>{['kcache','krecent'].forEach(k=>localStorage.removeItem(k));recent=[];caches?.keys().then(k=>k.forEach(x=>caches.delete(x)));status('Cache cleared');render()};

// ---- TV remote / keyboard: D-pad spatial navigation, Enter, Back, Play/Pause ----
function scope(){return !$('#settings').hidden?$('#settings'):!$('#queue').hidden?$('#queue'):!$('#player').hidden?$('#player'):document.body}
function focusables(){return [...scope().querySelectorAll('button,input,select')].filter(e=>e.offsetParent&&!e.disabled)}
document.addEventListener('keydown',e=>{
  const k=e.key,kc=e.keyCode,a=document.activeElement,tag=a&&a.tagName;
  if(['MediaPlayPause','MediaPlay','MediaPause'].includes(k)||kc===179){if(cur){e.preventDefault();$('#bPlay').click()}return}
  if(k==='MediaTrackNext'||kc===176){next(false);return}
  if(k==='Escape'||k==='GoBack'||kc===4||(k==='Backspace'&&tag!=='INPUT')){
    e.preventDefault();
    if(!$('#settings').hidden)$('#settings').hidden=true;else if(!$('#queue').hidden)toggleQ(false);else if(!$('#player').hidden)closePlayer();else if(tag==='INPUT'&&a.id==='search')a.blur();
    return;
  }
  const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];if(!dir)return;
  if(tag==='INPUT'&&a.type==='range'&&dir[0])return;           // let sliders use left/right
  if(tag==='INPUT'&&a.type==='search'&&dir[0])return;
  if(tag==='SELECT')return;
  e.preventDefault();
  const list=focusables();if(!a||!list.includes(a)){list[0]?.focus();return}
  const r=a.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let best=null,bd=1e9;
  for(const el of list){if(el===a)continue;const b=el.getBoundingClientRect(),dx=b.left+b.width/2-cx,dy=b.top+b.height/2-cy;
    if(dir[0]&&dx*dir[0]<=4)continue;if(dir[1]&&dy*dir[1]<=4)continue;
    const d=dir[0]?Math.abs(dx)+Math.abs(dy)*3:Math.abs(dy)+Math.abs(dx)*3;if(d<bd){bd=d;best=el}}
  if(best){best.focus();best.scrollIntoView({block:'nearest',inline:'nearest'})}
});

if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
saveQ();load();
