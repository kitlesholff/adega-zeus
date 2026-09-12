import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: object) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'Método não permitido.' });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'Entre no painel novamente.' });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    // Validate the session with Auth, then check the database administrator membership.
    const { data: identity, error: identityError } = await admin.auth.getUser(authorization.slice(7));
    if (identityError || !identity.user) return reply(401, { error: 'Sessão inválida. Entre novamente.' });
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: allowed, error: permissionError } = await caller.rpc('is_admin');
    if (permissionError || allowed !== true) return reply(403, { error: 'Somente o administrador pode criar usuários.' });
    if (Number(request.headers.get('Content-Length') || 0) > 4096) return reply(413, { error: 'Dados excedem o limite.' });
    const raw = await request.text();
    if (raw.length > 4096) return reply(413, { error: 'Dados excedem o limite.' });
    let input;
    try { input = JSON.parse(raw); } catch { return reply(400, { error: 'Dados inválidos.' }); }
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input?.password === 'string' ? input.password : '';
    if (name.length < 2 || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || password.length < 12 || password.length > 128) return reply(400, { error: 'Informe nome, e-mail válido e senha de 12 a 128 caracteres.' });
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: name },
    });
    if (createError || !created.user) return reply(400, { error: 'Não foi possível criar o usuário. Confira se o e-mail já está cadastrado e se a senha atende aos requisitos.' });
    const { error: registerError } = await admin.rpc('register_panel_operator', {
      p_user_id: created.user.id, p_name: name, p_email: email, p_created_by: identity.user.id,
    });
    if (registerError) {
      // Compensate only the account created by this request. Never touch an existing account.
      const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
      return reply(500, { error: cleanupError
        ? 'Conta criada sem acesso ao painel. O administrador precisa revisar esse e-mail no Supabase antes de tentar novamente.'
        : 'Não foi possível liberar o acesso. Confira a instalação do gerenciamento de usuários.' });
    }
    return reply(201, { id: created.user.id, name, email, role: 'operator' });
  } catch {
    return reply(500, { error: 'Serviço de usuários indisponível. Tente novamente.' });
  }
});
