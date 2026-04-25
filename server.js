const express=require('express'),http=require('http'),{Server}=require('socket.io'),path=require('path');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:'*'},pingTimeout:60000,pingInterval:25000});
app.use((req,res,next)=>{res.set({'Cache-Control':'no-store,no-cache,must-revalidate','Pragma':'no-cache','Expires':'0'});next()});

// ========== ADMIN SYSTEM ==========
const ADMIN_KEY='bendo2026x';
const visitors=[];
const onlineUsers=new Map();

function getDevice(ua){
  if(!ua)return{type:'Inconnu',os:'?',browser:'?'};
  const mobile=/Mobile|Android|iPhone|iPad/i.test(ua);
  let os='Autre';
  if(/Windows/i.test(ua))os='Windows';else if(/Mac/i.test(ua))os='MacOS';else if(/iPhone|iPad/i.test(ua))os='iOS';else if(/Android/i.test(ua))os='Android';else if(/Linux/i.test(ua))os='Linux';
  let browser='Autre';
  if(/Chrome/i.test(ua)&&!/Edg/i.test(ua))browser='Chrome';else if(/Safari/i.test(ua)&&!/Chrome/i.test(ua))browser='Safari';else if(/Firefox/i.test(ua))browser='Firefox';else if(/Edg/i.test(ua))browser='Edge';
  return{type:mobile?'📱 Mobile':'💻 PC',os,browser};
}

app.get('/api/visit',(req,res)=>{
  const ip=(req.headers['x-forwarded-for']||req.connection.remoteAddress||'unknown').split(',')[0].trim();
  const ua=req.headers['user-agent']||'';
  const fp=req.query.fp||'';
  const dev=getDevice(ua);
  // Check ban by fingerprint too
  if(bannedFPs.has(fp))return res.status(403).json({banned:true});
  const existing=visitors.find(v=>v.ip===ip);
  const existingFP=fp?visitors.find(v=>v.fp===fp):null;
  if(existing){
    existing.ua=ua;existing.device=dev;if(fp)existing.fp=fp;
  }else if(existingFP){
    // Same device, new IP (VPN) — don't count as new visitor
    existingFP.ua=ua;existingFP.device=dev;existingFP.ip=ip;
  }else{
    visitors.push({ip,ua,fp,device:dev,visits:1,firstSeen:new Date().toISOString(),lastSeen:new Date().toISOString()});
  }
  res.json({unique:visitors.length,views:visitors.reduce((a,v)=>a+v.visits,0)});
});
app.get('/api/stats',(req,res)=>res.json({unique:visitors.length,views:visitors.reduce((a,v)=>a+v.visits,0),since:visitors[0]?.firstSeen||new Date().toISOString()}));

// ADMIN ROUTES (protected)
app.get('/admin',(req,res)=>{if(req.query.key!==ADMIN_KEY)return res.status(403).send('🚫');res.sendFile(path.join(__dirname,'admin.html'))});
app.get('/api/admin/data',(req,res)=>{
  if(req.query.key!==ADMIN_KEY)return res.status(403).json({error:'nope'});
  const totalViews=visitors.reduce((a,v)=>a+v.visits,0);
  const mobileCount=visitors.filter(v=>v.device.type.includes('Mobile')).length;
  const pcCount=visitors.filter(v=>v.device.type.includes('PC')).length;
  const online=Array.from(onlineUsers.values());
  res.json({visitors,online,totalViews,uniqueCount:visitors.length,mobileCount,pcCount,rooms:rooms?.size||0,bannedIPs:[...bannedIPs],leaderboard:globalLeaderboard.slice(0,50)});
});

// BAN SYSTEM (IP + Fingerprint)
const bannedIPs=new Set();
const bannedFPs=new Set();
app.post('/api/admin/ban',(req,res)=>{
  if(req.query.key!==ADMIN_KEY)return res.status(403).json({error:'nope'});
  const ip=req.query.ip;if(!ip)return res.json({error:'no ip'});
  bannedIPs.add(ip);
  // Also ban all fingerprints associated with this IP
  visitors.filter(v=>v.ip===ip).forEach(v=>{if(v.fp)bannedFPs.add(v.fp)});
  // Disconnect them — send 'banned' event first so client stores poison pill
  onlineUsers.forEach((u,sid)=>{
    if(u.ip===ip||(u.fp&&bannedFPs.has(u.fp))){
      const s=io.sockets.sockets.get(sid);
      if(s){s.emit('banned');setTimeout(()=>s.disconnect(true),200)}
    }
  });
  res.json({ok:true});
});
app.post('/api/admin/unban',(req,res)=>{
  if(req.query.key!==ADMIN_KEY)return res.status(403).json({error:'nope'});
  bannedIPs.delete(req.query.ip);
  visitors.filter(v=>v.ip===req.query.ip).forEach(v=>{if(v.fp)bannedFPs.delete(v.fp)});
  res.json({ok:true});
});

