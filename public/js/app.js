// BROWSER FINGERPRINT (survit au VPN + navigation privée partielle)
function getFingerprint(){
  const c=document.createElement('canvas'),x=c.getContext('2d');
  c.width=200;c.height=50;
  x.textBaseline='top';x.font='14px Arial';x.fillStyle='#f60';x.fillRect(0,0,200,50);
  x.fillStyle='#069';x.fillText('QuiAaimé🎮',2,15);
  x.fillStyle='rgba(102,204,0,.7)';x.fillText('QuiAaimé🎮',4,17);
  const canvasHash=c.toDataURL();
  const gl=document.createElement('canvas').getContext('webgl');
  let gpu='?';
  if(gl){const d=gl.getExtension('WEBGL_debug_renderer_info');if(d)gpu=gl.getParameter(d.UNMASKED_RENDERER_WEBGL)}
  const raw=[navigator.language,screen.width+'x'+screen.height,screen.colorDepth,new Date().getTimezoneOffset(),navigator.hardwareConcurrency||'?',gpu,navigator.platform,canvasHash.slice(-50)].join('|');
  let h=0;for(let i=0;i<raw.length;i++){h=((h<<5)-h)+raw.charCodeAt(i);h|=0}
  return 'fp_'+Math.abs(h).toString(36);
}
const DEVICE_FP=getFingerprint();

// POISON PILL — impossible à contourner sans réinstaller le navigateur
function markBanned(){localStorage.setItem('_qb','1');sessionStorage.setItem('_qb','1');document.cookie='_qb=1;path=/;max-age=31536000;SameSite=Lax'}
function clearBan(){localStorage.removeItem('_qb');sessionStorage.removeItem('_qb');document.cookie='_qb=;path=/;max-age=0'}
function blockScreen(){document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:3rem;flex-direction:column;gap:10px;background:#050510;color:white;font-family:sans-serif"><span>🚫</span><span style=font-size:1rem;color:rgba(255,255,255,.3)>Accès bloqué</span></div>'}
function isBannedLocal(){return localStorage.getItem('_qb')==='1'||sessionStorage.getItem('_qb')==='1'||document.cookie.includes('_qb=1')}

// SOCKET — envoie le fingerprint dans le handshake
const socket=io({reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,timeout:10000,auth:{fp:DEVICE_FP}});

// Si le serveur kick pour ban
socket.on('banned',()=>{markBanned();blockScreen()});

let S={mode:null,myId:null,myName:'',myAvatar:'😎',roomCode:null,isHost:false,players:[],selGuess:new Set(),hasVoted:false,round:0,total:10,config:{},cats:{},modes:{}};

// PARTICLES
(function(){const c=document.getElementById('particle-canvas'),x=c.getContext('2d');let w,h,p=[];function r(){w=c.width=innerWidth;h=c.height=innerHeight;p=[];for(let i=0;i<50;i++)p.push({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.8+.4,dx:(Math.random()-.5)*.35,dy:(Math.random()-.5)*.35,o:Math.random()*.35+.08})}r();addEventListener('resize',r);(function d(){x.clearRect(0,0,w,h);p.forEach(pt=>{pt.x+=pt.dx;pt.y+=pt.dy;if(pt.x<0)pt.x=w;if(pt.x>w)pt.x=0;if(pt.y<0)pt.y=h;if(pt.y>h)pt.y=0;x.beginPath();x.arc(pt.x,pt.y,pt.r,0,Math.PI*2);x.fillStyle=`rgba(168,85,247,${pt.o})`;x.fill()});requestAnimationFrame(d)})()})();

// VISITOR TRACKING — vérifie le ban, si déban → nettoie le poison
fetch('/api/visit?fp='+DEVICE_FP).then(r=>{if(r.status===403){markBanned();blockScreen()}else{clearBan()}return r.json()}).catch(()=>{
  // Hors-ligne : utiliser le cache local
  if(isBannedLocal())blockScreen();
});
function fetchStats(){fetch('/api/stats').then(r=>r.json()).then(d=>{document.getElementById('stat-unique').textContent=d.unique||0;document.getElementById('stat-views').textContent=d.views||0}).catch(()=>{})}

// LOADING SCREEN
window.addEventListener('load',()=>{setTimeout(()=>{document.getElementById('loader')?.classList.add('done')},2000)});

// SCREENS
function goToScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id)?.classList.add('active');playSound('whoosh')}
function showSetup(m){S.mode=m;document.getElementById('setup-title').textContent=m==='create'?'🎉 Créer une Partie':'🔗 Rejoindre';document.getElementById('join-grp').style.display=m==='join'?'block':'none';goToScreen('screen-setup')}
function openDev(){document.getElementById('dev-overlay').classList.add('open');playSound('success');fetchStats()}
function closeDev(e){if(!e||e.target===document.getElementById('dev-overlay'))document.getElementById('dev-overlay').classList.remove('open')}

