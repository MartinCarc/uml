/* Sponsors: catálogo del staff, contrato por temporada y medios del equipo. */
(() => {
  const { $, S, esc, fmtM, isAdmin, client, rpc, toast, err, opt } = U;
  const q = async (query) => { const {data,error}=await query; if(error) throw error; return data; };
  const mainText=(code,tier)=>({A:`Marcar ${tier===1?15:12} goles de liga`,B:'Terminar 5.º o mejor en liga',C:tier===1?'Terminar entre los primeros 4':'Ascender directamente o clasificar a la promoción',D:tier===1?'Ser campeón de Premier':'Ascender directamente o ganando la promoción'})[code];
  const cupText=(code,tier)=>({A:`Ganar ${tier===1?2:1} partido(s) del grupo de UML Cup`,B:'Clasificar a cuartos de UML Cup',C:tier===1?'Llegar a semifinales de UML Cup':'Llegar a cuartos de UML Cup',D:tier===1?'Ser campeón de UML Cup':'Llegar a la final de UML Cup'})[code];
  const bonus={A:15,B:20,C:30,D:40};
  function terms(code,tier) {
    const fine={A:'10 %',B:tier===1?'20 %; 30 % si queda en promoción y se salva; 40 % si desciende':'30 % si termina 6.º, 7.º u 8.º',C:tier===1?'35 %; 45 % si queda en promoción y se salva; 55 % si desciende':'35 %; 45 % si termina entre los últimos tres',D:tier===1?'50 %; 60 % si queda en promoción y se salva; 70 % si desciende':'50 %; 60 % si termina entre los últimos tres'}[code];
    return `<p><b>Principal:</b> ${mainText(code,tier)}.</p><p><b>Extra:</b> ${cupText(code,tier)}.</p><p><b>Bonus:</b> ${bonus[code]} % si cumple ambos.</p><p><b>Devolución por incumplir el principal:</b> ${fine}. Se aplica un solo castigo, el mayor.</p>`;
  }
  U.uploadMedia=async(file,folder)=>{
    if(!isAdmin()) throw new Error('Solo administradores pueden subir imágenes.');
    if(!file || !file.size) return null;
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
    if(!ext || file.size>5*1024*1024) throw new Error('Usá una imagen JPG, PNG o WebP de hasta 5 MB.');
    const path=`${folder}/${crypto.randomUUID()}.${ext}`,bucket=client().storage.from('uml-media');
    await q(bucket.upload(path,file,{contentType:file.type,upsert:false}));
    return bucket.getPublicUrl(path).data.publicUrl;
  };
  U.sponsorAdmin=async()=>{
    if(!isAdmin()) return '<div class="empty">Solo administradores.</div>';
    const sponsors=await q(client().from('sponsors').select('*').order('code'));
    return '<div class="alert info">Configurá nombre, imagen y pago por división. Los equipos eligen antes del inicio. Los contratos se fijan y se pagan al iniciar; bonus y devoluciones se liquidan al cerrar. No se pagan contratos retroactivos.</div><div class="grid c2">'+sponsors.map(sp=>`<div class="card"><h3>Sponsor ${sp.code}</h3>${sp.image_url?`<img class="sponsor-logo mb" src="${esc(sp.image_url)}" alt="${esc(sp.name)}">`:''}<form onsubmit="A.saveSponsor(event,'${sp.id}')"><div class="field"><label>Nombre</label><input name="name" value="${esc(sp.name)}" required></div><div class="field"><label>Imagen (JPG, PNG o WebP, hasta 5 MB)</label><input type="file" name="image_file" accept="image/jpeg,image/png,image/webp"></div><div class="field"><label>O enlace de imagen</label><input name="image_url" type="url" value="${esc(sp.image_url||'')}"></div><div class="fields"><div><label>Pago inicial · Premier</label><input name="payment_tier1" type="number" min="0" step="0.01" value="${sp.payment_tier1??''}"></div><div><label>Pago inicial · Championship</label><input name="payment_tier2" type="number" min="0" step="0.01" value="${sp.payment_tier2??''}"></div></div><label class="check mb"><input type="checkbox" name="enabled" ${sp.enabled?'checked':''}> Disponible para elegir</label><details><summary>Condiciones · Premier</summary><div class="small mt">${terms(sp.code,1)}</div></details><details class="mb"><summary>Condiciones · Championship</summary><div class="small mt">${terms(sp.code,2)}</div></details><button type="submit">Guardar sponsor</button></form></div>`).join('')+'</div>';
  };
  A.saveSponsor=async(e,id)=>{
    e.preventDefault();if(!isAdmin())return;
    const f=new FormData(e.target),button=e.target.querySelector('[type=submit]');button.disabled=true;
    try{
      const image=await U.uploadMedia(f.get('image_file'),'sponsors');
      await q(client().from('sponsors').update({name:String(f.get('name')).trim(),image_url:image||f.get('image_url')||null,payment_tier1:f.get('payment_tier1')===''?null:Number(f.get('payment_tier1')),payment_tier2:f.get('payment_tier2')===''?null:Number(f.get('payment_tier2')),enabled:!!f.get('enabled')}).eq('id',id));
      toast('Sponsor guardado','ok');await U.route();
    }catch(x){err(x);button.disabled=false;}
  };
  U.sponsorCard=async(cid)=>{
    const team=U.st(cid);if(!team)return '';
    let ct,catalog;
    try{
      ct=await q(client().from('team_sponsor_contracts').select('*').eq('season_id',S.sid).eq('club_id',cid).maybeSingle());
      catalog=await q(client().from('sponsors').select('*').order('code'));
    }catch(x){return '<div class="card"><h3>Sponsor</h3><p class="muted small">No se pudo consultar el sponsor. Volvé a intentarlo.</p></div>';}
    const canChoose=S.season.status==='draft'&&!S.season.historical&&(isAdmin()||S.myClub===cid);
    let draftWarning='';
    if(ct && S.season.status==='draft') {
      const sp=catalog.find((r)=>r.id===ct.sponsor_id), amount=team.tier===1?sp?.payment_tier1:sp?.payment_tier2;
      if(sp && sp.enabled && sp.name.trim() && amount!=null) {
        ct={...ct,name:sp.name,image_url:sp.image_url,tier:team.tier,amount,rules:await q(client().rpc('sponsor_rules',{p_code:sp.code,p_tier:team.tier}))};
      } else draftWarning='<div class="alert warn">El staff debe completar o habilitar este sponsor antes del inicio. También podés elegir otro.</div>';
    }
    let detail='<p class="muted">Sin sponsor seleccionado.</p>';
    if(ct){
      const assessment=ct.assessment||await q(client().rpc('sponsor_assessment',{p_season:S.sid,p_club:cid,p_rules:ct.rules}));
      const status=(ok,cancelled)=>cancelled?'Condición anulada':ok==null?'En juego':ok?'Cumplido':'No cumplido';
      detail=`${ct.image_url?`<img class="sponsor-logo mb" src="${esc(ct.image_url)}" alt="${esc(ct.name)}">`:''}<h3>${esc(ct.name)} <span class="badge">${ct.code} · ${ct.tier===1?'Premier':'Championship'}</span></h3><p><b>Pago al inicio:</b> ${fmtM(ct.amount)} · ${ct.paid_at?'Acreditado':'Pendiente del inicio'}</p><div class="small">${terms(ct.code,ct.tier)}</div><p class="small"><b>Liga:</b> ${status(assessment.primary_met,assessment.primary_cancelled)} · ${assessment.league_goals} goles${assessment.league_position?' · puesto '+assessment.league_position:''}<br><b>Copa:</b> ${status(assessment.cup_met,assessment.cup_cancelled)}${ct.code==='A'?' · '+assessment.group_wins+' victorias en grupos':''}</p>${ct.settled_at?`<p class="small"><b>Liquidado:</b> bonus ${fmtM(ct.bonus)} · devolución ${fmtM(ct.fine)}</p>`:''}`;
    }
    const options=catalog.map(sp=>{
      const amount=team.tier===1?sp.payment_tier1:sp.payment_tier2;
      const enabled=sp.enabled&&sp.name.trim()&&amount!=null;
      return `<option value="${sp.code}" ${ct?.code===sp.code?'selected':''} ${enabled?'':'disabled'}>${esc(sp.name||'Sponsor '+sp.code)} · ${enabled?fmtM(amount):'Sin habilitar'}</option>`;
    }).join('');
    return `<div class="card"><h3>Sponsor de la temporada</h3>${draftWarning}${detail}${canChoose?`<div class="field mt"><label>Elegir sponsor</label><select onchange="A.chooseSponsor('${cid}',this.value)"><option value="">Sin sponsor</option>${options}</select></div><details class="mb"><summary>Comparar condiciones</summary>${catalog.map((sp)=>`<div class="mt small"><h3>${esc(sp.name||'Sponsor '+sp.code)}</h3>${terms(sp.code,team.tier)}</div>`).join('')}</details><div class="small muted">Los importes y condiciones se fijan al comenzar la temporada. Cada contrato tiene un objetivo de liga y uno de copa.</div>`:S.season.status==='active'&&!ct?'<p class="small muted">La elección estará disponible antes de iniciar la próxima temporada.</p>':''}</div>`;
  };
  A.chooseSponsor=async(cid,code)=>{
    try{await rpc('choose_sponsor',{p_season:S.sid,p_club:cid,p_code:code||null});toast('Sponsor seleccionado','ok');await U.route();}catch(x){err(x);}
  };
  A.cupGroups=cid=>U.confirmDo('¿Sortear cuatro grupos y generar los 24 partidos? Cada club tendrá una o dos localías.',async()=>{await rpc('generate_cup_groups',{p_competition:cid});toast('Grupos generados','ok');await U.refresh();});
  A.neutralCapacity=async(e,cid)=>{
    e.preventDefault();try{await rpc('set_cup_neutral_capacity',{p_competition:cid,p_capacity:Number(new FormData(e.target).get('capacity'))});toast('Capacidad guardada','ok');await U.refresh();}catch(x){err(x);}
  };
  A.cancelCompetition=cid=>U.confirmDo('¿Anular esta competencia? Se conservan sus partidos. Sus objetivos de sponsor quedan sin evaluar, sin premio ni castigo por esa condición.',async()=>{await rpc('cancel_competition',{p_competition:cid});await U.refresh();});
})();
