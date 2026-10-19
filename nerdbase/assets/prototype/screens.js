// Nerdbase screen library. Each screen returns the inner HTML of a 430x932 .ph element.
// This is a visual spec and prototype, not shipped code: the real app is SwiftUI.
const I = {
  flame:(c='#FB6415')=>`<svg class="flame" viewBox="0 0 24 24"><path fill="${c}" d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2 1-3 2-4 .2 1.6 1 2.3 1.8 2.5C10.2 8 10.8 4.5 12 2z"/><path fill="#fff" fill-opacity=".55" d="M12 20.5a3 3 0 0 0 3-3c0-1.6-1.4-2.4-3-4-1.6 1.6-3 2.4-3 4a3 3 0 0 0 3 3z" transform="translate(0 -1.5)"/></svg>`,
  bolt:(c='#F5B301')=>`<svg class="flame" viewBox="0 0 24 24"><path fill="${c}" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`,
  book:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5V21"/></svg>`,
  star:`<svg viewBox="0 0 24 24" fill="#fff"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>`,
  lock:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  trophy:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8M10 18h4"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  play:`<svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>`,
  home:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z"/></svg>`,
  scan:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/></svg>`,
  dumb:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  user:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  img:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 9"/></svg>`,
  flash:`<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`,
  bulb:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7a5a00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z"/></svg>`,
};
const fr=(a,b)=>`<span class="fr"><span>${a}</span><span>${b}</span></span>`;
const status=(dark)=>`<div class="sb" ${dark?'style="color:#fff"':''}><span>9:41</span><span class="r"><b></b><i></i></span></div><div class="hi" ${dark?'style="background:#fff"':''}></div>`;
const tabs=(on)=>`<div class="tab">${[['Lär dig',I.home],['Skanna',I.scan],['Öva',I.dumb],['Profil',I.user]].map(([t,s],i)=>`<div class="${i===on?'on':''}">${s}${t}</div>`).join('')}</div>`;

const S = {};

/* ---------- Opener ---------- */
S.opener = () => `${status()}
<div style="position:absolute;inset:0;background:radial-gradient(90% 50% at 50% 100%,rgba(251,100,21,.16),transparent 70%)"></div>
<canvas id="globe" width="860" height="860" style="position:absolute;left:-60px;top:36px;width:520px;height:520px"></canvas>
<div style="position:absolute;top:150px;left:0;right:0;text-align:center;font-size:58px;font-weight:800;letter-spacing:-2px;background:linear-gradient(180deg,#14110F,rgba(20,17,15,.12));-webkit-background-clip:text;color:transparent">Nerdbase</div>
${['f(x)','π','⚛','∑','✏️','💡','🎵','⚽','🚀','📐'].map((t,i)=>`<div class="fi" style="left:${[30,330,90,360,200,20,300,150,380,250][i]}px;top:${[560,520,600,640,500,680,580,700,470,690][i]}px;width:${[40,34,38,36,42,34,38,36,32,40][i]}px;height:${[40,34,38,36,42,34,38,36,32,40][i]}px;background:${['#FFE9DC','#E4F0FF','#E8F7EE','#FFF1CC','#FDE6EF','#EDE7FF'][i%6]};opacity:.85;font-weight:800;color:#14110F">${t}</div>`).join('')}
<div style="position:absolute;top:566px;left:0;right:0;display:flex;justify-content:center">
 <div style="position:relative;width:200px;height:150px">
  <div style="position:absolute;left:36px;top:38px;width:128px;height:96px;border-radius:10px;background:#E85A10;box-shadow:0 6px 14px rgba(0,0,0,.18)"></div>
  <div style="position:absolute;left:52px;top:26px;width:48px;height:16px;border-radius:8px 8px 0 0;background:#D94F0A"></div>
  ${[[-55,-12,'Matte'],[0,0,'Fysik'],[55,12,'HP']].map(([x,r,t])=>`<div style="position:absolute;left:60px;top:-30px;width:80px;height:112px;border-radius:10px;background:linear-gradient(160deg,#fff,#FFE9DC);border:1px solid var(--line);transform:translateX(${x}px) rotate(${r}deg);box-shadow:0 8px 16px rgba(0,0,0,.16);display:flex;align-items:flex-end;padding:8px;font-weight:800;font-size:12px">${t}</div>`).join('')}
  <div style="position:absolute;left:36px;top:48px;width:128px;height:90px;border-radius:10px;background:linear-gradient(135deg,rgba(255,255,255,.3),transparent 50%),#FB6415;box-shadow:0 8px 18px rgba(0,0,0,.22)"></div>
 </div></div>
<div style="position:absolute;top:735px;left:24px;right:24px;text-align:center">
 <div style="font-size:30px;font-weight:800;letter-spacing:-.8px">Skanna det. Förstå det.</div>
 <div style="color:var(--muted);font-weight:600;margin-top:6px;font-size:16px">Plugga matte och högskoleprovet som ett spel.</div>
</div>
<div style="position:absolute;bottom:42px;left:24px;right:24px"><div class="btn">Kom igång</div>
 <div style="text-align:center;margin-top:14px;color:var(--muted);font-weight:700;font-size:15px">Jag har redan ett konto</div></div>`;

