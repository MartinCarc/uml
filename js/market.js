/* =====================================================================
   UML - mercado de pases y Mi equipo
   ===================================================================== */
(() => {
  const { $, esc, fmt, fmtM, date, POS, S, toast, modal, closeModal, err, isAdmin, rpc, opt, club, player, comp, st, profile, managerName, squad, cfg, crest, clubLabel, sancBadges, pageHead, refresh, register, client } = U;
  const sb = () => client();
  const myST = () => st(S.myClub);
  const available = (cid) => { const t = st(cid); return Number(t?.budget || 0) - Number(t?.reserved || 0); };

  // ---------------- MERCADO ----------------
  let mTab = 'transferibles';
  A.mTab = (k) => { mTab = k; U.route(); };
  register('mercado', () => {
    const my = S.myClub; const s = S.season;
    const tabs = [['transferibles', 'Transferibles'], ['cedibles', 'Cedibles'], ['libres', 'Agentes libres'], ['ofertas', `Mis negociaciones${my ? pendingCount() : ''}`], ['espera', `Lista de espera (${S.queue.length})`], ['historial', 'Últimos pases']];
    const head = pageHead('Mercado de pases', esc(s.name), `<span class="badge ${s.market_open ? 'green' : 'red'}" style="font-size:13px;padding:6px 12px">${s.market_open ? 'Mercado abierto' : 'Mercado cerrado'}</span>`) +
      (!s.market_open ? `<div class="alert warn"><b>${esc(s.market_label || 'Mercado cerrado')}.</b> Podés negociar y acordar, pero los pases, fichajes y liberaciones se ejecutan cuando el staff abra el próximo mercado.</div>` : '') +
      (!S.user ? '<div class="alert info"><a href="#/login">Ingresá</a> para participar del mercado.</div>' : (!my ? '<div class="alert info">No dirigís ningún equipo en esta temporada; podés mirar el mercado.</div>' : `<div class="alert info row between"><span>${clubLabel(my, false)} · Disponible: <span class="money">${fmt(available(my))}</span>${Number(myST()?.reserved) ? ` <span class="muted small">(reservado ${fmtM(myST().reserved)})</span>` : ''}</span><span>Plantel: <b>${squadCountLabel(my)}</b></span></div>`));
    let body;
    if (mTab === 'transferibles' || mTab === 'cedibles') {
      const list = S.players.filter((p) => p.club_id && (mTab === 'transferibles' ? p.transfer_listed : p.loan_listed) && !p.loan_from_club_id).sort((a, b) => (b.overall || 0) - (a.overall || 0));
      body = list.length ? playersTable(list, { price: true, club: true, actions: (p) => my && p.club_id !== my ? `<button class="sm" onclick="A.offerModal('${p.club_id}','${p.id}',${mTab === 'cedibles'})">${mTab === 'cedibles' ? 'Pedir cesión' : 'Ofertar'}</button>` : '' }) : `<div class="empty">No hay jugadores ${mTab} por ahora. Entrá a cualquier equipo para ofertar por un jugador que no esté en lista.</div>`;
    } else if (mTab === 'libres') {
      const list = S.players.filter((p) => !p.club_id).sort((a, b) => (b.overall || 0) - (a.overall || 0));
      body = `<p class="muted small">Los agentes libres se fichan sin costo. ${s.market_open ? '' : 'Con el mercado cerrado, el fichaje queda en lista de espera.'}</p>` + (list.length ? playersTable(list, { actions: (p) => my ? (S.queue.some((q) => q.player_id === p.id) ? '<span class="badge">En espera</span>' : `<button class="sm" onclick="A.sign('${p.id}')">Fichar</button>`) : '' }) : '<div class="empty">No hay agentes libres.</div>');
    } else if (mTab === 'ofertas') body = offersPanel();
    else if (mTab === 'espera') {
      body = S.queue.length ? `<table><thead><tr><th>Tipo</th><th>Detalle</th><th>Equipo</th><th>Desde</th></tr></thead><tbody>${S.queue.map((q) => { const o = q.kind === 'offer' ? S.offers.find((x) => x.id === q.ref_id) : null; return `<tr><td><span class="badge">${{ offer: 'Pase', free_sign: 'Fichaje libre', release: 'Liberación', auction: 'Subasta', raffle: 'Sorteo', training: 'Gimnasio' }[q.kind]}</span></td><td>${o ? offerSummary(o) : esc(player(q.player_id)?.name || '')}</td><td>${q.club_id ? clubLabel(q.club_id) : ''}</td><td class="muted small">${date(q.created_at)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">No hay operaciones esperando el próximo mercado.</div>';
    } else {
      const hist = S.offers.filter((o) => o.status === 'executed').slice(0, 40);
      body = hist.length ? hist.map((o) => `<div class="list-item"><div>${offerSummary(o)}</div><span class="muted small">${date(o.executed_at)}</span></div>`).join('') : '<div class="empty">Todavía no hubo pases.</div>';
    }
    $('#app').innerHTML = head + `<div class="tabs">${tabs.map(([k, v]) => `<button class="${k === mTab ? 'active' : ''}" onclick="A.mTab('${k}')">${v}</button>`).join('')}</div><div class="card"><div class="table-wrap">${body}</div></div>`;
  });
  const pendingCount = () => { const n = S.offers.filter((o) => o.status === 'pending' && o.responder_turn === S.myClub).length; return n ? ` (${n})` : ''; };
  const squadCountLabel = (cid) => { const n = squad(cid).length; const lim = cfg().squad_limit; const pend = S.queue.filter((q) => q.club_id === cid && ['free_sign', 'auction', 'raffle'].includes(q.kind)).length; return `<span style="color:${n >= lim ? 'var(--red)' : 'inherit'}">${n}/${lim}</span>${pend ? ` <span class="muted small">+${pend} por ingresar</span>` : ''}`; };
  function playersTable(list, opts = {}) {
    return `<table><thead><tr><th>Pos</th><th>Jugador</th>${opts.club ? '<th>Equipo</th>' : ''}<th class="num">Edad</th><th class="num">Media</th>${opts.price ? '<th class="num">Valor</th>' : ''}<th></th></tr></thead><tbody>${list.map((p) => `<tr><td><span class="badge" title="${POS[p.position]}">${p.position}</span></td><td><a href="#/s/${S.sid}/jugador/${p.id}" style="color:inherit"><b>${esc(p.name)}</b></a> ${sancBadges(p.id)}</td>${opts.club ? `<td>${clubLabel(p.club_id)}</td>` : ''}<td class="num">${p.age}</td><td class="num">${p.overall ?? '-'}</td>${opts.price ? `<td class="num">${fmtM(p.value)}</td>` : ''}<td class="right">${opts.actions ? opts.actions(p) : ''}</td></tr>`).join('')}</tbody></table>`;
  }
  function offerSummary(o) {
    const names = (ids) => (ids || []).map((id) => `<b>${esc(player(id)?.name || '?')}</b>`).join(', ');
    const parts = [];
    if (o.players_ask?.length) parts.push(`${o.is_loan ? 'cesión de ' : ''}${names(o.players_ask)} de ${esc(club(o.seller_club_id)?.name)}`);
    if (o.players_give?.length) parts.push(`${names(o.players_give)} de ${esc(club(o.buyer_club_id)?.name)}`);
    let money = '';
    if (Number(o.money_give) > 0) money = ` + <span class="money">${fmtM(o.money_give)}</span> que paga ${esc(club(o.buyer_club_id)?.name)}`;
    if (Number(o.money_ask) > 0) money = ` + <span class="money">${fmtM(o.money_ask)}</span> que paga ${esc(club(o.seller_club_id)?.name)}`;
    return `${esc(club(o.buyer_club_id)?.name)} ↔ ${esc(club(o.seller_club_id)?.name)}: ${parts.join(' por ')}${money}`;
  }
  const STATUS = { pending: ['Pendiente', 'blue'], accepted: ['Acordado · espera mercado', 'amber'], executed: ['Ejecutado', 'green'], rejected: ['Rechazada', 'red'], cancelled: ['Cancelada', ''], countered: ['Contraofertada', ''] };
  function offersPanel() {
    const my = S.myClub; if (!my) return '<div class="empty">Necesitás dirigir un equipo para negociar.</div>';
    const mine = S.offers.filter((o) => o.buyer_club_id === my || o.seller_club_id === my);
    const toAnswer = mine.filter((o) => o.status === 'pending' && o.responder_turn === my);
    const waiting = mine.filter((o) => o.status === 'pending' && o.responder_turn !== my);
    const agreed = mine.filter((o) => o.status === 'accepted');
    const past = mine.filter((o) => ['executed', 'rejected', 'cancelled', 'countered'].includes(o.status)).slice(0, 20);
    const row = (o, actions = '') => `<div class="list-item"><div>${offerSummary(o)}<div class="muted tiny">${date(o.created_at)} · propuso ${esc(profile(o.created_by)?.username || '')}${o.parent_offer_id ? ' · contraoferta' : ''}</div></div><div class="row"><span class="badge ${STATUS[o.status][1]}">${STATUS[o.status][0]}</span>${actions}</div></div>`;
    return `<h3>Me toca responder (${toAnswer.length})</h3>${toAnswer.map((o) => row(o, `<button class="sm" onclick="A.respond('${o.id}',true)">Aceptar</button><button class="sm secondary" onclick="A.counterModal('${o.id}')">Contraoferta</button><button class="sm danger" onclick="A.respond('${o.id}',false)">Rechazar</button>`)).join('') || '<div class="empty">Nada pendiente.</div>'}
      <h3 class="mt">Esperando respuesta (${waiting.length})</h3>${waiting.map((o) => row(o, `<button class="sm secondary" onclick="A.cancelOffer('${o.id}')">Cancelar</button>`)).join('') || '<div class="empty">Ninguna.</div>'}
      <h3 class="mt">Acuerdos cerrados pendientes de ejecución (${agreed.length})</h3>${agreed.map((o) => row(o)).join('') || '<div class="empty">Ninguno.</div>'}
      <h3 class="mt">Historial</h3>${past.map((o) => row(o)).join('') || '<div class="empty">Sin historial.</div>'}`;
  }

  // ---------------- constructor de ofertas ----------------
  function offerForm(sellerId, prefill = {}) {
    const my = S.myClub; const mySquad = squad(my).filter((p) => !p.loan_from_club_id); const theirSquad = squad(sellerId).filter((p) => !p.loan_from_club_id);
    const check = (p, name, sel) => `<label class="check"><input type="checkbox" name="${name}" value="${p.id}" ${sel?.includes(p.id) ? 'checked' : ''}> <span class="badge">${p.position}</span> ${esc(p.name)} <span class="muted tiny">${p.overall ?? ''}${' · ' + fmtM(p.value)}</span></label>`;
    return `
      <div class="kicker mb">Pido de ${esc(club(sellerId)?.name)}</div><div class="check-list mb">${theirSquad.map((p) => check(p, 'ask', prefill.ask)).join('')}</div>
      ${prefill.loan ? '' : `<div class="kicker mb">Entrego de mi equipo (opcional)</div><div class="check-list mb">${mySquad.map((p) => check(p, 'give', prefill.give)).join('')}</div>`}
      <div class="fields"><div><label>Dinero que pago (${U.CUR})</label><input name="money_give" type="number" min="0" step="100000" value="${prefill.money_give ?? 0}"></div><div><label>Dinero que pido a cambio (${U.CUR})</label><input name="money_ask" type="number" min="0" step="100000" value="${prefill.money_ask ?? 0}"></div></div>
      <div class="help">Disponible: <b>${fmt(available(my))}</b> · Plantel: ${squadCountLabel(my)} (tope ${cfg().squad_limit}). El dinero va en un solo sentido.</div>`;
  }
  A.offerModal = (sellerId, pid, loan = false) => {
    if (!S.myClub) return toast('Necesitás dirigir un equipo para ofertar', 'error');
    modal(`<h2>${loan ? 'Pedir cesión' : 'Nueva oferta'} a ${esc(club(sellerId)?.name)}</h2>${loan ? '<div class="alert info">Cesión hasta el final de la temporada. El jugador vuelve solo a su club al cerrar la temporada.</div>' : ''}
      <form onsubmit="A.sendOffer(event,'${sellerId}',${loan})">${offerForm(sellerId, { ask: pid ? [pid] : [], loan, money_give: player(pid)?.value || 0 })}
      <div class="row"><button type="submit">Enviar oferta</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`, true);
  };
  const readOffer = (form) => { const f = new FormData(form); return { ask: f.getAll('ask'), give: f.getAll('give'), money_give: Number(f.get('money_give') || 0), money_ask: Number(f.get('money_ask') || 0) }; };
  A.sendOffer = async (e, sellerId, loan) => {
    e.preventDefault(); const o = readOffer(e.target);
    try { await rpc('create_offer', { p_season: S.sid, p_buyer: S.myClub, p_seller: sellerId, p_ask: o.ask, p_give: o.give, p_money_give: o.money_give, p_money_ask: o.money_ask, p_is_loan: loan }); closeModal(); toast('Oferta enviada. El otro DT tiene que responder.', 'ok'); mTab = 'ofertas'; refresh(); } catch (x) { err(x); }
  };
  A.counterModal = (oid) => {
    const o = S.offers.find((x) => x.id === oid); const iAmSeller = o.seller_club_id === S.myClub;
    // el formulario siempre se expresa desde el comprador original; si soy el vendedor, invierto la vista
    const sellerId = o.seller_club_id; const buyerId = o.buyer_club_id;
    const check = (p, name, sel) => `<label class="check"><input type="checkbox" name="${name}" value="${p.id}" ${sel?.includes(p.id) ? 'checked' : ''}> <span class="badge">${p.position}</span> ${esc(p.name)} <span class="muted tiny">${p.overall ?? ''}</span></label>`;
    modal(`<h2>Contraoferta</h2><p class="muted small">Propuesta actual: ${offerSummary(o)}</p>
      <form onsubmit="A.sendCounter(event,'${oid}')">
        <div class="kicker mb">Jugadores de ${esc(club(sellerId)?.name)} que pasan a ${esc(club(buyerId)?.name)}</div><div class="check-list mb">${squad(sellerId).filter((p) => !p.loan_from_club_id).map((p) => check(p, 'ask', o.players_ask)).join('')}</div>
        ${o.is_loan ? '' : `<div class="kicker mb">Jugadores de ${esc(club(buyerId)?.name)} que pasan a ${esc(club(sellerId)?.name)}</div><div class="check-list mb">${squad(buyerId).filter((p) => !p.loan_from_club_id).map((p) => check(p, 'give', o.players_give)).join('')}</div>`}
        <div class="fields"><div><label>Dinero que paga ${esc(club(buyerId)?.name)}</label><input name="money_give" type="number" min="0" step="100000" value="${o.money_give}"></div><div><label>Dinero que paga ${esc(club(sellerId)?.name)}</label><input name="money_ask" type="number" min="0" step="100000" value="${o.money_ask}"></div></div>
        <div class="row"><button type="submit">Enviar contraoferta</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`, true);
  };
  A.sendCounter = async (e, oid) => { e.preventDefault(); const o = readOffer(e.target); try { await rpc('counter_offer', { p_offer: oid, p_ask: o.ask, p_give: o.give, p_money_give: o.money_give, p_money_ask: o.money_ask }); closeModal(); toast('Contraoferta enviada', 'ok'); refresh(); } catch (x) { err(x); } };
  A.respond = async (oid, accept) => {
    if (accept && !confirm('Al aceptar, el acuerdo es vinculante y no se puede cancelar. ' + (S.season.market_open ? 'Se ejecuta ahora.' : 'Se ejecutará al abrir el próximo mercado.') + ' ¿Confirmás?')) return;
    try { await rpc('respond_offer', { p_offer: oid, p_accept: accept }); toast(accept ? 'Acuerdo cerrado' : 'Oferta rechazada', 'ok'); refresh(); } catch (x) { err(x); }
  };
  A.cancelOffer = async (oid) => { try { await rpc('cancel_offer', { p_offer: oid }); toast('Oferta cancelada', 'ok'); refresh(); } catch (x) { err(x); } };
  A.sign = async (pid) => { const p = player(pid); if (!confirm(`¿Fichar a ${p.name} como agente libre (sin costo)?`)) return; try { await rpc('sign_free_agent', { p_season: S.sid, p_player: pid, p_club: S.myClub }); toast(S.season.market_open ? '¡Fichaje realizado!' : 'Fichaje en lista de espera', 'ok'); refresh(); } catch (x) { err(x); } };
  A.release = async (pid) => { const p = player(pid); if (!confirm(`¿Liberar a ${p.name}? Pasa a ser agente libre sin costo ni compensación.`)) return; try { await rpc('release_player', { p_season: S.sid, p_player: pid }); toast(S.season.market_open ? 'Jugador liberado' : 'Liberación en lista de espera', 'ok'); refresh(); } catch (x) { err(x); } };

  // ---------------- MI EQUIPO ----------------
  let myTab = 'plantel';
  A.myTab = (k) => { myTab = k; U.route(); };
  register('mi-equipo', async () => {
    const my = S.myClub; if (!my) return ($('#app').innerHTML = pageHead('Mi equipo') + '<div class="empty">No dirigís ningún equipo en esta temporada. Pedile al staff que te asigne uno.</div>');
    const c = club(my), t = myST(); const conf = cfg();
    const league = S.competitions.find((x) => x.kind === 'league' && U.compClubs(x.id).includes(my)); const pos = league ? U.standings(league.id).find((r) => r.club_id === my)?.pos : null;
    const toAnswer = S.offers.filter((o) => o.status === 'pending' && o.responder_turn === my).length;
    const tabs = [['plantel', 'Plantel'], ['gimnasio', 'Gimnasio'], ['caja', 'Libro de caja']];
    let body;
    if (myTab === 'plantel') {
      body = `<p class="muted small">Podés modificar el valor y el dorsal de tus jugadores, y marcarlos como transferibles o cedibles. Liberar es gratis y sin compensación.</p>` +
        U.squadTable(my, { actions: (p) => p.loan_from_club_id ? '<span class="muted tiny">cedido</span>' : `<button class="sm secondary" onclick="A.editMyPlayer('${p.id}')">Editar</button> <button class="sm ghost" onclick="A.release('${p.id}')">Liberar</button>` });
    } else if (myTab === 'gimnasio') {
      const { data: tr } = await sb().from('player_training').select('*').eq('season_id', S.sid).eq('club_id', my);
      const used = (pid) => (tr || []).filter((x) => x.player_id === pid);
      const elig = squad(my).filter((p) => !p.loan_from_club_id && p.age <= 24);
      body = `<div class="alert info">Solo jugadores de hasta 24 años. 15-20 años: 3 entrenamientos por temporada; 21-24: 2. Cada entrenamiento suma +1 a la media y cuesta <b>${fmtM(conf.gym_cost)}</b> (va al UML Bank). ${S.season.market_open ? 'Se aplica al instante.' : 'Con el mercado cerrado, se paga ahora y se aplica al abrir el próximo mercado.'} Vales disponibles: <b>${t.gym_vouchers}</b>.</div>` +
        (elig.length ? `<table><thead><tr><th>Jugador</th><th class="num">Edad</th><th class="num">Media</th><th>Entrenamientos</th><th></th></tr></thead><tbody>${elig.map((p) => { const u = used(p.id); const max = p.age <= 20 ? 3 : 2; const pend = u.filter((x) => !x.applied).length; return `<tr><td><b>${esc(p.name)}</b> <span class="badge">${p.position}</span></td><td class="num">${p.age}</td><td class="num">${p.overall ?? '-'}${pend ? ` <span class="muted tiny">(+${pend} pendiente)</span>` : ''}</td><td>${u.length}/${max}</td><td class="right">${u.length < max ? `<button class="sm" onclick="A.train('${p.id}',false)">Entrenar</button> ${t.gym_vouchers > 0 ? `<button class="sm secondary" onclick="A.train('${p.id}',true)">Usar vale</button>` : ''}` : '<span class="muted tiny">sin cupo</span>'}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">No tenés jugadores de hasta 24 años.</div>');
    } else {
      const { data: tx } = await sb().from('transactions').select('*').eq('club_id', my).eq('season_id', S.sid).order('created_at', { ascending: false }).limit(200);
      let bal = Number(t.budget); const rows = (tx || []).map((x) => { const r = { ...x, bal }; bal -= Number(x.amount); return r; });
      body = rows.length ? `<table><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Monto</th><th class="num">Saldo</th></tr></thead><tbody>${rows.map((x) => `<tr><td class="muted small">${date(x.created_at)}</td><td>${esc(x.description)}</td><td class="num money ${x.amount < 0 ? 'neg' : ''}">${x.amount >= 0 ? '+' : '−'}${fmtM(Math.abs(x.amount))}</td><td class="num muted">${fmtM(x.bal)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin movimientos.</div>';
    }
    $('#app').innerHTML = `<div class="card navy"><div class="row" style="gap:18px">${crest(c, 'xl')}<div><div class="kicker" style="color:#8FB0EE">Mi equipo</div><h1 style="margin:0">${esc(c.name)}</h1><a class="btn sm mt" href="#/s/${S.sid}/pizarra/${my}">Pizarra táctica</a></div>
        <div class="grid c4" style="margin-left:auto;min-width:300px"><div class="stat"><div class="v">${fmtM(available(my))}</div><div class="l">Disponible${Number(t.reserved) ? ` · res. ${fmtM(t.reserved)}` : ''}</div></div><div class="stat"><div class="v">${pos ?? '-'}°</div><div class="l">Posición</div></div><div class="stat"><div class="v">${squad(my).length}/${conf.squad_limit}</div><div class="l">Plantel</div></div><div class="stat"><div class="v">${toAnswer}</div><div class="l">Ofertas por responder</div></div></div></div>
        ${toAnswer ? `<div class="mt"><a href="#/s/${S.sid}/mercado" class="btn sm" style="background:#fff;color:#0A2A66">Responder ofertas →</a></div>` : ''}</div>
      <div class="tabs">${tabs.map(([k, v]) => `<button class="${k === myTab ? 'active' : ''}" onclick="A.myTab('${k}')">${v}</button>`).join('')}</div><div class="card"><div class="table-wrap">${body}</div></div>`;
  });
  A.editMyPlayer = (pid) => {
    const p = player(pid);
    modal(`<h2>${esc(p.name)}</h2><form onsubmit="A.saveMyPlayer(event,'${pid}')">
      <div class="fields"><div><label>Valor (${U.CUR})</label><input name="value" type="number" min="0" step="1" value="${p.value ?? 0}" required></div><div><label>Dorsal</label><input name="number" type="number" min="1" max="99" value="${p.number ?? ''}"></div></div>
      <label class="check mb"><input type="checkbox" name="transfer" ${p.transfer_listed ? 'checked' : ''}> Transferible (aparece en el mercado)</label>
      <label class="check mb"><input type="checkbox" name="loan" ${p.loan_listed ? 'checked' : ''}> Cedible a préstamo</label>
      <div class="row"><button type="submit">Guardar</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`);
  };
  A.saveMyPlayer = async (e, pid) => { e.preventDefault(); const f = new FormData(e.target); try { await rpc('update_my_player', { p_player: pid, p_season: S.sid, p_price: Number(f.get('value')), p_number: f.get('number') ? Number(f.get('number')) : null, p_transfer: !!f.get('transfer'), p_loan: !!f.get('loan') }); closeModal(); toast('Guardado', 'ok'); refresh(); } catch (x) { err(x); } };
  A.train = async (pid, voucher) => { const p = player(pid); if (!confirm(`¿Entrenar a ${p.name}${voucher ? ' usando un vale' : ' por ' + fmtM(cfg().gym_cost)}? Suma +1 a la media.`)) return; try { await rpc('train_player', { p_season: S.sid, p_player: pid, p_use_voucher: voucher }); toast('Entrenamiento registrado', 'ok'); refresh(); } catch (x) { err(x); } };
})();