// QR CODE
function generateQR(code){
  const url=`${location.origin}?join=${code}`;
  document.getElementById('qr-img').src=`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=7c3aed`;
  document.getElementById('qr-url').textContent=url;
}

// LEADERBOARD
function openLeaderboard(){
  document.getElementById('lb-overlay').classList.add('open');playSound('success');
  fetch('/api/leaderboard').then(r=>r.json()).then(lb=>{
    const el=document.getElementById('lb-list');
    if(!lb.length){el.innerHTML='<div class="lb-empty">Aucune partie jouée encore 🎮</div>';return}
    el.innerHTML='';lb.forEach((p,i)=>{
      const r=document.createElement('div');r.className='lb-row';r.style.animationDelay=`${i*.05}s`;
      const rc=i===0?'gold':i===1?'silver':i===2?'bronze':'';
      r.innerHTML=`<div class="lb-rank ${rc}">${i+1}</div><span class="lb-av">${p.avatar}</span><div class="lb-info"><div class="lb-name">${p.name}</div><div class="lb-stats">${p.wins}🏆 · ${p.gamesPlayed} parties</div></div><div class="lb-score">${p.totalScore}</div>`;
      el.appendChild(r)})
  }).catch(()=>{});
}
function closeLB(e){if(!e||e.target===document.getElementById('lb-overlay'))document.getElementById('lb-overlay').classList.remove('open')}

// ACHIEVEMENTS
const myAchievements=JSON.parse(localStorage.getItem('quiaaime_ach')||'[]');
function openAchievements(){
  document.getElementById('ach-overlay').classList.add('open');playSound('success');
  fetch('/api/achievements').then(r=>r.json()).then(achs=>{
    const el=document.getElementById('ach-grid');el.innerHTML='';
    achs.forEach(a=>{const unlocked=myAchievements.includes(a.id);const d=document.createElement('div');d.className=`ach-card ${unlocked?'unlocked':'locked'}`;d.innerHTML=`<div class="ach-icon">${a.icon}</div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div>`;el.appendChild(d)})
  }).catch(()=>{});
}
function closeAch(e){if(!e||e.target===document.getElementById('ach-overlay'))document.getElementById('ach-overlay').classList.remove('open')}
function unlockAch(id){if(!myAchievements.includes(id)){myAchievements.push(id);localStorage.setItem('quiaaime_ach',JSON.stringify(myAchievements));showToast('🏅 Succès débloqué !')}}

// PWA INSTALL
let deferredPrompt=null;
if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;document.getElementById('install-btn').style.display='block'});
function installApp(){
  if(deferredPrompt){deferredPrompt.prompt();deferredPrompt.userChoice.then(r=>{if(r.outcome==='accepted')showToast('🎉 Appli installée !');document.getElementById('install-btn').style.display='none';deferredPrompt=null})}
  else{showToast('📱 Ouvre le menu du navigateur → "Ajouter à l\'écran d\'accueil"')}
}
window.addEventListener('appinstalled',()=>{document.getElementById('install-btn').style.display='none';showToast('✅ QuiAaimé installé !')});

// SOUNDS
let soundEnabled=true;
function toggleSound(){soundEnabled=!soundEnabled;document.getElementById('sound-toggle').textContent=soundEnabled?'🔊':'🔇';showToast(soundEnabled?'Son activé':'Son désactivé');playSound('tap')}