/* ---------- Founder story ---------- */
S.story = () => `${status()}
<div style="position:absolute;top:78px;left:22px;right:22px;display:flex;gap:6px">${[1,1,0,0,0,0,0,0].map(o=>`<i style="flex:1;height:5px;border-radius:3px;background:${o?'var(--accent)':'#E8E2DB'}"></i>`).join('')}</div>
<div style="position:absolute;top:140px;left:26px;right:26px">
 <div style="font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1.1">Jag pluggade 2 dagar och fick 1,8.</div>
 <div class="card" style="margin-top:26px;padding:22px"><div style="color:var(--muted);font-size:13px;font-weight:800;letter-spacing:1px">HÖGSKOLEPROVET</div><div style="font-size:72px;font-weight:800;color:var(--accent);letter-spacing:-2px;line-height:1.1">1,8</div><div style="color:var(--muted);font-weight:600">Studerade 2 dagar innan provet.</div></div>
 <div class="card" style="margin-top:14px;display:flex;align-items:center;gap:16px"><div style="font-size:46px;font-weight:800;color:var(--gold);width:60px">B</div><div style="color:var(--muted);font-weight:600;font-size:15px">Hela kursen, 2 dagars plugg.</div></div>
 <div style="margin-top:20px;font-size:17px;line-height:1.45;color:var(--muted);font-weight:600">Ingen magi. Korta fokuspass, äkta intresse och att testa sig själv. Nerdbase är det, byggt som en app.</div>
</div>
<div style="position:absolute;bottom:42px;left:24px;right:24px"><div class="btn">Visa mig hur</div></div>`;

/* ---------- Path ---------- */
S.path = () => {
  const xs=[0,46,70,40,-10,-56];
  const nodes=[
    {t:'gold',y:0,i:I.star},{t:'gold',y:1,i:I.star},{t:'cur',y:2,i:I.play},{t:'lock',y:3,i:I.lock},{t:'lock',y:4,i:I.lock},{t:'test',y:5,i:I.trophy}];
  const base=244;
  return `${status()}
<div class="top"><div class="pill">Matte 4 ⌄</div><div style="display:flex;gap:16px"><div class="stat">${I.flame()}7</div><div class="stat">${I.bolt()}3</div></div></div>
<div style="position:absolute;top:122px;left:0;right:0"><div class="banner"><div><small>AVSNITT 1, ENHET 2</small><h3>Komplexa tal</h3></div><div class="bk">${I.book}</div></div></div>
${nodes.map((n,i)=>{const cx=215+xs[i]-(n.t==='test'?46:38);const y=base+i*90+(i>=2?28:0);
 const ring=n.t==='cur'?`<div class="ring" style="border:6px solid #FFE0CC"><div style="position:absolute;inset:-6px;border-radius:50%;border:6px solid transparent;border-top-color:var(--accent);border-left-color:var(--accent);transform:rotate(20deg)"></div></div>`:n.t==='gold'?`<div class="ring" style="border:6px solid #FBE3A0"></div>`:'';
 return `<div class="node ${n.t}" style="left:${cx}px;top:${y}px">${ring}${n.t==='cur'?'<div class="startl">START +10 XP</div>':''}${n.i}</div>`}).join('')}
<div style="position:absolute;left:20px;top:520px;width:90px;height:90px;border-radius:30px;background:#FFE9DC;opacity:.45;transform:rotate(-12deg)"></div>
<div style="position:absolute;right:24px;top:680px;width:70px;height:70px;border-radius:50%;background:#E4F0FF;opacity:.5"></div>
${tabs(0)}`;
};