// Check ban on visit (IP + Fingerprint)
app.use((req,res,next)=>{
  if(req.url.includes('/admin'))return next();
  const ip=(req.headers['x-forwarded-for']||req.connection.remoteAddress||'').split(',')[0].trim();
  const fp=req.query?.fp||'';
  if(bannedIPs.has(ip)||bannedFPs.has(fp))return res.status(403).send('🚫 Accès bloqué');
  next();
});

// GLOBAL LEADERBOARD
const globalLeaderboard=[];
app.get('/api/leaderboard',(req,res)=>res.json(globalLeaderboard.slice(0,20)));

// ACHIEVEMENTS
const ACHIEVEMENTS=[
  {id:'first_win',name:'Première Victoire',desc:'Gagner une partie',icon:'🏆',condition:'wins>=1'},
  {id:'five_wins',name:'Serial Winner',desc:'Gagner 5 parties',icon:'👑',condition:'wins>=5'},
  {id:'perfect',name:'Parfait !',desc:'Round parfait (max points)',icon:'💎',condition:'perfectRounds>=1'},
  {id:'speed_demon',name:'Speed Demon',desc:'Gagner en mode Speed',icon:'⚡',condition:'speedWins>=1'},
  {id:'survivor',name:'Survivant',desc:'Gagner en mode Élimination',icon:'🛡️',condition:'elimWins>=1'},
  {id:'social',name:'Social Butterfly',desc:'Jouer 10 parties',icon:'🦋',condition:'gamesPlayed>=10'},
  {id:'veteran',name:'Vétéran',desc:'Jouer 25 parties',icon:'🎖️',condition:'gamesPlayed>=25'},
  {id:'bomber',name:'Démineur',desc:'Gagner en mode Bombe',icon:'💣',condition:'bombWins>=1'},
];
app.get('/api/achievements',(req,res)=>res.json(ACHIEVEMENTS));

// PUBLIC ROOMS
app.get('/api/public-rooms',(req,res)=>{
  const pub=[];
  rooms.forEach(r=>{if(r.isPublic&&r.state==='lobby'&&r.players.size<10)pub.push({code:r.code,players:r.players.size,host:allPlayers(r).find(p=>p.isHost)?.name||'?'})});
  res.json(pub);
});

app.get('/health',(req,res)=>res.json({status:'ok',rooms:rooms?.size||0}));
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

