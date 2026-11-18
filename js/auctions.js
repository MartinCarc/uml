/* Subastas públicas: reloj del servidor, reservas y cierre automático en Supabase. */
(() => {
  const {$,S,esc,fmt,rating,positionBadge,pageHead,isAdmin,rpc,toast,err,modal,closeModal}=U;
  let view=null,poll=null,tick=null,busy=false,picker=null;
  const TZ='America/Argentina/Buenos_Aires';
  const date=value=>value?new Intl.DateTimeFormat('es-AR',{timeZone:TZ,dateStyle:'short',timeStyle:'medium'}).format(new Date(value)):'—';
  const localInput=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T');
  const iso=value=>new Date(value+'-03:00').toISOString();
  const route=id=>`#/s/${S.sid}/subastas${id?'/'+id:''}`;
  const alive=v=>view===v && location.hash===v.hash && S.sid===v.sid;
  const now=()=>Date.now()+(view?.offset||0);
  const get=id=>view?.feed.auctions.find(a=>a.id===id);
  const phase=a=>a.status!=='open'?a.status:now()<new Date(a.starts_at)?'scheduled':now()>=new Date(a.ends_at)?'closing':'live';
  const labels={scheduled:'Programada',live:'En curso',closing:'Plazo terminado · adjudicando',awarded:'Adjudicada',no_bids:'Sin ofertas',cancelled:'Cancelada'};
  const q=async query=>{const r=await query;if(r.error)throw r.error;return r.data;};
  U.register('subastas',async id=>{
    S.auctionsTouched=true;
    if(poll)clearInterval(poll);if(tick)clearInterval(tick);
    const v=view={sid:S.sid,hash:location.hash,id:id||null,filter:'open',feed:{auctions:[],teams:[]},offset:0,loading:false};
    $('#app').innerHTML=pageHead('Subastas',esc(S.season.name),`${isAdmin()&&S.season.status==='active'?'<button id="auction-create">Nueva subasta</button>':''}`)+
      '<div id="auction-service"></div><p class="small muted">Pujas públicas · horarios de Argentina (UTC−3) · prórroga de 5 minutos. El ganador paga al UML Bank al adjudicar, incluso con el mercado cerrado.</p>'+
      (id?'<div id="auction-detail"></div>':'<div class="tabs" id="auction-tabs"><button data-au-filter="open" class="active">Abiertas y programadas</button><button data-au-filter="finished">Finalizadas</button><button data-au-filter="all">Todas</button></div><div id="auction-list"></div>');
    if($('#auction-create'))$('#auction-create').onclick=()=>openPicker();
    document.querySelectorAll('[data-au-filter]').forEach(b=>b.onclick=()=>{v.filter=b.dataset.auFilter;document.querySelectorAll('[data-au-filter]').forEach(x=>x.classList.toggle('active',x===b));renderList(v);});
    await refresh(v,true);
    if(!alive(v))return;
    poll=setInterval(()=>{if(!alive(v)){clearInterval(poll);clearInterval(tick);return;}if(!document.hidden)refresh(v);},4000);
    tick=setInterval(()=>{if(!alive(v))return;countdowns(v);updateBid(v);},1000);
  });
  async function refresh(v,initial=false){
    if(!alive(v)||v.loading)return;v.loading=true;
    try{
      const feed=await rpc('auction_feed',{p_season:v.sid,p_auction:v.id});
      if(!alive(v))return;
      v.feed=feed;v.offset=new Date(feed.server_now)-Date.now();
      for(const row of feed.teams){const t=S.seasonTeams.find(t=>t.club_id===row.club_id);if(t){t.budget=row.budget;t.reserved=row.reserved;}}
      $('#auction-service').innerHTML=!feed.automatic_close_ready?'<div class="alert warn">El cierre automático necesita configuración. '+(isAdmin()?'Aplicá la segunda consulta SQL de subastas para activar Supabase Cron.':'Las nuevas pujas están pausadas hasta que el administrador lo habilite.')+'</div>':'';
      if($('#auction-create'))$('#auction-create').disabled=!feed.automatic_close_ready;
      if(v.id)renderDetail(v);else renderList(v);
      countdowns(v);updateBid(v);
    }catch(e){if(alive(v)){const message=esc(e.message||'No se pudo actualizar.');if(initial)$(v.id?'#auction-detail':'#auction-list').innerHTML=`<div class="card"><p>${message}</p><p class="small muted">El administrador debe aplicar las consultas nuevas de subastas antes de usar esta sección.</p></div>`;else $('#auction-service').innerHTML=`<div class="alert warn">No se pudo actualizar. Reintentando… ${message}</div>`;}}
    finally{v.loading=false;}
  }
  function status(a){const p=phase(a);return `<span class="badge ${p==='live'?'green':p==='awarded'?'blue':p==='cancelled'?'red':''}">${labels[p]}</span>`;}
  function clock(a){return `<span class="auction-countdown" data-au-clock="${a.id}"></span>`;}
  const player=a=>a.player||a.player_snapshot;
  function staff(a){return isAdmin()&&a.status==='open'?`<div class="row mt">${!a.bid_count&&phase(a)!=='closing'?`<button class="xs secondary" data-au-edit="${a.id}">Editar condiciones</button>`:''}<button class="xs danger" data-au-cancel="${a.id}">Cancelar con motivo</button></div>`:'';}
  function bindStaff(){
    document.querySelectorAll('[data-au-edit]').forEach(b=>b.onclick=()=>conditions(player(get(b.dataset.auEdit)),get(b.dataset.auEdit)));
    document.querySelectorAll('[data-au-cancel]').forEach(b=>b.onclick=()=>cancelModal(get(b.dataset.auCancel)));
  }
  function renderList(v){
    const rows=v.feed.auctions.filter(a=>v.filter==='all'||(v.filter==='open'?a.status==='open':a.status!=='open'));
    $('#auction-list').innerHTML=rows.length?`<div class="auction-grid">${rows.map(a=>{const p=player(a);return `<div class="card"><div class="row between"><h3 style="margin:0"><a href="${route(a.id)}" style="color:inherit">${esc(p.name)}</a></h3>${status(a)}</div><div class="mt">${positionBadge(p.position)} ${rating(p.overall,true)} <span class="small muted">ID: ${a.pes_id}</span></div><p class="mt">${a.top_club_id?`Mayor oferta: <b>${fmt(a.top_amount)}</b><br><span class="small">${esc(a.top_club)}</span>`:`Precio inicial: <b>${fmt(a.initial_amount)}</b>`}</p><p class="small muted">Inicio: ${date(a.starts_at)}<br>Cierre: ${date(a.ends_at)}<br>${clock(a)}</p>${a.closing_error?'<p class="alert warn">El cierre necesita revisión administrativa.</p>':''}<a class="btn secondary sm" href="${route(a.id)}">Ver subasta y pujas</a>${staff(a)}</div>`;}).join('')}</div>`:'<div class="card empty">No hay subastas en esta lista.</div>';
    bindStaff();
  }
  function renderDetail(v){
    const a=v.feed.auctions[0];if(!a){$('#auction-detail').innerHTML='<div class="card empty">Subasta inexistente en esta temporada.</div>';return;}
    const p=player(a);
    if(!$('#auction-summary')){
      $('#auction-detail').innerHTML='<a class="btn secondary sm mb" href="'+route()+'">Volver a las subastas</a><div id="auction-summary"></div><div class="grid c2 of-layout"><div><div class="card" id="auction-bidding"></div><div class="card"><h3>Pujas públicas</h3><div id="auction-public-bids"></div></div><div class="card"><h3>Historial</h3><div id="auction-events"></div></div></div><div><div id="auction-personal"></div><div class="card"><h3>Habilidades</h3><div id="auction-abilities"></div><div class="pes-player-cards"><h3>Tarjetas especiales</h3><div id="auction-cards"></div></div></div></div></div>';
      const managed=v.feed.teams.filter(t=>S.user&&t.manager_id===S.user.id);
      $('#auction-bidding').innerHTML=managed.length?`<h3>Presentar una puja</h3><form id="auction-bid-form"><div class="field"><label for="auction-bid-club">Tu equipo</label><select id="auction-bid-club">${managed.map(t=>U.opt(t.club_id,U.club(t.club_id)?.name||t.name||'Equipo',S.myClub)).join('')}</select></div><p id="auction-available" class="small muted"></p><div class="field"><label for="auction-bid-amount">Importe de la oferta</label><input id="auction-bid-amount" type="number" step="1" max="1000000000000" required></div><p id="auction-minimum" class="small"></p><p class="small muted">La puja es vinculante. Si vas ganando, se reserva el dinero y un cupo. Al adjudicar se cobra de inmediato.</p><button id="auction-bid-submit">Confirmar puja</button><p id="auction-bid-state" class="small muted mt" role="status"></p></form>`:'<h3>Participar</h3><p class="muted">'+(!S.user?'<a href="#/login">Ingresá</a> con la cuenta del DT para pujar.':'Solo el DT asignado a un equipo en esta temporada puede pujar.')+'</p>';
      if($('#auction-bid-form')){
        $('#auction-bid-club').onchange=()=>updateBid(v);
        $('#auction-bid-form').onsubmit=e=>submitBid(e,v);
      }
    }
    $('#auction-summary').innerHTML=`<div class="card navy"><div class="row between"><div><h1 style="margin:0">${esc(p.name)}</h1><p class="mt">${positionBadge(p.position)} ${rating(p.overall,true)} · ${p.age} años · ID: ${a.pes_id}</p>${status(a)}</div><div class="stat"><div class="v">${a.top_club_id?fmt(a.top_amount):fmt(a.initial_amount)}</div><div class="l">${a.top_club_id?'Mayor oferta · '+esc(a.top_club):'Precio inicial'}</div></div></div><div class="mt">${clock(a)}</div></div><div class="card"><div class="grid c3"><div><b>Inicio</b><p class="small">${date(a.starts_at)}</p></div><div><b>Cierre actual</b><p class="small">${date(a.ends_at)}</p></div><div><b>Incremento mínimo</b><p>${fmt(a.min_increment)}</p></div></div><p class="small muted">Cada oferta válida en los últimos 5 minutos deja nuevamente 5 minutos para responder. Horarios de Argentina.</p>${a.status==='awarded'?`<div class="alert ok">Adjudicada a <b>${esc(a.top_club)}</b> por ${fmt(a.top_amount)}. El pago al UML Bank ya fue registrado. ${a.queue_pending?'La incorporación espera la apertura del mercado; no se volverá a cobrar.':a.delivered?'El jugador ya se incorporó al equipo.':'La incorporación ya fue procesada.'}</div>`:''}${a.status==='no_bids'?'<p>Finalizó sin ofertas. No hubo cobros ni incorporación.</p>':''}${a.status==='cancelled'?`<p>Motivo de cancelación: ${esc(a.cancel_reason)}</p>`:''}${a.closing_error?`<div class="alert warn">El cierre requiere revisión administrativa.${isAdmin()?'<br>'+esc(a.closing_error):''}</div>`:''}${staff(a)}</div>`;
    $('#auction-personal').innerHTML=U.optionFileDetails?U.optionFileDetails(p):'';
    $('#auction-abilities').innerHTML=U.playerAbilities(PES13.stats(p.abilities));$('#auction-cards').innerHTML=U.playerCards(p.cards);
    $('#auction-public-bids').innerHTML=v.feed.bids.length?`<div class="table-wrap"><table><thead><tr><th>Equipo / DT</th><th>Oferta</th><th>Fecha y hora</th></tr></thead><tbody>${v.feed.bids.map(b=>`<tr><td><b>${esc(b.club_name)}</b><div class="small muted">${esc(b.manager_name)}</div></td><td class="money">${fmt(b.amount)}</td><td class="small">${date(b.placed_at)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Todavía no hay ofertas.</p>';
    const events={created:'Publicación',edited:'Condiciones editadas',extended:'Prórroga de 5 minutos',cancelled:'Cancelación',awarded:'Adjudicación y pago al UML Bank',no_bids:'Cierre sin ofertas',close_error:'Cierre en revisión'};
    $('#auction-events').innerHTML=v.feed.events.map(e=>`<div class="list-item"><div><b>${events[e.kind]||esc(e.kind)}</b>${e.kind==='extended'?'<div class="small">Nuevo cierre: '+date(e.details.ends_at)+'</div>':''}${e.kind==='cancelled'?'<div class="small">'+esc(e.details.reason)+'</div>':''}</div><span class="tiny muted">${date(e.created_at)}</span></div>`).join('');
    bindStaff();
  }
  function countdowns(v){
    document.querySelectorAll('[data-au-clock]').forEach(el=>{
      const a=v.feed.auctions.find(a=>a.id===el.dataset.auClock);if(!a)return;
      const p=phase(a);if(!['scheduled','live'].includes(p)){el.textContent=labels[p];return;}
      let seconds=Math.max(0,Math.ceil((new Date(p==='scheduled'?a.starts_at:a.ends_at)-now())/1000));
      const days=Math.floor(seconds/86400);seconds%=86400;const hours=Math.floor(seconds/3600);seconds%=3600;const minutes=Math.floor(seconds/60);seconds%=60;
      el.textContent=(p==='scheduled'?'Comienza en ':'Cierra en ')+(days?days+' d ':'')+[hours,minutes,seconds].map(n=>String(n).padStart(2,'0')).join(':');
    });
  }
  function updateBid(v){
    const button=$('#auction-bid-submit');if(!button||!alive(v))return;
    const a=v.feed.auctions[0],team=v.feed.teams.find(t=>t.club_id===$('#auction-bid-club').value);if(!a||!team)return;
    const minimum=a.top_club_id?Number(a.top_amount)+Number(a.min_increment):Number(a.initial_amount);
    $('#auction-bid-amount').min=String(minimum);$('#auction-bid-amount').placeholder=String(minimum);
    $('#auction-minimum').textContent='Oferta mínima actual: '+fmt(minimum);
    $('#auction-available').textContent='Saldo libre: '+fmt(Number(team.budget)-Number(team.reserved))+(a.top_club_id===team.club_id?' · Tu reserva en esta subasta: '+fmt(a.top_amount):'')+' · Cupos comprometidos: '+team.count+'/'+team.limit;
    button.disabled=busy||phase(a)!=='live'||!v.feed.automatic_close_ready;
    $('#auction-bid-state').textContent=phase(a)==='live'?'':labels[phase(a)];
  }
  async function submitBid(event,v){
    event.preventDefault();if(busy||!alive(v))return;busy=true;updateBid(v);
    try{
      const result=await rpc('auction_bid',{p_auction:v.id,p_club:$('#auction-bid-club').value,p_amount:Number($('#auction-bid-amount').value)});
      if(!alive(v))return;
      $('#auction-bid-amount').value='';toast(result.extended?'Puja registrada · prórroga de 5 minutos':'Puja registrada','ok');await refresh(v);
    }catch(e){err(e);if(alive(v))await refresh(v);}finally{busy=false;if(alive(v))updateBid(v);}
  }
  async function openPicker(){
    try{
      if(!isAdmin())throw new Error('Solo administradores.');
      picker={page:0,request:0,rows:[]};
      const facets=await rpc('of_facets',{});
      modal(`<h2>Seleccionar jugador del Option File</h2><form id="auction-search" class="of-filters mb"><div class="field"><label for="auction-search-name">Nombre o ID</label><input id="auction-search-name"></div><div class="field"><label for="auction-search-team">Equipo del EDIT</label><select id="auction-search-team"><option value="">Todos</option>${(facets.teams||[]).filter(Boolean).map(t=>U.opt(t,t,'')).join('')}</select></div><button class="secondary">Buscar</button></form><div id="auction-candidates"></div>`,true);
      $('#auction-search').onsubmit=e=>{e.preventDefault();picker.page=0;searchCandidates();};await searchCandidates();
    }catch(e){err(e);}
  }
  async function searchCandidates(){
    const state=picker,host=$('#auction-candidates');if(!state||!host)return;
    const id=++state.request;host.innerHTML='<div class="loading">Buscando jugadores…</div>';
    try{
      const data=await rpc('auction_candidates',{p_search:$('#auction-search-name').value.trim(),p_team:$('#auction-search-team').value,p_page:state.page});
      if(picker!==state||id!==state.request||!document.contains(host))return;
      state.rows=data.players;
      host.innerHTML=data.version_id?`<div class="table-wrap"><table><thead><tr><th>Jugador / ID</th><th>Pos</th><th>Media</th><th></th></tr></thead><tbody>${data.players.map(p=>`<tr><td><b>${esc(p.name)}</b><div class="tiny muted">ID: ${p.pes_id} · ${esc(p.edit_team)||'Sin equipo en EDIT'}</div>${p.unavailable?'<div class="small muted">'+esc(p.unavailable)+'</div>':''}</td><td>${positionBadge(p.position)}</td><td>${rating(p.overall,true)}</td><td><button class="sm" data-au-pick="${p.pes_id}" ${p.unavailable?'disabled':''}>Elegir</button></td></tr>`).join('')}</tbody></table></div><div class="of-pagination"><button id="auction-pick-prev" class="secondary sm" ${state.page?'':'disabled'}>Anterior</button><span class="small">Página ${state.page+1}</span><button id="auction-pick-next" class="secondary sm" ${data.players.length===20?'':'disabled'}>Siguiente</button></div>`:'<p class="empty">Primero cargá una versión del Option File.</p>';
      if($('#auction-pick-prev')){$('#auction-pick-prev').onclick=()=>{state.page--;searchCandidates();};$('#auction-pick-next').onclick=()=>{state.page++;searchCandidates();};}
      host.querySelectorAll('[data-au-pick]').forEach(b=>b.onclick=()=>conditions(state.rows.find(p=>p.pes_id===Number(b.dataset.auPick))));
    }catch(e){if(document.contains(host))host.innerHTML='<p class="alert warn">'+esc(e.message)+'</p>';}
  }
  function conditions(p,a=null){
    if(!isAdmin())return;
    const serverNow=now();
    modal(`<h2>${a?'Editar condiciones':'Nueva subasta'}</h2><p><b>${esc(p.name)}</b> · ID: ${p.pes_id||a?.pes_id}</p><form id="auction-save-form"><div class="fields"><div><label>Precio inicial</label><input name="initial" type="number" min="1" max="1000000000000" step="1" required value="${a?a.initial_amount:''}"></div><div><label>Incremento mínimo</label><input name="increment" type="number" min="1" max="1000000000000" step="1" required value="${a?a.min_increment:''}"></div></div><div class="fields"><div><label>Inicio · hora de Argentina</label><input name="starts" type="datetime-local" required value="${localInput(a?a.starts_at:serverNow+60000)}"></div><div><label>Cierre · hora de Argentina</label><input name="ends" type="datetime-local" required value="${localInput(a?a.ends_at:serverNow+3600000)}"></div></div><p class="small muted">El cierre se prorroga hasta 5 minutos después de cada puja válida en los últimos 5 minutos. Las condiciones no se pueden editar después de la primera oferta.</p><div class="row"><button>${a?'Guardar condiciones':'Publicar subasta'}</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`);
    $('#auction-save-form').onsubmit=async e=>{
      e.preventDefault();const button=e.submitter;button.disabled=true;
      try{
        const data=new FormData(e.target),id=await rpc('auction_save',{p_season:S.sid,p_pes_id:p.pes_id||a.pes_id,p_initial:Number(data.get('initial')),p_increment:Number(data.get('increment')),p_starts:iso(data.get('starts')),p_ends:iso(data.get('ends')),p_id:a?.id||null});
        closeModal();toast(a?'Condiciones guardadas':'Subasta publicada','ok');if(location.hash===route(id))await refresh(view);else location.hash=route(id);
      }catch(x){err(x);if(document.contains(button))button.disabled=false;}
    };
  }
  function cancelModal(a){
    if(!isAdmin()||!a)return;
    modal(`<h2>Cancelar subasta</h2><p>${esc(player(a).name)}. Se liberará la reserva del líder y el historial se conservará.</p><form id="auction-cancel-form"><div class="field"><label>Motivo de la cancelación</label><textarea name="reason" required minlength="3" maxlength="500"></textarea></div><div class="row"><button class="danger">Confirmar cancelación</button><button type="button" class="secondary" onclick="U.closeModal()">Volver</button></div></form>`);
    $('#auction-cancel-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await rpc('auction_cancel',{p_auction:a.id,p_reason:new FormData(e.target).get('reason')});closeModal();toast('Subasta cancelada y reserva liberada','ok');if(view&&alive(view))await refresh(view);}catch(x){err(x);if(document.contains(b))b.disabled=false;}};
  }
})();
