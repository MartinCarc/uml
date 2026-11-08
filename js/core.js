/* =====================================================================
   UML - núcleo: estado, utilidades, carga de datos, router
   ===================================================================== */
window.U = (() => {
  const CFG = window.LIGA_CONFIG || {};
  const CUR = CFG.CURRENCY || '$';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => CUR + ' ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  const fmtM = (n) => { n = Number(n || 0); return Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M' : n.toLocaleString('es-AR'); };
  const date = (d) => d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  const datetime = (d) => d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  const POS = { ARQ: 'Arquero', DFC: 'Defensor central', LD: 'Lateral derecho', LI: 'Lateral izquierdo', MCD: 'Mediocampista defensivo', MC: 'Mediocampista central', MD: 'Volante derecho', MI: 'Volante izquierdo', MCO: 'Mediocampista ofensivo', DC: 'Delantero centro', SD: 'Segundo delantero', ED: 'Extremo derecho', EI: 'Extremo izquierdo' };
  const POS_ORDER = Object.keys(POS);
  const GROUP = (p) => p === 'ARQ' ? 'ARQ' : ['DFC', 'LD', 'LI'].includes(p) ? 'DEF' : ['MCD', 'MC', 'MD', 'MI', 'MCO'].includes(p) ? 'MED' : 'DEL';
  const STAGE = { league: 'Liga', group: 'Grupos', r64: '64avos', r32: '32avos', r16: 'Octavos', qf: 'Cuartos', sf: 'Semifinal', final: 'Final', promotion: 'Promoción' };
  const EVENT = { goal: 'Gol', own_goal: 'Gol en contra', yellow: 'Amarilla', second_yellow: 'Doble amarilla', red: 'Roja directa', injury_minor: 'Lesión leve', injury_major: 'Lesión grave' };
  const SANC = { red: 'Roja', second_yellow: 'Doble amarilla', yellow_accum: 'Acum. amarillas', injury_minor: 'Lesión leve', injury_major: 'Lesión grave', manual: 'Sanción' };

  // ---------------- estado ----------------
  const S = {
    user: null, profile: null, profiles: [], settings: {},
    sid: null, season: null, competitions: [], clubs: [], seasonTeams: [], compTeams: [],
    players: [], matches: [], events: [], sanctions: [], offers: [], queue: [],
    myClub: null, seasons: [],
  };
  let sb = null;
  const setClient = (c) => (sb = c);
  const client = () => sb;

  // ---------------- UI utils ----------------
  let toastTimer;
  function toast(msg, type = '') { const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + type; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'toast'), 3800); }
  function modal(html, wide) { $('#modal-card').innerHTML = html; $('#modal-card').className = 'modal-card' + (wide ? ' wide' : ''); $('#modal').classList.remove('hidden'); }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modal-card').innerHTML = ''; }
  function err(e) { console.error(e); toast(e?.message || String(e), 'error'); }
  const isAdmin = () => !!S.profile?.is_admin;
  const isSim = () => !!(S.profile?.is_simulator || S.profile?.is_admin);
  async function rpc(name, args) { const { data, error } = await sb.rpc(name, args); if (error) throw error; return data; }
  async function confirmDo(msg, fn) { if (!confirm(msg)) return; try { await fn(); } catch (e) { err(e); } }
  const formData = (form) => Object.fromEntries(new FormData(form));
  const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(sel) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;

  // ---------------- lookups ----------------
  const club = (id) => S.clubs.find((c) => c.id === id);
  const player = (id) => S.players.find((p) => p.id === id);
  const comp = (id) => S.competitions.find((c) => c.id === id);
  const st = (clubId) => S.seasonTeams.find((t) => t.club_id === clubId);
  const profile = (id) => S.profiles.find((p) => p.id === id);
  const managerName = (clubId) => { const t = st(clubId); if (!t?.manager_id) return 'Sin DT'; return profile(t.manager_id)?.username || '…'; };
  const compClubs = (compId) => S.compTeams.filter((x) => x.competition_id === compId).map((x) => x.club_id);
  const squad = (clubId) => S.players.filter((p) => p.club_id === clubId && !p.retired).sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position) || (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name));
  const playerSanctions = (pid) => S.sanctions.filter((s) => s.player_id === pid);
  const cfg = () => Object.assign({}, DEFAULT_CFG, S.season?.config || {});
  const DEFAULT_CFG = { budget_tier1: 200000000, budget_tier2: 150000000, tv_tier1: 60000000, tv_tier2: 40000000, ticket_price: 50, occupancy: { top4: 1, top8: .85, upper_half: .7, lower_half: .55, relegation: .4 }, relegation_zone: 3, multipliers: { league: 1, derby: 1.25, cup_early: 1, cup_qf: 1.15, cup_sf: 1.3, promotion: 1.3, final: 1.5 }, fairplay_fine: 10000000, yellow_points: 1, red_points: 3, gym_cost: 15000000, squad_limit: 32, retire_age: 41, sanction_red: 2, sanction_second_yellow: 1, sanction_yellows_per_ban: 3, sanction_yellow_ban: 1, injury_minor: 2, injury_major: 4 };

  // ---------------- render helpers ----------------
  function crest(c, cls = '') {
    if (!c) return `<span class="crest dot ${cls}" style="background:#ccc"></span>`;
    return c.crest_url ? `<img class="crest ${cls}" src="${esc(c.crest_url)}" alt="">` : `<span class="crest dot ${cls}" style="background:${esc(c.color || '#1F5FC4')}"></span>`;
  }
  const clubLabel = (id, link = true) => { const c = club(id); if (!c) return '<span class="muted">—</span>'; const inner = `${crest(c)}<span>${esc(c.name)}</span>`; return link && S.sid ? `<a class="club" href="#/s/${S.sid}/equipo/${c.id}">${inner}</a>` : `<span class="club">${inner}</span>`; };
  const statusBadge = (s) => ({ draft: '<span class="badge">En preparación</span>', active: '<span class="badge blue">En curso</span>', finished: '<span class="badge navy">Finalizada</span>', closed: '<span class="badge navy">Cerrada</span>' }[s] || '');
  function sancBadges(pid) { return playerSanctions(pid).map((s) => `<span class="sanc ${s.type.startsWith('injury') ? 'inj' : ''}" title="${esc(SANC[s.type])}${s.competition_id ? ' · ' + esc(comp(s.competition_id)?.name || '') : ''}">${s.type.startsWith('injury') ? 'LES' : 'SUSP'} ${s.remaining}</span>`).join(' '); }
  function pageHead(title, sub = '', actions = '') { return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`; }

  // ---------------- standings ----------------
  function standings(compId) {
    const c = comp(compId); if (!c) return [];
    const T = {};
    compClubs(compId).forEach((id) => (T[id] = { club_id: id, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0, form: [] }));
    S.matches.filter((m) => m.competition_id === compId && m.status === 'played' && ['league', 'group'].includes(m.stage)).sort((a, b) => (a.played_seq || 0) - (b.played_seq || 0)).forEach((m) => {
      const h = T[m.home_club_id], a = T[m.away_club_id]; if (!h || !a) return;
      h.pj++; a.pj++; h.gf += m.home_goals; h.gc += m.away_goals; a.gf += m.away_goals; a.gc += m.home_goals;
      if (m.home_goals > m.away_goals) { h.g++; a.p++; h.pts += c.points_win; h.form.push('G'); a.form.push('P'); }
      else if (m.home_goals < m.away_goals) { a.g++; h.p++; a.pts += c.points_win; a.form.push('G'); h.form.push('P'); }
      else { h.e++; a.e++; h.pts += c.points_draw; a.pts += c.points_draw; h.form.push('E'); a.form.push('E'); }
    });
    return Object.values(T).sort((x, y) => y.pts - x.pts || (y.gf - y.gc) - (x.gf - x.gc) || y.gf - x.gf || club(x.club_id).name.localeCompare(club(y.club_id).name)).map((r, i) => ({ ...r, pos: i + 1 }));
  }
  function matchGoals(mid) { return S.events.filter((e) => e.match_id === mid && (e.type === 'goal' || e.type === 'own_goal')); }
  function tieWinner(tieId) {
    const ms = S.matches.filter((m) => m.tie_id === tieId).sort((a, b) => a.leg - b.leg);
    if (!ms.length || ms.some((m) => m.status !== 'played')) return null;
    const a = ms[0].home_club_id, b = ms[0].away_club_id; let ga = 0, gb = 0, pa = 0, pb = 0;
    ms.forEach((m) => { if (m.home_club_id === a) { ga += m.home_goals; gb += m.away_goals; pa = m.home_pens || 0; pb = m.away_pens || 0; } else { ga += m.away_goals; gb += m.home_goals; pa = m.away_pens || 0; pb = m.home_pens || 0; } });
    if (ga !== gb) return ga > gb ? a : b; if (pa !== pb) return pa > pb ? a : b; return null;
  }

  // ---------------- data ----------------
  async function loadProfile() { if (!S.user) { S.profile = null; return; } const { data } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle(); S.profile = data; }
  async function loadProfiles() { const { data, error } = await sb.from('profiles').select('*').order('username'); if (error) throw error; S.profiles = data; }
  async function loadSettings() { const { data } = await sb.from('settings').select('*'); S.settings = {}; (data || []).forEach((r) => (S.settings[r.key] = r.value)); }
  async function loadSeasons() { const { data, error } = await sb.from('seasons').select('*').order('created_at', { ascending: false }); if (error) throw error; S.seasons = data; return data; }
  async function loadSeason(sid) {
    const [season, comps, clubs, steams, cteams] = await Promise.all([
      sb.from('seasons').select('*').eq('id', sid).single(),
      sb.from('competitions').select('*').eq('season_id', sid).order('sort_order').order('created_at'),
      sb.from('clubs').select('*').order('name'),
      sb.from('season_teams').select('*').eq('season_id', sid),
      sb.from('competition_teams').select('*, competitions!inner(season_id)').eq('competitions.season_id', sid),
    ]);
    for (const r of [season, comps, clubs, steams, cteams]) if (r.error) throw r.error;
    S.sid = sid; S.season = season.data; S.competitions = comps.data; S.clubs = clubs.data; S.seasonTeams = steams.data; S.compTeams = cteams.data;
    const compIds = S.competitions.map((c) => c.id); const clubIds = S.seasonTeams.map((t) => t.club_id);
    const [players, matches, events, sancs, offers, queue] = await Promise.all([
      sb.from('players').select('*').eq('archived', false).eq('retired', false).or(clubIds.length ? `club_id.is.null,club_id.in.(${clubIds.join(',')})` : 'club_id.is.null').order('name'),
      compIds.length ? sb.from('matches').select('*').in('competition_id', compIds).order('round').order('leg') : { data: [] },
      compIds.length ? sb.from('match_events').select('*, matches!inner(competition_id)').in('matches.competition_id', compIds).order('seq') : { data: [] },
      sb.from('active_sanctions').select('*').eq('season_id', sid),
      sb.from('offers').select('*').eq('season_id', sid).order('created_at', { ascending: false }),
      sb.from('transfer_queue').select('*').eq('season_id', sid).eq('status', 'pending').order('created_at'),
    ]);
    for (const r of [players, matches, events, sancs, offers, queue]) if (r.error) throw r.error;
    S.players = players.data; S.matches = matches.data; S.events = events.data; S.sanctions = sancs.data || []; S.offers = offers.data; S.queue = queue.data;
    if (S.season.status === 'closed') {
      const { data: snapshot, error } = await sb.from('season_snapshots').select('*').eq('season_id', sid).maybeSingle();
      if (error) throw error;
      if (S.season.historical && !snapshot) throw new Error('Falta la copia histórica de esta temporada. Revisá la migración antes de continuar.');
      if (snapshot) { S.clubs = snapshot.clubs; S.players = snapshot.players; }
    }
    S.myClub = S.user ? (S.seasonTeams.find((t) => t.manager_id === S.user.id)?.club_id || null) : null;
    if (!S.profiles.length) await loadProfiles().catch(() => {});
    localStorage.setItem('uml_sid', sid);
  }
  async function refresh() { if (S.sid) await loadSeason(S.sid); await route(); }

  // ---------------- router ----------------
  const routes = {}; // name -> fn(params)
  function register(name, fn) { routes[name] = fn; }
  const NAV = [['inicio', 'Inicio'], ['tabla', 'Tabla'], ['fixture', 'Fixture'], ['stats', 'Estadísticas'], ['equipos', 'Equipos'], ['mercado', 'Mercado'], ['mi-equipo', 'Mi equipo'], ['mis-partidos', 'Mis partidos'], ['banco', 'UML Bank'], ['admin', 'Admin']];
  function renderNav(active) {
    const nav = $('#nav');
    if (!S.sid || !S.season) nav.innerHTML = '';
    else nav.innerHTML = NAV.filter(([k]) => (k !== 'admin' || isAdmin()) && (k !== 'mi-equipo' || S.myClub) && (k !== 'mis-partidos' || S.profile?.is_simulator))
      .map(([k, v]) => `<a href="${k === 'inicio' ? '#/' : `#/s/${S.sid}/${k}`}" class="${active === k ? 'active' : ''}">${v}</a>`).join('');
    const ub = $('#userbox');
    if (S.user) {
      const p = S.profile; const initials = (p?.username || '?').slice(0, 1).toUpperCase();
      ub.innerHTML = `<a href="#/perfil" class="avatar" title="Mi perfil">${p?.avatar_url ? `<img src="${esc(p.avatar_url)}">` : initials}</a><a href="#/perfil" style="color:#fff;font-weight:600">${esc(p?.username || '')}</a>${isAdmin() ? '<span class="badge white">admin</span>' : (p?.is_simulator ? '<span class="badge white">sim</span>' : '')}<button class="secondary sm" onclick="A.logout()">Salir</button>`;
    } else ub.innerHTML = `<a class="btn sm" href="#/login">Ingresar</a>`;
  }
  async function route() {
    const hash = location.hash || '#/';
    const parts = hash.slice(2).split('/').filter(Boolean);
    const app = $('#app');
    if(parts[0]!=='s') U.applyCompetitionTheme?.(null);
    try {
      if (parts[0] === 'login') { renderNav(null); return routes.login(); }
      if (parts[0] === 'perfil') { renderNav(null); return routes.perfil(parts[1]); }
      if (parts[0] === 'clubes') { renderNav(null); return await routes.clubes(); }
      if (parts[0] === 'nueva-temporada') { renderNav(null); return routes['nueva-temporada'](); }
      if (parts[0] === 's' && parts[1]) {
        const sid = parts[1], page = parts[2] || 'inicio';
        if (S.sid !== sid || !S.season) { app.innerHTML = '<div class="loading">Cargando temporada…</div>'; await loadSeason(sid); }
        else S.myClub = S.user ? (S.seasonTeams.find((t) => t.manager_id === S.user.id)?.club_id || null) : null;
        const map = { inicio: 'home-season', tabla: 'tabla', fixture: 'fixture', stats: 'stats', equipos: 'equipos', equipo: 'equipo', partido: 'partido', mercado: 'mercado', 'mi-equipo': 'mi-equipo', 'mis-partidos': 'mis-partidos', banco: 'banco', admin: 'admin', jugador: 'jugador', pizarra: 'pizarra' };
        U.themeForRoute?.(page,parts[3]);
        renderNav(page === 'equipo' ? 'equipos' : page === 'partido' ? 'fixture' : page);
        const fn = routes[map[page]];
        if (!fn) return (app.innerHTML = '<div class="empty">Página inexistente.</div>');
        return await fn(parts[3], parts[4]);
      }
      renderNav('inicio');
      await routes.home();
    } catch (e) { U.applyCompetitionTheme?.(null); err(e); app.innerHTML = `<div class="card"><h2>Error</h2><p>${esc(e.message)}</p><p><a href="#/">Volver al inicio</a></p></div>`; }
  }

  return { CFG, CUR, $, esc, fmt, fmtM, date, datetime, POS, POS_ORDER, GROUP, STAGE, EVENT, SANC, S, setClient, client, toast, modal, closeModal, err, isAdmin, isSim, rpc, confirmDo, formData, opt,
    club, player, comp, st, profile, managerName, compClubs, squad, playerSanctions, cfg, crest, clubLabel, statusBadge, sancBadges, pageHead, standings, matchGoals, tieWinner,
    loadProfile, loadProfiles, loadSettings, loadSeasons, loadSeason, refresh, register, renderNav, route };
})();
window.A = window.A || {};