const CONTENT=[
  {id:1,emoji:'🍍',text:"Mettre de l'ananas sur la pizza",cat:'food'},
  {id:2,emoji:'🧦',text:"Dormir avec des chaussettes",cat:'habits'},
  {id:3,emoji:'🎵',text:"Écouter du Justin Bieber en cachette",cat:'music'},
  {id:4,emoji:'🗣️',text:"Se parler à soi-même tout seul",cat:'weird'},
  {id:5,emoji:'🎧',text:"Regarder des vidéos ASMR pour dormir",cat:'internet'},
  {id:6,emoji:'📱',text:"Stalker son ex sur les réseaux",cat:'relations'},
  {id:7,emoji:'😢',text:"Pleurer devant un film Disney",cat:'cinema'},
  {id:8,emoji:'💃',text:"Danser seul(e) devant le miroir",cat:'weird'},
  {id:9,emoji:'📩',text:"Envoyer un message et le supprimer direct",cat:'internet'},
  {id:10,emoji:'🚽',text:"Rester sur son tel aux toilettes +30min",cat:'habits'},
  {id:11,emoji:'😱',text:"Liker une photo de 2019 par accident",cat:'internet'},
  {id:12,emoji:'🚿',text:"Chanter faux sous la douche",cat:'music'},
  {id:13,emoji:'🍫',text:"Manger du Nutella à la cuillère",cat:'food'},
  {id:14,emoji:'💄',text:"Regarder des tutos maquillage sans en faire",cat:'internet'},
  {id:15,emoji:'🏥',text:"Googler ses symptômes et paniquer",cat:'weird'},
  {id:16,emoji:'👀',text:"Avoir eu un crush sur un(e) prof",cat:'relations'},
  {id:17,emoji:'💡',text:"Dormir avec la lumière allumée",cat:'habits'},
  {id:18,emoji:'🍝',text:"Mettre du ketchup sur les pâtes",cat:'food'},
  {id:19,emoji:'🎤',text:"Pleurer en écoutant un rappeur",cat:'music'},
  {id:20,emoji:'📹',text:"Enregistrer des TikTok sans jamais les poster",cat:'internet'},
  {id:21,emoji:'🐶',text:"Parler à son animal comme à un humain",cat:'weird'},
  {id:22,emoji:'🌑',text:"Avoir peur du noir à +18 ans",cat:'habits'},
  {id:23,emoji:'🛏️',text:"Manger au lit en regardant une série",cat:'habits'},
  {id:24,emoji:'💭',text:"Rêver de son/sa crush",cat:'relations'},
  {id:25,emoji:'🎵',text:"Écouter de la musique triste quand tout va bien",cat:'music'},
  {id:26,emoji:'🚶',text:"Faire semblant de pas voir quelqu'un dans la rue",cat:'weird'},
  {id:27,emoji:'💭',text:"Se créer des scénarios dans sa tête avant de dormir",cat:'habits'},
  {id:28,emoji:'😐',text:"Répondre 'mdr' sans avoir ri",cat:'internet'},
  {id:29,emoji:'⏰',text:"Mettre 3 alarmes minimum pour se réveiller",cat:'habits'},
  {id:30,emoji:'🎂',text:"Goûter le gâteau avant la fête",cat:'food'},
  {id:31,emoji:'📸',text:"Garder des captures d'écran compromettantes",cat:'internet'},
  {id:32,emoji:'🔒',text:"Avoir un compte spam/finstagram",cat:'internet'},
  {id:33,emoji:'🕺',text:"Danser dans l'ascenseur quand on est seul",cat:'weird'},
  {id:34,emoji:'🧠',text:"Essayer de déplacer un objet par la pensée",cat:'weird'},
  {id:35,emoji:'👕',text:"Rester en pyjama toute la journée",cat:'habits'},
  {id:36,emoji:'🍦',text:"Manger de la glace en plein hiver",cat:'food'},
  {id:37,emoji:'🔁',text:"Écouter la même chanson 50x d'affilée",cat:'music'},
  {id:38,emoji:'🎶',text:"Avoir honte de sa playlist secrète",cat:'music'},
  {id:39,emoji:'🔍',text:"Googler 'est-ce que je suis normal ?'",cat:'weird'},
  {id:40,emoji:'♈',text:"Croire aux signes astrologiques",cat:'weird'},
  {id:41,emoji:'📚',text:"Renifler un livre neuf",cat:'weird'},
  {id:42,emoji:'🤳',text:"Prendre des selfies en cachette",cat:'internet'},
  {id:43,emoji:'📞',text:"Simuler un appel pour éviter une conversation",cat:'weird'},
  {id:44,emoji:'🥣',text:"Boire le lait du bol de céréales",cat:'food'},
  {id:45,emoji:'🎮',text:"Ragequit un jeu et y retourner 5 min après",cat:'gaming'},
  {id:46,emoji:'💅',text:"Se ronger les ongles",cat:'habits'},
  {id:47,emoji:'🌮',text:"Manger un kebab à 3h du matin",cat:'food'},
  {id:48,emoji:'🎤',text:"Chanter à fond dans la voiture",cat:'music'},
  {id:49,emoji:'😴',text:"S'endormir en cours/réunion",cat:'habits'},
  {id:50,emoji:'🍿',text:"Regarder un film d'horreur entre les doigts",cat:'cinema'},
  {id:51,emoji:'📖',text:"Lire la fin d'un livre en premier",cat:'weird'},
  {id:52,emoji:'🧻',text:"Vérifier derrière le rideau de douche",cat:'weird'},
  {id:53,emoji:'💬',text:"Taper un long message puis tout effacer",cat:'internet'},
  {id:54,emoji:'🏃',text:"Courir en montant les escaliers",cat:'habits'},
  {id:55,emoji:'🧀',text:"Manger du fromage à minuit",cat:'food'},
  {id:56,emoji:'🐍',text:"Avoir une phobie des insectes",cat:'weird'},
  {id:57,emoji:'📱',text:"Vérifier son téléphone 100x par jour",cat:'internet'},
  {id:58,emoji:'🎭',text:"Préparer une dispute sous la douche",cat:'weird'},
  {id:59,emoji:'🛒',text:"Aller au supermarché pour les échantillons gratuits",cat:'food'},
  {id:60,emoji:'😈',text:"Tricher au Monopoly",cat:'gaming'},
];
const CATS={food:'🍔 Food',habits:'😴 Habitudes',music:'🎶 Musique',weird:'🤪 Bizarre',internet:'📱 Internet',relations:'💔 Relations',cinema:'🎬 Cinéma',gaming:'🎮 Gaming'};
const MODES={classic:{name:'🎯 Classique',desc:'Devine qui a aimé'},speed:{name:'⚡ Speed',desc:'Rounds ultra rapides'},elimination:{name:'👑 Élimination',desc:'Le dernier est éliminé'},bomb:{name:'💣 Bombe',desc:'Devine la bombe'}};