// PROFILE
function loadProfile(){
  const stats=JSON.parse(localStorage.getItem('quiaaime_stats')||'{"games":0,"wins":0,"score":0}');
  document.getElementById('ps-games').textContent=stats.games;
  document.getElementById('ps-wins').textContent=stats.wins;
  document.getElementById('ps-score').textContent=stats.score;
  const lastAv=localStorage.getItem('quiaaime_avatar')||'😎';
  const lastName=localStorage.getItem('quiaaime_name')||'Joueur';
  document.getElementById('prof-av').textContent=lastAv;
  document.getElementById('prof-name').textContent=lastName;
}
function openProfile(){loadProfile();document.getElementById('profile-overlay').classList.add('open');playSound('whoosh')}
function closeProfile(e){if(!e||e.target===document.getElementById('profile-overlay'))document.getElementById('profile-overlay').classList.remove('open')}
function resetProfile(){if(confirm('Tout effacer ?')){localStorage.removeItem('quiaaime_stats');localStorage.removeItem('quiaaime_ach');myAchievements=[];loadProfile();showToast('Profil réinitialisé')}}
function saveStats(score,won){
  const stats=JSON.parse(localStorage.getItem('quiaaime_stats')||'{"games":0,"wins":0,"score":0}');
  stats.games++;if(won)stats.wins++;stats.score+=score;
  localStorage.setItem('quiaaime_stats',JSON.stringify(stats));
  if(S.myName)localStorage.setItem('quiaaime_name',S.myName);
  if(S.myAvatar)localStorage.setItem('quiaaime_avatar',S.myAvatar);
}

// PUBLIC ROOMS
function openPublicRooms(){
  document.getElementById('pub-overlay').classList.add('open');
  playSound('whoosh');
  document.getElementById('pub-list').innerHTML='<div class="lb-empty">Recherche...</div>';
  fetch('/api/public-rooms').then(r=>r.json()).then(rooms=>{
    const el=document.getElementById('pub-list');el.innerHTML='';
    if(rooms.length===0){el.innerHTML='<div class="lb-empty">Aucune partie publique en ce moment 😕</div>';return}
    rooms.forEach(r=>{
      const d=document.createElement('div');d.className='pub-item';
      d.innerHTML=`<div class="pub-host">Partie de ${r.host}</div><div class="pub-count">👥 ${r.players}/10</div><button class="pub-join" onclick="joinPublic('${r.code}')">Rejoindre</button>`;
      el.appendChild(d);
    });
  }).catch(()=>{document.getElementById('pub-list').innerHTML='<div class="lb-empty" style="color:var(--no)">Erreur de connexion</div>'});
}
function closePub(e){if(!e||e.target===document.getElementById('pub-overlay'))document.getElementById('pub-overlay').classList.remove('open')}
function createPublic(){closePub();showSetup('create');S.isPublic=true;}
function joinPublic(code){closePub();showSetup('join');document.getElementById('input-code').value=code;}

// CHAT
let unreadChat=0;
function toggleChat(){
  const p=document.getElementById('chat-panel');
  if(p.classList.contains('open')){p.classList.remove('open')}
  else{p.classList.add('open');unreadChat=0;updateChatBadge();setTimeout(()=>document.getElementById('chat-input').focus(),100)}
}
function updateChatBadge(){const b=document.getElementById('chat-badge');if(unreadChat>0&&!document.getElementById('chat-panel').classList.contains('open')){b.style.display='flex';b.textContent=unreadChat>9?'9+':unreadChat}else{b.style.display='none'}}
function sendChat(){
  const inp=document.getElementById('chat-input');const text=inp.value.trim();if(!text||!S.roomCode)return;
  socket.emit('chat-msg',{text});inp.value='';
}
socket.on('chat-msg',m=>{
  const msgs=document.getElementById('chat-messages');
  const d=document.createElement('div');d.className='chat-msg'+(m.id===S.myId?' mine':'');
  d.innerHTML=`<div class="chat-msg-name">${m.name} ${m.avatar}</div><div class="chat-msg-text">${m.text.replace(/</g,'&lt;')}</div>`;
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;
  if(m.id!==S.myId&&!document.getElementById('chat-panel').classList.contains('open')){unreadChat++;updateChatBadge();playSound('bubble')}
});
// AVATAR
document.querySelectorAll('.av').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.av').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');S.myAvatar=b.dataset.avatar;playSound('tap');navigator.vibrate?.(30)}));

