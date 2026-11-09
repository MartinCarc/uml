/* Option File: public consultation, administrator CSV staging, and initial UML squads. */
(() => {
  const { $, S, esc, positionBadge, rating, pageHead, isAdmin, toast, err, modal, closeModal, rpc } = U;
  const db = () => U.client();
  const q = async request => { const r=await request; if(r.error)throw r.error; return r.data; };
  let version=null, teams=[], preview=null, uploading=false, sequence=0, picker=null;
  const filters={search:'',team:'',position:'',age:'',overall:'',sort:'name',page:0};
  const PAGE=30, EMPTY_TEAM='__no_team__';
  const opt=(v,t,selected)=>U.opt(v,t,selected);
  const errorText=e=>e.message || 'No se pudo completar la operación.';
  const adminGuard=()=>{if(!isAdmin())throw new Error('Solo administradores.');};
  async function currentVersion() {
    version=await q(db().from('option_file_versions').select('*').eq('status','active').maybeSingle());
    return version;
  }
  U.optionFileDetails = data => {
    if(!data)return '';
    const items=[['ID:',esc(data.pes_id)],['Nacionalidad',esc(data.nationality)],['Edad',`${esc(data.age)} años`],['Altura',`${esc(data.height)} cm`],['Peso',`${esc(data.weight)} kg`],['Pie dominante',data.foot==='L'?'Izquierdo':'Derecho'],['Posición natural',positionBadge(data.position)],['Posiciones alternativas',(data.positions||[]).filter(p=>p!==data.position).map(positionBadge).join(' ')||'—'],['Forma física',`${esc(data.form)}/8`],['Precisión de pierna menos hábil',`${esc(data.weak_accuracy)}/8`],['Frecuencia de pierna menos hábil',`${esc(data.weak_frequency)}/8`],['Tolerancia a lesiones',esc(data.injury)],['Actitud ofensiva',`${esc(data.attack_awareness)}/3`],['Actitud defensiva',`${esc(data.defence_awareness)}/3`]];
    return `<div class="card"><h3>Datos del jugador</h3><dl class="of-details">${items.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></div>`;
  };
  const administratorButton=()=>isAdmin()?'<a class="btn" href="#/option-file/admin">Actualizar Option File</a>':'';
  U.register('option-file',async id=>{
    const token=++sequence;
    try {
      if(id==='admin'){adminGuard();return await adminPage(token);}
      if(id && !/^\d+$/.test(id))throw new Error('Jugador inexistente.');
      $('#app').innerHTML='<div class="loading">Cargando Option File…</div>';
      await currentVersion(); if(token!==sequence)return;
      if(id)return await detail(+id,token);
      const facets=version?await rpc('of_facets',{}):{teams:[]}; if(token!==sequence)return;
      teams=facets.teams||[];
      $('#app').innerHTML=pageHead('Option File',version?`${esc(version.name)} · Actualizado ${U.datetime(version.activated_at)} · ${version.expected_count.toLocaleString('es-AR')} jugadores`:'Base de jugadores de PES 2013',administratorButton())+
        (!version?'<div class="card empty">Todavía no hay un Option File cargado. El administrador puede subir el CSV desde esta sección.</div>':`<div class="card"><form class="of-filters" id="of-search-form"><div class="field of-search"><label for="of-search">Buscar jugador o ID</label><input id="of-search" value="${esc(filters.search)}" placeholder="Nombre, apellido o ID"></div><div class="field"><label for="of-team">Equipo del EDIT</label><select id="of-team"><option value="">Todos</option>${teams.map(t=>opt(t||EMPTY_TEAM,t||'Sin equipo en EDIT',filters.team)).join('')}</select></div><div class="field"><label for="of-position">Posición natural o alternativa</label><select id="of-position"><option value="">Todas</option>${Object.keys(U.POS).map(p=>opt(p,p,filters.position)).join('')}</select></div><div class="field"><label for="of-age">Edad máxima</label><input id="of-age" type="number" min="15" max="65" value="${esc(filters.age)}"></div><div class="field"><label for="of-overall">Media mínima</label><input id="of-overall" type="number" min="0" max="199" value="${esc(filters.overall)}"></div><div class="field"><label for="of-sort">Ordenar</label><select id="of-sort">${[['name','Nombre'],['overall','Media'],['age','Edad']].map(([v,t])=>opt(v,t,filters.sort)).join('')}</select></div><button>Buscar</button></form></div><div class="card" id="of-results"></div>`);
      if(version){$('#of-search-form').onsubmit=e=>{e.preventDefault();readFilters();results();}; await results();}
    } catch(e) {
      if(token!==sequence)return;
      $('#app').innerHTML=pageHead('Option File')+`<div class="card"><p>${esc(errorText(e))}</p><p class="small muted">Si es la primera instalación, aplicá la migración de Option File en Supabase.</p></div>`;
    }
  });
  function readFilters(){for(const key of ['search','team','position','age','overall','sort'])filters[key]=$('#of-'+key).value;filters.page=0;}
  async function results(){
    const token=++sequence,host=$('#of-results'); if(!host)return;
    host.innerHTML='<div class="loading">Buscando jugadores…</div>';
    try {
      const newest=await q(db().from('option_file_versions').select('id').eq('status','active').maybeSingle());
      if(token!==sequence||!document.contains(host))return;
      if(newest?.id!==version?.id){filters.page=0;return await U.route();}
      let request=db().from('option_file_entries').select('*',{count:'exact'}).eq('version_id',version.id);
      if(filters.search.trim()) {
        const search=filters.search.trim();
        if(/^\d+$/.test(search))request=request.eq('pes_id',+search);
        else request=request.ilike('search_name','%'+PES13.normalize(search).replace(/[\\%_]/g,'\\$&')+'%');
      }
      if(filters.team)request=request.eq('edit_team',filters.team===EMPTY_TEAM?'':filters.team);
      if(filters.position)request=request.contains('data',{positions:[filters.position]});
      if(filters.age)request=request.lte('age',+filters.age);
      if(filters.overall)request=request.gte('overall',+filters.overall);
      const response=await request.order(filters.sort,{ascending:filters.sort!=='overall'}).order('pes_id').range(filters.page*PAGE,filters.page*PAGE+PAGE-1);
      if(response.error)throw response.error;
      if(token!==sequence||!document.contains(host))return;
      const players=response.data||[],count=response.count||0;
      const links=players.length?await rpc('of_uml_links',{p_ids:players.map(p=>p.pes_id)}):[];
      if(token!==sequence||!document.contains(host))return;
      host.innerHTML=`<div class="small muted mb">${count.toLocaleString('es-AR')} jugadores encontrados</div>`+(players.length?`<div class="table-wrap"><table><thead><tr><th>ID</th><th>Jugador</th><th>Pos</th><th>Equipo EDIT</th><th>Edad</th><th>Media</th><th>UML</th></tr></thead><tbody>${players.map(p=>{const link=links.find(l=>l.pes_id==p.pes_id);return `<tr><td class="muted">${p.pes_id}</td><td><a href="#/option-file/${p.pes_id}" style="color:inherit"><b>${esc(p.name)}</b></a></td><td>${positionBadge(p.position)}</td><td>${esc(p.edit_team)||'—'}</td><td>${p.age}</td><td>${rating(p.overall,true)}</td><td>${link?esc(link.club||'Agente libre'):'—'}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty">No hay jugadores que coincidan con la búsqueda.</div>')+
        `<div class="of-pagination"><button class="secondary sm" id="of-prev" ${filters.page?'':'disabled'}>Anterior</button><span class="small">Página ${filters.page+1} de ${Math.max(1,Math.ceil(count/PAGE))}</span><button class="secondary sm" id="of-next" ${(filters.page+1)*PAGE<count?'':'disabled'}>Siguiente</button></div>`;
      $('#of-prev').onclick=()=>{filters.page--;results();};$('#of-next').onclick=()=>{filters.page++;results();};
    }catch(e){if(token===sequence&&document.contains(host))host.innerHTML=`<p class="alert warn">${esc(errorText(e))}</p>`;}
  }
  async function detail(id,token){
    if(!version)throw new Error('Todavía no hay un Option File cargado.');
    const entry=await q(db().from('option_file_entries').select('*').eq('version_id',version.id).eq('pes_id',id).single());
    const links=await rpc('of_uml_links',{p_ids:[id]}); if(token!==sequence)return;
    const d=entry.data;
    $('#app').innerHTML=pageHead('Option File',`${esc(version.name)} · ${U.datetime(version.activated_at)}`,'<a class="btn secondary" href="#/option-file">Volver al buscador</a>')+
      `<div class="card navy"><div class="row between"><div><h1 style="margin:0">${esc(d.name)}</h1><div class="muted">${positionBadge(d.position)} · ${d.age} años · ${esc(d.edit_team)||'Sin equipo en EDIT'}</div><div class="mt">ID: ${d.pes_id}</div></div><div class="stat"><div class="v">${rating(d.overall,true)}</div><div class="l">Media</div></div></div></div><div class="grid c2 of-layout"><div>${U.optionFileDetails(d)}<div class="card"><h3>Plantel UML</h3>${links.length?links.map(l=>`<p>${esc(l.club||'Agente libre')}${l.retired?' · Retirado':''}${l.season_id?` · <a href="#/s/${l.season_id}/jugador/${l.player_id}">Ver ficha UML</a>`:''}</p>`).join(''):'<p class="muted">No está incorporado a un plantel UML.</p>'}${isAdmin()?`<button class="secondary sm" id="of-link">Vincular a un jugador UML existente</button>`:''}</div></div><div class="card"><h3>Habilidades</h3>${U.playerAbilities(PES13.stats(d.abilities))}<div class="pes-player-cards"><h3>Tarjetas especiales</h3>${U.playerCards(d.cards)}</div></div></div>`;
    if($('#of-link'))$('#of-link').onclick=()=>linkModal(id);
  }
  async function linkModal(id){
    try {
      adminGuard();
      const players=await q(db().from('players').select('id,name,club_id').eq('archived',false).eq('retired',false).is('option_file_id',null).order('name'));
      modal(`<h2>Vincular ID: ${id}</h2><p>Elegí el jugador UML que representa a este jugador del EDIT. Se actualizarán sus datos deportivos; conservará su equipo, valor e historial.</p><form id="of-link-form"><div class="field"><label for="of-existing-player">Jugador UML sin vínculo</label><select id="of-existing-player" required><option value="">Seleccioná un jugador</option>${players.map(p=>opt(p.id,p.name+(U.club(p.club_id)?' · '+U.club(p.club_id).name:''),'')).join('')}</select></div><div class="row"><button ${players.length?'':'disabled'}>Confirmar vinculación</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`);
      $('#of-link-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await rpc('of_link_player',{p_player:$('#of-existing-player').value,p_pes_id:id});closeModal();toast('Jugador vinculado','ok');if(S.sid)await U.loadSeason(S.sid);await U.route();}catch(x){err(x);button.disabled=false;}};
    }catch(e){err(e);}
  }
  async function adminPage(token){
    adminGuard();
    const history=await q(db().from('option_file_versions').select('id,name,status,expected_count,created_at,activated_at').neq('status','staging').order('created_at',{ascending:false}).limit(20));
    if(token!==sequence)return;
    $('#app').innerHTML=pageHead('Actualizar Option File','Solo administradores. Las negociaciones, equipos UML y movimientos de dinero se conservan.','<a class="btn secondary" href="#/option-file">Volver al catálogo</a>')+
      `<div class="card"><h3>Subir CSV del EDIT</h3><form id="of-upload"><div class="field"><label for="of-version-name">Nombre de la versión</label><input id="of-version-name" required maxlength="100" placeholder="Temporada 1 · Mitad de temporada"></div><div class="field"><label for="of-file">Archivo CSV de PES 2013 Editor</label><input id="of-file" type="file" accept=".csv,text/csv" required></div><button ${uploading?'disabled':''}>Preparar actualización</button></form><p id="of-progress" class="small muted of-progress" role="status"></p></div><div id="of-preview"></div><div class="card"><h3>Versiones publicadas</h3>${history.length?`<div class="table-wrap"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Jugadores</th><th>Estado</th></tr></thead><tbody>${history.map(v=>`<tr><td>${esc(v.name)}</td><td>${U.datetime(v.activated_at)}</td><td>${v.expected_count}</td><td>${v.status==='active'?'Vigente':'Anterior'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Todavía no hay versiones publicadas.</p>'}</div>`;
    $('#of-upload').onsubmit=stageUpload;if(preview)renderPreview();
  }
  async function stageUpload(event){
    event.preventDefault();if(uploading)return;
    const file=$('#of-file').files[0],name=$('#of-version-name').value.trim(),button=event.submitter;
    if(!file||!name)return;
    const progress=text=>{if($('#of-progress'))$('#of-progress').textContent=text;};
    try {
      adminGuard();if(file.size>20*1024*1024)throw new Error('El archivo supera los 20 MB.');
      uploading=true;button.disabled=true;preview=null;if($('#of-preview'))$('#of-preview').innerHTML='';
      progress('Leyendo y validando el CSV…');
      const bytes=await file.arrayBuffer();let text;
      try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('El CSV no está en UTF-8. Volvé a exportarlo desde PES 2013 Editor.');}
      const parsed=PES13.parseCSV(text);
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
      const started=await rpc('of_begin',{p_name:name,p_filename:file.name,p_hash:hash,p_count:parsed.players.length});
      const v=Array.isArray(started)?started[0]:started;
      if(v.status==='active'){progress('Este mismo archivo ya es la versión vigente. No se duplicó ningún registro.');return;}
      if(v.status!=='staging')throw new Error('Este archivo corresponde a una versión anterior ya publicada. No se volvió a aplicar.');
      for(let i=0;i<parsed.players.length;i+=400){
        await rpc('of_stage_batch',{p_version:v.id,p_players:parsed.players.slice(i,i+400)});
        progress(`Preparando ${Math.min(i+400,parsed.players.length).toLocaleString('es-AR')} de ${parsed.players.length.toLocaleString('es-AR')} jugadores… El catálogo vigente todavía no cambia.`);
      }
      preview={report:await rpc('of_preview',{p_version:v.id}),issues:parsed.issues,repairs:parsed.repairs,emptySlots:parsed.emptySlots};
      progress('Archivo preparado. Revisá el resumen antes de confirmar.');if($('#of-preview'))renderPreview();
    } catch(e){progress(errorText(e));err(e);} finally {uploading=false;if(document.contains(button))button.disabled=false;}
  }
  function renderPreview(){
    const {report:r,issues,repairs=[],emptySlots}=preview;
    const differences=r.team_differences||[],missing=r.missing_links||[];
    $('#of-preview').innerHTML=`<div class="card"><h3>Revisar actualización: ${esc(r.version.name)}</h3><div class="grid c4">${[['Jugadores válidos',r.loaded],['Nuevos',r.new],['Modificados',r.changed],['Ausentes del nuevo EDIT',r.removed],['Jugadores UML vinculados',r.linked]].map(([label,n])=>`<div class="stat"><div class="v">${n}</div><div class="l">${label}</div></div>`).join('')}</div><p class="small muted">${emptySlots} espacios vacíos del editor ignorados. Se conservarán los clubes UML, valores, dorsales, negociaciones, pagos y estadísticas.</p>${repairs.length?`<div class="alert warn"><b>${repairs.length} filas normalizadas por un separador vacío sobrante:</b><ul>${repairs.map(x=>`<li>Fila ${x.row} · ${esc(x.name)} · ID ${esc(x.id)}: ${esc(x.reason)}</li>`).join('')}</ul></div>`:''}${issues.length?`<div class="alert warn"><b>${issues.length} filas excluidas por datos inválidos:</b><ul>${issues.map(x=>`<li>Fila ${x.row} · ${esc(x.name)} · ID ${esc(x.id)}: ${esc(x.reason)}</li>`).join('')}</ul></div>`:''}${missing.length?`<div class="alert warn"><b>Vínculos ausentes del nuevo archivo:</b> ${missing.map(x=>esc(x.name)+' (ID '+x.pes_id+')').join(', ')}. Sus jugadores UML y datos anteriores se conservarán.</div>`:''}${differences.length?`<details class="mb"><summary>Diferencias de equipo (${differences.length}) · solo para revisión</summary><div class="table-wrap"><table><thead><tr><th>Jugador</th><th>Equipo UML actual</th><th>Equipo EDIT</th><th>Mercado</th></tr></thead><tbody>${differences.map(d=>`<tr><td>${esc(d.name)}</td><td>${esc(d.uml_team||'Agente libre')}</td><td>${esc(d.edit_team)}</td><td>${d.pending?'Tiene operación pendiente: revisar su fecha':'Revisar'}</td></tr>`).join('')}</tbody></table></div><p class="small muted">Estas diferencias no cambian equipos ni ejecutan operaciones pendientes.</p></details>`:''}<form id="of-confirm-form"><label class="check mb"><input type="checkbox" required> Revisé el resumen${issues.length||repairs.length?' y las correcciones/exclusiones indicadas':''}. Confirmo actualizar el catálogo y los datos deportivos de los jugadores vinculados.</label><div class="row"><button>Publicar y sincronizar</button><button type="button" class="secondary" id="of-cancel">Cancelar</button></div></form></div>`;
    $('#of-cancel').onclick=()=>{preview=null;$('#of-preview').innerHTML='';};
    $('#of-confirm-form').onsubmit=async e=>{
      e.preventDefault();const button=e.submitter;button.disabled=true;
      try{adminGuard();await rpc('of_activate',{p_version:r.version.id});preview=null;version=null;filters.page=0;toast('Option File publicado y jugadores sincronizados','ok');if(S.sid)await U.loadSeason(S.sid);location.hash='#/option-file';}
      catch(x){err(x);if(document.contains(button))button.disabled=false;}
    };
  }
  U.openOptionFileSquad=async cid=>{
    try {
      adminGuard();if(!cid)throw new Error('Elegí un equipo UML.');
      if(S.season?.status!=='draft')throw new Error('El plantel inicial se arma con la temporada en preparación.');
      await currentVersion();if(!version)throw new Error('Primero cargá el Option File.');
      const facets=await rpc('of_facets',{});picker={cid,selected:new Map(),version:version.id,teams:facets.teams||[],rows:[],page:0};
      modal(`<h2>Elegir jugadores desde Option File</h2><p>Destino UML: <b>${esc(U.club(cid)?.name)}</b>. Solo se agregan los jugadores que selecciones.</p><form class="of-filters mb" id="of-pick-search"><div class="field"><label for="of-pick-team">Plantel del EDIT</label><select id="of-pick-team"><option value="">Todos</option>${picker.teams.map(t=>opt(t||EMPTY_TEAM,t||'Sin equipo en EDIT',PES13.normalize(t)===PES13.normalize(U.club(cid)?.name)?(t||EMPTY_TEAM):'')).join('')}</select></div><div class="field"><label for="of-pick-name">Buscar jugador</label><input id="of-pick-name"></div><button class="secondary">Buscar</button></form><p class="small muted">Elegí un club del EDIT para seleccionar su plantel completo. Valor y dorsal son datos UML; no se copiará el precio interno del editor.</p><div id="of-pick-results"></div><div id="of-pick-selected" class="mt"></div><div class="row mt"><button id="of-pick-import" disabled>Confirmar incorporación</button><button class="secondary" onclick="U.closeModal()">Cancelar</button></div>`,true);
      $('#of-pick-search').onsubmit=e=>{e.preventDefault();picker.page=0;pickResults();};
      $('#of-pick-import').onclick=importPicked;await pickResults();
    }catch(e){err(e);}
  };
  async function pickResults(){
    const state=picker,host=$('#of-pick-results');if(!state||!host)return;
    const requestId=state.request=(state.request||0)+1;
    host.innerHTML='<div class="loading">Buscando…</div>';
    const team=$('#of-pick-team').value,search=$('#of-pick-name').value;
    try {
      let request=db().from('option_file_entries').select('*',{count:'exact'}).eq('version_id',state.version);
      if(team)request=request.eq('edit_team',team===EMPTY_TEAM?'':team);
      if(search.trim())request=request.ilike('search_name','%'+PES13.normalize(search).replace(/[\\%_]/g,'\\$&')+'%');
      const response=await request.order('name').order('pes_id').range(state.page*PAGE,state.page*PAGE+PAGE-1);if(response.error)throw response.error;
      if(picker!==state||state.request!==requestId||!document.contains(host))return;
      state.rows=response.data||[];
      const links=state.rows.length?await rpc('of_uml_links',{p_ids:state.rows.map(p=>p.pes_id)}):[];
      if(picker!==state||state.request!==requestId||!document.contains(host))return;
      host.innerHTML=`<label class="check mb"><input id="of-pick-all" type="checkbox"> Seleccionar disponibles de esta página</label><div class="table-wrap"><table><thead><tr><th></th><th>Jugador</th><th>Pos</th><th>Media</th><th>Estado UML</th></tr></thead><tbody>${state.rows.map(p=>{const linked=links.find(l=>l.pes_id==p.pes_id);return `<tr><td><input type="checkbox" aria-label="Seleccionar ${esc(p.name)}" data-of-pick="${p.pes_id}" ${state.selected.has(p.pes_id)?'checked':''} ${linked?'disabled':''}></td><td>${esc(p.name)}</td><td>${positionBadge(p.position)}</td><td>${rating(p.overall,true)}</td><td>${linked?'Ya registrado · '+esc(linked.club||'Agente libre'):'Disponible'}</td></tr>`;}).join('')}</tbody></table></div><div class="of-pagination"><button id="of-pick-prev" class="secondary sm" ${state.page?'':'disabled'}>Anterior</button><span class="small">${response.count||0} resultados · página ${state.page+1}</span><button id="of-pick-next" class="secondary sm" ${(state.page+1)*PAGE<(response.count||0)?'':'disabled'}>Siguiente</button></div>`;
      const change=(input)=>{const p=state.rows.find(p=>p.pes_id==input.dataset.ofPick);if(input.checked)state.selected.set(p.pes_id,{pes_id:p.pes_id,name:p.name,value:0,number:p.data.number||null});else state.selected.delete(p.pes_id);selectedRows();};
      host.querySelectorAll('[data-of-pick]').forEach(input=>input.onchange=()=>change(input));
      $('#of-pick-all').onchange=e=>{host.querySelectorAll('[data-of-pick]:not(:disabled)').forEach(input=>{input.checked=e.target.checked;change(input);});};
      $('#of-pick-prev').onclick=()=>{state.page--;pickResults();};$('#of-pick-next').onclick=()=>{state.page++;pickResults();};selectedRows();
    }catch(e){if(document.contains(host))host.innerHTML=`<p class="alert warn">${esc(errorText(e))}</p>`;}
  }
  function selectedRows(){
    const selected=[...picker.selected.values()];
    $('#of-pick-selected').innerHTML=`<h3>Seleccionados (${selected.length}) · revisar antes de incorporar</h3>`+(selected.length?`<div class="table-wrap"><table><thead><tr><th>Jugador</th><th>Valor inicial UML</th><th>Dorsal UML</th><th></th></tr></thead><tbody>${selected.map(p=>`<tr><td>${esc(p.name)}</td><td><input class="of-roster-values" aria-label="Valor de ${esc(p.name)}" type="number" min="0" max="1000000000000" step="1" data-of-value="${p.pes_id}" value="${p.value}"></td><td><input class="of-roster-values" aria-label="Dorsal de ${esc(p.name)}" type="number" min="1" max="99" data-of-number="${p.pes_id}" value="${p.number||''}"></td><td><button class="xs secondary" data-of-remove="${p.pes_id}">Quitar</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="small muted">Todavía no seleccionaste jugadores.</p>');
    $('#of-pick-import').disabled=!selected.length;
    document.querySelectorAll('[data-of-value]').forEach(input=>input.oninput=()=>{picker.selected.get(+input.dataset.ofValue).value=input.value===''?null:+input.value;});
    document.querySelectorAll('[data-of-number]').forEach(input=>input.oninput=()=>{picker.selected.get(+input.dataset.ofNumber).number=input.value===''?null:+input.value;});
    document.querySelectorAll('[data-of-remove]').forEach(button=>button.onclick=()=>{picker.selected.delete(+button.dataset.ofRemove);const checkbox=document.querySelector(`[data-of-pick="${button.dataset.ofRemove}"]`);if(checkbox)checkbox.checked=false;selectedRows();});
  }
  async function importPicked(e){
    const button=e.currentTarget;button.disabled=true;
    try {
      adminGuard();const players=[...picker.selected.values()].map(({pes_id,value,number})=>({pes_id,value,number}));
      if(players.some(p=>!Number.isFinite(p.value)||p.value<0||p.value>1e12||p.number!==null&&(!Number.isInteger(p.number)||p.number<1||p.number>99)))throw new Error('Revisá los valores y dorsales de los seleccionados.');
      const n=await rpc('of_import_squad',{p_season:S.sid,p_club:picker.cid,p_players:players,p_version:picker.version});
      closeModal();picker=null;toast(`${n} jugadores incorporados al plantel`,'ok');await U.refresh();
    }catch(x){err(x);if(document.contains(button))button.disabled=false;}
  }
})();