/* ---------- Lesson: KVA, choose ---------- */
S.lessonKVA = (state='sel') => {
  const ck = state==='sel'?'<div class="btn">Kontrollera</div>':state==='none'?'<div class="btn off">Kontrollera</div>':'';
  let o=['I är större','II är större','I och II är lika stora','Informationen är otillräcklig'];
  const cls = state==='sel'?['opt sel','opt','opt','opt']:state==='bad'?['opt badc','opt','opt','opt good']:['opt','opt','opt','opt'];
  const sheet = state==='bad'?`<div class="sheet bad"><h4><span class="circ" style="background:var(--wrong)">✕</span>Inte riktigt</h4>
   <p><b>Rätt svar: Informationen är otillräcklig.</b><br>Testa x = <span class="m">${fr(1,2)}</span>: I = <span class="m">${fr(1,4)}</span>, II = <span class="m">${fr(1,2)}</span>. Testa x = 2: I = 4, II = 2. Olika utfall, alltså otillräcklig.</p>
   <div class="btn bad">Fortsätt</div></div>`:'';
  return `${status()}
<div class="lh"><span class="x">✕</span><div class="bar"><b style="width:${state==='bad'?'58%':'42%'}"></b></div><span class="stat" style="font-size:15px">${I.bolt()}2</span></div>
${state==='sel'?'<div class="combo">3 i rad</div>':''}
<div class="lbody" style="${state==='sel'?'top:150px':''}"><div class="instr">Jämför kvantiteterna</div>
 <div class="prompt">För ett tal x gäller att <span class="m">x &gt; 0</span>.</div>
 <div class="qrow" style="margin-top:22px"><div class="card"><small>Kvantitet I</small><span class="m" style="font-size:30px">x<sup>2</sup></span></div><div class="card"><small>Kvantitet II</small><span class="m" style="font-size:30px">x</span></div></div>
 <div style="margin-top:6px">${o.map((t,i)=>`<div class="${cls[i]}">${t}</div>`).join('')}</div>
 ${state==='sel'?'<div style="margin-top:14px;background:var(--tint);color:var(--accentLip);border-radius:14px;padding:10px 14px;font-size:14px;font-weight:700">Tips: testa x = ½, 1 och 2.</div>':''}
</div>
${state==='bad'?'':`<div style="position:absolute;bottom:44px;left:22px;right:22px">${ck}</div>`}${sheet}`;
};