// GO
function handleGo(){const n=document.getElementById('input-name').value.trim();if(!n||n.length<2)return showToast('Pseudo min 2 car.',1);S.myName=n;if(S.mode==='create')socket.emit('create-room',{playerName:n,avatar:S.myAvatar});else{const c=document.getElementById('input-code').value.trim();if(!c||c.length!==4)return showToast('Code 4 chiffres !',1);socket.emit('join-room',{code:c,playerName:n,avatar:S.myAvatar})}}
document.getElementById('input-name').onkeydown=e=>{if(e.key==='Enter'){S.mode==='join'?document.getElementById('input-code').focus():handleGo()}};
document.getElementById('input-code').onkeydown=e=>{if(e.key==='Enter')handleGo()};

// CONFIG
function initConfig(cats,modes,config,isHost){
  S.cats=cats;S.modes=modes;S.config=config;
  if(isHost){document.getElementById('cfg-panel').style.display='flex';document.getElementById('cfg-sum').style.display='none';
    // Modes
    const mg=document.getElementById('mode-grid');mg.innerHTML='';
    Object.entries(modes).forEach(([k,v])=>{const d=document.createElement('div');d.className='mode-card'+(config.mode===k?' on':'');d.innerHTML=`<div class="mc-name">${v.name}</div><div class="mc-desc">${v.desc}</div>`;d.onclick=()=>{mg.querySelectorAll('.mode-card').forEach(x=>x.classList.remove('on'));d.classList.add('on');sendCfg();playSound('tap')};d.dataset.mode=k;mg.appendChild(d)});
    // Categories
    const cg=document.getElementById('cat-grid');cg.innerHTML='';
    Object.entries(cats).forEach(([k,v])=>{const b=document.createElement('button');b.className='cat-tog'+(config.categories.includes(k)?' on':'');b.textContent=v;b.dataset.cat=k;b.onclick=()=>{b.classList.toggle('on');sendCfg();playSound('tap')};cg.appendChild(b)});
    // Options
    initOpts('opt-rounds',config.rounds);initOpts('opt-vote',config.voteTimer);initOpts('opt-guess',config.guessTimer);
  }else{document.getElementById('cfg-panel').style.display='none';document.getElementById('cfg-sum').style.display='flex';updSum(config)}
}
function initOpts(id,val){document.getElementById(id).querySelectorAll('.co').forEach(b=>{b.classList.toggle('on',parseInt(b.dataset.val)===val);b.onclick=()=>{document.getElementById(id).querySelectorAll('.co').forEach(x=>x.classList.remove('on'));b.classList.add('on');sendCfg();playSound('tap')}})}
function sendCfg(){
  const rounds=parseInt(document.querySelector('#opt-rounds .co.on')?.dataset.val||10);
  const voteTimer=parseInt(document.querySelector('#opt-vote .co.on')?.dataset.val||12);
  const guessTimer=parseInt(document.querySelector('#opt-guess .co.on')?.dataset.val||15);
  const cats=Array.from(document.querySelectorAll('#cat-grid .cat-tog.on')).map(b=>b.dataset.cat);
  const mode=document.querySelector('#mode-grid .mode-card.on')?.dataset.mode||'classic';
  if(!cats.length)return showToast('Min 1 catégorie !',1);
  socket.emit('update-config',{rounds,voteTimer,guessTimer,categories:cats,mode});
}
function updSum(c){const e=document.getElementById('cfg-sum');const mn=S.modes[c.mode]?.name||c.mode;e.innerHTML=`<span>${mn}</span><span>🎯 ${c.rounds}r</span><span>⏱️ ${c.voteTimer}s</span><span>🤔 ${c.guessTimer}s</span>`}

