// Isolated, deterministic multi-target combat slice. No profile or save access.
export const ENCOUNTERS = [
  {name:'Bloodscar Outskirts', count:13, hp:25, interval:1.05, cap:3, initial:2, batch:1, attack:1},
  {name:'Crimson Gate', count:18, hp:28, interval:.85, cap:4, initial:2, batch:1, attack:1.1},
  {name:'Shattered Hall', count:24, hp:31, interval:.7, cap:5, initial:3, batch:1, attack:1.2},
  {name:'Stormglass Crossing', count:31, hp:34, interval:.55, cap:7, initial:3, batch:3, attack:1.25},
  {name:'The Last Host', count:51, hp:38, interval:.38, cap:8, initial:6, batch:5, attack:1.3},
];
export const UPGRADES = {
  blood: [
    [{id:'deep_cuts',name:'Deep Cuts',text:'Bleed ticks 60% harder, making each wound more dangerous.'},{id:'quick_hands',name:'Quick Hands',text:'Attack 25% faster; each strike adds a stronger Bleed.'}],
    [{id:'sanguine_fury',name:'Sanguine Fury',text:'Crits immediately trigger an extra Bleed tick and hasten the next tick.'},{id:'crimson_rush',name:'Crimson Rush',text:'Crits cut every bleeding enemy and refresh their Bleed.'}],
    [{id:'carrion_detonation',name:'Carrion Detonation',text:'Bleed kills burst through nearby enemies and spread Bleed.'},{id:'reapers_cadence',name:"Reaper's Cadence",text:'Bleed kills execute wounded targets and spread a stronger Bleed.'}],
  ],
  lightning: [
    [{id:'overcharge',name:'Overcharge',text:'Every third charged attack releases a bonus discharge.'},{id:'static_field',name:'Static Field',text:'Charged hits mark nearby enemies and pulse damage through them.'}],
    [{id:'arcane_echo',name:'Arcane Echo',text:'Arcs leap to two more enemies; each jump can trigger a new arc.'},{id:'forked_current',name:'Forked Current',text:'Every arc forks into two separate targets for wider coverage.'}],
    [{id:'spell_surge',name:'Spell Surge',text:'A kill by an arc starts a new discharge from the fallen target.'},{id:'thunderhead',name:'Thunderhead',text:'Every third arc detonates all charged enemies; kills release another pulse.'}],
  ],
};
export const MOB_ART = [
  ['Bloodfang Ravager','assets/mobs/forge/bloodfang_ravager.png'],
  ['Sanguine Leech','assets/mobs/forge/sanguine_leech.png'],
  ['Echo Reaver','assets/mobs/crypt/echo_reaver.png'],
  ['Tempest Hawk','assets/mobs/storm/tempest_hawk.png'],
  ['Stormglass Knight','assets/mobs/storm/stormglass_knight.png'],
  ['Umbral Eye','assets/mobs/void/umbral_eye.png'],
];