/* ---------- Scan guide (live camera) ---------- */
S.scan = (st='aim') => {
  const cfg={
    aim:{h:'Håll telefonen rakt över sidan',c:'',tx:'18%',rot:'-6deg',good:false,steps:0},
    close:{h:'Kom lite närmare',c:'warn',tx:'44%',rot:'-3deg',good:false,steps:0},
    hold:{h:'Bra. Håll stilla',c:'good',tx:'50%',rot:'-1deg',good:true,steps:1},
    solve:{h:'Läser uppgiften…',c:'good',tx:'50%',rot:'0deg',good:true,steps:2},
  }[st];
  return `<div class="cam"></div>
<div class="paper" style="--rot:${cfg.rot}">
 <div style="font-size:11px;color:#8a8fa8;font-weight:700;letter-spacing:.5px;margin-bottom:10px">Uppgift 7</div>
 <div class="l">Derivera <i>f</i>(<i>x</i>) = <i>x</i>² · <i>e</i><sup>3<i>x</i></sup></div>
 <div class="l" style="opacity:.55;font-size:18px">Produktregeln: u = x², v = e<sup>3x</sup></div>
 <div class="l" style="opacity:.55;font-size:18px">u' = 2x, v' = ?</div>
 <div style="position:absolute;left:0;right:0;top:76px;height:1px;background:rgba(80,100,160,.15)"></div>
 <div style="position:absolute;left:0;right:0;top:124px;height:1px;background:rgba(80,100,160,.15)"></div>
 <div style="position:absolute;left:0;right:0;top:172px;height:1px;background:rgba(80,100,160,.15)"></div>
 <div style="position:absolute;left:0;right:0;top:220px;height:1px;background:rgba(80,100,160,.15)"></div>
</div>
${status(true)}
<div class="frame ${cfg.c}"><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>${st==='solve'||st==='hold'?'<div class="laser"></div>':''}</div>
<div class="hint ${cfg.c}"><span class="dot"></span>${cfg.h}</div>
<div class="tilt ${cfg.good?'good':''}" style="--tx:${cfg.tx}"><i></i></div>
<div style="position:absolute;top:196px;left:0;right:0;text-align:center;color:rgba(255,255,255,.7);font-size:12px;font-weight:700;letter-spacing:.6px">${st==='aim'?'Centrera bollen':'Vågrät'}</div>
<div class="steps3"><span class="${cfg.steps===0?'on':''}">1 Rikta</span><span class="${cfg.steps===1?'on':''}">2 Fånga</span><span class="${cfg.steps===2?'on':''}">3 Lös</span></div>
<div class="sidebtn" style="left:40px">${I.img}</div>
<div class="shutter ${cfg.good?'go':''}">${cfg.good?'<div class="ring2"></div>':''}<i></i></div>
<div class="sidebtn" style="right:40px">${I.flash}</div>
<div style="position:absolute;top:70px;left:22px;color:#fff;font-size:26px;font-weight:300;z-index:20">✕</div>
<div style="position:absolute;bottom:46px;left:0;right:0;text-align:center;color:rgba(255,255,255,.65);font-size:13px;font-weight:600;z-index:20">2 skanningar kvar idag</div>`;
};

/* ---------- Solving (skeleton) ---------- */
S.solving = () => `${status()}
<div style="position:absolute;top:70px;left:22px;font-size:26px;font-weight:300;color:var(--muted)">✕</div>
<div style="position:absolute;top:120px;left:22px;right:22px">
 <div class="card" style="padding:0;overflow:hidden;position:relative;height:150px;background:linear-gradient(180deg,#FAF6EC,#EFE8D8)"><div class="l m" style="padding:26px;font-size:24px;color:#26304a">Derivera <i>f</i>(<i>x</i>) = <i>x</i>²·<i>e</i><sup>3<i>x</i></sup></div><div class="laser" style="animation-duration:1.6s"></div></div>
 <div style="margin-top:22px;font-size:20px;font-weight:800;display:flex;gap:10px;align-items:center"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--accent);animation:pulse 1s infinite"></span>Löser steg för steg…</div>
 <div class="shimmer" style="height:78px;margin-top:18px"></div><div class="shimmer" style="height:20px;margin-top:16px;width:70%"></div><div class="shimmer" style="height:20px;margin-top:12px;width:90%"></div><div class="shimmer" style="height:20px;margin-top:12px;width:60%"></div>
</div>`;