// LOBBY
function renderLobby(players,hostId){
  const l=document.getElementById('lobby-plrs');l.innerHTML='';
  players.forEach((p,i)=>{const d=document.createElement('div');d.className='plr';d.style.animationDelay=`${i*.06}s`;d.innerHTML=`<div class="pa">${p.avatar}</div><div class="pn">${esc(p.name)}</div>${p.isHost||p.id===hostId?'<div class="ph">👑 HÔTE</div>':''}`;l.appendChild(d)});
  document.getElementById('pcnt').textContent=players.length;
  if(S.isHost){document.getElementById('btn-start').style.display='flex';document.getElementById('btn-start').disabled=players.length<2;document.getElementById('wait-txt').style.display='none'}
  else{document.getElementById('btn-start').style.display='none';document.getElementById('wait-txt').style.display='block'}
}
function copyCode(){if(S.roomCode){navigator.clipboard.writeText(S.roomCode).then(()=>showToast('Code copié ! 📋')).catch(()=>showToast(S.roomCode));navigator.vibrate?.(50)}}
function startGame(){socket.emit('start-game')}

// VOTE
function submitVote(liked){if(S.hasVoted)return;S.hasVoted=true;socket.emit('submit-vote',{liked});document.getElementById('vbtns').style.display='none';document.getElementById('stip').style.display='none';document.getElementById('vdone').style.display='block';playSound(liked?'like':'nope');navigator.vibrate?.(liked?[50,30,50]:[100])}
let tx=0,sw=false;
document.addEventListener('touchstart',e=>{if(!document.getElementById('screen-vote').classList.contains('active')||S.hasVoted)return;tx=e.touches[0].clientX;sw=true},{passive:true});
document.addEventListener('touchmove',e=>{if(!sw)return;const c=document.getElementById('vote-card'),dx=e.touches[0].clientX-tx;c.style.transform=`translateX(${dx}px) rotate(${dx*.08}deg)`;c.style.transition='none';c.style.borderColor=dx>50?'var(--ok)':dx<-50?'var(--no)':''},{passive:true});
document.addEventListener('touchend',e=>{if(!sw)return;sw=false;const c=document.getElementById('vote-card'),dx=e.changedTouches[0].clientX-tx;c.style.transition='all .3s';c.style.transform='';c.style.borderColor='';if(Math.abs(dx)>80)submitVote(dx>0)});

// GUESS
function renderGuess(players){const g=document.getElementById('ggrid');g.innerHTML='';S.selGuess.clear();players.forEach(p=>{if(p.id===S.myId)return;const d=document.createElement('div');d.className='gp';d.innerHTML=`<div class="ga">${p.avatar}</div><div class="gn">${esc(p.name)}</div>`;d.onclick=()=>{d.classList.toggle('sel');d.classList.contains('sel')?S.selGuess.add(p.id):S.selGuess.delete(p.id);playSound('tap');navigator.vibrate?.(20)};g.appendChild(d)})}
function confirmGuess(){socket.emit('submit-guess',{guessedIds:[...S.selGuess]});const b=document.getElementById('btn-guess');b.disabled=true;b.innerHTML='<span class="bi">✅</span>Envoyé !';playSound('confirm')}

// ROULETTE
function runRoulette(data){
  document.getElementById('r-emo').textContent=data.content.emoji;
  document.getElementById('r-txt').textContent=data.content.text;
  const ring=document.getElementById('roul-ring');ring.innerHTML='';
  const reveal=document.getElementById('roul-reveal');reveal.style.display='none';
  document.getElementById('roul-suspense').style.display='block';
  
  const all=data.allPlayers||[];const likerIds=new Set(data.likers.map(l=>l.id));
  all.forEach(p=>{const d=document.createElement('div');d.className='roul-player';d.id=`rp-${p.id}`;d.innerHTML=`<div class="rp-av">${p.avatar}</div><div class="rp-nm">${esc(p.name)}</div>`;ring.appendChild(d)});
  
  goToScreen('screen-roulette');playSound('drumroll');
  
  // Spinning highlight
  let idx=0,speed=80,step=0,totalSteps=35+Math.floor(Math.random()*15);
  function spin(){
    all.forEach(p=>document.getElementById(`rp-${p.id}`)?.classList.remove('highlight'));
    document.getElementById(`rp-${all[idx%all.length].id}`)?.classList.add('highlight');
    playSound('tick');navigator.vibrate?.(15);
    idx++;step++;
    if(step<totalSteps){speed+=step>20?12:3;setTimeout(spin,speed)}
    else{setTimeout(()=>revealAll(all,likerIds,data),600)}
  }
  setTimeout(spin,800);
}