const rooms=new Map(),playerRooms=new Map();
function genCode(){let c;do{c=Math.floor(1000+Math.random()*9000).toString()}while(rooms.has(c));return c}
function arr(room){return Array.from(room.players.values()).filter(p=>!p.eliminated)}
function allPlayers(room){return Array.from(room.players.values())}
function pick(room){
  const cats=room.config.categories;
  let avail=CONTENT.filter(c=>!room.used.has(c.id)&&cats.includes(c.cat));
  if(!avail.length){room.used.clear();avail=CONTENT.filter(c=>cats.includes(c.cat))}
  const p=avail[~~(Math.random()*avail.length)];room.used.add(p.id);return{...p,catLabel:CATS[p.cat]||p.cat};
}

function startGame(room){
  room.state='playing';room.round=0;room.used.clear();
  allPlayers(room).forEach(p=>{p.score=0;p.eliminated=false});
  if(room.config.mode==='speed'){room.config.voteTimer=5;room.config.guessTimer=8}
  nextRound(room);
}

function nextRound(room){
  room.round++;
  if(room.round>room.config.rounds)return endGame(room);
  // Elimination check
  if(room.config.mode==='elimination'&&room.round>1){
    const active=arr(room);
    if(active.length>2){
      let worst=active[0];active.forEach(p=>{if(p.score<worst.score)worst=p});
      worst.eliminated=true;
      io.to(room.code).emit('player-eliminated',{id:worst.id,name:worst.name,avatar:worst.avatar});
    }
  }
  room.votes.clear();room.guesses.clear();
  room.currentContent=pick(room);
  // Bomb mode: random bomb player
  room.bombId=null;
  if(room.config.mode==='bomb'){const a=arr(room);room.bombId=a[~~(Math.random()*a.length)].id}
  const activePlayers=arr(room);
  io.to(room.code).emit('round-start',{round:room.round,totalRounds:room.config.rounds,content:room.currentContent,mode:room.config.mode,activePlayers:activePlayers.map(p=>({id:p.id,name:p.name,avatar:p.avatar}))});
  let vt=room.config.voteTimer;room.phase='voting';
  clearInterval(room.timer);
  room.timer=setInterval(()=>{vt--;io.to(room.code).emit('timer',{phase:'vote',seconds:vt,max:room.config.voteTimer});if(vt<=0){clearInterval(room.timer);guessPhase(room)}},1000);
}

function checkVotes(room){if(room.votes.size>=arr(room).length){clearInterval(room.timer);setTimeout(()=>guessPhase(room),300)}}

function guessPhase(room){
  room.phase='guessing';
  const players=arr(room).map(p=>({id:p.id,name:p.name,avatar:p.avatar}));
  io.to(room.code).emit('guess-phase',{content:room.currentContent,players});
  let gt=room.config.guessTimer;
  clearInterval(room.timer);
  room.timer=setInterval(()=>{gt--;io.to(room.code).emit('timer',{phase:'guess',seconds:gt,max:room.config.guessTimer});if(gt<=0){clearInterval(room.timer);endRound(room)}},1000);
}