/* ---------- Result ---------- */
S.result = () => `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#FAF6EC,#EFE8D8)"></div>${status()}
<div style="position:absolute;top:70px;left:30px" class="m"><span style="font-size:22px;color:#26304a">Derivera <i>f</i>(<i>x</i>) = <i>x</i>²·<i>e</i><sup>3<i>x</i></sup></span></div>
<div class="res"><div class="grab"></div>
 <span class="tag">Matte 4 · Derivata</span>
 <div class="ans"><small>Svar</small><div class="m"><i>f</i>′(<i>x</i>) = <i>x</i>·<i>e</i><sup>3<i>x</i></sup>(2 + 3<i>x</i>)</div></div>
 <div style="margin-top:16px;font-weight:800;font-size:18px">Steg för steg</div>
 <div class="stp"><div class="n">1</div><div><b>Produktregeln</b><span>Låt u = x² och v = e<sup>3x</sup>.</span></div></div>
 <div class="stp"><div class="n">2</div><div><b>Derivera varje del</b><span>u′ = 2x. Kedjeregeln ger v′ = 3e<sup>3x</sup>.</span></div></div>
 <div class="stp"><div class="n">3</div><div><b>Sätt ihop</b><span>f′ = 2x·e<sup>3x</sup> + x²·3e<sup>3x</sup></span></div></div>
 <div class="stp" style="border:0"><div class="n">4</div><div><b>Faktorisera</b><span>f′ = x·e<sup>3x</sup>(2 + 3x)</span></div></div>
 <div class="warnbox">${I.bulb}<div>Vanligt misstag: att glömma faktorn 3 från kedjeregeln.</div></div>
 <div class="actions"><div class="btn neutral" style="flex:1">Spara</div><div class="btn" style="flex:1.5">Öva liknande</div></div>
</div>`;

/* ---------- Focus timer ---------- */
S.timer = () => `${status()}
<div style="position:absolute;top:84px;left:0;right:0;text-align:center"><span class="tag">Fokus 2 av 4</span></div>
<div style="position:absolute;top:150px;left:0;right:0;display:grid;place-items:center">
 <div style="position:relative;width:310px;height:310px">
  <svg width="310" height="310" viewBox="0 0 310 310" style="transform:rotate(-90deg)"><circle cx="155" cy="155" r="140" fill="none" stroke="#E8E2DB" stroke-width="20"/><circle cx="155" cy="155" r="140" fill="none" stroke="#FB6415" stroke-width="20" stroke-linecap="round" stroke-dasharray="879.6" stroke-dashoffset="${879.6*(1-0.62)}"/></svg>
  <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center"><div><div class="big">09:31</div><div style="color:var(--muted);font-weight:700;margin-top:-4px">kvar av 25 min</div></div></div>
 </div></div>
<div style="position:absolute;top:500px;left:22px;right:22px">
 <div class="card" style="display:flex;gap:14px;align-items:center"><div style="font-size:30px">🎵</div><div><div style="font-size:13px;color:var(--muted);font-weight:800;letter-spacing:.8px">NÄSTA PAUS · 7 MIN</div><div style="font-weight:800;font-size:17px">Lyssna på musik</div></div></div>
 <div class="card" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center"><div style="display:flex;gap:8px;align-items:center;font-weight:800">${I.flame()} 7 dagars streak</div><div style="color:var(--muted);font-size:14px;font-weight:700">Mål 20 XP</div></div>
  <div class="week">${['M','T','O','T','F','L','S'].map((d,i)=>`<div>${d}<i class="${i<5?'on':''}">${i<5?'✓':''}</i></div>`).join('')}</div></div>
</div>
<div style="position:absolute;bottom:42px;left:22px;right:22px;display:flex;gap:12px"><div class="btn neutral" style="flex:1">Pausa</div><div class="btn" style="flex:1.4">Fortsätt lektion</div></div>`;