function revealAll(all,likerIds,data){
  document.getElementById('roul-suspense').style.display='none';
  all.forEach(p=>document.getElementById(`rp-${p.id}`)?.classList.remove('highlight'));
  let i=0;
  function revealNext(){
    if(i>=all.length){
      const reveal=document.getElementById('roul-reveal');
      reveal.style.display='block';
      const count=data.likers.length;
      reveal.innerHTML=count>0?`<span style="color:var(--ok)">${count} personne${count>1?'s':''} ${count>1?'ont':'a'} aimé !</span>`:`<span style="color:var(--td)">Personne n'a aimé 💔</span>`;
      if(count>0)launchConfetti();
      return;
    }
    const p=all[i];const el=document.getElementById(`rp-${p.id}`);
    if(likerIds.has(p.id)){el?.classList.add('revealed-yes');playSound('reveal')}
    else{el?.classList.add('revealed-no');playSound('nope')}
    navigator.vibrate?.(40);i++;
    setTimeout(revealNext,500);
  }
  revealNext();
}

// RESULTS
function renderResults(d){
  document.getElementById('res-emo').textContent=d.content.emoji;document.getElementById('res-txt').textContent=d.content.text;document.getElementById('res-title').textContent=`Round ${d.round}/${d.totalRounds}`;
  const ll=document.getElementById('likers'),nl=document.getElementById('nolk');ll.innerHTML='';
  if(!d.likers.length){nl.style.display='block';ll.style.display='none'}else{nl.style.display='none';ll.style.display='flex';d.likers.forEach((p,i)=>{const c=document.createElement('div');c.className='lk';c.style.animationDelay=`${i*.1}s`;c.innerHTML=`<div class="la">${p.avatar}</div><div class="ln">${esc(p.name)}</div>`;ll.appendChild(c)})}
  const pts=d.roundScores[S.myId]||0;const e=document.getElementById('my-pts');e.textContent=pts>=0?`+${pts}`:pts;e.className=pts>=0?'sval':'sval neg';
  let cd=5;const te=document.getElementById('nxt-t');const iv=setInterval(()=>{cd--;te.textContent=cd;if(cd<=0)clearInterval(iv)},1000);
}

// GAME OVER
function renderGO(rk){
  [['pod-1',0],['pod-2',1],['pod-3',2]].forEach(([id,i])=>{const e=document.getElementById(id);if(rk[i]){e.querySelector('.pod-av').textContent=rk[i].avatar;e.querySelector('.pod-nm').textContent=rk[i].name;e.querySelector('.pod-sc').textContent=rk[i].score+' pts';e.style.display='flex'}else e.style.display='none'});
  const f=document.getElementById('ranks');f.innerHTML='';rk.forEach((p,i)=>{if(i<3)return;const r=document.createElement('div');r.className='rk';r.style.animationDelay=`${(i-3)*.08+.6}s`;r.innerHTML=`<span class="rk-p">#${i+1}</span><span class="rk-a">${p.avatar}</span><span class="rk-n">${esc(p.name)}${p.eliminated?' ❌':''}</span><span class="rk-s">${p.score} pts</span>`;f.appendChild(r)});
  document.getElementById('btn-replay').style.display=S.isHost?'flex':'none';launchConfetti();playSound('victory');
  const me=rk.find(p=>p.id===S.myId);if(me)saveStats(me.score,rk[0]&&rk[0].id===S.myId);
}
function playAgain(){socket.emit('play-again')}
function goHome(){location.reload()}

// REACTIONS
function sendReaction(e){socket.emit('send-reaction',{emoji:e});spawnR(e);navigator.vibrate?.(20)}
function spawnR(e){const c=document.getElementById('reactions-container'),el=document.createElement('div');el.className='flt';el.textContent=e;el.style.left=`${20+Math.random()*60}%`;el.style.animationDuration=`${2+Math.random()*2}s`;c.appendChild(el);setTimeout(()=>el.remove(),4000)}

