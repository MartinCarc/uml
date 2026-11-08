/* Identidad por competencia; las secciones generales mantienen el estilo UML. */
(() => {
  const { S, esc, comp, pageHead } = U;
  const identity = (c) => !c ? null : c.kind==='league' ? (c.tier===2?'championship':'premier') : ({cup:'cup',supercup:'supercup',promotion:'promotion'}[c.kind]||null);
  U.competitionIdentity=identity;
  U.applyCompetitionTheme=(c)=>{
    const key=identity(c);
    if(key) document.documentElement.dataset.competition=key;
    else delete document.documentElement.dataset.competition;
  };
  U.themeForRoute=(page,id)=>{
    let c=null;
    if(page==='tabla') c=comp(id)||S.competitions.find(r=>r.kind==='league');
    else if(page==='fixture') c=comp(id)||S.competitions[0];
    else if(page==='partido') c=comp(S.matches.find(m=>m.id===id)?.competition_id);
    else if(page==='stats') c=U.statsCompetition?.();
    U.applyCompetitionTheme(c);
  };
  U.competitionMark=(c,extra='')=>{
    if(!c)return '';
    const key=identity(c),source=c.logo_url||U.CFG.COMPETITION_LOGOS?.[key];
    const tag={premier:'PRE',championship:'CHA',cup:'CUP',supercup:'SUP',promotion:'PRO'}[key]||'UML';
    return `<span class="competition-mark ${extra}" ${extra==='competition-tab-logo'?'aria-hidden="true"':''}>${source?`<img src="${esc(source)}" alt="${esc(c.name)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`:''}<span class="competition-placeholder" ${source?'hidden':''} title="Logo pendiente de cargar">${tag}</span></span>`;
  };
  U.competitionHead=(c,sub='',actions='')=>!c?pageHead('Competencia',sub,actions):
    `<div class="page-head competition-head"><div class="competition-heading">${U.competitionMark(c)}<div><h1>${esc(c.name)}</h1>${sub?`<div class="sub">${sub}</div>`:''}</div></div>${actions?`<div class="actions">${actions}</div>`:''}</div>`;
  U.competitionIdentityForm=(c)=>S.season.status==='closed'?'':
    `<details class="mt"><summary>Logo de la competencia</summary><form class="mt" onsubmit="A.saveCompetitionIdentity(event,'${c.id}')">${U.competitionMark(c)}<div class="field mt"><label>Logo (PNG, JPG o WebP, hasta 5 MB)</label><input type="file" name="logo_file" accept="image/png,image/jpeg,image/webp"></div><div class="field"><label>O enlace del logo</label><input name="logo_url" type="url" value="${esc(c.logo_url||'')}"></div><p class="muted small">La paleta se aplica automáticamente según la competencia. El archivo se muestra completo, sin recortes.</p><button type="submit" class="sm">Guardar logo</button></form></details>`;
  A.saveCompetitionIdentity=async(e,id)=>{
    e.preventDefault();if(!U.isAdmin())return;
    const button=e.target.querySelector('[type=submit]'),f=new FormData(e.target);button.disabled=true;
    try{
      const image=await U.uploadMedia(f.get('logo_file'),'competitions');
      const logo_url=image||f.get('logo_url')||null;
      const {error}=await U.client().from('competitions').update({logo_url}).eq('id',id);
      if(error)throw error;
      const c=comp(id);if(c)c.logo_url=logo_url;
      U.toast('Logo guardado','ok');await U.route();
    }catch(x){U.err(x);button.disabled=false;}
  };
})();