/* ---------- Lesson complete ---------- */
S.complete = () => `${status()}
<div style="position:absolute;top:130px;left:0;right:0;text-align:center"><div style="width:110px;height:110px;margin:0 auto;border-radius:50%;background:var(--correct);display:grid;place-items:center;box-shadow:0 8px 0 var(--correctLip)"><div style="width:56px">${I.check}</div></div>
 <div style="font-size:34px;font-weight:800;margin-top:26px;letter-spacing:-.8px">Lektionen klar!</div></div>
<div style="position:absolute;top:340px;left:22px;right:22px;display:flex;gap:12px">
 ${[['XP','+15','var(--gold)'],['Rätt','92%','var(--correct)'],['Tid','3:48','var(--accent)']].map(([l,v,c])=>`<div class="card" style="flex:1;padding:0;overflow:hidden;text-align:center;border-color:${c}"><div style="background:${c};color:#fff;font-size:12px;font-weight:800;letter-spacing:1px;padding:6px">${l}</div><div style="font-size:26px;font-weight:800;padding:16px 0">${v}</div></div>`).join('')}</div>
<div style="position:absolute;top:500px;left:22px;right:22px" class="card"><div style="font-weight:800">Konjugat</div><div style="display:flex;gap:8px;margin-top:10px">${[1,1,0].map(o=>`<i style="width:34px;height:34px;border-radius:50%;background:${o?'var(--gold)':'#E8E2DB'};display:grid;place-items:center"><div style="width:18px">${I.star}</div></i>`).join('')}<span style="margin-left:6px;align-self:center;color:var(--muted);font-weight:700">Nivå 2 av 3</span></div></div>
<div style="position:absolute;bottom:42px;left:24px;right:24px"><div class="btn">Fortsätt</div></div>`;

/* ---------- Paywall ---------- */
S.paywall = () => `${status()}
<div style="position:absolute;top:70px;right:22px;font-size:26px;font-weight:300;color:var(--muted)">✕</div>
<div style="position:absolute;top:120px;left:26px;right:26px">
 <div style="font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1.1">Lås upp Nerdbase Pro</div>
 <div style="margin-top:22px;display:grid;gap:14px">${[['Obegränsade lektioner och skanningar','⚡'],['Hela Nerd Method och 2-dagars sprint','🧠'],['Alla högskoleprovets tidsprov','⏱'],['Felloggen som visar vad du missar','📈']].map(([t,e])=>`<div style="display:flex;gap:14px;align-items:center;font-weight:700;font-size:16px"><span style="width:40px;height:40px;border-radius:12px;background:var(--tint);display:grid;place-items:center;font-size:20px">${e}</span>${t}</div>`).join('')}</div>
 <div class="plan sel" style="margin-top:26px"><span class="rb">SPARA 40%</span><div><div style="font-weight:800;font-size:18px">Årsvis</div><div style="color:var(--muted);font-weight:600;font-size:14px">$144 per år</div></div><div style="text-align:right"><div style="font-weight:800;font-size:20px">$12<span style="font-size:14px">/mån</span></div><div style="color:var(--muted);font-size:13px;text-decoration:line-through;font-weight:600">$20</div></div></div>
 <div class="plan"><div><div style="font-weight:800;font-size:18px">Månadsvis</div><div style="color:var(--muted);font-weight:600;font-size:14px">Avsluta när du vill</div></div><div style="font-weight:800;font-size:20px">$20<span style="font-size:14px">/mån</span></div></div>
</div>
<div style="position:absolute;bottom:42px;left:24px;right:24px"><div class="btn">Fortsätt</div>
 <div style="text-align:center;margin-top:12px;color:var(--muted);font-size:12px;font-weight:600;line-height:1.4">$144 per år. Förnyas automatiskt. Avsluta när som helst i Inställningar.<br>Återställ köp · Villkor · Integritet</div></div>`;

