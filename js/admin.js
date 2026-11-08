/* =====================================================================
   UML - panel de administración y asistente de temporada
   ===================================================================== */
(() => {
  const { $, esc, fmt, fmtM, date, datetime, POS, STAGE, SANC, S, toast, modal, closeModal, err, isAdmin, rpc, opt, club, player, comp, st, profile, managerName, compClubs, squad, cfg, crest, clubLabel, statusBadge, pageHead, standings, tieWinner, refresh, register, client, loadProfiles } = U;
  const sb = () => client();
  const guard = () => { if (!isAdmin()) { $('#app').innerHTML = '<div class="empty">Solo para administradores.</div>'; return false; } return true; };
  const q = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
  const editingSeasonClubs = () => !!S.sid && !!S.season && location.hash.startsWith(`#/s/${S.sid}/admin`);
  let showArchivedClubs = false;
  A.showArchivedClubs = (value) => { showArchivedClubs = value; U.route(); };

  // Catálogo permanente, accesible incluso antes de crear la primera temporada.
  register('clubes', async () => {
    if (!guard()) return;
    const all = await q(sb().from('clubs').select('*').order('name'));
    S.clubs = all;
    $('#app').innerHTML = pageHead('Administrar clubes', 'Los clubes son permanentes y se reutilizan en cada temporada.', '<a class="btn secondary" href="#/">Volver al inicio</a><a class="btn" href="#/nueva-temporada">+ Nueva temporada</a>') +
      `<div class="tabs"><button class="${!showArchivedClubs ? 'active' : ''}" onclick="A.showArchivedClubs(false)">Disponibles</button><button class="${showArchivedClubs ? 'active' : ''}" onclick="A.showArchivedClubs(true)">Archivados</button></div>` +
      clubCatalog(all.filter((c) => !!c.archived === showArchivedClubs), false) +
      '<div class="card"><h3>Nueva etapa</h3><p class="small muted">Archiva los clubes y jugadores actuales. Conserva las temporadas cerradas, sus planteles y movimientos. Después podés cargar otros clubes y planteles; cada nueva temporada comienza con presupuestos nuevos. Primero cerrá o eliminá todas las temporadas pendientes.</p><button class="danger" onclick="A.newGameModal()">Iniciar nueva etapa</button></div>';
  });

  // Confirmaciones explícitas: no se ejecuta ninguna operación al abrir el cuadro.
  let pendingManagement = null;
  function managementModal(title, message, phrase, operation) {
    pendingManagement = { phrase, operation };
    modal(`<h2>${esc(title)}</h2><p>${esc(message)}</p><form onsubmit="A.confirmManagement(event)"><div class="field"><label>Escribí ${esc(phrase)} para confirmar</label><input name="confirmation" required autocomplete="off"></div><div class="row"><button type="submit" class="danger">Confirmar</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`);
  }
  A.confirmManagement = async (e) => {
    e.preventDefault(); if (!guard() || !pendingManagement) return;
    const { phrase, operation } = pendingManagement;
    const value = U.formData(e.target).confirmation;
    if (value !== phrase) return toast('La confirmación no coincide. No se hizo ningún cambio.', 'error');
    const button = e.target.querySelector('[type=submit]'); button.disabled = true;
    try { await operation(value); pendingManagement = null; closeModal(); }
    catch (x) { err(x); button.disabled = false; }
  };
  A.manageClubModal = (id, action) => {
    if (!guard()) return;
    const c = club(id); if (!c) return;
    const label = { archive: 'Archivar', restore: 'Restaurar', delete: 'Eliminar' }[action];
    if (!label) return;
    const message = action === 'delete' ? 'Solo se puede eliminar un club sin datos asociados. Esta acción es definitiva. Si tiene historial, usá Archivar.' : action === 'archive' ? 'El club dejará de estar disponible para nuevas temporadas. Su historial se conserva. No puede participar en temporadas pendientes.' : 'El club volverá a estar disponible para nuevas temporadas. Los jugadores de una etapa anterior no se reactivan: podés cargar un plantel nuevo.';
    managementModal(`${label} ${c.name}`, message, `${label.toUpperCase()} ${c.name}`, async () => {
      await rpc('manage_club', { p_club: id, p_action: action });
      toast('Club actualizado', 'ok'); await U.route();
    });
  };
  function clearSeasonContext() {
    Object.assign(S, { sid: null, season: null, myClub: null, competitions: [], seasonTeams: [], compTeams: [], players: [], matches: [], events: [], sanctions: [], offers: [], queue: [], seasons: [] });
    localStorage.removeItem('uml_sid');
  }
  A.newGameModal = () => {
    if (!guard()) return;
    managementModal('Iniciar nueva etapa', 'Se archivarán los clubes y jugadores actuales, incluidos los agentes libres. No se borran temporadas cerradas ni sus resultados, planteles y presupuestos. La nueva etapa tendrá clubes y planteles por cargar. El banco general conserva su saldo.', 'NUEVA ETAPA', async (value) => {
      await rpc('start_new_game', { p_confirmation: value });
      clearSeasonContext(); showArchivedClubs = false;
      toast('Nueva etapa lista. Podés cargar los clubes.', 'ok'); await U.route();
    });
  };
  A.deleteSeasonModal = () => {
    if (!guard() || !S.season || S.season.status === 'closed' || S.season.historical) return;
    const id = S.sid, name = S.season.name;
    managementModal('Eliminar temporada', `Se eliminará definitivamente ${name}: competencias, fixture, resultados, eventos, sanciones, ofertas, entrenamientos y movimientos de esa temporada. Las otras temporadas y los clubes se conservan. No revierte transferencias ni cambios de edad o media ya aplicados a jugadores. El saldo del banco se recalcula sin los movimientos eliminados.`, `ELIMINAR ${name}`, async (value) => {
      await rpc('delete_current_season', { p_season: id, p_confirmation: value });
      clearSeasonContext(); location.hash = '#/'; await U.route(); toast('Temporada eliminada', 'ok');
    });
  };

  // ================= ASISTENTE DE NUEVA TEMPORADA =================
  register('nueva-temporada', async () => {
    if (!guard()) return;
    const clubs = await q(sb().from('clubs').select('*').eq('archived', false).order('name'));
    const prev = (await q(sb().from('seasons').select('*').eq('historical', false).order('created_at', { ascending: false }).limit(1)))[0];
    let prevTeams = []; let note = '';
    if (prev) {
      prevTeams = await q(sb().from('season_teams').select('*').eq('season_id', prev.id));
      if (prev.mode === 'two') {
        // propuesta de divisiones según ascensos, descensos y promoción de la temporada anterior
        const keep = { sid: S.sid };
        try {
          await U.loadSeason(prev.id);
          const L1 = S.competitions.find((c) => c.kind === 'league' && c.tier === 1), L2 = S.competitions.find((c) => c.kind === 'league' && c.tier === 2), PR = S.competitions.find((c) => c.kind === 'promotion');
          if (L1?.status === 'finished' && L2?.status === 'finished') {
            const s1 = standings(L1.id), s2 = standings(L2.id);
            const down = new Set(s1.slice(s1.length - L1.relegate_direct).map((r) => r.club_id)), up = new Set(s2.slice(0, L2.promote_direct).map((r) => r.club_id));
            if (PR?.status === 'finished') { const winners = PR.format?.winners || [PR.champion_club_id]; compClubs(PR.id).forEach((id) => { const wasTop = s1.some((r) => r.club_id === id); if (winners.includes(id) && !wasTop) up.add(id); if (!winners.includes(id) && wasTop) down.add(id); }); }
            prevTeams = prevTeams.map((t) => ({ ...t, tier: down.has(t.club_id) ? 2 : up.has(t.club_id) ? 1 : t.tier }));
            const names = (set) => [...set].map((id) => club(id)?.name).join(', ');
            note = `<div class="alert ok">Propuesta según la temporada anterior: ascienden <b>${names(up) || '—'}</b>, descienden <b>${names(down) || '—'}</b>. Podés cambiarla.</div>`;
          }
        } catch (x) { console.warn(x); }
        if (keep.sid) await U.loadSeason(keep.sid).catch(() => {});
      }
    }
    const d = U.cfg();
    const clubCheck = (c, tier) => `<label class="check"><input type="checkbox" name="t${tier}" value="${c.id}" ${prevTeams.find((t) => t.club_id === c.id && (t.tier === tier || (tier === 1 && !prev?.mode))) ? 'checked' : ''}> ${crest(c)} ${esc(c.name)}</label>`;
    $('#app').innerHTML = pageHead('Nueva temporada') + note + `
      <form onsubmit="A.createSeason(event)" oninput="A.wizardUpdate(this)">
      <div class="card"><h3>1 · Nombre y modo</h3>
        <div class="fields"><div><label>Nombre</label><input name="name" required placeholder="Temporada 1"></div>
        <div><label>Modo</label><select name="mode"><option value="one">Una liga</option><option value="two">Dos divisiones (Premier + Championship)</option></select></div></div></div>
      <div class="card"><h3>2 · Ligas</h3>
        <div class="fields"><div><label>Nombre de la liga / primera división</label><input name="league1_name" value="UML Premier" required></div><div><label>Formato</label><select name="league1_rounds"><option value="double">Ida y vuelta</option><option value="single">Una rueda</option></select></div>
          <div><label>Puntos por victoria</label><input name="points_win" type="number" value="3"></div><div><label>Puntos por empate</label><input name="points_draw" type="number" value="1"></div></div>
        <div class="kicker mb">Equipos de la primera división <span class="muted" id="cnt1"></span></div>
        <div class="check-list mb">${clubs.map((c) => clubCheck(c, 1)).join('') || '<span class="muted">Primero creá clubes desde <a href="#/clubes">Administrar clubes</a>.</span>'}</div>
        <div id="wiz-two" style="display:none">
          <div class="hr"></div>
          <div class="fields"><div><label>Nombre de la segunda división</label><input name="league2_name" value="UML Championship"></div><div><label>Formato</label><select name="league2_rounds"><option value="double">Ida y vuelta</option><option value="single">Una rueda</option></select></div>
            <div><label>Descienden directo de Premier</label><input name="relegate_direct" type="number" min="0" value="2"></div><div><label>Ascienden directo de Championship</label><input name="promote_direct" type="number" min="0" value="2"></div><div><label>Equipos por lado en promoción</label><input name="promotion_slots" type="number" min="0" value="1"></div></div>
          <div class="help mb">La promoción es ida y vuelta: ida en cancha del equipo de Championship, vuelta en cancha del de Premier; penales si el global empata.</div>
          <div class="kicker mb">Equipos de la segunda división <span class="muted" id="cnt2"></span></div>
          <div class="check-list mb">${clubs.map((c) => clubCheck(c, 2)).join('')}</div>
        </div></div>
      <div class="card"><h3>3 · UML Cup</h3>
        <label class="check mb"><input type="checkbox" name="cup_enabled" checked> Crear la copa de la liga (la juegan todos los equipos de la temporada)</label>
        <div class="fields"><div><label>Nombre</label><input name="cup_name" value="UML Cup"></div><input type="hidden" name="cup_legs" value="1"><div><label>Desempate</label><select name="cup_pen"><option value="true">Penales</option></select></div></div>
        <div class="help">16 equipos: cuatro grupos de cuatro, tres fechas y dos clasificados por grupo. Cuartos, semifinales y final a partido único en estadio neutral, con tiempo extra y penales. Las entradas neutrales se reparten por mitades.</div></div>
      <div class="card"><h3>4 · UML Supercup</h3><label class="check"><input type="checkbox" name="supercup_enabled" checked> Crear la Supercopa (campeón de liga vs campeón de copa; si coinciden, subcampeón de liga). Partido único con penales.</label></div>
      <div class="card"><h3>5 · Economía</h3><p class="muted small">El presupuesto inicial se entrega solo en la temporada 1 de la etapa. En las siguientes se conserva el saldo del equipo. La TV se acredita al iniciar cada temporada.</p>
        <div class="fields"><div><label>Inicial Premier (solo temporada 1)</label><input name="budget_tier1" type="number" value="${d.budget_tier1}"></div><div><label>Inicial Championship (solo temporada 1)</label><input name="budget_tier2" type="number" value="${d.budget_tier2}"></div>
          <div><label>TV · Premier (cada temporada)</label><input name="tv_tier1" type="number" value="${d.tv_tier1}"></div><div><label>TV · Championship (cada temporada)</label><input name="tv_tier2" type="number" value="${d.tv_tier2}"></div>
          <div><label>Precio de entrada</label><input name="ticket_price" type="number" value="${d.ticket_price}"></div><div><label>Multa de fair play</label><input name="fairplay_fine" type="number" value="${d.fairplay_fine}"></div>
          <div><label>Costo del gimnasio</label><input name="gym_cost" type="number" value="${d.gym_cost}"></div><div><label>Tope de plantel</label><input name="squad_limit" type="number" value="${d.squad_limit}"></div></div>
        <div class="help">Ocupación por posición (100/85/70/55/40 %), multiplicadores por tipo de partido, sanciones (roja 2, doble amarilla 1, 3 amarillas = 1) y lesiones (leve 2, grave 4) ya vienen configurados y se pueden ajustar después desde Admin → Temporada.</div></div>
      <div class="row"><button type="submit" class="navy">Crear temporada</button><a class="btn secondary" href="#/">Cancelar</a></div></form>`;
    A.wizardUpdate($('#app form'));
  });
  A.wizardUpdate = (form) => { const two = form.mode.value === 'two'; $('#wiz-two').style.display = two ? '' : 'none'; const n1 = form.querySelectorAll('[name=t1]:checked').length, n2 = form.querySelectorAll('[name=t2]:checked').length; $('#cnt1').textContent = `(${n1} seleccionados)`; $('#cnt2').textContent = `(${n2} seleccionados)`; };
  A.createSeason = async (e) => {
    e.preventDefault(); const form = e.target; const f = new FormData(form);
    const two = f.get('mode') === 'two'; const t1 = f.getAll('t1'), t2 = two ? f.getAll('t2') : [];
    if (t1.length < 2) return toast('Elegí al menos 2 equipos para la primera división', 'error');
    if (f.get('cup_enabled') && t1.length + t2.length !== 16) return toast('La UML Cup con grupos necesita 16 equipos. Podés crear la temporada sin copa si estás haciendo una prueba menor.', 'error');
    if (two && t2.length < 2) return toast('Elegí al menos 2 equipos para la segunda división', 'error');
    if (t1.some((id) => t2.includes(id))) return toast('Un club no puede estar en las dos divisiones', 'error');
    const config = { budget_tier1: +f.get('budget_tier1'), budget_tier2: +f.get('budget_tier2'), tv_tier1: +f.get('tv_tier1'), tv_tier2: +f.get('tv_tier2'), ticket_price: +f.get('ticket_price'), fairplay_fine: +f.get('fairplay_fine'), gym_cost: +f.get('gym_cost'), squad_limit: +f.get('squad_limit') };
    try {
      const season = await q(sb().from('seasons').insert({ name: f.get('name'), mode: f.get('mode'), config, created_by: S.user.id, market_label: 'Mercado de inicio de temporada' }).select().single());
      const base = { season_id: season.id, status: 'draft', points_win: +f.get('points_win') || 3, points_draw: +f.get('points_draw') || 1, promote_direct: 0, relegate_direct: 0, promotion_slots: 0 };
      const comps = [{ ...base, kind: 'league', tier: 1, name: f.get('league1_name'), format: { rounds: f.get('league1_rounds') }, relegate_direct: two ? +f.get('relegate_direct') : 0, promotion_slots: two ? +f.get('promotion_slots') : 0, sort_order: 1 }];
      if (two) comps.push({ ...base, kind: 'league', tier: 2, name: f.get('league2_name'), format: { rounds: f.get('league2_rounds') }, promote_direct: +f.get('promote_direct'), promotion_slots: +f.get('promotion_slots'), sort_order: 2 });
      if (f.get('cup_enabled')) comps.push({ ...base, kind: 'cup', tier: 1, name: f.get('cup_name'), format: { groups: true, legs: 1, penalties: true, extra_time: true, neutral_knockout: true }, sort_order: 3 });
      if (f.get('supercup_enabled')) comps.push({ ...base, kind: 'supercup', tier: 1, name: 'UML Supercup', format: { legs: 1, penalties: true }, sort_order: 4 });
      const created = await q(sb().from('competitions').insert(comps).select());
      await q(sb().from('season_teams').insert([...t1.map((id) => ({ season_id: season.id, club_id: id, tier: 1 })), ...t2.map((id) => ({ season_id: season.id, club_id: id, tier: 2 }))]));
      const ct = [];
      created.forEach((c) => { if (c.kind === 'league') (c.tier === 1 ? t1 : t2).forEach((id) => ct.push({ competition_id: c.id, club_id: id })); if (c.kind === 'cup') [...t1, ...t2].forEach((id) => ct.push({ competition_id: c.id, club_id: id })); });
      await q(sb().from('competition_teams').insert(ct));
      toast('Temporada creada. Asigná DTs y generá los fixtures desde Admin.', 'ok'); location.hash = `#/s/${season.id}/admin`;
    } catch (x) { err(x); }
  };

  // ================= PANEL ADMIN =================
  let tab = 'temporada';
  A.adminTab = (k) => { tab = k; U.route(); };
  register('admin', async () => {
    if (!guard()) return;
    if (S.season.historical) return ($('#app').innerHTML = pageHead('Administración', esc(S.season.name)) + '<div class="empty">Esta temporada pertenece a una etapa archivada. Su historial se conserva para consulta.</div>');
    await loadProfiles();
    const tabs = [['temporada', 'Temporada'], ['clubes', 'Clubes y DTs'], ['jugadores', 'Jugadores'], ['competencias', 'Competencias'], ['partidos', 'Partidos'], ['sanciones', 'Sanciones'], ['usuarios', 'Usuarios'], ['auditoria', 'Auditoría'], ['sponsors', 'Sponsors']];
    const body = await ({ temporada: tabSeason, clubes: tabClubs, jugadores: tabPlayers, competencias: tabComps, partidos: tabMatches, sanciones: tabSanctions, usuarios: tabUsers, auditoria: tabAudit, sponsors: U.sponsorAdmin }[tab])();
    $('#app').innerHTML = pageHead('Administración', esc(S.season.name) + ' ' + statusBadge(S.season.status)) + `<div class="tabs">${tabs.map(([k, v]) => `<button class="${k === tab ? 'active' : ''}" onclick="A.adminTab('${k}')">${v}</button>`).join('')}</div>${body}`;
  });

  // ---- Temporada ----
  async function tabSeason() {
    const s = S.season; const c = cfg();
    const num = (k, label) => `<div><label>${label}</label><input name="${k}" type="number" step="any" value="${c[k]}"></div>`;
    const occ = (k, label) => `<div><label>${label}</label><input name="occ_${k}" type="number" step="0.05" min="0" max="1" value="${c.occupancy[k]}"></div>`;
    const mul = (k, label) => `<div><label>${label}</label><input name="mul_${k}" type="number" step="0.05" min="0" value="${c.multipliers[k]}"></div>`;
    return `<div class="grid c2">
      <div class="card"><h3>Estado</h3>
        ${s.status === 'draft' ? `<p>La temporada está en preparación. Al iniciarla se conserva el saldo final de cada equipo y se acredita la TV según su división actual. El presupuesto inicial se entrega únicamente en la primera temporada de la etapa. Los sponsors elegidos se pagan al inicio. Antes, asigná los DTs y cargá los planteles.</p><button class="navy" onclick="A.startSeason()">Iniciar temporada</button>` : ''}
        ${s.status === 'active' ? `<p><b>Mercado:</b> <span class="badge ${s.market_open ? 'green' : 'red'}">${s.market_open ? 'Abierto' : 'Cerrado'}</span> <span class="muted small">${esc(s.market_label || '')}</span></p>
          <div class="row mb">${s.market_open ? `<button class="danger" onclick="A.setMarket(false)">Cerrar mercado</button>` : `<button onclick="A.setMarket(true)">Abrir mercado (ejecuta ${S.queue.length} en espera)</button>`}</div>
          <div class="hr"></div><p class="small muted">Cerrar la temporada: liquida bonus y devoluciones de sponsors, cobra la multa de fair play, devuelve las cesiones, suma un año a todos los jugadores y retira a los que llegan a ${c.retire_age}. No se puede deshacer.</p><button class="danger" onclick="A.closeSeason()">Cerrar temporada</button>` : ''}
        ${s.status === 'closed' ? `<p>Temporada cerrada el ${date(s.closed_at)}.</p><a class="btn" href="#/nueva-temporada">Crear la temporada siguiente</a>` : ''}
        ${retiringSoon()}
        ${s.status !== 'closed' ? '<div class="hr"></div><p class="small muted">Eliminar esta temporada borra sus competencias, resultados y movimientos. No se puede deshacer.</p><button class="danger" onclick="A.deleteSeasonModal()">Eliminar temporada</button>' : ''}
      </div>
      <div class="card"><h3>Configuración</h3><form onsubmit="A.saveSeasonConfig(event)">
        <div class="fields"><div><label>Nombre</label><input name="name" value="${esc(s.name)}"></div></div>
        <div class="kicker mb">Economía</div><div class="fields">${num('budget_tier1', 'Inicial Premier (solo temporada 1)')}${num('budget_tier2', 'Inicial Championship (solo temporada 1)')}${num('tv_tier1', 'TV Premier')}${num('tv_tier2', 'TV Championship')}${num('ticket_price', 'Precio entrada')}${num('fairplay_fine', 'Multa fair play')}${num('gym_cost', 'Gimnasio')}${num('squad_limit', 'Tope plantel')}${num('retire_age', 'Edad de retiro')}</div>
        <div class="kicker mb">Ocupación del estadio</div><div class="fields">${occ('top4', '1° a 4°')}${occ('top8', '5° a 8°')}${occ('upper_half', 'Mitad superior')}${occ('lower_half', 'Mitad inferior')}${occ('relegation', 'Zona de descenso')}${num('relegation_zone', 'Equipos en zona descenso')}</div>
        <div class="kicker mb">Multiplicadores</div><div class="fields">${mul('league', 'Liga')}${mul('derby', 'Clásico')}${mul('cup_early', 'Copa inicial')}${mul('cup_qf', 'Cuartos')}${mul('cup_sf', 'Semifinal')}${mul('promotion', 'Promoción')}${mul('final', 'Final')}</div>
        <div class="kicker mb">Sanciones (partidos)</div><div class="fields">${num('sanction_red', 'Roja directa')}${num('sanction_second_yellow', 'Doble amarilla')}${num('sanction_yellows_per_ban', 'Amarillas por suspensión')}${num('sanction_yellow_ban', 'Partidos por acumulación')}${num('injury_minor', 'Lesión leve')}${num('injury_major', 'Lesión grave')}${num('yellow_points', 'Puntos fair play amarilla')}${num('red_points', 'Puntos fair play roja')}</div>
        <button type="submit">Guardar configuración</button></form></div></div>`;
  }
  function retiringSoon() { const age = cfg().retire_age - 1; const list = S.players.filter((p) => p.club_id && p.age >= age); return list.length ? `<div class="alert warn mt"><b>Se retiran al cerrar la temporada:</b> ${list.map((p) => `${esc(p.name)} (${esc(club(p.club_id)?.name)})`).join(', ')}</div>` : ''; }
  A.saveSeasonConfig = async (e) => {
    e.preventDefault(); const f = U.formData(e.target); const c = cfg(); const nc = { ...c, occupancy: { ...c.occupancy }, multipliers: { ...c.multipliers } };
    Object.entries(f).forEach(([k, v]) => { if (k === 'name') return; if (k.startsWith('occ_')) nc.occupancy[k.slice(4)] = +v; else if (k.startsWith('mul_')) nc.multipliers[k.slice(4)] = +v; else nc[k] = +v; });
    try { await q(sb().from('seasons').update({ name: f.name, config: nc }).eq('id', S.sid)); toast('Configuración guardada', 'ok'); refresh(); } catch (x) { err(x); }
  };
  A.startSeason = () => U.confirmDo(`¿Iniciar la temporada para ${S.seasonTeams.length} equipos? Se conserva el saldo anterior y se acreditan la TV y los sponsors elegidos. El presupuesto inicial solo se entrega en la primera temporada de la etapa.`, async () => { await rpc('start_season', { p_season: S.sid }); toast('Temporada iniciada', 'ok'); refresh(); });
  A.setMarket = (open) => {
    const label = open ? prompt('Nombre de este mercado (se muestra a todos):', S.queue.length ? 'Mercado de mitad de temporada' : 'Mercado abierto') : prompt('Mensaje mientras esté cerrado:', 'Mercado cerrado · próximo: mitad de temporada');
    if (label === null) return;
    U.confirmDo(open ? `¿Abrir el mercado? Se ejecutan ${S.queue.length} operaciones en espera.` : '¿Cerrar el mercado? Las negociaciones siguen, pero los pases quedan en espera.', async () => { const n = await rpc('set_market', { p_season: S.sid, p_open: open, p_label: label }); toast(open ? `Mercado abierto · ${n} operaciones ejecutadas` : 'Mercado cerrado', 'ok'); refresh(); });
  };
  A.closeSeason = () => { if (prompt('Escribí CERRAR para confirmar el cierre de temporada:') !== 'CERRAR') return; (async () => { try { const r = await rpc('close_season', { p_season: S.sid }); toast(`Temporada cerrada. Retirados: ${r.retired}. Multa: ${r.fairplay_fined || 'nadie'}`, 'ok'); refresh(); } catch (x) { err(x); } })(); };

  // ---- Clubes y DTs ----
  async function tabClubs() {
    const all = await q(sb().from('clubs').select('*').eq('archived', false).order('name'));
    return `<div class="card"><div class="row between"><h3 style="margin:0">Clubes en la temporada (${S.seasonTeams.length})</h3><button class="sm" onclick="A.clubModal()">+ Nuevo club</button></div>
      <div class="table-wrap mt"><table><thead><tr><th>Club</th><th>División</th><th>DT</th><th class="num">Presupuesto</th><th class="num">Plantel</th><th></th></tr></thead><tbody>
      ${S.seasonTeams.map((t) => { const c = club(t.club_id); return `<tr><td>${clubLabel(c.id)}</td><td>${S.season.mode === 'two' ? `<select style="width:auto" onchange="A.setTier('${t.id}', this.value)">${opt(1, 'Premier', t.tier)}${opt(2, 'Championship', t.tier)}</select>` : '—'}</td>
        <td><select style="width:auto;max-width:170px" onchange="A.assignManager('${t.id}', this.value)"><option value="">— Sin DT —</option>${S.profiles.map((p) => opt(p.id, p.username, t.manager_id)).join('')}</select></td>
        <td class="num money plain">${fmtM(t.budget)}${Number(t.reserved) ? `<div class="tiny muted">res. ${fmtM(t.reserved)}</div>` : ''}</td><td class="num">${squad(c.id).length}</td>
        <td class="right"><button class="xs secondary" onclick="A.clubModal('${c.id}')">Editar</button> <button class="xs secondary" onclick="A.budgetModal('${c.id}')">$ Ajustar</button> ${S.season.status === 'draft' ? `<button class="xs danger" onclick="A.removeFromSeason('${t.id}')">Quitar</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">Sin clubes en la temporada.</td></tr>'}</tbody></table></div></div>
      ${clubCatalog(all, true)}`;
  }
  function clubCatalog(all, seasonal) {
    const draft = seasonal && S.season.status === 'draft';
    return `<div class="card"><div class="row between"><h3 style="margin:0">Todos los clubes (${all.length})</h3>${!seasonal ? '<button class="sm" onclick="A.clubModal()">+ Nuevo club</button>' : ''}</div><p class="muted small">Los clubes son permanentes y se usan temporada tras temporada. ${draft ? 'Podés sumar clubes a esta temporada mientras esté en preparación.' : ''}</p>
      <div class="table-wrap"><table><tbody>${all.map((c) => `<tr><td><span class="club">${crest(c)}${esc(c.name)}</span></td><td class="muted small">${esc(c.stadium_name || '')} · ${Number(c.stadium_capacity).toLocaleString('es-AR')}</td><td class="right">${seasonal && S.seasonTeams.some((t) => t.club_id === c.id) ? '<span class="badge green">En temporada</span>' : (draft ? `<button class="xs" onclick="A.addToSeason('${c.id}')">Sumar a la temporada</button>` : '')} ${!c.archived ? `<button class="xs secondary" onclick="A.clubModal('${c.id}')">Editar</button>` : ''} ${!seasonal ? (c.archived ? `<button class="xs secondary" onclick="A.manageClubModal('${c.id}','restore')">Restaurar</button>` : `<button class="xs secondary" onclick="A.manageClubModal('${c.id}','archive')">Archivar</button>`) + ` <button class="xs danger" onclick="A.manageClubModal('${c.id}','delete')">Eliminar</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">${!seasonal && showArchivedClubs ? 'No hay clubes archivados.' : 'Todavía no hay clubes. Creá el primero con + Nuevo club.'}</td></tr>`}</tbody></table></div></div>`;
  }
  A.clubModal = async (id) => {
    if (!guard()) return;
    const c = id ? (club(id) || (await q(sb().from('clubs').select('*').eq('id', id).single()))) : {};
    modal(`<h2>${id ? 'Editar club' : 'Nuevo club'}</h2><form onsubmit="A.saveClub(event,'${id || ''}')">
      <div class="fields"><div><label>Nombre</label><input name="name" value="${esc(c.name || '')}" required></div><div><label>Abreviatura</label><input name="short_name" maxlength="4" value="${esc(c.short_name || '')}"></div><div><label>Color</label><input name="color" type="color" value="${esc(c.color || '#1F5FC4')}"></div></div>
      <div class="fields"><div><label>Estadio</label><input name="stadium_name" value="${esc(c.stadium_name || '')}"></div><div><label>Capacidad real</label><input name="stadium_capacity" type="number" min="1000" value="${c.stadium_capacity || 40000}" required></div></div>
      <div class="field"><label>Foto del estadio (JPG, PNG o WebP, hasta 5 MB)</label><input name="stadium_file" type="file" accept="image/jpeg,image/png,image/webp"></div><div class="field"><label>O enlace de foto del estadio</label><input name="stadium_photo_url" type="url" value="${esc(c.stadium_photo_url || '')}"></div>
      <div class="field"><label>Escudo (URL de imagen PNG)</label><input name="crest_url" type="url" value="${esc(c.crest_url || '')}" placeholder="https://…"><div class="help">La subida directa de escudos llega en la etapa de imágenes; por ahora pegá un link.</div></div>
      ${!id && editingSeasonClubs() && S.season.status === 'draft' ? `<label class="check mb"><input type="checkbox" name="add" checked> Sumar a esta temporada ${S.season.mode === 'two' ? '<select name="tier" style="width:auto;margin-left:8px"><option value="1">Premier</option><option value="2">Championship</option></select>' : ''}</label>` : ''}
      <div class="row"><button type="submit">Guardar</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`);
  };
  A.saveClub = async (e, id) => {
    e.preventDefault(); if (!guard()) return; const f = U.formData(e.target);
    const rec = { name: f.name.trim(), short_name: f.short_name || null, color: f.color, stadium_name: f.stadium_name || null, stadium_capacity: +f.stadium_capacity, crest_url: f.crest_url || null };
    try {
      const image = await U.uploadMedia(f.stadium_file, 'stadiums');
      rec.stadium_photo_url = image || f.stadium_photo_url || null;
      if (id) await q(sb().from('clubs').update(rec).eq('id', id));
      else { const c = await q(sb().from('clubs').insert(rec).select().single()); if (f.add && editingSeasonClubs() && S.season.status === 'draft') await A.addToSeason(c.id, +(f.tier || 1), true); }
      closeModal(); toast('Club guardado', 'ok'); await (editingSeasonClubs() ? refresh() : U.route());
    } catch (x) { err(x); }
  };
  A.addToSeason = async (clubId, tier = 1, silent = false) => {
    try {
      await q(sb().from('season_teams').insert({ season_id: S.sid, club_id: clubId, tier }));
      const ct = S.competitions.filter((c) => (c.kind === 'league' && c.tier === tier) || c.kind === 'cup').map((c) => ({ competition_id: c.id, club_id: clubId }));
      if (ct.length) await q(sb().from('competition_teams').insert(ct));
      if (!silent) { toast('Club sumado', 'ok'); refresh(); }
    } catch (x) { err(x); }
  };
  A.removeFromSeason = (stId) => U.confirmDo('¿Quitar el club de esta temporada?', async () => { const t = S.seasonTeams.find((x) => x.id === stId); await q(sb().from('competition_teams').delete().eq('club_id', t.club_id).in('competition_id', S.competitions.map((c) => c.id))); await q(sb().from('season_teams').delete().eq('id', stId)); refresh(); });
  A.setTier = async (stId, tier) => {
    const t = S.seasonTeams.find((x) => x.id === stId);
    try { await q(sb().from('season_teams').update({ tier: +tier }).eq('id', stId)); const leagues = S.competitions.filter((c) => c.kind === 'league'); await q(sb().from('competition_teams').delete().eq('club_id', t.club_id).in('competition_id', leagues.map((c) => c.id))); const L = leagues.find((c) => c.tier === +tier); if (L) await q(sb().from('competition_teams').insert({ competition_id: L.id, club_id: t.club_id })); toast('División cambiada', 'ok'); refresh(); } catch (x) { err(x); }
  };
  A.assignManager = async (stId, uid) => { try { await q(sb().from('season_teams').update({ manager_id: uid || null }).eq('id', stId)); toast('DT asignado', 'ok'); refresh(); } catch (x) { err(x); } };
  A.budgetModal = (clubId) => { const t = st(clubId); modal(`<h2>Ajustar presupuesto</h2><p>${clubLabel(clubId, false)} · actual <span class="money">${fmt(t.budget)}</span></p><form onsubmit="A.adjustBudget(event,'${clubId}')"><div class="field"><label>Monto (negativo para descontar)</label><input name="amount" type="number" required></div><div class="field"><label>Motivo (queda en el libro de caja)</label><input name="desc" required placeholder="Premio, multa, corrección…"></div><div class="row"><button type="submit">Aplicar</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`); };
  A.adjustBudget = async (e, clubId) => { e.preventDefault(); const f = U.formData(e.target); try { await rpc('adjust_budget', { p_season: S.sid, p_club: clubId, p_amount: +f.amount, p_desc: f.desc }); closeModal(); toast('Presupuesto actualizado', 'ok'); refresh(); } catch (x) { err(x); } };

  // ---- Jugadores ----
  let pFilter = '';
  A.pFilter = (v) => { pFilter = v; U.route(); };
  async function tabPlayers() {
    const list = S.players.filter((p) => !pFilter || p.club_id === pFilter || (pFilter === 'free' && !p.club_id));
    const teamOpts = (sel) => `<option value="">— Agente libre —</option>${S.seasonTeams.map((t) => opt(t.club_id, club(t.club_id)?.name, sel)).join('')}`;
    return `<div class="grid c2">
      <div class="card"><h3>Agregar jugador</h3><form onsubmit="A.addPlayer(event)">
        <div class="field"><label>Nombre</label><input name="name" required></div>
        <div class="fields"><div><label>Posición</label><select name="position">${Object.entries(POS).map(([k, v]) => opt(k, `${k} · ${v}`, 'MC')).join('')}</select></div><div><label>Edad</label><input name="age" type="number" min="15" max="45" value="25" required></div><div><label>Media</label><input name="overall" type="number" min="1" max="99"></div><div><label>Dorsal</label><input name="number" type="number" min="1" max="99"></div></div>
        <div class="fields"><div><label>Valor</label><input name="value" type="number" min="0" value="1000000"></div><div><label>Equipo</label><select name="club_id">${teamOpts('')}</select></div></div>
        <button type="submit">Agregar</button></form></div>
      <div class="card"><h3>Importar varios</h3><p class="muted small">Un jugador por línea: <code>Nombre, POS, Edad, Media, Valor, Dorsal</code>. POS: ${Object.keys(POS).join(' ')}. Ej: <code>Lautaro Martínez, DC, 29, 88, 60000000, 10</code></p>
        <form onsubmit="A.importPlayers(event)"><div class="field"><textarea name="text" rows="7"></textarea></div><div class="field"><label>Asignar a</label><select name="club_id">${teamOpts('')}</select></div><button type="submit">Importar</button></form></div></div>
      <div class="card"><div class="row between"><h3 style="margin:0">Jugadores (${list.length})</h3><select style="width:auto" onchange="A.pFilter(this.value)"><option value="">Todos</option><option value="free" ${pFilter === 'free' ? 'selected' : ''}>Agentes libres</option>${S.seasonTeams.map((t) => opt(t.club_id, club(t.club_id)?.name, pFilter)).join('')}</select></div>
      <div class="table-wrap mt"><table><thead><tr><th>Jugador</th><th>Pos</th><th>Equipo</th><th class="num">Edad</th><th class="num">Media</th><th class="num">#</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr><td><b>${esc(p.name)}</b>${p.loan_from_club_id ? ' <span class="badge amber">cedido</span>' : ''}</td><td><span class="badge">${p.position}</span></td><td><select style="width:auto;max-width:150px" onchange="A.movePlayer('${p.id}', this.value)">${teamOpts(p.club_id)}</select></td><td class="num">${p.age}</td><td class="num">${p.overall ?? '-'}</td><td class="num">${p.number ?? ''}</td><td class="right"><button class="xs secondary" onclick="A.editPlayerModal('${p.id}')">Editar</button> <button class="xs danger" onclick="A.deletePlayer('${p.id}')">✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin jugadores.</td></tr>'}</tbody></table></div></div>`;
  }
  A.addPlayer = async (e) => { e.preventDefault(); const f = U.formData(e.target); try { await q(sb().from('players').insert({ name: f.name.trim(), position: f.position, age: +f.age, overall: f.overall ? +f.overall : null, number: f.number ? +f.number : null, value: +f.value || 0, club_id: f.club_id || null })); e.target.querySelector('[name=name]').value = ''; toast('Jugador agregado', 'ok'); refresh(); } catch (x) { err(x); } };
  A.importPlayers = async (e) => {
    e.preventDefault(); const f = U.formData(e.target);
    const rows = f.text.split('\n').map((l) => l.split(/[,;\t]/).map((x) => x.trim())).filter((r) => r[0]);
    if (!rows.length) return toast('Nada para importar', 'error');
    const recs = rows.map((r) => ({ name: r[0], position: POS[(r[1] || '').toUpperCase()] ? r[1].toUpperCase() : 'MC', age: +r[2] || 25, overall: r[3] ? +r[3] || null : null, value: +r[4] || 0, number: r[5] ? +r[5] || null : null, club_id: f.club_id || null }));
    try { await q(sb().from('players').insert(recs)); toast(`${recs.length} jugadores importados`, 'ok'); refresh(); } catch (x) { err(x); }
  };
  A.movePlayer = async (id, clubId) => { try { await q(sb().from('players').update({ club_id: clubId || null, loan_from_club_id: null }).eq('id', id)); toast('Jugador movido', 'ok'); refresh(); } catch (x) { err(x); } };
  A.editPlayerModal = (id) => {
    const p = player(id);
    modal(`<h2>Editar jugador</h2><form onsubmit="A.savePlayer(event,'${id}')">
      <div class="field"><label>Nombre</label><input name="name" value="${esc(p.name)}" required></div>
      <div class="fields"><div><label>Posición</label><select name="position">${Object.entries(POS).map(([k, v]) => opt(k, `${k} · ${v}`, p.position)).join('')}</select></div><div><label>Edad</label><input name="age" type="number" value="${p.age}"></div><div><label>Media</label><input name="overall" type="number" value="${p.overall ?? ''}"></div><div><label>Dorsal</label><input name="number" type="number" value="${p.number ?? ''}"></div></div>
      <div class="field"><label>Valor</label><input name="value" type="number" min="0" value="${p.value}" required></div>
      <div class="field"><label>Foto (URL)</label><input name="photo_url" type="url" value="${esc(p.photo_url || '')}"></div>
      <div class="row"><button type="submit">Guardar</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`);
  };
  A.savePlayer = async (e, id) => { e.preventDefault(); const f = U.formData(e.target); try { await q(sb().from('players').update({ name: f.name, position: f.position, age: +f.age, overall: f.overall ? +f.overall : null, number: f.number ? +f.number : null, value: +f.value || 0, photo_url: f.photo_url || null }).eq('id', id)); closeModal(); refresh(); } catch (x) { err(x); } };
  A.deletePlayer = (id) => U.confirmDo('¿Eliminar al jugador definitivamente?', async () => { await q(sb().from('players').delete().eq('id', id)); refresh(); });

  // ---- Competencias ----
  async function tabComps() {
    return S.competitions.map((c) => {
      const ms = S.matches.filter((m) => m.competition_id === c.id); const pending = ms.filter((m) => m.status === 'pending').length; const teams = compClubs(c.id);
      let actions = '';
      if (c.kind === 'league') {
        if (c.status === 'draft') actions = `<button onclick="A.genLeague('${c.id}')" ${teams.length < 2 ? 'disabled' : ''}>Generar fixture (${teams.length} equipos)</button>`;
        else if (c.status === 'active') actions = `<span class="muted small">${ms.length - pending}/${ms.length} jugados</span> ${pending === 0 ? `<button onclick="A.finishLeague('${c.id}')">Finalizar liga y definir campeón</button>` : ''} <button class="danger sm" onclick="A.resetComp('${c.id}')">Borrar fixture</button>`;
        else actions = `<span class="badge navy">Campeón: ${esc(club(c.champion_club_id)?.name || '?')}</span>`;
        if (c.status === 'finished' && S.season.mode === 'two' && c.tier === 1 && c.promotion_slots > 0 && !S.competitions.some((x) => x.kind === 'promotion')) {
          const L2 = S.competitions.find((x) => x.kind === 'league' && x.tier === 2);
          if (L2?.status === 'finished') actions += ` <button class="navy" onclick="A.createPromotion()">Crear promoción</button>`;
        }
      } else if (c.kind === 'cup') {
        if (c.status === 'finished') actions = `<span class="badge navy">Campeón: ${esc(club(c.champion_club_id)?.name || '?')}</span>`;
        else actions = `${ms.length ? `<span class="muted small">Ronda ${Math.max(...ms.map((m) => m.round))} · ${pending} pendientes</span>` : `<span class="muted small">${teams.length} equipos</span>`} <button onclick="A.cupRound('${c.id}')" ${pending > 0 ? 'disabled' : ''}>${ms.length ? 'Generar siguiente ronda' : 'Sortear primera ronda'}</button>${ms.length ? ` <button class="danger sm" onclick="A.resetComp('${c.id}')">Borrar llaves</button>` : ''}`;
        if (!ms.length && c.status !== 'finished') actions += ` <button class="sm secondary" onclick="A.cupGroups('${c.id}')" ${teams.length!==16?'disabled':''}>Sortear 4 grupos (16 equipos)</button>`;
        if (c.format?.groups && c.status !== 'finished' && !ms.some((m)=>m.stage!=='group')) actions += `<form class="row mt" onsubmit="A.neutralCapacity(event,'${c.id}')"><label>Capacidad del estadio neutral <input name="capacity" type="number" min="1" max="1000000" required value="${c.format.neutral_capacity||''}"></label><button type="submit" class="sm secondary">Guardar capacidad</button></form>`;
      } else if (c.kind === 'supercup') {
        if (c.status === 'finished') actions = `<span class="badge navy">Campeón: ${esc(club(c.champion_club_id)?.name || '?')}</span>`;
        else if (ms.length) actions = `<span class="muted small">${pending ? 'Partido pendiente' : 'Jugado'}</span> ${pending === 0 ? `<button onclick="A.cupRound('${c.id}')">Definir campeón</button>` : ''}`;
        else actions = `<button onclick="A.setupSupercup('${c.id}')">Armar Supercopa con los campeones</button>`;
      } else if (c.kind === 'promotion') actions = `<span class="muted small">${ms.length - pending}/${ms.length} jugados</span>${pending === 0 && ms.length ? ` <button onclick="A.finishPromotion('${c.id}')">Resolver promoción</button>` : ''}`;
      if (c.format?.cancelled) actions='<span class="badge">Competencia anulada</span>';
      else if (c.status!=='finished') actions+=` <button class="xs secondary" onclick="A.cancelCompetition('${c.id}')">Anular competencia</button>`;
      return `<div class="card"><div class="row between"><div><h3 style="margin:0">${esc(c.name)} ${statusBadge(c.status)}</h3><div class="muted small">${c.kind === 'league' ? (c.format?.rounds === 'single' ? 'Una rueda' : 'Ida y vuelta') + (c.relegate_direct ? ` · descienden ${c.relegate_direct}` : '') + (c.promote_direct ? ` · ascienden ${c.promote_direct}` : '') + (c.promotion_slots ? ` · promoción ${c.promotion_slots}` : '') : c.kind === 'cup' ? `${c.format?.legs === 2 ? 'Ida y vuelta' : 'Partido único'} · penales` : ''}</div></div><div class="row">${actions}</div></div>${U.competitionIdentityForm(c)}</div>`;
    }).join('') + `<div class="card"><h3>Clásicos</h3><p class="muted small">Marcá rivalidades: esos partidos llevan insignia y pagan entradas con multiplicador de clásico.</p>${derbiesPanel()}</div>`;
  }
  function derbiesPanel() {
    const derbies = S.matches.filter((m) => m.is_derby); const pairs = {}; derbies.forEach((m) => { const k = [m.home_club_id, m.away_club_id].sort().join('|'); pairs[k] = true; });
    const sel = `<select name="a" style="width:auto">${S.seasonTeams.map((t) => opt(t.club_id, club(t.club_id)?.name)).join('')}</select> vs <select name="b" style="width:auto">${S.seasonTeams.map((t) => opt(t.club_id, club(t.club_id)?.name)).join('')}</select>`;
    return `<form class="row mb" onsubmit="A.setDerby(event, true)">${sel}<button type="submit" class="sm">Marcar clásico</button></form>${Object.keys(pairs).map((k) => { const [a, b] = k.split('|'); return `<div class="list-item"><span>${clubLabel(a, false)} vs ${clubLabel(b, false)}</span><button class="xs secondary" onclick="A.unsetDerby('${a}','${b}')">Quitar</button></div>`; }).join('') || '<div class="muted small">Sin clásicos marcados.</div>'}`;
  }
  A.setDerby = async (e) => { e.preventDefault(); const f = U.formData(e.target); if (f.a === f.b) return; try { await q(sb().from('matches').update({ is_derby: true }).in('competition_id', S.competitions.map((c) => c.id)).or(`and(home_club_id.eq.${f.a},away_club_id.eq.${f.b}),and(home_club_id.eq.${f.b},away_club_id.eq.${f.a})`)); toast('Clásico marcado (en los partidos ya generados)', 'ok'); refresh(); } catch (x) { err(x); } };
  A.unsetDerby = async (a, b) => { try { await q(sb().from('matches').update({ is_derby: false }).in('competition_id', S.competitions.map((c) => c.id)).or(`and(home_club_id.eq.${a},away_club_id.eq.${b}),and(home_club_id.eq.${b},away_club_id.eq.${a})`)); refresh(); } catch (x) { err(x); } };
  A.genLeague = (cid) => U.confirmDo('¿Generar el fixture? Se sortea el calendario.', async () => { const n = await rpc('generate_league_fixture', { p_competition: cid }); toast(`Fixture generado: ${n} fechas`, 'ok'); refresh(); });
  A.cupRound = (cid) => U.confirmDo('¿Generar la siguiente ronda?', async () => { const n = await rpc('generate_cup_round', { p_competition: cid }); toast(n ? `${n} llave(s) generadas` : 'Competencia finalizada: campeón definido', 'ok'); refresh(); });
  A.resetComp = (cid) => { if (prompt('Se borran TODOS los partidos y resultados de esta competencia. Escribí BORRAR:') !== 'BORRAR') return; (async () => { try { await q(sb().from('matches').delete().eq('competition_id', cid)); await q(sb().from('competitions').update({ status: 'draft', champion_club_id: null, runnerup_club_id: null }).eq('id', cid)); await q(sb().from('competition_teams').update({ seed: null, group_name: null }).eq('competition_id', cid)); refresh(); } catch (x) { err(x); } })(); };
  A.finishLeague = (cid) => U.confirmDo('¿Finalizar la liga? Se define campeón y subcampeón por la tabla.', async () => { const rows = standings(cid); await q(sb().from('competitions').update({ status: 'finished', champion_club_id: rows[0]?.club_id, runnerup_club_id: rows[1]?.club_id }).eq('id', cid)); toast(`Campeón: ${club(rows[0]?.club_id)?.name}`, 'ok'); refresh(); });
  A.setupSupercup = (cid) => U.confirmDo('¿Armar la Supercopa con el campeón de liga y el campeón de copa?', async () => {
    const L = S.competitions.find((c) => c.kind === 'league' && c.tier === 1), C = S.competitions.find((c) => c.kind === 'cup');
    if (L?.status !== 'finished' || C?.status !== 'finished') throw new Error('La liga y la copa tienen que estar finalizadas.');
    let a = L.champion_club_id, b = C.champion_club_id; if (a === b) b = L.runnerup_club_id;
    await q(sb().from('competition_teams').delete().eq('competition_id', cid));
    await q(sb().from('competition_teams').insert([{ competition_id: cid, club_id: a, seed: 1 }, { competition_id: cid, club_id: b, seed: 2 }]));
    await rpc('generate_cup_round', { p_competition: cid }); toast('Supercopa armada', 'ok'); refresh();
  });
  A.createPromotion = () => U.confirmDo('¿Crear la promoción (ida y vuelta, ida en cancha del equipo de Championship)?', async () => {
    const L1 = S.competitions.find((c) => c.kind === 'league' && c.tier === 1), L2 = S.competitions.find((c) => c.kind === 'league' && c.tier === 2);
    const s1 = standings(L1.id), s2 = standings(L2.id); const n = L1.promotion_slots;
    if (L1.relegate_direct + n >= s1.length || L2.promote_direct + n > s2.length) throw new Error('Los cupos de descenso/ascenso y promoción superan la cantidad de equipos. Ajustá la configuración de las ligas.');
    const fromTop = s1.slice(s1.length - L1.relegate_direct - n, s1.length - L1.relegate_direct).map((r) => r.club_id);
    const fromBottom = s2.slice(L2.promote_direct, L2.promote_direct + n).map((r) => r.club_id);
    if (fromTop.length !== fromBottom.length || !fromTop.length) throw new Error('No se pudieron determinar los equipos de promoción.');
    const comp = await q(sb().from('competitions').insert({ season_id: S.sid, kind: 'promotion', tier: 1, name: 'Promoción', status: 'active', format: { legs: 2, penalties: true }, sort_order: 9 }).select().single());
    await q(sb().from('competition_teams').insert([...fromTop, ...fromBottom].map((id) => ({ competition_id: comp.id, club_id: id }))));
    const ms = [];
    fromTop.forEach((top, i) => { const bot = fromBottom[fromBottom.length - 1 - i]; const tie = crypto.randomUUID(); ms.push({ competition_id: comp.id, round: 1, stage: 'promotion', leg: 1, tie_id: tie, home_club_id: bot, away_club_id: top }, { competition_id: comp.id, round: 1, stage: 'promotion', leg: 2, tie_id: tie, home_club_id: top, away_club_id: bot }); });
    await q(sb().from('matches').insert(ms)); toast('Promoción creada', 'ok'); refresh();
  });
  A.finishPromotion = (cid) => U.confirmDo('¿Resolver la promoción? Se registran ganadores (el cambio de división se aplica al crear la temporada siguiente).', async () => {
    const ms = S.matches.filter((m) => m.competition_id === cid); const ties = [...new Set(ms.map((m) => m.tie_id))];
    const winners = ties.map((t) => tieWinner(t)); if (winners.some((w) => !w)) throw new Error('Hay llaves empatadas sin penales cargados.');
    const c = comp(cid);
    await q(sb().from('competitions').update({ status: 'finished', champion_club_id: winners[0], format: { ...(c.format || {}), winners } }).eq('id', cid));
    toast('Ganadores: ' + winners.map((w) => club(w)?.name).join(', '), 'ok'); refresh();
  });

  // ---- Partidos ----
  let mComp = '';
  A.mComp = (v) => { mComp = v; U.route(); };
  async function tabMatches() {
    const c = comp(mComp) || S.competitions[0]; if (!c) return '<div class="empty">Sin competencias.</div>';
    const ms = S.matches.filter((m) => m.competition_id === c.id); const rounds = {}; ms.forEach((m) => (rounds[m.round] ||= []).push(m));
    const sims = S.profiles.filter((p) => p.is_simulator || p.is_admin);
    const simSel = (m) => `<select style="width:auto;max-width:150px" onchange="A.assignSim('${m.id}', this.value)"><option value="">— Simulador —</option>${sims.map((p) => opt(p.id, p.username, m.simulator_id)).join('')}</select>`;
    return `<div class="card"><div class="row between"><h3 style="margin:0">Partidos</h3><select style="width:auto" onchange="A.mComp(this.value)">${S.competitions.map((x) => opt(x.id, x.name, c.id)).join('')}</select></div>
      <p class="muted small mt">Asigná el simulador de cada partido o de toda una fecha. Un simulador puede cargar solo los partidos asignados; "Cerrar" impide que lo siga editando.</p>
      ${Object.keys(rounds).sort((a, b) => a - b).map((r) => `<div class="row between mt" style="border-top:1px solid var(--line2);padding-top:10px"><b>${c.kind === 'league' ? 'Fecha ' + r : STAGE[rounds[r][0].stage] || 'Ronda ' + r}</b><span class="row small">Toda la fecha: <select style="width:auto" onchange="A.assignSimRound('${c.id}', ${r}, this.value)"><option value="">— elegir —</option>${sims.map((p) => opt(p.id, p.username)).join('')}</select></span></div>
        <div class="table-wrap"><table><tbody>${rounds[r].map((m) => `<tr><td><a href="#/s/${S.sid}/partido/${m.id}" style="color:inherit">${esc(club(m.home_club_id)?.name)} vs ${esc(club(m.away_club_id)?.name)}</a>${m.leg === 2 ? ' <span class="muted tiny">vuelta</span>' : ''}${m.is_derby ? ' <span class="badge amber">clásico</span>' : ''}</td><td>${m.status === 'played' ? `<b>${m.home_goals}-${m.away_goals}</b>` : '<span class="muted">pendiente</span>'}</td><td>${simSel(m)}</td><td class="right"><button class="xs secondary" onclick="A.resultModal('${m.id}')">${m.status === 'played' ? 'Editar' : 'Cargar'}</button> ${m.status === 'played' ? `<button class="xs ${m.locked ? 'secondary' : 'navy'}" onclick="A.lockMatch('${m.id}', ${!m.locked})">${m.locked ? 'Reabrir' : 'Cerrar'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`).join('') || '<div class="empty">Sin partidos generados.</div>'}</div>`;
  }
  A.assignSim = async (mid, uid) => { try { await q(sb().from('matches').update({ simulator_id: uid || null }).eq('id', mid)); toast('Simulador asignado', 'ok'); refresh(); } catch (x) { err(x); } };
  A.assignSimRound = async (cid, round, uid) => { if (!uid) return; try { await q(sb().from('matches').update({ simulator_id: uid }).eq('competition_id', cid).eq('round', round)); toast('Simulador asignado a toda la fecha', 'ok'); refresh(); } catch (x) { err(x); } };
  A.lockMatch = async (mid, locked) => { try { await rpc('lock_match', { p_match: mid, p_locked: locked }); refresh(); } catch (x) { err(x); } };

  // ---- Sanciones ----
  async function tabSanctions() {
    return `<div class="card"><h3>Sanciones vigentes (${S.sanctions.length})</h3><div class="table-wrap"><table><thead><tr><th>Jugador</th><th>Equipo</th><th>Motivo</th><th>Alcance</th><th class="num">Faltan</th><th></th></tr></thead><tbody>${S.sanctions.map((s) => `<tr><td><b>${esc(s.player_name)}</b></td><td>${clubLabel(s.club_id)}</td><td>${SANC[s.type]} ${esc(s.note || '')}</td><td class="muted small">${s.competition_id ? esc(comp(s.competition_id)?.name) : 'Todas'}</td><td class="num b">${s.remaining}</td><td class="right"><button class="xs secondary" onclick="A.liftSanction('${s.id}')">Levantar</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin sanciones vigentes.</td></tr>'}</tbody></table></div></div>
      <div class="card"><h3>Sanción manual</h3><form class="row" onsubmit="A.addSanction(event)"><select name="player" style="flex:2;min-width:180px">${S.players.filter((p) => p.club_id).map((p) => opt(p.id, `${p.name} (${club(p.club_id)?.short_name || club(p.club_id)?.name})`)).join('')}</select><select name="comp" style="width:auto"><option value="">Todas las competencias</option>${S.competitions.map((c) => opt(c.id, c.name)).join('')}</select><input name="matches" type="number" min="1" value="1" style="width:80px"><input name="note" placeholder="Motivo" style="flex:1"><button type="submit">Aplicar</button></form></div>`;
  }
  A.liftSanction = (id) => U.confirmDo('¿Levantar la sanción?', async () => { await rpc('lift_sanction', { p_sanction: id }); refresh(); });
  A.addSanction = async (e) => { e.preventDefault(); const f = U.formData(e.target); try { await rpc('add_sanction', { p_player: f.player, p_season: S.sid, p_competition: f.comp || null, p_matches: +f.matches, p_note: f.note }); toast('Sanción aplicada', 'ok'); refresh(); } catch (x) { err(x); } };

  // ---- Usuarios ----
  async function tabUsers() {
    return `<div class="card"><h3>Usuarios registrados (${S.profiles.length})</h3><div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Equipo</th><th>Admin</th><th>Simulador</th></tr></thead><tbody>${S.profiles.map((p) => { const t = S.seasonTeams.find((x) => x.manager_id === p.id); return `<tr><td><a href="#/perfil/${p.id}"><b>${esc(p.username)}</b></a></td><td class="muted">${esc([p.first_name, p.last_name].filter(Boolean).join(' '))}</td><td>${t ? clubLabel(t.club_id) : '<span class="muted">—</span>'}</td><td><label class="check"><input type="checkbox" ${p.is_admin ? 'checked' : ''} ${p.id === S.user.id ? 'disabled' : ''} onchange="A.setRole('${p.id}','is_admin',this.checked)"></label></td><td><label class="check"><input type="checkbox" ${p.is_simulator ? 'checked' : ''} onchange="A.setRole('${p.id}','is_simulator',this.checked)"></label></td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  A.setRole = async (id, field, val) => { try { await q(sb().from('profiles').update({ [field]: val }).eq('id', id)); toast('Rol actualizado', 'ok'); S.profiles = []; refresh(); } catch (x) { err(x); } };

  // ---- Auditoría ----
  async function tabAudit() {
    const rows = await q(sb().from('audit_log').select('*').order('created_at', { ascending: false }).limit(150));
    return `<div class="card"><h3>Registro de actividad</h3><p class="muted small">Toda acción del staff y las operaciones importantes quedan registradas.</p><div class="table-wrap"><table><tbody>${rows.map((r) => `<tr><td class="muted tiny">${datetime(r.created_at)}</td><td class="small"><b>${esc(r.actor_name || 'sistema')}</b></td><td class="small">${esc(r.action)} <span class="muted">${esc(r.target_table || '')}</span></td><td class="muted tiny" style="max-width:380px;white-space:normal">${esc(JSON.stringify(r.details || {}).slice(0, 180))}</td></tr>`).join('') || '<tr><td class="empty">Sin registros.</td></tr>'}</tbody></table></div></div>`;
  }
})();
