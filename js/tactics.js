/* Formación vertical: una alineación publicada por equipo y temporada. */
(() => {
  const { $, S, esc, POS, squad, club, st, isAdmin, rpc, toast, err, register, pageHead, opt } = U;
  let board = null;
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
    board = { cid, sid: S.sid, hash: location.hash, lineup: (team.tactics?.lineup || []).map((p) => ({ ...p })), bench: [...(team.tactics?.bench || [])], edit: editable(cid), dirty: false };
    const saved = team.tactics?.updated_at;
    $('#app').innerHTML = pageHead('Formación', esc(club(cid).name), `<a class="btn secondary" href="#/s/${S.sid}/equipo/${cid}">Ver equipo</a>`) +
      `<div class="alert info">Ataque hacia arriba ↑. ${board.edit ? 'Agregá jugadores, elegí su posición y arrastrá las fichas. También podés mover la ficha seleccionada con las flechas del teclado. Guardá para publicar la formación.' : 'Formación publicada por el equipo.'} Se muestra la última formación guardada para esta temporada.</div>
      <div class="tactics-layout"><div class="card"><div class="row between mb"><h3 style="margin:0">Campo de juego</h3><span class="badge" id="tactics-count"></span></div>
      <div id="tactics-pitch" class="tactics-pitch" aria-label="Campo vertical. Ataque hacia arriba"><div class="tactics-lines" aria-hidden="true"><i class="tactics-half"></i><i class="tactics-circle"></i><i class="tactics-area top"></i><i class="tactics-area bottom"></i></div><div id="tactics-pieces"></div></div></div>
      <div class="card"><h3>${board.edit ? 'Armar alineación' : 'Alineación'}</h3>${board.edit ? `<form id="tactics-add" class="mb"><div class="field"><label for="tactics-player">Jugador</label><select id="tactics-player" required></select></div><div class="field"><label for="tactics-position">Posición en la formación</label><select id="tactics-position">${positions('MC')}</select></div><button type="submit">Agregar al campo</button></form>` : ''}
      <div class="hr"></div><div class="row between mb"><h3 style="margin:0">Banco de suplentes</h3><span class="badge" id="tactics-bench-count"></span></div>${board.edit ? '<form id="tactics-bench-add" class="mb"><div class="field"><label for="tactics-bench-player">Suplente</label><select id="tactics-bench-player" required></select></div><button type="submit">Agregar al banco</button></form>' : ''}<div id="tactics-bench"></div><div class="hr"></div><h3>Titulares</h3><div id="tactics-roster"></div><p class="muted small mt" id="tactics-status">${saved ? 'Formación guardada.' : 'Todavía no hay una formación guardada.'}</p>${board.edit ? '<button id="tactics-save" class="mt">Guardar formación</button>' : ''}</div></div>`;
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
        render(); mark();
      });
      $('#tactics-bench-add').addEventListener('submit', (e) => {
        e.preventDefault(); const pid = $('#tactics-bench-player').value;
        if (!pid || !allowed(pid) || board.bench.includes(pid) || board.lineup.some((p) => p.player_id === pid)) return;
        if (board.bench.length >= 12) return toast('Solo podés elegir doce suplentes.', 'error');
        board.bench.push(pid); render(); mark();
      });
      $('#tactics-save').addEventListener('click', save);
    }
  });

  function render() {
    const { lineup, bench, edit } = board;
    $('#tactics-count').textContent = `${lineup.length}/11`;
    $('#tactics-pieces').innerHTML = lineup.map((p, i) => `<${edit ? 'button type="button"' : 'div'} class="tactics-piece ${edit ? 'movable' : ''}" data-index="${i}" style="left:${Number(p.x)}%;top:${Number(p.y)}%" ${edit ? `aria-label="Mover ${esc(name(p.player_id))}, ${esc(p.position)}"` : ''}><span class="tactics-disc">${esc(p.position)}</span><span class="tactics-name">${esc(name(p.player_id))}</span></${edit ? 'button' : 'div'}>`).join('');
    $('#tactics-roster').innerHTML = lineup.map((p, i) => `<div class="tactics-row"><div><b>${esc(name(p.player_id))}</b>${!allowed(p.player_id) ? '<div class="sanc">Ya no pertenece al plantel</div>' : ''}${U.sancBadges(p.player_id)}</div>${edit ? `<label class="sr-only" for="tactics-pos-${i}">Posición de ${esc(name(p.player_id))}</label><select id="tactics-pos-${i}" data-position="${i}">${positions(p.position)}</select><button type="button" class="xs danger" data-remove="${i}" aria-label="Quitar ${esc(name(p.player_id))}">Quitar</button>` : `<span class="badge">${esc(p.position)}</span>`}</div>`).join('') || '<p class="muted small">Sin jugadores en el campo.</p>';
    $('#tactics-bench-count').textContent = `${bench.length}/12`;
    $('#tactics-bench').innerHTML = bench.map((id, i) => `<div class="tactics-row"><span class="badge">${esc(U.player(id)?.position || '—')}</span><div><b>${esc(name(id))}</b>${!allowed(id) ? '<div class="sanc">Ya no pertenece al plantel</div>' : ''}${U.sancBadges(id)}</div>${edit ? `<button type="button" class="xs danger" data-bench-remove="${i}" aria-label="Quitar del banco a ${esc(name(id))}">Quitar</button>` : ''}</div>`).join('') || '<p class="muted small">Sin suplentes seleccionados.</p>';
    if (!edit) return;
    document.querySelectorAll('[data-bench-remove]').forEach((el) => el.addEventListener('click', () => { bench.splice(+el.dataset.benchRemove, 1); render(); mark(); }));
    const available = squad(board.cid).filter((p) => !lineup.some((t) => t.player_id === p.id) && !bench.includes(p.id));
    $('#tactics-player').innerHTML = '<option value="">Elegí un jugador</option>' + available.map((p) => opt(p.id, `${p.name} · ${p.position}`, '')).join('');
    $('#tactics-bench-player').innerHTML = $('#tactics-player').innerHTML;
    $('#tactics-bench-add button').disabled = bench.length >= 12 || !available.length;
    $('#tactics-add button').disabled = lineup.length >= 11 || !available.length;
    document.querySelectorAll('[data-position]').forEach((el) => el.addEventListener('change', () => { lineup[+el.dataset.position].position = el.value; render(); mark(); }));
    document.querySelectorAll('[data-remove]').forEach((el) => el.addEventListener('click', () => { lineup.splice(+el.dataset.remove, 1); render(); mark(); }));
    document.querySelectorAll('.tactics-piece').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); el.focus(); el.setPointerCapture(e.pointerId);
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
    const lineup = saving.lineup.map((p) => ({ ...p })), bench = [...saving.bench];
    button.disabled = true; button.textContent = 'Guardando…';
    try {
      await rpc('save_tactics', { p_season: saving.sid, p_club: saving.cid, p_lineup: lineup, p_bench: bench });
      // Actualizar solo el equipo guardado; no perder los cambios hechos durante la petición.
      if (S.sid === saving.sid) { const team = st(saving.cid); if (team) team.tactics = { lineup, bench, updated_at: new Date().toISOString() }; }
      if (board === saving && current()) {
        const changed = JSON.stringify(saving.lineup) !== JSON.stringify(lineup) || JSON.stringify(saving.bench) !== JSON.stringify(bench);
        saving.dirty = changed; $('#tactics-status').textContent = changed ? 'Hay cambios nuevos sin guardar.' : 'Formación guardada y publicada.';
        toast('Formación guardada', 'ok');
      }
    } catch (x) { if (board === saving && current()) { $('#tactics-status').textContent = 'No se pudo guardar. Tus cambios siguen en pantalla.'; err(x); } }
    finally { if (board === saving && current()) { button.disabled = false; button.textContent = 'Guardar formación'; } }
  }
  window.addEventListener('beforeunload', (e) => { if (current() && board.dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