/* ---------- Out of lessons ---------- */
S.limit = () => `${S.path().replace(/<div class="tab">[\s\S]*$/, '')}
<div style="position:absolute;inset:0;background:rgba(0,0,0,.4);z-index:40"></div>
<div class="sheet" style="background:var(--bg);z-index:45;padding-bottom:44px"><div class="grab"></div>
 <div style="font-size:26px;font-weight:800;letter-spacing:-.5px">Du har inga lektioner kvar idag</div>
 <p style="color:var(--muted);margin:8px 0 18px;font-weight:600">Nya lektioner om 04:12:30.</p>
 <div class="btn">Skaffa Pro</div>
 <div class="btn neutral" style="margin-top:14px">Få 1 till med Misstagsrepetition</div></div>`;

window.NB_SCREENS = S;

/* ---------- Globe (approximate dotted sphere for the prototype only) ---------- */
window.drawGlobe = function(canvas, phi=0.6){
  const c=canvas.getContext('2d'), W=canvas.width, R=W*0.42, cx=W/2, cy=W/2; c.clearRect(0,0,W,W);
  const blobs=[[50,-100,30,40],[-15,-60,28,18],[50,15,24,28],[5,22,30,22],[28,100,28,45],[-25,135,14,18],[60,-45,10,18]];
  const inLand=(lat,lon)=>blobs.some(([a,b,h,w])=>((lat-a)/h)**2+(((lon-b+540)%360-180)/w)**2<1);
  const g=c.createRadialGradient(cx-R*.3,cy-R*.4,R*.1,cx,cy,R*1.1);g.addColorStop(0,'#fff');g.addColorStop(1,'#F1ECE6');
  c.fillStyle=g;c.beginPath();c.arc(cx,cy,R,0,7);c.fill();
  c.strokeStyle='rgba(20,17,15,.06)';c.lineWidth=3;c.stroke();
  const th=0.3, N=7000, ga=Math.PI*(3-Math.sqrt(5));
  const pts=[];
  for(let i=0;i<N;i++){const y=1-2*(i+.5)/N, r=Math.sqrt(1-y*y), a=ga*i;
    const lat=Math.asin(y)*180/Math.PI, lon=Math.atan2(Math.sin(a)*r,Math.cos(a)*r)*180/Math.PI;
    if(!inLand(lat,lon))continue;
    const x0=Math.cos(a)*r, z0=Math.sin(a)*r;
    const x1=x0*Math.cos(phi)+z0*Math.sin(phi), z1=-x0*Math.sin(phi)+z0*Math.cos(phi);
    const y1=y*Math.cos(th)-z1*Math.sin(th), z2=y*Math.sin(th)+z1*Math.cos(th);
    if(z2>0)pts.push([cx+x1*R,cy-y1*R,z2]);}
  pts.forEach(([x,y,z])=>{c.fillStyle=`rgba(20,17,15,${.18+.5*z})`;c.beginPath();c.arc(x,y,2.4,0,7);c.fill();});
  const mk=[[59.33,18.07,1.4],[40.7,-74,1],[19.07,72.87,1],[-23.5,-46.6,1],[39.9,116.4,1],[30,31,.8]];
  mk.forEach(([lat,lon,s])=>{const la=lat*Math.PI/180, lo=lon*Math.PI/180;
    const x0=Math.cos(la)*Math.cos(lo), z0=Math.cos(la)*Math.sin(lo), y=Math.sin(la);
    const x1=x0*Math.cos(phi)+z0*Math.sin(phi), z1=-x0*Math.sin(phi)+z0*Math.cos(phi);
    const y1=y*Math.cos(th)-z1*Math.sin(th), z2=y*Math.sin(th)+z1*Math.cos(th);
    if(z2>.05){c.fillStyle='rgba(251,100,21,.25)';c.beginPath();c.arc(cx+x1*R,cy-y1*R,20*s,0,7);c.fill();c.fillStyle='#FB6415';c.beginPath();c.arc(cx+x1*R,cy-y1*R,9*s,0,7);c.fill();}});
};