// TIMER
function updTimer(ph,sec,max){const pre=ph==='vote'?'v':'g';const tn=document.getElementById(`${pre}-tn`),tc=document.getElementById(`${pre}-tc`);tn.textContent=sec;tc.style.strokeDashoffset=276-(sec/max)*276;if(sec<=3){tn.classList.add('urg');tc.classList.add('urg');playSound('tick')}else{tn.classList.remove('urg');tc.classList.remove('urg')}}

// SOCKET EVENTS
socket.on('room-created',d=>{S.roomCode=d.code;S.isHost=true;S.players=d.players;document.getElementById('lobby-code').textContent=d.code;renderLobby(d.players,S.myId);initConfig(d.categories,d.modes,{rounds:10,voteTimer:12,guessTimer:15,categories:Object.keys(d.categories),mode:'classic'},true);generateQR(d.code);goToScreen('screen-lobby');playSound('success')});
socket.on('room-joined',d=>{S.roomCode=d.code;S.isHost=false;S.players=d.players;document.getElementById('lobby-code').textContent=d.code;renderLobby(d.players,d.hostId);initConfig(d.categories,d.modes,d.config,false);generateQR(d.code);goToScreen('screen-lobby');playSound('success')});
socket.on('player-joined',d=>{S.players=d.players;renderLobby(d.players,null);showToast(`${d.player.avatar} ${d.player.name} a rejoint !`)});
socket.on('player-left',d=>{S.players=d.players;renderLobby(d.players,null);showToast(`${d.playerName} est parti 👋`)});
socket.on('new-host',d=>{if(d.hostId===S.myId){S.isHost=true;showToast("Tu es le nouvel hôte ! 👑")}renderLobby(S.players,d.hostId)});
socket.on('config-updated',c=>{S.config=c;if(!S.isHost)updSum(c)});
socket.on('player-eliminated',d=>showToast(`💀 ${d.avatar} ${d.name} est éliminé !`));

socket.on('round-start',d=>{
  S.hasVoted=false;S.round=d.round;S.total=d.totalRounds;
  document.getElementById('v-rb').textContent=`${d.round}/${d.totalRounds}`;
  document.getElementById('v-cat').textContent=d.content.catLabel||'';
  document.getElementById('v-emo').textContent=d.content.emoji;
  document.getElementById('v-txt').textContent=d.content.text;
  document.getElementById('vbtns').style.display='flex';document.getElementById('stip').style.display='flex';document.getElementById('vdone').style.display='none';
  document.getElementById('vc').textContent='0';document.getElementById('vt').textContent=(d.activePlayers||S.players).length;
  document.getElementById('v-tn').textContent='';document.getElementById('v-tc').style.strokeDashoffset='0';
  document.getElementById('v-tn').classList.remove('urg');document.getElementById('v-tc').classList.remove('urg');
  goToScreen('screen-vote');playSound('newRound');
});
socket.on('timer',d=>updTimer(d.phase,d.seconds,d.max));
socket.on('player-voted',d=>{document.getElementById('vc').textContent=d.votedCount;document.getElementById('vt').textContent=d.total});
socket.on('guess-phase',d=>{
  document.getElementById('g-rb').textContent=`${S.round}/${S.total}`;
  document.getElementById('gq-e').textContent=d.content.emoji;document.getElementById('gq-t').textContent=`"${d.content.text}" — Qui a aimé ?`;
  document.getElementById('gc').textContent='0';document.getElementById('gt').textContent=d.players.length;
  document.getElementById('g-tn').textContent='';document.getElementById('g-tc').style.strokeDashoffset='0';
  document.getElementById('g-tn').classList.remove('urg');document.getElementById('g-tc').classList.remove('urg');
  const b=document.getElementById('btn-guess');b.disabled=false;b.innerHTML='<span class="btn-shine"></span><span class="bi">✅</span>Confirmer';
  renderGuess(d.players);goToScreen('screen-guess');playSound('guessPhase');
});
socket.on('player-guessed',d=>{document.getElementById('gc').textContent=d.guessedCount;document.getElementById('gt').textContent=d.total});
socket.on('roulette-start',d=>{runRoulette(d)});
socket.on('round-results',d=>{renderResults(d);goToScreen('screen-results')});
socket.on('game-over',d=>{renderGO(d.rankings);goToScreen('screen-gameover')});
socket.on('back-to-lobby',d=>{S.players=d.players;renderLobby(d.players,null);if(d.config){S.config=d.config;initConfig(S.cats,S.modes,d.config,S.isHost)}goToScreen('screen-lobby');showToast('Nouvelle partie ! 🎉')});
socket.on('reaction',d=>spawnR(d.emoji));
socket.on('error-msg',d=>showToast(d.message,1));
let discoTimer=null;
socket.on('disconnect',()=>{discoTimer=setTimeout(()=>{if(S.roomCode)showToast('Connexion perdue... Reconnexion...',1)},3000)});
socket.on('connect',()=>{S.myId=socket.id;if(discoTimer){clearTimeout(discoTimer);discoTimer=null}});

