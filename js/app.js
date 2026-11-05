/* =====================================================================
   UML - arranque de la aplicación
   ===================================================================== */
(() => {
  const { $, CFG, S, setClient, loadProfile, loadSettings, route } = U;
  async function init() {
    if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('TU-PROYECTO') || !CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY === 'TU_ANON_KEY') {
      $('#app').innerHTML = `<div class="card" style="max-width:600px;margin:40px auto"><h2>Falta configurar la conexión</h2><p>Abrí el archivo <code>config.js</code> y completá <code>SUPABASE_URL</code> y <code>SUPABASE_ANON_KEY</code> con los datos de tu proyecto de Supabase (Project Settings → API). Los pasos completos están en el README.</p></div>`;
      return;
    }
    const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    setClient(sb);
    document.title = CFG.LEAGUE_NAME || 'UML';
    $('#brand-name').textContent = CFG.LEAGUE_NAME || 'UML';
    const { data: { session } } = await sb.auth.getSession();
    S.user = session?.user || null; await loadProfile();
    sb.auth.onAuthStateChange(async (_ev, sess) => {
      const prev = S.user?.id; S.user = sess?.user || null;
      if (S.user?.id !== prev) { await loadProfile(); S.profiles = []; if (S.sid) await U.loadSeason(S.sid).catch(() => {}); route(); }
    });
    window.addEventListener('hashchange', route);
    route();
  }
  init();
})();
