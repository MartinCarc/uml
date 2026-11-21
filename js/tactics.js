/* Formación vertical: una alineación publicada por equipo y temporada. */
(() => {
  const { $, S, esc, POS, squad, club, st, isAdmin, rpc, toast, err, register, pageHead, opt } = U;
  let board = null;
  const responsibilities = { captain:'Capitán', penalties:'Penales', free_kicks_short:'Tiros libres cortos', free_kicks_long:'Tiros libres lejanos', corners_left:'Córners desde la izquierda', corners_right:'Córners desde la derecha' };
  const tacticFields = [
   ['passSupport','Ofrecerse para el pase',17],
   ['supportArea','Zona en la que ofrecerse',12],
   ['positionSwitch','Cambio de posiciones',17],
   ['attackStyle','Estilo de ataque',6],
   ['pressing','Presión',17],
   ['defensiveLine','Línea defensiva',17],
   ['compactness','Cierre de filas',16]
  ];
  const setPieceRoles = [
   ['penalties','Penales'], ['shortFreeKicks','Tiros libres cortos'],
   ['longFreeKicks','Tiros libres lejanos'], ['leftCorners','Córners desde la izquierda'],
   ['rightCorners','Córners desde la derecha']
  ];
  const tacticTypes = ['Normal', 'Posesión', 'Contraataques rápidos', 'Balones largos a la contra', 'Todos a atacar', 'Defensa total'];
  const backFour = [74, ['LI','DFC','DFC','LD'], [14,37,63,86]];
  const backThree = [74, ['DFC','DFC','DFC'], [25,50,75]];
  const backFive = [74, ['LI','DFC','DFC','DFC','LD'], [11,30,50,70,89]];
  const pivots = [55, ['MCD','MCD'], [34,66]];
  const wings = [17, ['EI','DC','ED'], [15,50,85]];
  const pair = [16, ['DC','DC'], [34,66]];
  // Cada línea define su altura, roles y separación horizontal.
  const formations = {
   '4-4-2': [backFour, [46,['MI','MC','MC','MD'],[15,37,63,85]], pair],
   '4-3-3': [backFour, [55,['MCD'],[50]], [39,['MC','MC'],[30,70]], wings],
   '4-3-1-2': [backFour, [58,['MCD'],[50]], [44,['MC','MC'],[27,73]], [32,['MCO'],[50]], pair],
   '4-2-3-1': [backFour, pivots, [35,['MI','MCO','MD'],[17,50,83]], [15,['DC'],[50]]],
   '4-2-1-3': [backFour, pivots, [36,['MCO'],[50]], wings],
   '4-3-2-1': [backFour, [54,['MC','MCD','MC'],[24,50,76]], [35,['MCO','MCO'],[35,65]], [15,['DC'],[50]]],
   '4-1-2-3': [backFour, [56,['MCD'],[50]], [38,['MCO','MCO'],[33,67]], wings],
   '3-2-3-2': [backThree, pivots, [36,['MI','MCO','MD'],[16,50,84]], pair],
   '3-1-4-2': [backThree, [56,['MCD'],[50]], [36,['MI','MC','MC','MD'],[13,37,63,87]], pair],
   '3-2-2-3': [backThree, pivots, [36,['MCO','MCO'],[34,66]], wings],
   '5-2-2-1': [backFive, pivots, [35,['MCO','MCO'],[34,66]], [15,['DC'],[50]]]
  };
  const timeFormat = new Intl.DateTimeFormat('es-AR', {
    dateStyle:'short', timeStyle:'medium', timeZone:'America/Argentina/Buenos_Aires'
  });
  const snapshot = ({lineup,bench,roles,instructions,favorite}) => JSON.stringify({lineup,bench,roles,instructions,favorite});
  const roleLine = role => role === 'ARQ' ? 'arco' : role.startsWith('M') ? 'medio' : ['DC','SD','EI','ED'].includes(role) ? 'ataque' : 'defensa';
  const readerIcons = {
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pitch:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 12h16M9 3v4h6V3M9 21v-4h6v4"/><circle cx="12" cy="12" r="2.5"/>',
    notes:'<path d="M5 5h14v11H9l-4 4zM8 9h8m-8 3h5"/>',
    lineup:'<circle cx="12" cy="6" r="2"/><circle cx="6" cy="16" r="2"/><circle cx="12" cy="16" r="2"/><circle cx="18" cy="16" r="2"/>',
    bench:'<path d="M4 14h16v3H4zM6 17v3m12-3v3M6 11V5h12v6"/>',
    tactics:'<path d="M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4"/>',
    ball:'<circle cx="12" cy="12" r="9"/><path d="m12 8 4 3-1.5 4h-5L8 11zM12 8V3m4 8 4.5-2m-6 6 2.5 4.5m-7.5-4.5L7 19.5M8 11 3.5 9"/>'
  };
  const readerIcon = name => `<svg class="tactics-reader-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${readerIcons[name]}</svg>`;

  function readerNotes() {
    return `<div class="tactics-reader-notes">
      <h3>${readerIcon('notes')} Indicaciones del DT</h3>
      <p class="tactics-instructions">${esc(board.instructions)||'Sin indicaciones adicionales.'}</p>
    </div>
    <h3 class="tactics-reader-roles-heading">${readerIcon('ball')} Capitán y pelota parada</h3>
    <div id="tactics-responsibilities"></div>`;
  }

  function applyScheme(scheme) {
    const slots = [[50,88,'ARQ'], ...formations[scheme].flatMap(([y,roles,xs]) => roles.map((role,i) => [xs[i],y,role]))];
    const remaining = new Set(board.lineup);
    const assigned = slots.map(() => null);
    const assign = (matches) => slots.forEach(([, , role],i) => {
      if (assigned[i]) return;
      const player = [...remaining].find(item => matches(item,role));
      if (player) { assigned[i]=player; remaining.delete(player); }
    });
    assign((player,role) => player.position===role);
    assign((player,role) => roleLine(player.position)===roleLine(role));
    assign(() => true);
    assigned.forEach((player,i) => {
      if (player) [player.x,player.y,player.position]=slots[i];
    });
    board.favorite.scheme=scheme;
    drawFavorite(); render(); mark();
    $('#tactics-scheme').focus({preventScroll:true});
  }

  function shortName(player, fullName) {
    if (player.short_name) return player.short_name;
    const words=fullName.trim().split(/\s+/);
    const compound=fullName.match(/(?:^|\s)(Smith Rowe)$/i);
    if (compound) return compound[1];
    let start=words.length-1;
    while(start>1 && /^(de|del|la|las|los|van|von|ten|der|den|da|das|do|dos|di|du|el|al)$/i.test(words[start-1])) start--;
    return words.slice(start).join(' ');
  }

  function renderLastChange() {
    const time=$('#tactics-last-change');
    const value=Number.isFinite(Date.parse(board.updatedAt)) ? board.updatedAt : null;
    time.textContent=value ? timeFormat.format(new Date(value))+' · hora argentina' : 'Sin registro';
    if(value) time.dateTime=value;
    else time.removeAttribute('datetime');
  }

  function showTab(tab) {
    board.tab=tab;
    document.querySelectorAll('[data-tactics-tab]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.tacticsTab===tab)));
    document.querySelectorAll('[data-tactics-panel]').forEach(panel => { panel.hidden=panel.dataset.tacticsPanel!==tab; });
  }

  function drawFavorite() {
    const { favorite, edit }=board;
    $('#tactics-favorite').innerHTML=edit ? `
      <div class="field"><label for="tactics-scheme">Formación</label><select id="tactics-scheme"><option value="">Libre</option>${Object.keys(formations).map(s=>opt(s,s,favorite.scheme)).join('')}</select></div>
      <div class="field"><label for="tactics-type">Táctica</label><select id="tactics-type"><option value="">Sin definir</option>${tacticTypes.map(t=>opt(t,t,favorite.type)).join('')}</select></div>
      ${tacticFields.map(([key,label])=>`<div class="tactics-point"><label for="tactics-point-${key}">${label}</label><input id="tactics-point-${key}" data-tactics-point="${key}" type="range" min="0" max="20" step="1" value="${favorite.points?.[key] ?? 10}" aria-valuetext="${favorite.points?.[key] ?? 'Sin definir'}"><output for="tactics-point-${key}">${favorite.points?.[key] ?? '—'}</output></div>`).join('')}
    ` : `<dl class="tactics-reader-tactic">
      <div><dt>Formación</dt><dd>${esc(favorite.scheme || 'Libre')}</dd></div>
      <div><dt>Táctica</dt><dd>${esc(favorite.type || 'Sin definir')}</dd></div>
    </dl>
    <div class="tactics-reader-points">${tacticFields.map(([key,label])=>{
      const value=favorite.points?.[key];
      return `<div><span>${label}</span><b>${value == null ? '—' : `${esc(value)}<small> / 20</small>`}</b>
        ${value == null ? '' : `<meter min="0" max="20" value="${esc(value)}" aria-label="${label}"></meter>`}</div>`;
    }).join('')}</div>`;
    if(!edit)return;
    $('#tactics-scheme').onchange=e=>{
      if(e.target.value) applyScheme(e.target.value);
      else {delete favorite.scheme;mark();}
    };
    $('#tactics-type').onchange=e=>{
      if(e.target.value) favorite.type=e.target.value;
      else delete favorite.type;
      mark();
    };
    $('#tactics-favorite').querySelectorAll('[data-tactics-point]').forEach(input=>{
      const update=()=>{
        (favorite.points ||= {})[input.dataset.tacticsPoint]=Number(input.value);
        input.nextElementSibling.value=input.value;
        input.setAttribute('aria-valuetext',input.value);
        mark();
      };
      input.oninput=update;
      input.onchange=update;
    });
  }

  function selectPlayer(id) {
    board.selected=id;
    document.querySelectorAll('button.tactics-piece').forEach(button=>
      button.setAttribute('aria-pressed',String(board.lineup[+button.dataset.index]?.player_id===id)));
    drawInspector();
  }

  function drawInspector() {
    const panel=$('#tactics-inspector');
    if(!board.edit)return;
    const player=board.lineup.find(p=>p.player_id===board.selected);
    if(!player){ panel.innerHTML='<p class="small muted">Seleccioná una ficha para editar al titular.</p>';return; }
    const fullName=name(player.player_id);
    const substitutes=board.bench.filter(allowed);
    panel.innerHTML=`<h3>${U.playerLabel(U.player(player.player_id)||{name:fullName})} ${U.positionBadge(player.position)}</h3>
      <div class="field"><label for="tactics-selected-position">Posición en la formación</label><select id="tactics-selected-position">${positions(player.position)}</select></div>
      <div class="field"><label for="tactics-short-name">Apellido o nombre en cancha</label><input id="tactics-short-name" maxlength="32" value="${esc(player.short_name || '')}" placeholder="${esc(shortName(player,fullName))}"></div>
      <div class="field"><label for="tactics-replacement">Reemplazar con un suplente</label><select id="tactics-replacement"${substitutes.length?'':' disabled'}><option value="">Elegí un suplente</option>${substitutes.map(id=>opt(id,name(id),'')).join('')}</select></div>`;
    $('#tactics-selected-position').onchange=e=>{player.position=e.target.value;render();mark();$('#tactics-selected-position').focus();};
    $('#tactics-short-name').oninput=e=>{
      const text=e.target.value.trim();
      if(text)player.short_name=text;
      else delete player.short_name;
      const index=board.lineup.indexOf(player);
      const token=$('#tactics-pieces').querySelector(`[data-index="${index}"] .tactics-name`);
      token.textContent=shortName(player,fullName);
      mark();
    };
    $('#tactics-replacement').onchange=e=>{
      const id=e.target.value;
      if(!id||!allowed(id))return;
      const index=board.bench.indexOf(id);
      if(index<0)return;
      const outgoing=player.player_id;
      if(allowed(outgoing))board.bench[index]=outgoing;
      else board.bench.splice(index,1);
      clearRoles(outgoing);
      player.player_id=id;delete player.short_name;
      board.selected=id;
      render();mark();$('#tactics-replacement').focus();
    };
  }

  const clearRoles = (id) => Object.keys(board.roles).forEach((key) => { if (board.roles[key] === id) delete board.roles[key]; });
  const editable = (cid) => !!S.user && (isAdmin() || S.myClub === cid) && S.season.status !== 'closed' && !S.season.historical;
  const current = () => board && location.hash === board.hash && S.sid === board.sid;
  const mark = () => { board.dirty = true; $('#tactics-status').textContent = 'Cambios sin guardar'; };
  const name = (id) => U.player(id)?.name || 'Jugador fuera del plantel';
  const allowed = (id) => squad(board.cid).some((p) => p.id === id);
  function teamDiscColors(color, fallback = '#1F5FC4') {
    let hex = typeof color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : fallback;
    if (hex.length === 4) hex = '#' + [...hex.slice(1)].map((c) => c + c).join('');
    const luminance = [1,3,5].map((i) => parseInt(hex.slice(i,i+2),16) / 255)
      .map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
      .reduce((sum,c,i) => sum + c * [.2126,.7152,.0722][i], 0);
    return { color:hex, ink:1.05 / (luminance + .05) >= (luminance + .05) / .05 ? '#ffffff' : '#000000' };
  }

  const positions = (selected) => Object.entries(POS).map(([k, v]) => opt(k, `${k} · ${v}`, selected)).join('');

  register('pizarra', async (cid) => {
    const team = st(cid);
    if (!team || !club(cid)) { $('#app').innerHTML = '<div class="empty">Equipo inexistente en esta temporada.</div>'; return; }
    const routeHash = location.hash, sid = S.sid;
    $('#app').innerHTML = '<div class="loading">Cargando formación…</div>';
    const { data, error } = await U.client().from('season_teams').select('*').eq('season_id', sid).eq('club_id', cid).single();
    if (location.hash !== routeHash || S.sid !== sid) return;
    if (error) { $('#app').innerHTML = '<div class="empty">No se pudo cargar la formación. Volvé a intentarlo.</div>'; err(error); return; }
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'tactics')) {
      $('#app').innerHTML = pageHead('Formación', esc(club(cid).name)) + '<div class="alert warn">Falta habilitar la formación en la base de datos. El administrador debe aplicar el archivo 20261107_tactics.sql indicado en el README. Los datos actuales se conservan.</div>'; return;
    }
    team.tactics = data.tactics;
    const existing = team.tactics || {};
    const roles = {...existing.roles};
    if (!Object.hasOwn(roles,'free_kicks_short') && roles.free_kicks) roles.free_kicks_short=roles.free_kicks;
    delete roles.free_kicks;
    board = {cid,sid,hash:routeHash,lineup:(existing.lineup||[]).map(p=>({...p})),
      bench:[...(existing.bench||[])],roles,instructions:existing.instructions||'',
      favorite:JSON.parse(JSON.stringify(existing.favorite||{})),updatedAt:existing.updated_at,
      selected:existing.lineup?.[0]?.player_id,tab:'roles',edit:editable(cid),dirty:false};
    const edit=board.edit;
    const icon=name=>edit?'':readerIcon(name);
    const summaryTab=`<button type="button" data-tactics-tab="roles">${icon('notes')}${edit?'Roles y notas':'Resumen'}</button>`;
    const history=`Última modificación · <time id="tactics-last-change"></time>`;
    $('#app').innerHTML = pageHead('Formación', esc(club(cid).name), `<a class="btn secondary" href="#/s/${sid}/equipo/${cid}">Ver equipo</a>${edit?'<button id="tactics-save" type="button">Guardar formación</button>':''}`) +
      `${edit?`<div class="alert info tactics-history">${history}</div><p id="tactics-status" class="muted small" role="status"></p>`:''}
      <div class="tactics-layout tactics-interactive${edit?'':' tactics-reader'}">
        ${edit?'':`<div class="tactics-reader-history muted small">${icon('clock')}<span>${history}</span></div>`}
        <section class="card"><div class="row between mb"><h3 class="tactics-pitch-heading">${icon('pitch')} Cancha</h3><span class="badge" id="tactics-count"></span></div>
        <div id="tactics-pitch" class="tactics-pitch" aria-label="Campo vertical. Ataque hacia arriba"><div class="tactics-lines" aria-hidden="true"><i class="tactics-half"></i><i class="tactics-circle"></i><i class="tactics-area top"></i><i class="tactics-area bottom"></i></div><div id="tactics-pieces"></div></div></section>
        <div class="tactics-side">
          ${edit?'<section class="card" id="tactics-inspector"></section>':''}
          <section class="card"><div class="tabs tactics-tabs" aria-label="Opciones de formación">
            ${edit?'':summaryTab}
            <button type="button" data-tactics-tab="lineup">${icon('lineup')}Titulares <span id="tactics-lineup-count"></span></button>
            <button type="button" data-tactics-tab="bench">${icon('bench')}Banco <span id="tactics-bench-count"></span></button>
            ${edit?summaryTab:''}
            <button type="button" data-tactics-tab="favorite">${icon('tactics')}${edit?'Táctica favorita':'Táctica'}</button>
          </div>
          <div data-tactics-panel="lineup">
            ${edit?`<form id="tactics-add" class="mb"><div class="field"><label for="tactics-player">Jugador</label><select id="tactics-player" required></select></div><div class="field"><label for="tactics-position">Posición en la formación</label><select id="tactics-position">${positions('MC')}</select></div><button type="submit">Agregar al campo</button></form>`:''}
            <div id="tactics-roster" class="tactics-entries"></div>
          </div>
          <div data-tactics-panel="bench">
            ${edit?'<form id="tactics-bench-add" class="mb"><div class="field"><label for="tactics-bench-player">Suplente</label><select id="tactics-bench-player" required></select></div><button type="submit">Agregar al banco</button></form>':''}
            <div id="tactics-bench" class="tactics-entries"></div>
          </div>
          <div data-tactics-panel="roles">
            ${edit?`<h3>Capitán y pelota parada</h3><div id="tactics-responsibilities"></div>
            <h3>Indicaciones para el simulador</h3><label class="sr-only" for="tactics-instructions">Indicaciones para el simulador</label><textarea id="tactics-instructions" rows="4" maxlength="4000">${esc(board.instructions)}</textarea>`:readerNotes()}
          </div>
          <div data-tactics-panel="favorite"><h3>Táctica favorita</h3><div id="tactics-favorite"></div></div>
          </section>
        </div>
      </div>`;
    document.querySelectorAll('[data-tactics-tab]').forEach(button=>button.onclick=()=>showTab(button.dataset.tacticsTab));
    showTab(board.tab);
    drawFavorite();
    renderLastChange();
    const disc = teamDiscColors(club(cid).color);
    $('#tactics-pitch').style.setProperty('--team-disc-color', disc.color);
    $('#tactics-pitch').style.setProperty('--team-disc-ink', disc.ink);
    $('#tactics-pitch').style.setProperty('--team-disc-secondary', teamDiscColors(club(cid).secondary_color, '#ffffff').color);
    render();
    if (board.edit) {
      $('#tactics-player').addEventListener('change', (e) => { const p = U.player(e.target.value); if (p) $('#tactics-position').value = p.position; });
      $('#tactics-add').addEventListener('submit', (e) => {
        e.preventDefault();
        const pid = $('#tactics-player').value;
        if (!pid || !allowed(pid) || (board.lineup.some((p) => p.player_id === pid) || board.bench.includes(pid))) return;
        if (board.lineup.length >= 11) return toast('Solo podés colocar once jugadores.', 'error');
        const position = $('#tactics-position').value;
        const y = position === 'ARQ' ? 86 : ['DFC','LD','LI'].includes(position) ? 68 : ['DC','SD','ED','EI'].includes(position) ? 20 : 44;
        const spots = [y, 30, 53, 73, 16, 86].flatMap((row) => [50, 25, 75, 12, 88].map((x) => ({ x, y: row })));
        const spot = spots.find((s) => !board.lineup.some((p) => Math.abs(p.x - s.x) < 14 && Math.abs(p.y - s.y) < 10)) || { x:50, y };
        board.lineup.push({ player_id: pid, position, ...spot });
        board.selected=pid;
        render(); mark();
      });
      $('#tactics-bench-add').addEventListener('submit', (e) => {
        e.preventDefault(); const pid = $('#tactics-bench-player').value;
        if (!pid || !allowed(pid) || board.bench.includes(pid) || board.lineup.some((p) => p.player_id === pid)) return;
        if (board.bench.length >= 12) return toast('Solo podés elegir doce suplentes.', 'error');
        board.bench.push(pid); render(); mark();
      });
      $('#tactics-save').addEventListener('click', save);
      $('#tactics-instructions').addEventListener('input', (e) => { board.instructions = e.target.value; mark(); });
    }
  });

  function render() {
    const { lineup, bench, edit } = board;
    $('#tactics-count').textContent = `${lineup.length}/11 · Ataque ↑`;
    $('#tactics-lineup-count').textContent = edit ? `· ${lineup.length}` : lineup.length;
    $('#tactics-pieces').innerHTML = lineup.map((p,i)=>{
      const fullName=name(p.player_id), player=U.player(p.player_id);
      const label=shortName(p,fullName);
      const number=player?.number ?? (player?.name ? label.slice(0,1).toUpperCase() : '—');
      const tag=edit?'button':'div';
      return `<${tag} ${edit?'type="button"':''} class="tactics-piece ${edit?'movable':''}" data-index="${i}"
        style="left:${Number(p.x)}%;top:${Number(p.y)}%" title="${esc(fullName)}"
        ${edit?`aria-label="Seleccionar ${esc(fullName)}, ${esc(p.position)}" aria-pressed="${board.selected===p.player_id}"`:''}>
        <span class="tactics-disc">${esc(number)}</span><span class="tactics-token-label"><span class="tactics-name">${esc(label)}</span>${U.positionBadge(p.position)}</span>
      </${tag}>`;
    }).join('');
    $('#tactics-roster').innerHTML = lineup.map((p,i)=>`<div class="tactics-row">${U.positionBadge(p.position)}
      <div>${U.playerLabel(U.player(p.player_id)||{name:name(p.player_id)})} ${U.sancBadges(p.player_id)}
      ${!allowed(p.player_id)?'<span class="sanc">Fuera del plantel</span>':''}</div>
      ${edit?`<button type="button" class="xs secondary" data-pick="${i}">Editar</button><button type="button" class="xs danger" data-remove="${i}" aria-label="Quitar ${esc(name(p.player_id))}">Quitar</button>`:''}</div>`).join('') || '<p class="muted small">Sin jugadores en el campo.</p>';
    $('#tactics-bench-count').textContent = edit ? `· ${bench.length}/12` : bench.length;
    $('#tactics-bench').innerHTML = bench.map((id, i) => `<div class="tactics-row">${U.positionBadge(U.player(id)?.position || '—')}<div><b>${U.playerLabel(U.player(id)||{name:name(id)})}</b>${!allowed(id) ? '<div class="sanc">Ya no pertenece al plantel</div>' : ''}${U.sancBadges(id)}</div>${edit ? `<button type="button" class="xs danger" data-bench-remove="${i}" aria-label="Quitar del banco a ${esc(name(id))}">Quitar</button>` : ''}</div>`).join('') || '<p class="muted small">Sin suplentes seleccionados.</p>';
    $('#tactics-responsibilities').innerHTML = Object.entries(responsibilities).map(([key,label]) => {
      const selected = board.roles[key] || '';
      if (!edit) return `<div class="tactics-reader-role"><span>${label}</span><b class="${selected?'':'muted'}">${selected ? esc(name(selected)) : 'Sin asignar'}</b></div>`;
      const candidates = lineup.map((p) => opt(p.player_id, name(p.player_id), selected)).join('');
      const missing = selected && !lineup.some((p) => p.player_id === selected) ? opt(selected, name(selected) + ' (ya no es titular)', selected) : '';
      return `<div class="field"><label for="tactics-role-${key}">${label}</label><select id="tactics-role-${key}" data-role="${key}"><option value="">Sin asignar</option>${missing}${candidates}</select></div>`;
    }).join('');
    if (!edit) return;
    drawInspector();
    document.querySelectorAll('[data-role]').forEach((el) => el.addEventListener('change', () => { if (el.value) board.roles[el.dataset.role]=el.value; else delete board.roles[el.dataset.role]; mark(); }));
    document.querySelectorAll('[data-bench-remove]').forEach((el) => el.addEventListener('click', () => { bench.splice(+el.dataset.benchRemove, 1); render(); mark(); }));
    const available = squad(board.cid).filter((p) => !lineup.some((t) => t.player_id === p.id) && !bench.includes(p.id));
    $('#tactics-player').innerHTML = '<option value="">Elegí un jugador</option>' + available.map((p) => opt(p.id, `${p.name} · ${p.position}`, '')).join('');
    $('#tactics-bench-player').innerHTML = $('#tactics-player').innerHTML;
    $('#tactics-bench-add button').disabled = bench.length >= 12 || !available.length;
    $('#tactics-add button').disabled = lineup.length >= 11 || !available.length;
    document.querySelectorAll('[data-pick]').forEach(el=>el.onclick=()=>{selectPlayer(lineup[+el.dataset.pick].player_id);$('#tactics-selected-position').focus();});
    document.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{
      const [removed]=lineup.splice(+el.dataset.remove,1);
      clearRoles(removed.player_id);
      if(board.selected===removed.player_id)board.selected=lineup[0]?.player_id;
      render();mark();
    });
    document.querySelectorAll('.tactics-piece').forEach((el) => {
      el.addEventListener('click',()=>selectPlayer(lineup[+el.dataset.index].player_id));
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); el.focus(); selectPlayer(lineup[+el.dataset.index].player_id); el.setPointerCapture(e.pointerId);
        const rect = $('#tactics-pitch').getBoundingClientRect(), p = lineup[+el.dataset.index];
        const start = { x: e.clientX, y: e.clientY, px: p.x, py: p.y };
        const move = (ev) => { if (ev.pointerId !== e.pointerId) return; place(el, p, start.px + (ev.clientX - start.x) / rect.width * 100, start.py + (ev.clientY - start.y) / rect.height * 100); };
        const end = (ev) => { if (ev.pointerId !== e.pointerId) return; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      });
      el.addEventListener('keydown', (e) => {
        const delta = { ArrowLeft: [-2,0], ArrowRight: [2,0], ArrowUp: [0,-2], ArrowDown: [0,2] }[e.key];
        if (!delta) return; e.preventDefault(); const p = lineup[+el.dataset.index]; place(el, p, p.x + delta[0], p.y + delta[1]);
      });
    });
  }
  function place(el, p, x, y) {
    p.x = Math.max(9, Math.min(91, x)); p.y = Math.max(7, Math.min(91, y));
    el.style.left = `${p.x}%`; el.style.top = `${p.y}%`; mark();
  }
  async function save() {
    if (!current() || !editable(board.cid)) return;
    if (board.lineup.some((p) => !allowed(p.player_id)) || board.bench.some((id) => !allowed(id))) return toast('Quitá los jugadores que ya no pertenecen al plantel.', 'error');
    const button = $('#tactics-save'), saving = board;
    const serialized=snapshot(saving);
    const {lineup,bench,roles,instructions,favorite}=JSON.parse(serialized);
    button.disabled=true;button.textContent='Guardando…';
    try {
      const result=await rpc('save_tactics_v2',{p_season:saving.sid,p_club:saving.cid,p_lineup:lineup,p_bench:bench,p_roles:roles,p_instructions:instructions,p_favorite:favorite});
      if(S.sid===saving.sid && st(saving.cid))st(saving.cid).tactics=result.tactics;
      if(board===saving && current()){
        saving.updatedAt=result.tactics.updated_at;
        renderLastChange();
        saving.dirty=snapshot(saving)!==serialized;
        $('#tactics-status').textContent=saving.dirty?'Hay cambios nuevos sin guardar.':result.changed?'Formación guardada y publicada.':'No hay cambios para guardar.';
        if(result.changed)toast('Formación guardada','ok');
      }
    } catch(error){
      if(board===saving && current()){ $('#tactics-status').textContent='No se pudo guardar. Tus cambios siguen en pantalla.';err(error); }
    } finally {
      if(board===saving && current()){button.disabled=false;button.textContent='Guardar formación';}
    }
  }
  window.addEventListener('beforeunload', (e) => { if (current() && board.dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
