/* CSV and rating for the supplied PES 2013 Editor 2.0; no network or database writes. */
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PES13 = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';
  const FORMULAS = {"GK":[40.0,[["BodyBalance",0.218],["Responsiveness",0.356],["ExplosivePower",0.16],["GoalKeepingSkill",0.501]]],"SWP":[25.0,[["Defence",0.45],["BodyBalance",0.45],["Stamina",0.3],["TopSpeed",0.2],["HeaderAccuracy",0.1],["Jump",0.3]]],"CB":[25.0,[["Defence",0.48],["BodyBalance",0.44],["Stamina",0.3],["Responsiveness",0.16],["TopSpeed",0.1],["Jump",0.3]]],"SB":[25.0,[["Attack",0.15],["Defence",0.2],["BodyBalance",0.15],["TopSpeed",0.22],["Stamina",0.22],["DribbleAccuracy",0.24],["DribbleSpeed",0.24],["LongPassAccuracy",0.2],["LongPassSpeed",0.15],["ExplosivePower",0.15],["Responsiveness",0.12]]],"LB":[25.0,[["Attack",0.15],["Defence",0.2],["BodyBalance",0.15],["TopSpeed",0.22],["Stamina",0.22],["DribbleAccuracy",0.24],["DribbleSpeed",0.24],["LongPassAccuracy",0.2],["LongPassSpeed",0.15],["ExplosivePower",0.15],["Responsiveness",0.12]]],"RB":[25.0,[["Attack",0.15],["Defence",0.2],["BodyBalance",0.15],["TopSpeed",0.22],["Stamina",0.22],["DribbleAccuracy",0.24],["DribbleSpeed",0.24],["LongPassAccuracy",0.2],["LongPassSpeed",0.15],["ExplosivePower",0.15],["Responsiveness",0.12]]],"WB":[25.0,[["Attack",0.15],["Defence",0.2],["BodyBalance",0.15],["TopSpeed",0.22],["Stamina",0.22],["DribbleAccuracy",0.24],["DribbleSpeed",0.24],["LongPassAccuracy",0.2],["LongPassSpeed",0.15],["ExplosivePower",0.15],["Responsiveness",0.12]]],"DMF":[18.0,[["Attack",0.1],["Defence",0.24],["BodyBalance",0.17],["Stamina",0.34],["DribbleAccuracy",0.15],["DribbleSpeed",0.15],["ShortPassAccuracy",0.2],["ShortPassSpeed",0.2],["LongPassAccuracy",0.24],["LongPassSpeed",0.24],["Jump",0.05],["BallControl",0.1]]],"CMF":[16.0,[["Attack",0.1],["Defence",0.17],["BodyBalance",0.22],["Stamina",0.34],["DribbleAccuracy",0.27],["DribbleSpeed",0.24],["ShortPassAccuracy",0.22],["ShortPassSpeed",0.2],["LongPassAccuracy",0.22],["LongPassSpeed",0.15],["BallControl",0.12]]],"SMF":[16.0,[["Attack",0.22],["BodyBalance",0.15],["Stamina",0.2],["TopSpeed",0.29],["DribbleAccuracy",0.2],["DribbleSpeed",0.22],["ShortPassAccuracy",0.12],["ShortPassSpeed",0.12],["LongPassAccuracy",0.24],["LongPassSpeed",0.1],["BallControl",0.05],["ExplosivePower",0.24]]],"LMF":[16.0,[["Attack",0.22],["BodyBalance",0.15],["Stamina",0.2],["TopSpeed",0.29],["DribbleAccuracy",0.2],["DribbleSpeed",0.22],["ShortPassAccuracy",0.12],["ShortPassSpeed",0.12],["LongPassAccuracy",0.24],["LongPassSpeed",0.1],["BallControl",0.05],["ExplosivePower",0.24]]],"RMF":[16.0,[["Attack",0.22],["BodyBalance",0.15],["Stamina",0.2],["TopSpeed",0.29],["DribbleAccuracy",0.2],["DribbleSpeed",0.22],["ShortPassAccuracy",0.12],["ShortPassSpeed",0.12],["LongPassAccuracy",0.24],["LongPassSpeed",0.1],["BallControl",0.05],["ExplosivePower",0.24]]],"AMF":[13.0,[["Attack",0.2],["BodyBalance",0.15],["Stamina",0.2],["TopSpeed",0.15],["DribbleAccuracy",0.24],["DribbleSpeed",0.15],["ShortPassAccuracy",0.24],["ShortPassSpeed",0.24],["LongPassAccuracy",0.1],["LongPassSpeed",0.1],["BallControl",0.27],["KickingPower",0.1]]],"WF":[17.0,[["Attack",0.1],["BodyBalance",0.15],["Stamina",0.1],["TopSpeed",0.22],["ExplosivePower",0.22],["DribbleAccuracy",0.22],["DribbleSpeed",0.22],["ShortPassAccuracy",0.12],["ShortPassSpeed",0.1],["LongPassAccuracy",0.15],["LongPassSpeed",0.1],["KickingPower",0.22],["ShotAccuracy",0.15]]],"LWF":[17.0,[["Attack",0.1],["BodyBalance",0.15],["Stamina",0.1],["TopSpeed",0.22],["ExplosivePower",0.22],["DribbleAccuracy",0.22],["DribbleSpeed",0.22],["ShortPassAccuracy",0.12],["ShortPassSpeed",0.1],["LongPassAccuracy",0.15],["LongPassSpeed",0.1],["KickingPower",0.22],["ShotAccuracy",0.15]]],"RWF":[17.0,[["Attack",0.1],["BodyBalance",0.15],["Stamina",0.1],["TopSpeed",0.22],["ExplosivePower",0.22],["DribbleAccuracy",0.22],["DribbleSpeed",0.22],["ShortPassAccuracy",0.12],["ShortPassSpeed",0.1],["LongPassAccuracy",0.15],["LongPassSpeed",0.1],["KickingPower",0.22],["ShotAccuracy",0.15]]],"SS":[11.0,[["Attack",0.12],["BodyBalance",0.1],["TopSpeed",0.2],["DribbleAccuracy",0.22],["DribbleSpeed",0.15],["ShortPassAccuracy",0.17],["ShortPassSpeed",0.17],["ShotAccuracy",0.27],["BallControl",0.2],["Responsiveness",0.1],["ExplosivePower",0.24],["KickingPower",0.2]]],"CF":[11.0,[["Attack",0.2],["BodyBalance",0.32],["TopSpeed",0.2],["DribbleAccuracy",0.17],["DribbleSpeed",0.1],["ShotAccuracy",0.22],["KickingPower",0.27],["HeaderAccuracy",0.15],["Jump",0.15],["ShortPassAccuracy",0.12],["ShortPassSpeed",0.12],["BallControl",0.12]]]};
  const ABILITIES = {
    Attack:['ATTACK','Ataque'], Defence:['DEFENCE','Defensa'], HeaderAccuracy:['HEADER ACCURACY','Cabeceo'], DribbleAccuracy:['DRIBBLE ACCURACY','Precisión regate'], ShortPassAccuracy:['SHORT PASS ACCURACY','Precisión pase corto'], ShortPassSpeed:['SHORT PASS SPEED','Velocidad pase corto'], LongPassAccuracy:['LONG PASS ACCURACY','Precisión pase largo'], LongPassSpeed:['LONG PASS SPEED','Velocidad pase largo'], ShotAccuracy:['SHOT ACCURACY','Precisión disparo'], PlaceKicking:['PLACE KICKING','Balón parado'], Swerve:['SWERVE','Efecto'], BallControl:['BALL CONTROLL','Control de balón'], GoalKeepingSkill:['GOAL KEEPING SKILLS','Portería'], Responsiveness:['RESPONSE','Respuesta'], ExplosivePower:['EXPLOSIVE POWER','Explosividad'], DribbleSpeed:['DRIBBLE SPEED','Velocidad regate'], TopSpeed:['TOP SPEED','Velocidad máxima'], BodyBalance:['BODY BALANCE','Equilibrio'], Stamina:['STAMINA','Resistencia'], KickingPower:['KICKING POWER','Potencia de disparo'], Jump:['JUMP','Salto'], Tenacity:['TENACITY','Tenacidad'], Teamwork:['TEAMWORK','Trabajo en equipo']
  };
  const POS = {GK:'ARQ',SWP:'DFC',SW:'DFC',CB:'DFC',LB:'LI',RB:'LD',DMF:'MCD',CMF:'MC',LMF:'MI',RMF:'MD',AMF:'MCO',LWF:'EI',RWF:'ED',SS:'SD',CF:'DC'};
  const POSITION_FLAGS = ['GK 0','SW 1','CB 2','LB 3','RB 4','DMF 5','CMF 6','LMF 7','RMF 8','AMF 9','LWF 10','RWF 11','SS 12','CF 13'];
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function rating(abilities, position) {
    const f = FORMULAS[position];
    if (!f) throw new Error('Posición del EDIT desconocida: '+position);
    let n = f[0];
    for (const [key, weight] of f[1]) n += (abilities[key]-50)*weight;
    const floor = Math.floor(n);
    return n-floor === .5 ? floor+(Math.abs(floor)%2) : Math.round(n);
  }
  const stats = abilities => Object.fromEntries(Object.entries(ABILITIES).map(([k,[,label]])=>[label,abilities[k]]));
  function splitCSV(text) {
    text = text.replace(/^\uFEFF/,'');
    const rows=[]; let row=[],field='',quoted=false;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(c==='"') {
        if(quoted && text[i+1]==='"') {field+='"';i++;}
        else if(!quoted && field.length) throw new Error('Comillas inesperadas en el CSV.');
        else quoted=!quoted;
      } else if(c===';' && !quoted) {row.push(field);field='';}
      else if((c==='\r'||c==='\n') && !quoted) {if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}
      else field+=c;
    }
    if(quoted)throw new Error('El CSV tiene una celda con comillas sin cerrar.');
    row.push(field);if(row.some(x=>x.trim()))rows.push(row);
    return rows;
  }
  function parseCSV(text) {
    if(text.length>20*1024*1024)throw new Error('El CSV supera los 20 MB permitidos.');
    const rows=splitCSV(text), headers=rows.shift()?.map(s=>s.trim());
    if(!headers||new Set(headers).size!==headers.length)throw new Error('Cabecera vacía o con columnas repetidas.');
    const cardHeaders=headers.filter(h=>/^[PS]\d{2} /.test(h));
    const required=['INDEX','NAME','AGE','NATIONALITY','FOOT','HEIGHT','WEIGHT','FORM','WEAK FOOT ACCURACY','WEAK FOOT FREQUENCY','INJURY TOLERANCE','POSITION','ATTACK AWARENESS','DEFENCE AWARENESS','CLUB TEAM','NUMBER',...POSITION_FLAGS,...Object.values(ABILITIES).map(v=>v[0])];
    const missing=required.filter(k=>!headers.includes(k));
    const expectedCards=[...Array.from({length:18},(_,i)=>'P'+String(i+1).padStart(2,'0')),...Array.from({length:26},(_,i)=>'S'+String(i+1).padStart(2,'0'))];
    if(missing.length||cardHeaders.length!==44||expectedCards.some(c=>!cardHeaders.some(h=>h.slice(0,3)===c)))throw new Error('El CSV no tiene las columnas de PES 2013 esperadas. '+missing.join(', '));
    if(rows.length>30000)throw new Error('El CSV supera los 30.000 registros permitidos.');
    const players=[],issues=[],repairs=[],ids=new Set();let emptySlots=0;
    for(let index=0;index<rows.length;index++) {
      let cells=rows[index],repaired=false;
      // W!Ld@ may export an extra empty Japanese-name cell; accept only if the entire shifted row then validates.
      if(cells.length===headers.length+1 && headers[3]==='JAPANESE PLAYER NAME' && cells[3]==='' && cells[4]==='') {cells=cells.filter((_,i)=>i!==4);repaired=true;}
      const row=Object.fromEntries(headers.map((h,i)=>[h,(cells[i]??'').trim()]));
      if(row.INDEX==='0') {emptySlots++;continue;}
      try {
        if(cells.length!==headers.length)throw new Error('Cantidad de columnas incorrecta');
        const num=(key,min,max)=>{const v=row[key];if(!/^\d+$/.test(v)||!Number.isSafeInteger(+v)||+v<min||+v>max)throw new Error(key+' fuera de rango ('+v+')');return +v;};
        const id=num('INDEX',1,2147483647);
        if(ids.has(id))throw Object.assign(new Error('ID repetido '+id+'; corregí el archivo antes de importar.'),{duplicate:true});
        ids.add(id);
        if(!row.NAME||row.NAME.length>200)throw new Error('Nombre vacío o demasiado largo');
        if(!POS[row.POSITION])throw new Error('Posición desconocida: '+row.POSITION);
        const abilities=Object.fromEntries(Object.entries(ABILITIES).map(([k,[h]])=>[k,num(h,0,99)]));
        const cards={playing_styles:[],special_skills:[]};
        for(const h of cardHeaders)if(num(h,0,1))cards[h[0]==='P'?'playing_styles':'special_skills'].push(h.slice(0,3));
        cards.playing_styles.sort();cards.special_skills.sort();
        const positions=[...new Set([POS[row.POSITION],...POSITION_FLAGS.filter(h=>num(h,0,1)).map(h=>POS[h.split(' ')[0]])])];
        if(!['A','B','C'].includes(row['INJURY TOLERANCE']))throw new Error('Tolerancia a lesiones desconocida');
        if(!['L','R'].includes(row.FOOT))throw new Error('Pie dominante desconocido');
        const p={pes_id:id,name:row.NAME,edit_team:row['CLUB TEAM'],age:num('AGE',15,65),height:num('HEIGHT',100,250),weight:num('WEIGHT',30,200),nationality:row.NATIONALITY,foot:row.FOOT,source_position:row.POSITION,position:POS[row.POSITION],positions,form:num('FORM',1,8),weak_accuracy:num('WEAK FOOT ACCURACY',1,8),weak_frequency:num('WEAK FOOT FREQUENCY',1,8),injury:row['INJURY TOLERANCE'],attack_awareness:num('ATTACK AWARENESS',1,3),defence_awareness:num('DEFENCE AWARENESS',1,3),number:row.NUMBER===''?null:num('NUMBER',0,99),abilities,cards};
        p.overall=rating(abilities,p.source_position);
        if(p.overall<0||p.overall>199)throw new Error('Media calculada fuera de rango');
        players.push(p);
        if(repaired)repairs.push({row:index+2,id:row.INDEX,name:row.NAME,reason:'Se quitó una columna vacía sobrante del exportador. Los valores de los atributos se conservan.'});
      } catch(e) {
        if(e.duplicate)throw e;
        issues.push({row:index+2,id:row.INDEX,name:row.NAME,reason:e.message});
      }
    }
    if(!players.length)throw new Error('No hay jugadores válidos para importar.');
    return {players,issues,repairs,emptySlots,total:rows.length};
  }
  return {FORMULAS,ABILITIES,POS,POSITION_FLAGS,normalize,rating,stats,splitCSV,parseCSV};
});