// TOAST
function showToast(m,err){const c=document.getElementById('toast-container'),t=document.createElement('div');t.className=`toast${err?' err':''}`;t.textContent=m;c.appendChild(t);setTimeout(()=>t.remove(),3000)}

// SOUNDS
const ax=new(window.AudioContext||window.webkitAudioContext)();
function tone(f,d,tp='sine',v=.1){try{const o=ax.createOscillator(),g=ax.createGain();o.type=tp;o.frequency.value=f;g.gain.setValueAtTime(v,ax.currentTime);g.gain.exponentialRampToValueAtTime(.001,ax.currentTime+d);o.connect(g).connect(ax.destination);o.start();o.stop(ax.currentTime+d)}catch(e){}}
function playSound(n){if(!soundEnabled)return;try{switch(n){case'tap':tone(800,.06);break;case'whoosh':tone(300,.1,'sine',.06);break;case'success':tone(523,.1);setTimeout(()=>tone(659,.1),80);setTimeout(()=>tone(784,.12),160);break;case'like':tone(700,.06);setTimeout(()=>tone(900,.1),60);break;case'nope':tone(300,.15,'triangle');break;case'confirm':tone(500,.06);setTimeout(()=>tone(700,.1),80);break;case'newRound':tone(440,.06);setTimeout(()=>tone(550,.06),80);setTimeout(()=>tone(660,.1),160);break;case'guessPhase':tone(660,.1);setTimeout(()=>tone(550,.06),120);break;case'tick':tone(1000,.03,'square',.05);break;case'reveal':tone(400,.06);setTimeout(()=>tone(600,.06),80);setTimeout(()=>tone(800,.12),160);break;case'victory':tone(523,.1);setTimeout(()=>tone(659,.1),120);setTimeout(()=>tone(784,.1),240);setTimeout(()=>tone(1047,.2),360);break;case'drumroll':for(let i=0;i<8;i++)setTimeout(()=>tone(200+i*20,.08,'triangle',.06),i*120);break;case'bubble':tone(400,.08,'sine');setTimeout(()=>tone(600,.08,'sine'),80);break}}catch(e){}}
document.addEventListener('click',()=>{if(ax.state==='suspended')ax.resume()},{once:true});
document.addEventListener('touchstart',()=>{if(ax.state==='suspended')ax.resume()},{once:true});

// CONFETTI
function launchConfetti(){const c=document.getElementById('confetti-canvas'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const ps=[];const co=['#7c3aed','#ec4899','#06b6d4','#22c55e','#f59e0b','#ef4444','#fff'];for(let i=0;i<100;i++)ps.push({x:Math.random()*c.width,y:-20-Math.random()*200,w:5+Math.random()*5,h:3+Math.random()*4,c:co[~~(Math.random()*co.length)],vx:(Math.random()-.5)*4,vy:2+Math.random()*3.5,r:Math.random()*360,rs:(Math.random()-.5)*8,l:1});let f=0;(function a(){x.clearRect(0,0,c.width,c.height);let alive=0;ps.forEach(p=>{if(p.l<=0)return;alive++;p.x+=p.vx;p.y+=p.vy;p.vy+=.04;p.r+=p.rs;p.l-=.004;x.save();x.translate(p.x,p.y);x.rotate(p.r*Math.PI/180);x.globalAlpha=p.l;x.fillStyle=p.c;x.fillRect(-p.w/2,-p.h/2,p.w,p.h);x.restore()});f++;if(alive&&f<280)requestAnimationFrame(a);else x.clearRect(0,0,c.width,c.height)})()}

function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