function checkGuesses(room){if(room.guesses.size>=arr(room).length){clearInterval(room.timer);setTimeout(()=>endRound(room),300)}}

function endRound(room){
  room.phase='roulette';clearInterval(room.timer);
  const likers=[];room.votes.forEach((v,pid)=>{if(v)likers.push(pid)});
  const likerSet=new Set(likers);
  const roundScores={};
  arr(room).forEach(player=>{
    const g=room.guesses.get(player.id)||[];const gs=new Set(g);let pts=0;
    arr(room).forEach(o=>{if(o.id===player.id)return;const guessed=gs.has(o.id),actual=likerSet.has(o.id);if(guessed&&actual)pts+=15;else if(!guessed&&!actual)pts+=5});
    // Bomb bonus
    if(room.config.mode==='bomb'&&room.bombId){
      if(player.id===room.bombId&&!likerSet.has(room.bombId)){/* bomb didn't like, no bonus */}
      else if(player.id!==room.bombId&&room.bombId&&gs.has(room.bombId)===likerSet.has(room.bombId))pts+=10;
    }
    roundScores[player.id]=pts;player.score+=pts;
  });
  const results={
    content:room.currentContent,
    likers:likers.map(id=>{const p=room.players.get(id);return p?{id:p.id,name:p.name,avatar:p.avatar}:null}).filter(Boolean),
    roundScores,totalScores:{},round:room.round,totalRounds:room.config.rounds,
    allPlayers:arr(room).map(p=>({id:p.id,name:p.name,avatar:p.avatar})),
    bombId:room.bombId,mode:room.config.mode,
  };
  arr(room).forEach(p=>{results.totalScores[p.id]=p.score});
  io.to(room.code).emit('roulette-start',results);
  setTimeout(()=>{io.to(room.code).emit('round-results',results)},6000);
  setTimeout(()=>{if(room.state==='playing')nextRound(room)},12000);
}

function endGame(room){
  room.state='finished';clearInterval(room.timer);
  const rankings=allPlayers(room).map(p=>({id:p.id,name:p.name,avatar:p.avatar,score:p.score,eliminated:p.eliminated})).sort((a,b)=>b.score-a.score);
  // Update global leaderboard
  rankings.forEach((p,i)=>{
    const existing=globalLeaderboard.find(l=>l.name===p.name&&l.avatar===p.avatar);
    if(existing){existing.totalScore+=p.score;existing.gamesPlayed++;if(i===0)existing.wins++;existing.lastPlayed=new Date().toISOString()}
    else{globalLeaderboard.push({name:p.name,avatar:p.avatar,totalScore:p.score,wins:i===0?1:0,gamesPlayed:1,lastPlayed:new Date().toISOString()})}
  });
  globalLeaderboard.sort((a,b)=>b.totalScore-a.totalScore);
  io.to(room.code).emit('game-over',{rankings,leaderboard:globalLeaderboard.slice(0,10)});
}

