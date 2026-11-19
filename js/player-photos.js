/* Retratos compartidos por ID del EDIT; los jugadores manuales usan su UUID. */
(() => {
  const {S,esc,$}=U;
  let loadedAt=0,pending=null;
  const clean=value=>{try{const url=new URL(String(value||'').trim());return ['https:','http:'].includes(url.protocol)?url.href:'';}catch(_){return '';}};
  U.playerPhotoURL=p=>clean(S.playerPortraits?.[p?.option_file_id||p?.pes_id]||p?.photo_url);
  U.playerFace=(p,size=24)=>{
    if(typeof p==='string')p=U.player(p);p=p||{};
    const url=U.playerPhotoURL(p),initial=esc((p.name||'?').slice(0,1));
    return `<span class="player-face${size>=64?' player-face--large':''}" style="--face-size:${Number(size)}px" aria-hidden="true"><span>${initial}</span>${url?`<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:''}</span>`;
  };
  U.playerLabel=(p,size=24)=>{if(typeof p==='string')p=U.player(p);return `<span class="player-label">${U.playerFace(p,size)}<span>${esc(p?.name||'Jugador')}</span></span>`;};
  U.loadPlayerPhotos=async(force=false)=>{
    if(pending)return pending;
    if(!force&&Date.now()-loadedAt<60000)return;
    pending=(async()=>{
      try{
        const portraits={};
        for(let start=0;;start+=1000){
          const {data,error}=await U.client().from('player_portraits').select('pes_id,photo_url').order('pes_id').range(start,start+999);
          if(error)throw error;
          for(const p of data||[])portraits[p.pes_id]=p.photo_url;
          if(!data||data.length<1000)break;
        }
        S.playerPortraits=portraits;loadedAt=Date.now();
      }catch(_){/* Conserva fotos locales si todavía no se instaló la migración. */}
    })();
    try{await pending;}finally{pending=null;}
  };
  U.playerPhotoButton=p=>U.isAdmin()&&!(p.id&&S.season?.historical)?`<button class="secondary sm" data-player-photo="${esc(p.id||'')}" data-player-pes="${esc(p.option_file_id||p.pes_id||'')}" data-player-name="${esc(p.name)}">${U.playerPhotoURL(p)?'Cambiar foto':'Agregar foto'}</button>`:'';
  document.addEventListener('click',async e=>{
    const button=e.target.closest('[data-player-photo]');if(!button||!U.isAdmin())return;
    const id=button.dataset.playerPhoto||null,pes=Number(button.dataset.playerPes)||null;
    const p=U.player(id)||{pes_id:pes,name:button.dataset.playerName||'Jugador'};
    U.modal(`<h2>Foto del jugador</h2><p>${esc(p.name)}</p><div id="player-photo-preview" class="mb">${U.playerFace(p,84)}</div><form id="player-photo-form"><div class="field"><label for="player-photo-url">Enlace de la imagen</label><input id="player-photo-url" name="url" type="url" maxlength="2048" placeholder="https://…/jugador.png" value="${esc(U.playerPhotoURL(p))}"><div class="help">Pegá el enlace directo a una imagen. Dejá el campo vacío para quitar la foto.</div></div><div class="row"><button type="submit">Guardar foto</button><button type="button" class="secondary" onclick="U.closeModal()">Cancelar</button></div></form>`);
    $('#player-photo-url').oninput=e=>{$('#player-photo-preview').innerHTML=U.playerFace({name:p.name,photo_url:clean(e.target.value)},84);};
    $('#player-photo-form').onsubmit=async e=>{
      e.preventDefault();const b=e.submitter,url=$('#player-photo-url').value.trim();if(url&&!clean(url))return U.toast('Usá un enlace HTTP o HTTPS válido.','error');b.disabled=true;
      try{
        await U.rpc('set_player_photo',{p_player:id,p_pes_id:pes,p_url:url||null});
        if(pes){S.playerPortraits=S.playerPortraits||{};if(url)S.playerPortraits[pes]=url;else delete S.playerPortraits[pes];}
        for(const row of S.players)if(row.id===id||(pes&&Number(row.option_file_id)===pes))row.photo_url=url||null;
        await U.loadPlayerPhotos(true);U.closeModal();U.toast('Foto guardada','ok');await U.route();
      }catch(x){U.err(x);if(document.contains(b))b.disabled=false;}
    };
  });
})();