const round = n => Math.round(n * 10) / 10;
export function createRun(build, seed=202613) {
  if (!UPGRADES[build]) throw Error('Unknown build');
  const r={build, seed:seed>>>0, rng:seed>>>0, time:0, encounter:0, phase:'fight', hp:340, maxhp:340,
    enemies:[], spawned:0, killed:0, attackClock:0, spawnClock:0, choices:[], events:[], nextId:1,
    metrics:{damage:0, received:0, kills:0, bleedTicks:0, crits:0, arcs:0, discharges:0, chainKills:0, encounterSeconds:[], interruptedCasts:0},
    startedAt:0, encounterStartedAt:0, attackIndex:0, charge:0, arcIndex:0, focusId:null, commanderAlive:false};
  for(let i=0;i<ENCOUNTERS[0].initial;i++)spawn(r,roleFor(r,i));
  return r;
}
function random(r) {r.rng=(Math.imul(r.rng,1664525)+1013904223)>>>0; return r.rng/4294967296;}
function emit(r,type,more={}) {r.events.push({type,time:round(r.time),...more});}
function alive(r) {return r.enemies.filter(e=>e.hp>0);}
function selected(r,id) {return r.choices.includes(id);}
function roleFor(r,index) {
  if(r.encounter===3&&index===4)return 'commander';
  return ['skirmisher','tank','caster','skirmisher','skirmisher','tank','caster'][index%7];
}
function spawn(r,role=roleFor(r,r.spawned)) {
  const cfg=ENCOUNTERS[r.encounter], kind=(r.spawned+r.encounter*2)%MOB_ART.length;
  const [baseName,image]=MOB_ART[kind],elite=role==='commander';
  const hpScale=role==='tank'?1.72:role==='skirmisher'?.72:elite?2.65:role==='caster'?.90:1;
  const maxhp=Math.round((cfg.hp+(r.spawned%4)*3)*hpScale),attackEvery=role==='skirmisher'?3.2:role==='tank'?5.8:elite?5.3:4.6;
  const occupied=new Set(r.enemies.map(e=>e.slotId));let slotId=0;while(occupied.has(slotId))slotId++;
  const archetype=role==='commander'?'tank':role;
  const lane=archetype==='tank'?'frontline':archetype==='skirmisher'?'midline':'backline';
  const duration=elite?1.65:role==='tank'?1.35:role==='skirmisher'?.90:1.15;
  const e={id:r.nextId++,name:elite?'Elite Commander':baseName,image,role,elite,hp:maxhp,maxhp,defense:role==='tank'?3:elite?2:0,
    bleed:0,bleedTime:0,bleedClock:0,charge:0,barrier:0,barrierTime:0,attackClock:random(r)*attackEvery,
    attackEvery,guardClock:random(r)*1.5,castDuration:3,castProgress:0,casting:false,slotId,
    archetype,formationSlot:{index:slotId,lane,rank:Math.floor(slotId/2),flank:slotId%2},
    visualPosition:{x:null,y:null,unit:'percent'},movement:{state:'entering',progress:0,duration,entryPosition:null,currentPosition:null,destination:null,viewport:null},lifeState:'alive',
    attackDamage:role==='skirmisher'?1.15:role==='tank'?3.2:elite?3.8:role==='caster'?7.5:4};
  if(elite){r.commanderAlive=true;emit(r,'commanderBuffStart',{target:e.id});}
  r.enemies.push(e);r.spawned++;emit(r,'spawn',{target:e.id,role:e.role,elite:e.elite});
}
function bleed(r,e,power) {
  if(e.hp<=0)return;
  e.bleed=Math.min(24,Math.max(e.bleed,power));e.bleedTime=6;
  emit(r,'bleed',{target:e.id,power:round(e.bleed)});
}
function damage(r,e,amount,kind,source=null,depth=0) {
  if(e.hp<=0||amount<=0)return;
  let remaining=amount,absorbed=0;
  if(e.barrier>0){absorbed=Math.min(e.barrier,remaining);e.barrier=round(e.barrier-absorbed);remaining-=absorbed;}
  const dealt=Math.min(e.hp,Math.max(0,remaining-(e.defense||0)));e.hp=round(Math.max(0,e.hp-dealt));r.metrics.damage=round(r.metrics.damage+dealt);
  emit(r,'damage',{target:e.id,amount:round(dealt),absorbed:round(absorbed),kind,source});
  if(e.hp<=0)kill(r,e,kind,depth);
}
function hurtPlayer(r,e,kind) {
  const hit=round(e.attackDamage*ENCOUNTERS[r.encounter].attack);
  r.hp=round(Math.max(0,r.hp-hit));r.metrics.received=round(r.metrics.received+hit);
  emit(r,'playerDamage',{target:e.id,amount:hit,kind});
  return hit;
}
function kill(r,e,kind,depth) {
  e.lifeState='dying';e.movement.state='death';
  r.killed++;r.metrics.kills++;if(depth>0||kind==='arc')r.metrics.chainKills++;
  if(e.casting){e.casting=false;r.metrics.interruptedCasts++;emit(r,'castInterrupted',{target:e.id});}
  if(e.elite){r.commanderAlive=false;emit(r,'commanderBuffEnd',{target:e.id});}
  emit(r,'kill',{target:e.id,kind,depth});
  r.hp=Math.min(r.maxhp,r.hp+.3);
  if(depth>=5)return;
  if(r.build==='blood'&&kind==='bleed'&&r.choices.length>=3) {
    const targets=alive(r).sort((a,b)=>a.hp-b.hp).slice(0,selected(r,'reapers_cadence')?3:4);
    for(const [i,next] of targets.entries()) {
      bleed(r,next,selected(r,'reapers_cadence')?7:5);
      const burst=i===0?next.hp:selected(r,'reapers_cadence')?(next.hp<next.maxhp*.58?19:7):13;
      emit(r,'chain',{from:e.id,target:next.id,kind:'blood'});
      damage(r,next,burst,'bleed',e.id,depth+1);
    }
  }
  if(r.build==='lightning'&&r.choices.length>=3&&(kind==='arc'||kind==='discharge')) {
    const targets=alive(r).sort((a,b)=>a.hp-b.hp).slice(0,selected(r,'thunderhead')?4:2);
    for(const [i,next] of targets.entries()){emit(r,'chain',{from:e.id,target:next.id,kind:'lightning'});r.metrics.discharges++;damage(r,next,i===0?next.hp:selected(r,'thunderhead')?12:17,'discharge',e.id,depth+1);}
  }
}
function arc(r,from,depth=0,visited=new Set()) {
  if(depth>4||!(selected(r,'arcane_echo')||selected(r,'forked_current')))return;
  visited.add(from.id);
  const count=selected(r,'arcane_echo')?3:selected(r,'forked_current')?2:1;
  const candidates=alive(r).filter(e=>!visited.has(e.id)).sort((a,b)=>a.hp-b.hp||b.charge-a.charge);
  for(const target of candidates.slice(0,count)) {
    visited.add(target.id);r.metrics.arcs++;r.arcIndex++;emit(r,'arc',{from:from.id,target:target.id,depth});
    damage(r,target,r.choices.length>=3?19:selected(r,'forked_current')?9:11,'arc',from.id,depth);
    target.charge=Math.min(4,Math.max(0,target.charge-1)+1);
    if(selected(r,'thunderhead')&&r.arcIndex%3===0)for(const other of alive(r).filter(e=>e.charge>0).slice(0,5)) {
      r.metrics.discharges++;emit(r,'discharge',{target:other.id});damage(r,other,10,'discharge',target.id,depth+1);
    }
    if(selected(r,'arcane_echo')&&depth<2&&target.hp>0)arc(r,target,depth+1,new Set(visited));
  }
}
function playerAttack(r) {
  const targets=alive(r);if(!targets.length)return;
  let target=r.focusId==null?null:targets.find(e=>e.id===r.focusId);
  if(!target){const uncast=targets.filter(e=>!e.casting);const pool=uncast.length?uncast:targets;target=[...pool].sort((a,b)=>(Number(b.elite)-Number(a.elite))||a.hp-b.hp)[0];}
  r.attackTargetId=target.id;r.attackIndex++;
  if(r.build==='blood'&&r.choices.length>=3&&target.bleed>0&&target.hp<=24){
    damage(r,target,selected(r,'reapers_cadence')?25:24,'bleed');
    if(target.hp<=0)return;
  }
  const crit=r.build==='blood'&&(r.attackIndex%5===0||selected(r,'sanguine_fury')&&r.attackIndex%4===0);
  if(crit){r.metrics.crits++;emit(r,'crit',{target:target.id});}
  if(r.build==='lightning'){target.charge=Math.min(4,target.charge+1);emit(r,'charge',{target:target.id});}
  damage(r,target,crit?18:12,crit?'crit':'hit');
  if(target.hp<=0){if(r.build==='lightning')arc(r,target);return;}
  if(r.build==='blood') {
    bleed(r,target,selected(r,'deep_cuts')?9:selected(r,'quick_hands')?7:5);
    if(crit&&selected(r,'sanguine_fury')){r.metrics.bleedTicks++;damage(r,target,target.bleed*1.5,'bleed');target.bleedClock=.65;}
    if(crit&&selected(r,'crimson_rush'))for(const other of alive(r).filter(e=>e.bleed>0)){
      other.bleedTime=6;damage(r,other,8,'crit',target.id);
    }
  } else {
    if(selected(r,'static_field'))for(const other of alive(r).filter(e=>e.id!==target.id).slice(0,2)) {other.charge=Math.min(4,other.charge+1);damage(r,other,3,'static',target.id);}
    if(selected(r,'overcharge')&&++r.charge%3===0){r.metrics.discharges++;emit(r,'discharge',{target:target.id});damage(r,target,14,'discharge');}
    if(target.hp>0)arc(r,target);
  }
}
function second(r,dt) {
  for(const e of alive(r)) {
    if(e.bleedTime>0){e.bleedTime-=dt;e.bleedClock+=dt;const interval=selected(r,'sanguine_fury')?.68:1;
      if(e.bleedClock>=interval){e.bleedClock-=interval;r.metrics.bleedTicks++;damage(r,e,e.bleed,'bleed');}
      if(e.bleedTime<=0)e.bleed=0;
    }
    if(e.hp<=0)continue;
    if(e.barrierTime>0){e.barrierTime=Math.max(0,e.barrierTime-dt);if(!e.barrierTime)e.barrier=0;}
    const haste=r.commanderAlive&&!e.elite?1.22:1;
    if(e.role==='tank'){
      e.guardClock+=dt;
      if(e.guardClock>=4.6){e.guardClock=0;const ally=alive(r).filter(x=>x.id!==e.id&&x.barrier<12).sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp)[0];
        if(ally){ally.barrier=12;ally.barrierTime=4;emit(r,'guard',{source:e.id,target:ally.id,amount:12});}
      }
    }
    if(e.role==='caster'&&!e.elite){
      if(e.casting){e.castProgress+=dt;if(e.castProgress>=e.castDuration){e.casting=false;e.castProgress=0;const hit=hurtPlayer(r,e,'spell');emit(r,'casterAttack',{target:e.id,amount:hit});}}
      else {e.attackClock+=dt*haste;if(e.attackClock>=e.attackEvery){e.attackClock=0;e.casting=true;e.castProgress=0;emit(r,'castStart',{target:e.id,duration:e.castDuration});}}
    }else{
      e.attackClock+=dt*haste;
      if(e.attackClock>=e.attackEvery){e.attackClock-=e.attackEvery;hurtPlayer(r,e,'physical');emit(r,'enemyAttack',{target:e.id,amount:round(e.attackDamage*ENCOUNTERS[r.encounter].attack)});}
    }
  }
}
export function tick(r,dt=.1) {
  if(r.phase!=='fight')return r;
  dt=Math.min(.2,Math.max(0,dt));r.time=round(r.time+dt);
  for(const e of r.enemies)if(e.movement?.state==='entering'){
    e.movement.progress=Math.min(e.movement.duration,e.movement.progress+dt);
    if(e.movement.progress>=e.movement.duration){e.movement.state='holding';emit(r,'arrivalComplete',{target:e.id});}
  }
  const cfg=ENCOUNTERS[r.encounter];r.spawnClock+=dt;
  if(r.spawned<cfg.count&&alive(r).length<cfg.cap&&r.spawnClock>=cfg.interval) {
    const room=cfg.cap-alive(r).length,pack=Math.min(cfg.batch,room,cfg.count-r.spawned);
    for(let i=0;i<pack;i++)spawn(r);
    r.spawnClock=0;
  }
  r.attackClock+=dt;
  const attackPeriod=r.build==='blood'&&selected(r,'quick_hands')?.32:.4;
  if(r.attackClock>=attackPeriod){r.attackClock-=attackPeriod;playerAttack(r);}
  second(r,dt);
  if(r.focusId!=null&&!alive(r).some(e=>e.id===r.focusId)){const previous=r.focusId;r.focusId=null;emit(r,'focusCleared',{target:previous});}
  r.enemies=r.enemies.filter(e=>e.hp>0||r.time-(r.events.findLast(x=>x.type==='kill'&&x.target===e.id)?.time??r.time)<.9);
  if(r.hp<=0){r.phase='finished';emit(r,'defeat');}
  else if(r.spawned===cfg.count&&alive(r).length===0){
    r.metrics.encounterSeconds.push(round(r.time-r.encounterStartedAt));
    emit(r,'encounterEnd',{encounter:r.encounter});
    if(r.encounter===ENCOUNTERS.length-1)r.phase='finished';
    else if(r.encounter<3)r.phase='choice';
    else nextEncounter(r);
  }
  return r;
}
export function choose(r,id) {
  if(r.phase!=='choice'||!UPGRADES[r.build][r.encounter].some(x=>x.id===id))throw Error('Choice unavailable');
  r.choices.push(id);emit(r,'upgrade',{id});nextEncounter(r);return r;
}
function nextEncounter(r) {
  r.encounter++;r.encounterStartedAt=r.time;r.spawned=0;r.spawnClock=0;r.attackClock=0;r.enemies=[];r.focusId=null;r.commanderAlive=false;
  r.hp=Math.min(r.maxhp,r.hp+20);r.phase='fight';
  emit(r,'encounterStart',{encounter:r.encounter});
  const cfg=ENCOUNTERS[r.encounter];for(let i=0;i<cfg.initial;i++)spawn(r,roleFor(r,i));
}
export function setTargetFocus(r,id) {
  if(r.phase!=='fight'||!alive(r).some(e=>e.id===id))return r.focusId;
  r.focusId=r.focusId===id?null:id;
  emit(r,r.focusId===null?'focusCleared':'focusSet',{target:id});
  return r.focusId;
}
