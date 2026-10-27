import {createRun,tick,choose,setTargetFocus,ENCOUNTERS,UPGRADES} from './engine.mjs';

const app=document.querySelector('#app');
const pauseButton=document.querySelector('#pause');
const exitButton=document.querySelector('#exit');
let run=null,timer=null,paused=false,logLines=[],seen=new Set(),eventCursor=0;
const asset=path=>path;
const hero=build=>asset(build==='blood'?'assets/characters/full/duelist.webp':'assets/characters/full/spellblade.webp');
const seconds=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function welcome(){
  pauseButton.hidden=true;exitButton.hidden=true;
  app.innerHTML=`<section class="intro"><div class="introCopy"><span class="overline">FIVE ENCOUNTERS · THREE CHOICES</span><h2>Build the chain. Break the horde.</h2><p>Combat plays itself. Your decisions turn a lone strike into a cascade. Choose an affinity, then shape its power after the first three encounters.</p><p class="muted small">About 3–5 minutes per run. No account, saves, XP, or movement.</p></div><div class="builds"><button class="buildCard blood" data-build="blood"><img src="${hero('blood')}" alt=""><span><span class="overline">BLOOD + FURY</span><strong>Crimson Cascade</strong><small>Bleed, critical strikes, and executions that spill into the whole pack.</small></span></button><button class="buildCard lightning" data-build="lightning"><img src="${hero('lightning')}" alt=""><span><span class="overline">MAGIC · LIGHTNING</span><strong>Living Storm</strong><small>Charge enemies, leap between targets, then turn each kill into another discharge.</small></span></button></div></section>`;
  app.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>start(b.dataset.build));
}
function start(build){
  run=createRun(build);paused=false;seen=new Set();logLines=[];eventCursor=0;
  pauseButton.hidden=false;exitButton.hidden=false;pauseButton.textContent='Pause';
  app.innerHTML=`<section class="hud"><div><span class="overline" id="stage">ENCOUNTER 1 / 5</span><h2 id="encounterName"></h2><span class="muted small" id="counter"></span><span class="focusSummary" id="focusInfo">AUTO TARGETING</span><span class="commanderSummary" id="commanderInfo" hidden>COMMANDER AURA · ALLIES ATTACK FASTER</span></div><div class="encounterDots" id="dots"></div><div class="hudRight"><span class="overline" id="buildName"></span><div id="timer">0:00</div><span class="muted small" id="buildChoices"></span></div></section><section class="arena" id="arena"><div class="battlefield"><div class="hero" id="hero"><img src="${hero(build)}" alt="${build==='blood'?'Duelist':'Spellblade'}"><div class="heroInfo"><strong class="heroName">${build==='blood'?'Duelist':'Spellblade'}</strong><div class="health heroHealth"><i id="heroHp"></i></div><span class="small" id="heroHpText"></span></div></div><div class="mobField" id="mobField" aria-label="Enemies"></div></div><div id="overlay"></div></section><section class="below"><div class="panel"><h3>Build effects</h3><div class="stats" id="stats"></div></div><div class="panel"><h3>Combat feed</h3><div class="log" id="log" aria-live="off"></div></div></section>`;
  document.querySelector('#buildName').textContent=build==='blood'?'BLOOD + FURY':'MAGIC · LIGHTNING';
  const mobField=document.querySelector('#mobField');
  mobField.addEventListener('click',ev=>{const card=ev.target.closest('[data-enemy]');if(!card)return;setTargetFocus(run,Number(card.dataset.enemy));render();});
  mobField.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches('[data-enemy]')){ev.preventDefault();setTargetFocus(run,Number(ev.target.dataset.enemy));render();}});
  addLog('The first host approaches.');render();
  clearInterval(timer);timer=setInterval(frame,100);
}
function addLog(s){logLines.unshift(s);logLines=logLines.slice(0,5);const el=document.querySelector('#log');if(el)el.innerHTML=logLines.map(x=>`<div>${escape(x)}</div>`).join('');}
function frame(){if(!run||paused||run.phase==='choice'||run.phase==='finished')return;tick(run,.1);events();render();if(run.phase==='finished')finish();}
function events(){
  const batch=run.events.slice(eventCursor);eventCursor=run.events.length;
  for(const ev of batch){
    if(ev.type==='damage'){
      const card=document.querySelector(`[data-enemy="${ev.target}"]`);
      if(card){card.classList.remove('hit');void card.offsetWidth;card.classList.add('hit');if(ev.kind==='bleed'||ev.kind==='arc'||ev.kind==='discharge'||ev.kind==='crit')float(card,`${ev.kind==='crit'?'CRIT ':''}−${Math.round(ev.amount)}`,ev.kind);if(ev.kind==='hit'||ev.kind==='crit'||ev.kind==='arc'||ev.kind==='discharge')flashVfx(card,ev.kind);}
      document.querySelector('#hero')?.classList.toggle('attacking',ev.kind==='hit'||ev.kind==='crit');
    }
    if(ev.type==='playerDamage'){
      const h=document.querySelector('#hero');if(h){h.classList.add('hurt');float(h,`−${Math.round(ev.amount)}`,'damageTaken');flashVfx(h,ev.kind==='spell'?'arc':'hit');setTimeout(()=>h.classList.remove('hurt'),320);}
    }
    if(ev.type==='arc'||ev.type==='chain'){
      drawBolt(ev.from,ev.target,ev.kind==='blood'?'blood':'lightning');
      const card=document.querySelector(`[data-enemy="${ev.target}"]`);if(card){card.classList.add(ev.kind==='blood'?'burst':'shock');setTimeout(()=>card.classList.remove('burst','shock'),320);}
      if(ev.type==='chain')addLog(ev.kind==='blood'?'Bleed execution spreads through the host!':'A kill releases another discharge!');
    }
    if(ev.type==='crit')addLog('Critical strike accelerates the cascade.');
    if(ev.type==='castStart')addLog('Caster begins a 3 second spell. Focus it to interrupt.');
    if(ev.type==='castInterrupted')addLog('CAST INTERRUPTED · spell prevented.');
    if(ev.type==='guard')addLog('Tank grants a temporary shield to an ally.');
    if(ev.type==='commanderBuffStart')addLog('ELITE COMMANDER · nearby allies attack faster.');
    if(ev.type==='commanderBuffEnd')addLog('Commander defeated · allied attack speed returns to normal.');
    if(ev.type==='kill'&&ev.depth>0)addLog('CHAIN KILL · '+ev.kind.toUpperCase());
    if(ev.type==='enemyAttack'||ev.type==='casterAttack'){const card=document.querySelector(`[data-enemy="${ev.target}"]`);if(card)flashVfx(card,ev.type==='casterAttack'?'arc':'hit');}
    if(ev.type==='encounterEnd')addLog(`Encounter ${ev.encounter+1} cleared in ${Math.round(run.metrics.encounterSeconds.at(-1))}s.`);
    if(ev.type==='encounterStart')addLog(`Encounter ${ev.encounter+1} begins automatically.`);
  }
}
function float(card,label,kind){const el=document.createElement('span');el.className='float '+kind;el.textContent=label;card.append(el);setTimeout(()=>el.remove(),850);}
function flashVfx(card,kind){
  const img=document.createElement('img');img.className='impactVfx';img.alt='';img.setAttribute('aria-hidden','true');
  img.src=asset(kind==='arc'||kind==='discharge'?'assets/combat-vfx/spell_projectile_wand_shock.png':'assets/combat-vfx/slash_main_hand.png');
  card.append(img);setTimeout(()=>img.remove(),390);
}
function drawBolt(from,to,kind){
  const arena=document.querySelector('#arena'),a=document.querySelector(`[data-enemy="${from}"]`),b=document.querySelector(`[data-enemy="${to}"]`);if(!arena||!a||!b)return;
  const ar=arena.getBoundingClientRect(),ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
  const x=ra.left+ra.width/2-ar.left,y=ra.top+ra.height/2-ar.top,x2=rb.left+rb.width/2-ar.left,y2=rb.top+rb.height/2-ar.top;
  const line=document.createElement('span');line.className='bolt '+kind;line.style.cssText=`left:${x}px;top:${y}px;width:${Math.hypot(x2-x,y2-y)}px;transform:rotate(${Math.atan2(y2-y,x2-x)}rad)`;arena.append(line);setTimeout(()=>line.remove(),360);
}
function render(){
  if(!run)return;
  const cfg=ENCOUNTERS[run.encounter];document.querySelector('#stage').textContent=`ENCOUNTER ${run.encounter+1} / 5`;
  document.querySelector('#encounterName').textContent=cfg.name;
  document.querySelector('#counter').textContent=`${run.killed} defeated · ${run.spawned}/${cfg.count} arrived`;
  const focused=run.focusId==null?null:run.enemies.find(e=>e.id===run.focusId&&e.hp>0);
  document.querySelector('#focusInfo').textContent=focused?`FOCUS · ${focused.name}`:'AUTO TARGETING · TAP AN ENEMY TO FOCUS';
  document.querySelector('#focusInfo').classList.toggle('focused',!!focused);
  const commander=document.querySelector('#commanderInfo');commander.hidden=!run.commanderAlive;
  document.querySelector('#timer').textContent=seconds(run.time);
  document.querySelector('#buildChoices').textContent=run.choices.length?run.choices.map(id=>UPGRADES[run.build].flat().find(x=>x.id===id)?.name).join(' · '):'Base affinity';
  document.querySelector('#dots').innerHTML=ENCOUNTERS.map((_,i)=>`<span class="${i<run.encounter?'done':i===run.encounter?'now':''}"></span>`).join('');
  document.querySelector('#arena').style.setProperty('--arena',`url('${asset(run.build==='blood'?'assets/dungeons/c3/blood_crimson_dominion.webp':'assets/dungeons/c3/magic_stormglass_beyond.webp')}')`);
  document.querySelector('#heroHp').style.width=`${run.hp/run.maxhp*100}%`;
  document.querySelector('#heroHpText').textContent=`${Math.ceil(run.hp)} / ${run.maxhp} HP`;
  document.querySelector('#stats').innerHTML=run.build==='blood'?stats([['Bleed ticks',run.metrics.bleedTicks],['Critical hits',run.metrics.crits],['Chain kills',run.metrics.chainKills],['Damage',Math.round(run.metrics.damage)] ]):stats([['Arc jumps',run.metrics.arcs],['Discharges',run.metrics.discharges],['Chain kills',run.metrics.chainKills],['Damage',Math.round(run.metrics.damage)]]);
  const field=document.querySelector('#mobField');
  for(const e of run.enemies){
    let card=field.querySelector(`[data-enemy="${e.id}"]`);
    if(!card){card=document.createElement('div');card.className='mob';card.dataset.enemy=e.id;card.tabIndex=0;card.setAttribute('role','button');card.innerHTML=`<div class="tags"></div><img src="${asset(e.image)}" alt=""><strong>${escape(e.name)}</strong><small class="mobRole"></small><div class="castTrack" hidden><i></i></div><div class="health"><i></i></div>`;field.append(card);seen.add(e.id);}
    card.classList.toggle('dead',e.hp<=0);card.classList.toggle('focused',run.focusId===e.id&&e.hp>0);card.classList.toggle('elite',!!e.elite);
    card.setAttribute('aria-pressed',String(run.focusId===e.id&&e.hp>0));card.setAttribute('aria-label',`${e.name}, ${e.role}${e.casting?' casting spell':''}, ${Math.ceil(e.hp)} health${run.focusId===e.id?', focused':''}`);
    card.querySelector('.health i').style.width=`${Math.max(0,e.hp/e.maxhp*100)}%`;
    card.querySelector('.mobRole').textContent=e.elite?'ELITE COMMANDER':e.role.toUpperCase();
    const cast=card.querySelector('.castTrack');cast.hidden=!e.casting;if(e.casting)cast.querySelector('i').style.width=`${Math.min(100,e.castProgress/e.castDuration*100)}%`;
    card.querySelector('.tags').innerHTML=(e.bleed>0&&e.hp>0?'<span class="tag">BLEED</span>':'')+(e.charge>0&&e.hp>0?`<span class="tag lightning">⚡${e.charge}</span>`:'')+(e.barrier>0&&e.hp>0?'<span class="tag shield">SHIELD</span>':'')+(e.casting?'<span class="tag castTag">CAST</span>':'');
  }
  for(const card of [...field.children])if(!run.enemies.some(e=>String(e.id)===card.dataset.enemy))card.remove();
  if(run.phase==='choice')choiceOverlay();
}
function stats(items){return items.map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');}
function choiceOverlay(){
  const options=UPGRADES[run.build][run.encounter],overlay=document.querySelector('#overlay');
  overlay.className='arenaOverlay';overlay.innerHTML=`<div class="decision"><span class="overline">ENCOUNTER ${run.encounter+1} COMPLETE · EVOLUTION ${run.encounter+1} / 3</span><h2>Shape your power</h2><p class="muted">Choose one. The next encounter starts immediately.</p><div class="choiceGrid">${options.map(o=>`<button class="choice ${run.build}" data-choice="${o.id}"><strong>${escape(o.name)}</strong><small>${escape(o.text)}</small></button>`).join('')}</div></div>`;
  overlay.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{choose(run,b.dataset.choice);overlay.innerHTML='';overlay.className='';addLog(`${UPGRADES[run.build].flat().find(o=>o.id===b.dataset.choice).name} acquired.`);render();});
  overlay.querySelector('button')?.focus();
}
function finish(){
  clearInterval(timer);pauseButton.hidden=true;exitButton.hidden=true;
  const won=run.hp>0,total=run.metrics.encounterSeconds.reduce((a,b)=>a+b,0);
  app.innerHTML=`<section class="result"><img class="resultHero" src="${hero(run.build)}" alt=""><span class="overline">${won?'THE HOST HAS FALLEN':'THE HOST ENDURES'}</span><h2>${won?'Your build became a storm.':'Try a different path.'}</h2><p class="muted">${run.build==='blood'?'Blood + Fury':'Magic: Lightning'} · ${run.choices.map(id=>UPGRADES[run.build].flat().find(x=>x.id===id)?.name).join(' → ')||'Base affinity'}</p><div class="stats">${stats([['Duration',seconds(run.time)],['Enemies defeated',run.metrics.kills],['Damage dealt',Math.round(run.metrics.damage)],['Damage taken',Math.round(run.metrics.received)]])}</div><div class="stats">${run.build==='blood'?stats([['Bleed ticks',run.metrics.bleedTicks],['Critical hits',run.metrics.crits],['Chain kills',run.metrics.chainKills],['Health left',Math.ceil(run.hp)]]):stats([['Arc jumps',run.metrics.arcs],['Discharges',run.metrics.discharges],['Chain kills',run.metrics.chainKills],['Health left',Math.ceil(run.hp)]])}</div><h3>Encounter times</h3><ol>${run.metrics.encounterSeconds.map((s,i)=>`<li>${escape(ENCOUNTERS[i].name)} · ${seconds(s)}</li>`).join('')}</ol><p class="muted small">${Math.round(total)} seconds in combat · No account or save data used.</p><div class="resultActions"><button id="again" class="primary">Try another build</button><button id="retry" class="ghost">Replay this build</button></div></section>`;
  document.querySelector('#again').onclick=welcome;document.querySelector('#retry').onclick=()=>start(run.build);
}
pauseButton.onclick=()=>{if(!run||run.phase==='finished')return;paused=!paused;pauseButton.textContent=paused?'Resume':'Pause';const overlay=document.querySelector('#overlay');if(paused){overlay.className='arenaOverlay';overlay.innerHTML='<div class="decision pauseText"><h2>Paused</h2><p>Your build waits for you.</p><button id="resume">Resume combat</button></div>';document.querySelector('#resume').onclick=()=>pauseButton.click();}else if(run.phase==='choice')choiceOverlay();else{overlay.className='';overlay.innerHTML='';}};
exitButton.onclick=()=>{clearInterval(timer);run=null;paused=false;welcome();};
welcome();
