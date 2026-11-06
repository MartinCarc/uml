/* =====================================================================
   UML - páginas públicas: inicio, login, perfil, tabla, fixture, partido,
   estadísticas, equipos, jugador, mis partidos, banco
   ===================================================================== */
(() => {
  const { $, esc, fmt, fmtM, date, POS, POS_ORDER, GROUP, STAGE, EVENT, SANC, S, toast, modal, closeModal, err, isAdmin, isSim, rpc, opt, club, player, comp, st, profile, managerName, compClubs, squad, cfg, crest, clubLabel, statusBadge, sancBadges, pageHead, standings, matchGoals, tieWinner, loadSeasons, loadSettings, refresh, register, client } = U;
  const sb = () => client();

  // ---------------- LOGIN ----------------
  register('login', () => {
    $('#app').innerHTML = `
      <div class="card" style="max-width:440px;margin:30px auto">
        <div class="center mb"><img src="assets/logo.png" style="width:90px;height:90px;border-radius:50%" onerror="this.style.display='none'"></div>
        <div class="tabs"><button class="active" id="tab-in" onclick="A.authTab('in')">Ingresar</button><button id="tab-up" onclick="A.authTab('up')">Registrarme</button></div>
        <form id="f-in" onsubmit="A.login(event)">
          <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label>Contraseña</label><input name="password" type="password" required autocomplete="current-password"></div>
          <button type="submit">Ingresar</button>
        </form>
        <form id="f-up" onsubmit="A.signup(event)" style="display:none">
          <div class="field"><label>Nombre de usuario (como te van a ver los demás)</label><input name="username" required minlength="3" maxlength="24"></div>
          <div class="fields"><div><label>Nombre</label><input name="first_name"></div><div><label>Apellido</label><input name="last_name"></div></div>
          <div class="field"><label>Email</label><input name="email" type="email" required></div>
          <div class="field"><label>Contraseña (mínimo 6 caracteres)</label><input name="password" type="password" required minlength="6"></div>
          <button type="submit">Crear cuenta</button>
        </form>
      </div>`;
  });

  // ---------------- PERFIL ----------------
  register('perfil', async (uid) => {
    const id = uid || S.user?.id;
    if (!id) { location.hash = '#/login'; return; }
    const { data: p } = await sb().from('profiles').select('*').eq('id', id).single();
    if (!p) return ($('#app').innerHTML = '<div class="empty">Usuario inexistente.</div>');
    const mine = p.id === S.user?.id;
    const { data: teams } = await sb().from('season_teams').select('*, seasons(name, status), clubs(name, color, crest_url)').eq('manager_id', id);
    const { data: simMatches } = await sb().from('matches').select('id', { count: 'exact', head: true }).eq('simulator_id', id).eq('status', 'played');
    $('#app').innerHTML = `
      <div class="card navy"><div class="row" style="gap:20px">
        <span class="avatar" style="width:84px;height:84px;font-size:32px;border:3px solid #fff">${p.avatar_url ? `<img src="${esc(p.avatar_url)}">` : esc(p.username.slice(0, 1).toUpperCase())}</span>
        <div><h1 style="margin:0">${esc(p.username)}</h1><div class="muted">${esc([p.first_name, p.last_name].filter(Boolean).join(' '))}</div>
        <div class="mt">${p.is_admin ? '<span class="badge white">admin</span> ' : ''}${p.is_simulator ? '<span class="badge white">simulador</span>' : ''}</div></div>
        ${mine ? `<div class="row" style="margin-left:auto">${isAdmin() ? '<a class="btn secondary" href="#/clubes">Administrar clubes</a>' : ''}<button class="secondary" onclick="A.editProfile()">Editar perfil</button></div>` : ''}
      </div></div>
      <div class="grid c2">
        <div class="card"><h3>Equipos dirigidos</h3>${teams?.length ? teams.map((t) => `<div class="list-item"><span class="club">${crest(t.clubs)}${esc(t.clubs?.name)}</span><span class="muted small">${esc(t.seasons?.name)} ${statusBadge(t.seasons?.status)}</span></div>`).join('') : '<div class="empty">Todavía no dirigió ningún equipo.</div>'}</div>
        <div class="card"><h3>Actividad</h3><div class="grid c2"><div class="stat"><div class="v">${teams?.length || 0}</div><div class="l">Temporadas como DT</div></div><div class="stat"><div class="v">${simMatches?.count ?? 0}</div><div class="l">Partidos simulados</div></div></div></div>
      </div>`;
  });

  // ---------------- INICIO ----------------
  register('home', async () => {
    const seasons = await loadSeasons();
    await loadSettings();
    const app = $('#app');
    const league = S.settings.league || {};
    const hero = `<div class="hero"><img src="assets/logo.png" alt="" onerror="this.style.display='none'"><div>
      <div class="kicker" style="color:#8FB0EE">Comunidad de managers · PES</div>
      <h1>${esc(U.CFG.LEAGUE_FULL_NAME || league.full_name || 'UEFA Manager League')}</h1>
      <p>La comunidad de fútbol virtual donde cada participante dirige su club, arma su plantel y define sus tácticas para competir en ligas y copas con partidos simulados en PES. Un espacio para vivir la pasión de ser DT, compartir con otros fanáticos y hacer historia con tu equipo.</p>
      <div class="row">${!S.user ? '<a class="btn" style="background:#fff;color:#0A2A66" href="#/login">Ingresar o registrarme</a>' : ''}${isAdmin() ? '<a class="btn" href="#/clubes">Administrar clubes</a><a class="btn" href="#/nueva-temporada">+ Nueva temporada</a>' : ''}</div></div></div>`;
    if (!seasons.length) { app.innerHTML = hero + '<div class="empty">Todavía no hay temporadas creadas.</div>'; return; }
    const active = seasons.find((s) => s.status === 'active') || seasons[0];
    if (S.sid !== active.id) await U.loadSeason(active.id);
    U.renderNav('inicio');
    app.innerHTML = hero + seasonHome() + `<h2 class="mt">Todas las temporadas</h2>${seasons.map((s) => `<a class="card" href="#/s/${s.id}" style="display:flex;justify-content:space-between;align-items:center;color:inherit"><b>${esc(s.name)}</b><span>${s.mode === 'two' ? '<span class="badge">2 divisiones</span> ' : ''}${statusBadge(s.status)}</span></a>`).join('')}`;
  });
  register('home-season', () => { $('#app').innerHTML = seasonHome(); });
  function seasonHome() {
    const s = S.season;
    const comps = S.competitions.map((c) => {
      const ms = S.matches.filter((m) => m.competition_id === c.id); const played = ms.filter((m) => m.status === 'played').length;
      const sub = c.kind === 'league' ? `${played} de ${ms.length} partidos · ${c.format?.rounds === 'single' ? 'Una rueda' : 'Ida y vuelta'}` : c.kind === 'cup' ? (ms.length ? `${STAGE[ms[ms.length - 1].stage] || ''} · ${played}/${ms.length}` : `${compClubs(c.id).length} equipos`) : 'Campeón de liga vs campeón de copa';
      return `<a href="#/s/${S.sid}/${c.kind === 'league' ? 'tabla' : 'fixture'}/${c.id}" class="card tint" style="color:inherit;margin:0;display:flex;flex-direction:column;gap:6px"><span class="kicker">${c.kind === 'league' ? 'Liga' : c.kind === 'cup' ? 'Copa' : c.kind === 'supercup' ? 'Supercopa' : 'Promoción'}</span><span style="font-family:var(--display);font-size:22px;font-weight:700;color:var(--navy)">${esc(c.name)}</span><span class="small muted">${sub}</span><span>${statusBadge(c.status)}</span></a>`;
    }).join('');
    const recent = S.matches.filter((m) => m.status === 'played').sort((a, b) => (b.played_seq || 0) - (a.played_seq || 0)).slice(0, 5);
    const scorers = topList('goal', 5);
    const pend = S.myClub ? S.offers.filter((o) => o.status === 'pending' && o.responder_turn === S.myClub).length : 0;
    return `<div class="row between mb"><h2 style="margin:0">${esc(s.name)} ${statusBadge(s.status)}</h2><span class="badge ${s.market_open ? 'green' : 'red'}">${s.market_open ? 'Mercado abierto' : 'Mercado cerrado'}</span></div>
      ${pend ? `<div class="alert info">Tenés <b>${pend}</b> oferta(s) esperando tu respuesta. <a href="#/s/${S.sid}/mercado">Ir al mercado →</a></div>` : ''}
      <div class="grid c3 mb">${comps || '<div class="empty">Sin competencias.</div>'}</div>
      <div class="grid c2">
        <div class="card"><h3>Últimos resultados</h3>${recent.length ? recent.map(matchRow).join('') : '<div class="empty">Todavía no se jugaron partidos.</div>'}</div>
        <div class="card"><h3>Goleadores</h3>${scorers.length ? scorers.map((r, i) => `<div class="list-item"><span class="row"><span class="muted2 b">${i + 1}</span><a href="#/s/${S.sid}/jugador/${r.p.id}" style="color:inherit"><b>${esc(r.p.name)}</b></a> <span class="muted small">${esc(club(r.p.club_id)?.name || 'libre')}</span></span><span class="pts" style="font-family:var(--display);font-size:20px;font-weight:800;color:var(--blue)">${r.n}</span></div>`).join('') : '<div class="empty">Sin goles todavía.</div>'}</div>
      </div>`;
  }

  // ---------------- componentes compartidos ----------------
  function matchRow(m, opts = {}) {
    const h = club(m.home_club_id), a = club(m.away_club_id); const played = m.status === 'played';
    const goals = matchGoals(m.id);
    const scorers = (cid) => goals.filter((e) => e.club_id === cid).map((e) => esc(player(e.player_id)?.name || 'Gol') + (e.type === 'own_goal' ? ' (e/c)' : '')).join(', ');
    const pens = played && m.home_pens != null ? `<div class="sub">(${m.home_pens}-${m.away_pens} pen.)</div>` : '';
    return `<a class="match" href="#/s/${S.sid}/partido/${m.id}">
      <div class="home"><div><div>${esc(h?.name || '?')}</div>${played && opts.scorers !== false ? `<div class="sub">${scorers(h?.id)}</div>` : ''}</div>${crest(h)}</div>
      <div>${played ? `<div class="score">${m.home_goals} - ${m.away_goals}</div>${pens}` : '<div class="vs">vs</div>'}${opts.sub ? `<div class="sub center">${opts.sub(m)}</div>` : ''}${m.is_derby ? '<div class="center"><span class="badge amber">Clásico</span></div>' : ''}</div>
      <div class="away">${crest(a)}<div><div>${esc(a?.name || '?')}</div>${played && opts.scorers !== false ? `<div class="sub">${scorers(a?.id)}</div>` : ''}</div></div></a>`;
  }
  U.matchRow = matchRow;
  function topList(type, limit = 30, compId = null) {
    const c = {};
    S.events.filter((e) => e.player_id && (!compId || e.matches?.competition_id === compId)).forEach((e) => {
      if (type === 'goal' && e.type === 'goal') c[e.player_id] = (c[e.player_id] || 0) + 1;
      if (type === 'assist' && e.type === 'goal' && e.assist_player_id) c[e.assist_player_id] = (c[e.assist_player_id] || 0) + 1;
      if (type === 'yellow' && (e.type === 'yellow' || e.type === 'second_yellow')) c[e.player_id] = (c[e.player_id] || 0) + 1;
      if (type === 'red' && (e.type === 'red' || e.type === 'second_yellow')) c[e.player_id] = (c[e.player_id] || 0) + 1;
    });
    if (type === 'mvp' || type === 'save') S.matches.filter((m) => m.status === 'played' && (!compId || m.competition_id === compId)).forEach((m) => { const pid = type === 'mvp' ? m.mvp_player_id : m.save_player_id; if (pid) c[pid] = (c[pid] || 0) + 1; });
    return Object.entries(c).map(([pid, n]) => ({ p: player(pid), n })).filter((x) => x.p).sort((x, y) => y.n - x.n || x.p.name.localeCompare(y.p.name)).slice(0, limit);
  }
  U.topList = topList;
  const compTabs = (kindFilter, active, page) => S.competitions.filter(kindFilter).map((c) => `<a class="btn sm ${c.id === active ? 'navy' : 'secondary'}" href="#/s/${S.sid}/${page}/${c.id}">${esc(c.name)}</a>`).join('');

  // ---------------- TABLA ----------------
  register('tabla', (cid) => {
    const leagues = S.competitions.filter((c) => c.kind === 'league');
    const c = comp(cid) || leagues[0];
    if (!c) return ($('#app').innerHTML = pageHead('Tabla') + '<div class="empty">Esta temporada no tiene ligas.</div>');
    const rows = standings(c.id); const n = rows.length; const conf = cfg();
    const relZone = c.tier === 1 || S.season.mode === 'one' ? (c.relegate_direct || 0) : 0;
    const promoZoneTop = c.tier === 2 ? (c.promote_direct || 0) : 0;
    const stripe = (r) => r.pos === 1 ? 'top' : (relZone && r.pos > n - relZone) ? 'rel' : (c.tier === 1 && c.promotion_slots && r.pos > n - relZone - c.promotion_slots) ? 'promo' : (promoZoneTop && r.pos <= promoZoneTop) ? 'top' : (c.tier === 2 && c.promotion_slots && r.pos > promoZoneTop && r.pos <= promoZoneTop + c.promotion_slots) ? 'promo' : '';
    $('#app').innerHTML = pageHead(esc(c.name), `${esc(S.season.name)} · ${c.format?.rounds === 'single' ? 'Una rueda' : 'Ida y vuelta'}`, compTabs((x) => x.kind === 'league', c.id, 'tabla')) +
      (rows.length ? `<div class="card"><div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Equipo</th><th>DT</th><th class="num">PJ</th><th class="num">G</th><th class="num">E</th><th class="num">P</th><th class="num">GF</th><th class="num">GC</th><th class="num">DIF</th><th class="num">PTS</th><th>Últimos 5</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="${S.myClub === r.club_id ? 'me' : ''}">
          <td class="stripe ${stripe(r)} b" style="color:${r.pos === 1 ? 'var(--blue)' : 'inherit'}">${r.pos}</td><td>${clubLabel(r.club_id)}</td><td class="muted">${esc(managerName(r.club_id))}</td>
          <td class="num">${r.pj}</td><td class="num">${r.g}</td><td class="num">${r.e}</td><td class="num">${r.p}</td><td class="num">${r.gf}</td><td class="num">${r.gc}</td><td class="num muted">${r.gf - r.gc > 0 ? '+' : ''}${r.gf - r.gc}</td><td class="num pts">${r.pts}</td>
          <td><span class="row" style="gap:3px">${r.form.slice(-5).map((f) => `<span style="width:18px;height:18px;border-radius:4px;background:${f === 'G' ? 'var(--green)' : f === 'E' ? 'var(--muted2)' : 'var(--red)'};color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center">${f}</span>`).join('')}</span></td></tr>`).join('')}</tbody></table></div></div>
        <div class="row small muted"><span><span class="stripe top" style="display:inline-block;width:12px;height:12px;border-left-width:12px;border-radius:3px"></span> Puntero${promoZoneTop ? ' / ascenso directo' : ''}</span>${relZone ? '<span><span class="stripe rel" style="display:inline-block;width:12px;height:12px;border-left-width:12px;border-radius:3px"></span> Descenso directo</span>' : ''}${c.promotion_slots ? '<span><span class="stripe promo" style="display:inline-block;width:12px;height:12px;border-left-width:12px;border-radius:3px"></span> Promoción</span>' : ''}<span><span style="display:inline-block;width:12px;height:12px;background:var(--tint);border:1px solid var(--line);border-radius:3px"></span> Tu equipo</span></div>`
      : '<div class="empty">La liga todavía no tiene equipos.</div>');
  });

  // ---------------- FIXTURE ----------------
  register('fixture', (cid) => {
    const c = comp(cid) || S.competitions[0];
    if (!c) return ($('#app').innerHTML = pageHead('Fixture') + '<div class="empty">Sin competencias.</div>');
    const ms = S.matches.filter((m) => m.competition_id === c.id);
    let body;
    if (!ms.length) body = `<div class="empty">El fixture todavía no fue generado.${isAdmin() ? ` Podés generarlo desde <a href="#/s/${S.sid}/admin">Admin → Competencias</a>.` : ''}</div>`;
    else if (c.kind === 'league') {
      const rounds = {}; ms.forEach((m) => (rounds[m.round] ||= []).push(m));
      const keys = Object.keys(rounds).sort((a, b) => a - b);
      const firstPending = keys.find((k) => rounds[k].some((m) => m.status === 'pending'));
      body = keys.map((r) => `<div class="card" id="fecha-${r}"><div class="row between"><h3 style="margin:0">Fecha ${r}</h3>${r === firstPending ? '<span class="badge blue">Próxima</span>' : ''}</div><div class="mt">${rounds[r].map((m) => matchRow(m, { sub: simSub })).join('')}</div></div>`).join('');
      if (firstPending) setTimeout(() => document.getElementById('fecha-' + firstPending)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
    } else body = bracket(c, ms);
    $('#app').innerHTML = pageHead(esc(c.name), esc(S.season.name), compTabs(() => true, c.id, 'fixture')) + body;
  });
  const simSub = (m) => m.simulator_id ? `Simula: ${esc(profile(m.simulator_id)?.username || '…')}` : '';
  function bracket(c, ms) {
    const rounds = {}; ms.forEach((m) => (rounds[m.round] ||= []).push(m));
    const cols = Object.keys(rounds).sort((a, b) => a - b).map((r) => {
      const ties = {}; rounds[r].forEach((m) => (ties[m.tie_id || m.id] ||= []).push(m));
      return `<div class="round"><div class="kicker">${STAGE[rounds[r][0].stage] || 'Ronda ' + r}</div>${Object.entries(ties).map(([tid, legs]) => {
        const w = tieWinner(tid); const a = legs[0].home_club_id, b = legs[0].away_club_id;
        const g = (cid) => legs.map((m) => m.status === 'played' ? (m.home_club_id === cid ? m.home_goals : m.away_goals) : '-').join(' · ');
        return `<a class="tie" href="#/s/${S.sid}/partido/${legs[0].id}" style="display:block;color:inherit"><div class="line ${w === a ? 'w' : ''}"><span class="club">${crest(club(a))}${esc(club(a)?.name)}</span><span>${g(a)}</span></div><div class="line ${w === b ? 'w' : ''}"><span class="club">${crest(club(b))}${esc(club(b)?.name)}</span><span>${g(b)}</span></div>${legs.length > 1 ? `<div class="tiny muted">Ida y vuelta${legs[1].status === 'played' ? '' : ' · vuelta pendiente'}</div>` : ''}</a>`;
      }).join('')}</div>`;
    });
    const champ = c.champion_club_id ? `<div class="card navy center"><div class="kicker" style="color:#8FB0EE">Campeón</div><h2 style="margin:6px 0">${esc(club(c.champion_club_id)?.name)}</h2></div>` : '';
    return champ + `<div class="card"><div class="bracket">${cols.join('')}</div></div><div class="card"><h3>Partidos</h3>${ms.map((m) => matchRow(m, { sub: (x) => `${STAGE[x.stage] || ''}${x.leg === 2 ? ' · vuelta' : (S.matches.some((y) => y.tie_id === x.tie_id && y.leg === 2) ? ' · ida' : '')}` })).join('')}</div>`;
  }

  // ---------------- PARTIDO ----------------
  register('partido', (mid) => {
    const m = S.matches.find((x) => x.id === mid);
    if (!m) return ($('#app').innerHTML = '<div class="empty">Partido inexistente.</div>');
    const c = comp(m.competition_id); const h = club(m.home_club_id), a = club(m.away_club_id); const played = m.status === 'played';
    const evs = S.events.filter((e) => e.match_id === mid);
    const canEdit = isAdmin() || (isSim() && m.simulator_id === S.user?.id && !m.locked);
    const goals = (cid) => evs.filter((e) => e.club_id === cid && (e.type === 'goal' || e.type === 'own_goal')).map((e) => `<div class="list-item" style="justify-content:flex-start;gap:8px"><span class="badge blue">GOL</span><span><b>${esc(player(e.player_id)?.name || 'Sin jugador')}</b>${e.type === 'own_goal' ? ' <span class="muted small">(en contra)</span>' : ''}${e.assist_player_id ? ` <span class="muted small">· asist. ${esc(player(e.assist_player_id)?.name)}</span>` : ''}</span></div>`).join('') || '<div class="muted small">Sin goles</div>';
    const cards = evs.filter((e) => ['yellow', 'second_yellow', 'red'].includes(e.type)).map((e) => `<div class="list-item" style="justify-content:flex-start;gap:8px">${e.type === 'yellow' ? '<span class="pill-yellow"></span>' : e.type === 'second_yellow' ? '<span class="pill-yellow"></span><span class="pill-red"></span>' : '<span class="pill-red"></span>'}<span><b>${esc(player(e.player_id)?.name || '?')}</b> <span class="muted small">· ${esc(club(e.club_id)?.name)} · ${EVENT[e.type]}</span></span>${sancBadges(e.player_id)}</div>`).join('') || '<div class="muted small">Sin tarjetas</div>';
    const inj = evs.filter((e) => e.type.startsWith('injury')).map((e) => `<div class="list-item" style="justify-content:flex-start;gap:8px"><span class="badge amber">+</span><span><b>${esc(player(e.player_id)?.name || '?')}</b> <span class="muted small">· ${esc(club(e.club_id)?.name)} · ${EVENT[e.type]}</span></span>${sancBadges(e.player_id)}</div>`).join('') || '<div class="muted small">Sin lesiones</div>';
    const simNote = m.simulator_id ? `Simula: <b>${esc(profile(m.simulator_id)?.username || '…')}</b>${[m.home_club_id, m.away_club_id].includes(S.seasonTeams.find((t) => t.manager_id === m.simulator_id)?.club_id) ? ' <span class="muted">· simula su propio partido · autorizado por admin</span>' : ''}` : '<span class="muted">Simulador sin asignar</span>';
    $('#app').innerHTML = `
      <div class="card navy">
        <div class="center kicker" style="color:#8FB0EE">${esc(c?.name)} · ${m.stage === 'league' ? 'Fecha ' + m.round : (STAGE[m.stage] || '') + (m.leg === 2 ? ' · vuelta' : '')} · ${played ? 'Finalizado' : 'Pendiente'}${m.is_derby ? ' · Clásico' : ''}</div>
        <div class="scorebox mt">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:14px;text-align:right"><div><div class="name">${esc(h?.name)}</div><div class="muted small">DT ${esc(managerName(h?.id))}</div></div>${crest(h, 'xl')}</div>
          <div><div class="big">${played ? `${m.home_goals} – ${m.away_goals}` : 'vs'}</div>${played && m.home_pens != null ? `<div class="center muted small">Penales ${m.home_pens} – ${m.away_pens}</div>` : ''}</div>
          <div style="display:flex;align-items:center;gap:14px">${crest(a, 'xl')}<div><div class="name">${esc(a?.name)}</div><div class="muted small">DT ${esc(managerName(a?.id))}</div></div></div>
        </div>
        <div class="row mt" style="justify-content:center;gap:14px"><span class="small">${simNote}</span>${m.discord_url ? `<a class="btn sm" style="background:#123C8F" href="${esc(m.discord_url)}" target="_blank" rel="noopener">Ver capturas en Discord</a>` : ''}${m.locked ? '<span class="badge white">Cerrado por admin</span>' : ''}</div>
        ${canEdit ? `<div class="center mt"><button onclick="A.resultModal('${m.id}')" style="background:#fff;color:#0A2A66">${played ? 'Editar resultado' : 'Cargar resultado'}</button></div>` : ''}
      </div>
      ${played ? `<div class="grid c3">
        <div class="card" style="grid-column:span 2"><h3>Resumen</h3><div class="grid c2"><div><div class="kicker mb">Goles · ${esc(h?.name)}</div>${goals(h?.id)}</div><div><div class="kicker mb">Goles · ${esc(a?.name)}</div>${goals(a?.id)}</div></div>
          <div class="hr"></div><div class="grid c2"><div><div class="kicker mb">Tarjetas</div>${cards}</div><div><div class="kicker mb">Lesiones</div>${inj}</div></div></div>
        <div class="card"><h3>Destacados</h3>
          <div class="list-item" style="justify-content:flex-start;gap:12px"><span class="avatar" style="width:44px;height:44px;font-family:var(--display);font-size:14px">MVP</span><div>${m.mvp_player_id ? `<b>${esc(player(m.mvp_player_id)?.name)}</b><div class="muted small">${esc(club(player(m.mvp_player_id)?.club_id)?.name || '')}</div>` : '<span class="muted">Sin MVP</span>'}</div></div>
          <div class="list-item" style="justify-content:flex-start;gap:12px"><span class="avatar" style="width:44px;height:44px;background:var(--navy)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 11V5a2 2 0 1 1 4 0v6"/><path d="M11 10V4a2 2 0 1 1 4 0v7"/><path d="M15 11V6a2 2 0 1 1 4 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-3a2 2 0 1 1 4 0"/></svg></span><div>${m.save_player_id ? `<b>${esc(player(m.save_player_id)?.name)}</b><div class="muted small">Atajada del partido</div>` : '<span class="muted">Sin atajada destacada</span>'}</div></div>
        </div></div>` : `<div class="grid c2"><div class="card"><h3>${esc(h?.name)}</h3>${squadMini(h?.id, c?.id)}</div><div class="card"><h3>${esc(a?.name)}</h3>${squadMini(a?.id, c?.id)}</div></div>`}`;
  });
  function squadMini(cid, compId) {
    const ps = squad(cid); if (!ps.length) return '<div class="muted small">Plantel vacío.</div>';
    return `<div class="table-wrap"><table><tbody>${ps.map((p) => { const out = U.playerSanctions(p.id).filter((s) => !s.competition_id || s.competition_id === compId); return `<tr style="${out.length ? 'opacity:.55' : ''}"><td class="muted small">${p.number ?? ''}</td><td><span class="badge">${p.position}</span></td><td>${esc(p.name)}</td><td class="num muted">${p.overall ?? ''}</td><td class="right">${out.map((s) => `<span class="sanc ${s.type.startsWith('injury') ? 'inj' : ''}">${s.type.startsWith('injury') ? 'LES' : 'SUSP'} ${s.remaining}</span>`).join(' ')}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  // Modal de carga de resultado
  A.resultModal = (mid) => {
    const m = S.matches.find((x) => x.id === mid); const c = comp(m.competition_id); const h = club(m.home_club_id), a = club(m.away_club_id);
    const evs = S.events.filter((e) => e.match_id === mid);
    const both = [...squad(h.id), ...squad(a.id)];
    const needPens = c.kind !== 'league' && c.format?.penalties !== false;
    modal(`<h2>${esc(h.name)} vs ${esc(a.name)}</h2><form onsubmit="A.saveResult(event,'${mid}')">
      <div class="fields"><div><label>${esc(h.name)}</label><input name="home" type="number" min="0" value="${m.home_goals ?? 0}" required></div><div><label>${esc(a.name)}</label><input name="away" type="number" min="0" value="${m.away_goals ?? 0}" required></div></div>
      ${needPens ? `<div class="fields"><div><label>Penales ${esc(h.short_name || h.name)} (si hubo)</label><input name="home_pens" type="number" min="0" value="${m.home_pens ?? ''}"></div><div><label>Penales ${esc(a.short_name || a.name)}</label><input name="away_pens" type="number" min="0" value="${m.away_pens ?? ''}"></div></div>` : ''}
      <div class="row between"><label style="margin:0">Goles, tarjetas y lesiones</label><button type="button" class="secondary xs" onclick="A.addEventRow('${mid}')">+ Agregar</button></div>
      <div id="events" class="mt"></div>
      <div class="fields mt">
        <div><label>MVP del partido</label><select name="mvp"><option value="">— Sin MVP —</option>${both.map((p) => opt(p.id, `${p.name} (${club(p.club_id).short_name || club(p.club_id).name})`, m.mvp_player_id)).join('')}</select></div>
        <div><label>Atajada del partido</label><select name="save"><option value="">— Ninguna —</option>${both.filter((p) => p.position === 'ARQ').map((p) => opt(p.id, `${p.name} (${club(p.club_id).short_name || club(p.club_id).name})`, m.save_player_id)).join('')}</select></div>
      </div>
      <div class="field"><label>Link a Discord (mensaje con las capturas)</label><input name="discord" type="url" placeholder="https://discord.com/channels/…" value="${esc(m.discord_url || '')}"></div>
      <div class="row"><button type="submit">Guardar resultado</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`, true);
    evs.forEach((e) => A.addEventRow(mid, e));
  };
  A.addEventRow = (mid, ev = {}) => {
    const m = S.matches.find((x) => x.id === mid); const h = club(m.home_club_id), a = club(m.away_club_id);
    const row = document.createElement('div'); row.className = 'event-row';
    row.innerHTML = `<select name="club">${opt(h.id, h.short_name || h.name, ev.club_id)}${opt(a.id, a.short_name || a.name, ev.club_id)}</select><select name="type">${Object.entries(EVENT).map(([k, v]) => opt(k, v, ev.type || 'goal')).join('')}</select><select name="player"></select><select name="assist"></select><button type="button" class="danger xs" onclick="this.parentNode.remove()">✕</button>`;
    const fill = () => {
      const cid = row.querySelector('[name=club]').value; const type = row.querySelector('[name=type]').value; const ps = squad(cid);
      row.querySelector('[name=player]').innerHTML = `<option value="">(jugador)</option>` + ps.map((p) => opt(p.id, p.name, ev.player_id)).join('');
      const as = row.querySelector('[name=assist]'); as.style.display = type === 'goal' ? '' : 'none';
      as.innerHTML = `<option value="">(sin asistencia)</option>` + ps.map((p) => opt(p.id, 'Asist. ' + p.name, ev.assist_player_id)).join('');
    };
    row.querySelector('[name=club]').addEventListener('change', fill); row.querySelector('[name=type]').addEventListener('change', fill); fill();
    $('#events').appendChild(row);
  };
  A.saveResult = async (e, mid) => {
    e.preventDefault(); const f = U.formData(e.target);
    const events = [...document.querySelectorAll('#events .event-row')].map((r) => ({ club_id: r.querySelector('[name=club]').value, type: r.querySelector('[name=type]').value, player_id: r.querySelector('[name=player]').value || null, assist_player_id: r.querySelector('[name=type]').value === 'goal' ? (r.querySelector('[name=assist]').value || null) : null }));
    const goalsH = events.filter((x) => x.type === 'goal' && x.club_id === S.matches.find((m) => m.id === mid).home_club_id).length + events.filter((x) => x.type === 'own_goal' && x.club_id !== S.matches.find((m) => m.id === mid).home_club_id).length;
    if (events.some((x) => x.type === 'goal' || x.type === 'own_goal') && goalsH !== Number(f.home) && !confirm('Los goles cargados no coinciden con el marcador del local. ¿Guardar igual?')) return;
    try {
      await rpc('set_result', { p_match: mid, p_home: Number(f.home), p_away: Number(f.away), p_events: events, p_mvp: f.mvp || null, p_save: f.save || null, p_discord: f.discord || null, p_home_pens: f.home_pens === '' || f.home_pens == null ? null : Number(f.home_pens), p_away_pens: f.away_pens === '' || f.away_pens == null ? null : Number(f.away_pens) });
      closeModal(); toast('Resultado guardado', 'ok'); refresh();
    } catch (x) { err(x); }
  };

  // ---------------- ESTADÍSTICAS ----------------
  let statsTab = 'goal', statsComp = '';
  A.statsTab = (k) => { statsTab = k; U.route(); }; A.statsComp = (v) => { statsComp = v; U.route(); };
  register('stats', () => {
    const tabs = [['goal', 'Goleadores'], ['assist', 'Asistencias'], ['mvp', 'MVP'], ['save', 'Atajadas'], ['yellow', 'Amarillas'], ['red', 'Rojas'], ['out', 'Suspendidos y lesionados'], ['fairplay', 'Fair play'], ['teams', 'Equipos']];
    let body;
    if (statsTab === 'out') {
      body = S.sanctions.length ? `<table><thead><tr><th>Jugador</th><th>Equipo</th><th>Motivo</th><th>Alcance</th><th class="num">Faltan</th></tr></thead><tbody>${S.sanctions.sort((x, y) => y.remaining - x.remaining).map((s) => `<tr><td><a href="#/s/${S.sid}/jugador/${s.player_id}" style="color:inherit"><b>${esc(s.player_name)}</b></a></td><td>${clubLabel(s.club_id)}</td><td><span class="sanc ${s.type.startsWith('injury') ? 'inj' : ''}">${SANC[s.type]}</span> ${esc(s.note || '')}</td><td class="muted small">${s.competition_id ? esc(comp(s.competition_id)?.name) : 'Todas las competencias'}</td><td class="num b">${s.remaining}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nadie suspendido ni lesionado.</div>';
    } else if (statsTab === 'fairplay') {
      const conf = cfg(); const T = {};
      S.events.filter((e) => ['yellow', 'second_yellow', 'red'].includes(e.type) && (!statsComp || e.matches?.competition_id === statsComp)).forEach((e) => { const t = (T[e.club_id] ||= { y: 0, r: 0 }); if (e.type === 'yellow') t.y++; else t.r++; });
      const rows = S.seasonTeams.map((t) => ({ club_id: t.club_id, y: T[t.club_id]?.y || 0, r: T[t.club_id]?.r || 0 })).map((r) => ({ ...r, pts: r.y * conf.yellow_points + r.r * conf.red_points })).sort((a, b) => a.pts - b.pts);
      body = `<p class="muted small">Amarilla = ${conf.yellow_points} punto, roja = ${conf.red_points}. Al cerrar la temporada, el equipo con más puntos paga ${fmtM(conf.fairplay_fine)} al UML Bank.</p><table><thead><tr><th>#</th><th>Equipo</th><th class="num">Amarillas</th><th class="num">Rojas</th><th class="num">Puntos</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${i === rows.length - 1 && r.pts > 0 ? 'me' : ''}"><td>${i + 1}</td><td>${clubLabel(r.club_id)}</td><td class="num">${r.y}</td><td class="num">${r.r}</td><td class="num b">${r.pts}</td></tr>`).join('')}</tbody></table>`;
    } else if (statsTab === 'teams') {
      const leagues = S.competitions.filter((c) => c.kind === 'league');
      body = leagues.map((c) => { const rows = standings(c.id); return `<h3>${esc(c.name)}</h3><table class="mb"><thead><tr><th>Equipo</th><th class="num">GF</th><th class="num">GC</th><th class="num">Prom GF</th><th class="num">Vallas invictas</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${clubLabel(r.club_id)}</td><td class="num">${r.gf}</td><td class="num">${r.gc}</td><td class="num">${r.pj ? (r.gf / r.pj).toFixed(2) : '-'}</td><td class="num">${S.matches.filter((m) => m.competition_id === c.id && m.status === 'played' && ((m.home_club_id === r.club_id && m.away_goals === 0) || (m.away_club_id === r.club_id && m.home_goals === 0))).length}</td></tr>`).join('')}</tbody></table>`; }).join('') || '<div class="empty">Sin ligas.</div>';
    } else {
      const rows = topList(statsTab, 30, statsComp || null);
      body = rows.length ? `<table><thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th class="num">Total</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td><a href="#/s/${S.sid}/jugador/${r.p.id}" style="color:inherit"><b>${esc(r.p.name)}</b></a> <span class="badge">${r.p.position}</span></td><td>${r.p.club_id ? clubLabel(r.p.club_id) : '<span class="muted">libre</span>'}</td><td class="num pts">${r.n}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin datos todavía.</div>';
    }
    $('#app').innerHTML = pageHead('Estadísticas', esc(S.season.name), `<select style="width:auto" onchange="A.statsComp(this.value)"><option value="">Toda la temporada</option>${S.competitions.map((c) => opt(c.id, c.name, statsComp)).join('')}</select>`) +
      `<div class="tabs">${tabs.map(([k, v]) => `<button class="${k === statsTab ? 'active' : ''}" onclick="A.statsTab('${k}')">${v}</button>`).join('')}</div><div class="card"><div class="table-wrap">${body}</div></div>`;
  });

  // ---------------- EQUIPOS ----------------
  register('equipos', () => {
    const byTier = (tier) => S.seasonTeams.filter((t) => t.tier === tier).map((t) => club(t.club_id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const card = (c) => { const t = st(c.id); return `<a class="card" href="#/s/${S.sid}/equipo/${c.id}" style="color:inherit;margin:0;display:flex;gap:14px;align-items:center">${crest(c, 'lg')}<div style="flex:1;min-width:0"><div style="font-family:var(--display);font-size:22px;font-weight:700;color:var(--navy)">${esc(c.name)}</div><div class="muted small">DT ${esc(managerName(c.id))} · ${squad(c.id).length} jug.</div><div class="money small">${fmtM(t?.budget)}</div></div></a>`; };
    const tiers = S.season.mode === 'two' ? [[1, 'UML Premier'], [2, 'UML Championship']] : [[1, '']];
    $('#app').innerHTML = pageHead('Equipos', esc(S.season.name)) + tiers.map(([tier, label]) => `${label ? `<h2>${esc(S.competitions.find((c) => c.kind === 'league' && c.tier === tier)?.name || label)}</h2>` : ''}<div class="grid c3 mb">${byTier(tier).map(card).join('') || '<div class="empty">Sin equipos.</div>'}</div>`).join('');
  });

  register('equipo', async (cid) => {
    const c = club(cid); if (!c) return ($('#app').innerHTML = '<div class="empty">Equipo inexistente.</div>');
    const t = st(cid); const mine = S.myClub === cid; const canOffer = S.myClub && !mine && S.season.status === 'active';
    const value = squad(cid).reduce((a, p) => a + Number(p.price ?? p.value ?? 0), 0);
    const league = S.competitions.find((x) => x.kind === 'league' && compClubs(x.id).includes(cid)); const pos = league ? standings(league.id).find((r) => r.club_id === cid)?.pos : null;
    const { data: tx } = await sb().from('transactions').select('*').eq('club_id', cid).eq('season_id', S.sid).order('created_at', { ascending: false }).limit(100);
    let bal = Number(t?.budget || 0);
    const ledger = (tx || []).map((x) => { const row = { ...x, bal }; bal -= Number(x.amount); return row; });
    const recent = S.matches.filter((m) => m.status === 'played' && (m.home_club_id === cid || m.away_club_id === cid)).sort((a, b) => (b.played_seq || 0) - (a.played_seq || 0)).slice(0, 6);
    $('#app').innerHTML = `
      <div class="card navy"><div class="row" style="gap:18px">${crest(c, 'xl')}<div><h1 style="margin:0">${esc(c.name)}</h1><div class="muted">DT <b style="color:#fff">${esc(managerName(cid))}</b> · ${esc(c.stadium_name || 'Estadio')} (${Number(c.stadium_capacity).toLocaleString('es-AR')})${t?.tier === 2 ? ' · Championship' : ''}</div></div>
        <div class="grid c4" style="margin-left:auto;min-width:300px"><div class="stat"><div class="v">${fmtM(t?.budget)}</div><div class="l">Presupuesto</div></div><div class="stat"><div class="v">${pos ?? '-'}°</div><div class="l">Posición</div></div><div class="stat"><div class="v">${squad(cid).length}/${cfg().squad_limit}</div><div class="l">Plantel</div></div><div class="stat"><div class="v">${fmtM(value)}</div><div class="l">Valor plantel</div></div></div></div></div>
      <div class="card"><div class="row between"><h3 style="margin:0">Plantel</h3>${mine ? `<a class="btn sm secondary" href="#/s/${S.sid}/mi-equipo">Gestionar mi equipo</a>` : ''}</div><div class="mt">${squadTable(cid, { actions: (p) => canOffer && !p.loan_from_club_id ? `<button class="sm" onclick="A.offerModal('${cid}','${p.id}')">Ofertar</button>` : '' })}</div></div>
      <div class="grid c2">
        <div class="card"><h3>Últimos partidos</h3>${recent.length ? recent.map((m) => U.matchRow(m, { scorers: false })).join('') : '<div class="empty">Sin partidos jugados.</div>'}</div>
        <div class="card"><h3>Libro de caja</h3>${ledger.length ? `<div class="table-wrap"><table><tbody>${ledger.map((x) => `<tr><td class="muted tiny">${date(x.created_at)}</td><td class="small">${esc(x.description)}</td><td class="num money ${x.amount < 0 ? 'neg' : ''}">${x.amount >= 0 ? '+' : '−'}${fmtM(Math.abs(x.amount))}</td><td class="num muted tiny">${fmtM(x.bal)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin movimientos.</div>'}</div>
      </div>`;
  });
  function squadTable(cid, opts = {}) {
    const ps = squad(cid); if (!ps.length) return '<div class="empty">Plantel vacío.</div>';
    const goals = (pid) => S.events.filter((e) => e.player_id === pid && e.type === 'goal').length;
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Pos</th><th>Jugador</th><th class="num">Edad</th><th class="num">Media</th><th class="num">Goles</th><th class="num">Precio</th><th>Estado</th>${opts.actions ? '<th></th>' : ''}</tr></thead>
      <tbody>${ps.map((p) => `<tr><td class="muted">${p.number ?? ''}</td><td><span class="badge" title="${POS[p.position]}">${p.position}</span></td><td><a href="#/s/${S.sid}/jugador/${p.id}" style="color:inherit"><b>${esc(p.name)}</b></a>${p.loan_from_club_id ? ` <span class="badge amber" title="Cedido por ${esc(club(p.loan_from_club_id)?.name)}">Cedido</span>` : ''}</td><td class="num">${p.age}</td><td class="num">${p.overall ?? '-'}</td><td class="num">${goals(p.id)}</td><td class="num">${p.price ? fmtM(p.price) : '<span class="muted">—</span>'}</td><td>${p.transfer_listed ? '<span class="badge green">Transferible</span> ' : ''}${p.loan_listed ? '<span class="badge amber">Cedible</span> ' : ''}${sancBadges(p.id)}</td>${opts.actions ? `<td class="right">${opts.actions(p)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }
  U.squadTable = squadTable;

  // ---------------- JUGADOR ----------------
  register('jugador', async (pid) => {
    let p = player(pid);
    if (!p) { const { data } = await sb().from('players').select('*').eq('id', pid).single(); p = data; }
    if (!p) return ($('#app').innerHTML = '<div class="empty">Jugador inexistente.</div>');
    const evs = S.events.filter((e) => e.player_id === pid || e.assist_player_id === pid);
    const n = (t) => evs.filter((e) => e.type === t && e.player_id === pid).length;
    const assists = evs.filter((e) => e.type === 'goal' && e.assist_player_id === pid).length;
    const mvp = S.matches.filter((m) => m.mvp_player_id === pid).length, saves = S.matches.filter((m) => m.save_player_id === pid).length;
    const trainings = (await sb().from('player_training').select('*').eq('player_id', pid).eq('season_id', S.sid)).data || [];
    const stats = p.stats && Object.keys(p.stats).length ? `<div class="grid c4">${Object.entries(p.stats).map(([k, v]) => `<div class="stat"><div class="v">${esc(v)}</div><div class="l">${esc(k)}</div></div>`).join('')}</div>` : '<div class="empty">Las habilidades se van a cargar cuando se importe la base del option file.</div>';
    $('#app').innerHTML = `
      <div class="card navy"><div class="row" style="gap:18px"><span class="avatar" style="width:84px;height:84px;font-size:30px;border:3px solid #fff">${p.photo_url ? `<img src="${esc(p.photo_url)}">` : esc(p.name.slice(0, 1))}</span>
        <div><h1 style="margin:0">${p.number ? `<span style="color:#8FB0EE">${p.number}</span> ` : ''}${esc(p.name)}</h1><div class="muted">${POS[p.position]} · ${p.age} años${p.retired ? ' · Retirado' : p.club_id ? ' · ' + esc(club(p.club_id)?.name || '') : ' · Agente libre'}</div><div class="mt">${sancBadges(pid)}</div></div>
        <div class="grid c4" style="margin-left:auto;min-width:300px"><div class="stat"><div class="v">${p.overall ?? '-'}</div><div class="l">Media</div></div><div class="stat"><div class="v">${n('goal')}</div><div class="l">Goles</div></div><div class="stat"><div class="v">${assists}</div><div class="l">Asistencias</div></div><div class="stat"><div class="v">${p.position === 'ARQ' ? saves : mvp}</div><div class="l">${p.position === 'ARQ' ? 'Atajadas' : 'MVP'}</div></div></div></div></div>
      <div class="grid c2">
        <div class="card"><h3>Temporada</h3><div class="grid c4"><div class="stat"><div class="v">${n('yellow') + n('second_yellow')}</div><div class="l">Amarillas</div></div><div class="stat"><div class="v">${n('red') + n('second_yellow')}</div><div class="l">Rojas</div></div><div class="stat"><div class="v">${n('injury_minor') + n('injury_major')}</div><div class="l">Lesiones</div></div><div class="stat"><div class="v">${trainings.length}</div><div class="l">Entrenamientos</div></div></div>
          <div class="mt small muted">Precio pedido: <b>${p.price ? fmtM(p.price) : '—'}</b> · Valor de referencia: ${fmtM(p.value)}${p.loan_from_club_id ? ` · Cedido por ${esc(club(p.loan_from_club_id)?.name)}` : ''}</div></div>
        <div class="card"><h3>Habilidades</h3>${stats}</div>
      </div>`;
  });

  // ---------------- MIS PARTIDOS (simulador) ----------------
  register('mis-partidos', () => {
    const mine = S.matches.filter((m) => m.simulator_id === S.user?.id);
    const pend = mine.filter((m) => m.status === 'pending'), done = mine.filter((m) => m.status === 'played');
    const sub = (m) => `${esc(comp(m.competition_id)?.name)} · ${m.stage === 'league' ? 'Fecha ' + m.round : STAGE[m.stage]}`;
    $('#app').innerHTML = pageHead('Mis partidos', 'Partidos que te asignaron para simular') + `<div class="card"><h3>Pendientes (${pend.length})</h3>${pend.length ? pend.map((m) => U.matchRow(m, { sub })).join('') : '<div class="empty">No tenés partidos pendientes.</div>'}</div><div class="card"><h3>Cargados (${done.length})</h3>${done.map((m) => U.matchRow(m, { sub })).join('') || '<div class="empty">Todavía no cargaste ninguno.</div>'}</div>`;
  });

  // ---------------- UML BANK ----------------
  register('banco', async () => {
    await loadSettings();
    const bank = S.settings.bank || {};
    const { data: tx } = await sb().from('transactions').select('*').is('club_id', null).order('created_at', { ascending: false }).limit(100);
    $('#app').innerHTML = `<div class="card navy"><div class="row" style="gap:18px"><div><div class="kicker" style="color:#8FB0EE">Banco de la liga</div><h1 style="margin:0">${esc(bank.name || 'UML Bank')}</h1></div><div class="stat" style="margin-left:auto"><div class="v">${fmt(bank.balance)}</div><div class="l">Saldo</div></div></div></div>
      ${!bank.enabled ? `<div class="alert warn"><b>${esc(bank.notice || 'Banco no disponible por el momento')}</b> — los préstamos se habilitan cuando el staff lo defina. Mientras tanto, acá se acumulan los pagos de gimnasio y las multas de fair play.</div>` : ''}
      <div class="card"><h3>Movimientos</h3>${tx?.length ? `<div class="table-wrap"><table><tbody>${tx.map((x) => `<tr><td class="muted tiny">${date(x.created_at)}</td><td>${esc(x.description)}</td><td class="num money ${x.amount < 0 ? 'neg' : ''}">${x.amount >= 0 ? '+' : '−'}${fmtM(Math.abs(x.amount))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin movimientos.</div>'}</div>`;
  });

  // ---------------- acciones de autenticación / perfil ----------------
  A.authTab = (k) => { $('#f-in').style.display = k === 'in' ? '' : 'none'; $('#f-up').style.display = k === 'up' ? '' : 'none'; $('#tab-in').classList.toggle('active', k === 'in'); $('#tab-up').classList.toggle('active', k === 'up'); };
  A.login = async (e) => { e.preventDefault(); const f = U.formData(e.target); const { error } = await sb().auth.signInWithPassword({ email: f.email, password: f.password }); if (error) return err(error); toast('¡Bienvenido!', 'ok'); location.hash = '#/'; };
  A.signup = async (e) => {
    e.preventDefault(); const f = U.formData(e.target);
    const { data, error } = await sb().auth.signUp({ email: f.email, password: f.password, options: { data: { username: f.username.trim() } } });
    if (error) return err(error);
    if (data.user && (f.first_name || f.last_name)) await sb().from('profiles').update({ first_name: f.first_name, last_name: f.last_name }).eq('id', data.user.id);
    if (data.session) { toast('Cuenta creada. ¡Bienvenido!', 'ok'); location.hash = '#/'; } else { toast('Cuenta creada. Revisá tu email para confirmarla y después ingresá.', 'ok'); A.authTab('in'); }
  };
  A.logout = async () => { await sb().auth.signOut(); S.myClub = null; location.hash = '#/'; };
  A.editProfile = () => {
    const p = S.profile;
    modal(`<h2>Editar perfil</h2><form onsubmit="A.saveProfile(event)">
      <div class="field"><label>Nombre de usuario</label><input name="username" value="${esc(p.username)}" required minlength="3" maxlength="24"></div>
      <div class="fields"><div><label>Nombre</label><input name="first_name" value="${esc(p.first_name || '')}"></div><div><label>Apellido</label><input name="last_name" value="${esc(p.last_name || '')}"></div></div>
      <div class="field"><label>Foto (URL de imagen)</label><input name="avatar_url" type="url" value="${esc(p.avatar_url || '')}" placeholder="https://…"><div class="help">La subida de fotos desde el celular llega en la próxima etapa; por ahora pegá un link a una imagen.</div></div>
      <div class="row"><button type="submit">Guardar</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`);
  };
  A.saveProfile = async (e) => { e.preventDefault(); const f = U.formData(e.target); const { error } = await sb().from('profiles').update({ username: f.username.trim(), first_name: f.first_name, last_name: f.last_name, avatar_url: f.avatar_url || null }).eq('id', S.user.id); if (error) return err(error); await U.loadProfile(); S.profiles = []; closeModal(); toast('Perfil guardado', 'ok'); U.route(); };
})();