io.on('connection',socket=>{
  // TRACK ONLINE + BAN CHECK
  const ua=socket.handshake.headers['user-agent']||'';
  const ip=(socket.handshake.headers['x-forwarded-for']||socket.handshake.address||'?').split(',')[0].trim();
  const fp=socket.handshake.auth?.fp||'';
  const dev=getDevice(ua);

  // CHECK BAN BY IP OR FINGERPRINT
  if(bannedIPs.has(ip)||bannedFPs.has(fp)){
    socket.emit('banned');
    socket.disconnect(true);
    return;
  }

  onlineUsers.set(socket.id,{id:socket.id,ip,fp,device:dev,connectedAt:new Date().toISOString()});

  socket.on('create-room',({playerName,avatar,isPublic})=>{
    const code=genCode(),room={code,hostId:socket.id,players:new Map(),state:'lobby',round:0,used:new Set(),currentContent:null,votes:new Map(),guesses:new Map(),timer:null,phase:'lobby',bombId:null,isPublic:!!isPublic,config:{rounds:10,voteTimer:12,guessTimer:15,categories:Object.keys(CATS),mode:'classic'}};
    const player={id:socket.id,name:playerName,avatar,score:0,isHost:true,eliminated:false};
    room.players.set(socket.id,player);rooms.set(code,room);playerRooms.set(socket.id,code);socket.join(code);
    socket.emit('room-created',{code,player,players:[player],categories:CATS,modes:MODES});
  });
  socket.on('join-room',({code,playerName,avatar})=>{
    const room=rooms.get(code);
    if(!room)return socket.emit('error-msg',{message:"Room introuvable 😕"});
    if(room.state!=='lobby')return socket.emit('error-msg',{message:"Partie déjà commencée !"});
    if(room.players.size>=10)return socket.emit('error-msg',{message:"Room pleine !"});
    let nm=playerName;const names=new Set();room.players.forEach(p=>names.add(p.name.toLowerCase()));
    if(names.has(nm.toLowerCase()))nm+=~~(Math.random()*99);
    const player={id:socket.id,name:nm,avatar,score:0,isHost:false,eliminated:false};
    room.players.set(socket.id,player);playerRooms.set(socket.id,code);socket.join(code);
    socket.emit('room-joined',{code,player,players:allPlayers(room),hostId:room.hostId,config:room.config,categories:CATS,modes:MODES});
    socket.to(code).emit('player-joined',{player,players:allPlayers(room)});
  });
  socket.on('update-config',cfg=>{
    const code=playerRooms.get(socket.id),room=rooms.get(code);
    if(!room||room.hostId!==socket.id)return;
    if(cfg.rounds)room.config.rounds=Math.min(30,Math.max(3,cfg.rounds));
    if(cfg.voteTimer)room.config.voteTimer=Math.min(30,Math.max(5,cfg.voteTimer));
    if(cfg.guessTimer)room.config.guessTimer=Math.min(30,Math.max(5,cfg.guessTimer));
    if(cfg.categories?.length)room.config.categories=cfg.categories;
    if(cfg.mode&&MODES[cfg.mode])room.config.mode=cfg.mode;
    io.to(code).emit('config-updated',room.config);
  });
  socket.on('start-game',()=>{
    const code=playerRooms.get(socket.id),room=rooms.get(code);
    if(!room||room.hostId!==socket.id)return;
    if(room.players.size<2)return socket.emit('error-msg',{message:"Min 2 joueurs !"});
    startGame(room);
  });
  socket.on('submit-vote',({liked})=>{const code=playerRooms.get(socket.id),room=rooms.get(code);if(!room||room.phase!=='voting')return;room.votes.set(socket.id,liked);io.to(code).emit('player-voted',{votedCount:room.votes.size,total:arr(room).length});checkVotes(room)});
  socket.on('submit-guess',({guessedIds})=>{const code=playerRooms.get(socket.id),room=rooms.get(code);if(!room||room.phase!=='guessing')return;room.guesses.set(socket.id,guessedIds||[]);io.to(code).emit('player-guessed',{guessedCount:room.guesses.size,total:arr(room).length});checkGuesses(room)});
  socket.on('send-reaction',({emoji})=>{const code=playerRooms.get(socket.id);if(code)socket.to(code).emit('reaction',{emoji})});
  // CHAT
  socket.on('chat-msg',({text})=>{
    const code=playerRooms.get(socket.id),room=rooms.get(code);if(!room||!text)return;
    const p=room.players.get(socket.id);if(!p)return;
    const msg=text.trim().slice(0,100);if(!msg)return;
    io.to(code).emit('chat-msg',{name:p.name,avatar:p.avatar,text:msg,id:socket.id});
  });
  socket.on('play-again',()=>{const code=playerRooms.get(socket.id),room=rooms.get(code);if(!room||room.hostId!==socket.id)return;room.state='lobby';room.round=0;room.used.clear();room.votes.clear();room.guesses.clear();allPlayers(room).forEach(p=>{p.score=0;p.eliminated=false});io.to(code).emit('back-to-lobby',{players:allPlayers(room),config:room.config})});
  socket.on('disconnect',()=>{
    onlineUsers.delete(socket.id);
    const code=playerRooms.get(socket.id);if(!code)return;const room=rooms.get(code);if(!room)return;const p=room.players.get(socket.id);room.players.delete(socket.id);playerRooms.delete(socket.id);if(!room.players.size){clearInterval(room.timer);rooms.delete(code);return}if(room.hostId===socket.id){const nh=room.players.values().next().value;room.hostId=nh.id;nh.isHost=true;io.to(code).emit('new-host',{hostId:nh.id})}io.to(code).emit('player-left',{playerName:p?.name||'?',players:allPlayers(room)});
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`\n🎮 WhoLiked → http://localhost:${PORT}\n`));
