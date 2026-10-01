// Supabase Edge Function: update-user-password
// Cambia la contraseña de un usuario existente (Admin API).
// Solo puede ser invocada por un usuario autenticado con rol admin o supervisor.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: jsonHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: jsonHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .single();

    if (profileErr || !callerProfile || !['admin', 'supervisor'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'No tienes permiso para cambiar contraseñas' }), { status: 403, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const { user_id, password } = body;
    if (!user_id || !password) {
      return new Response(JSON.stringify({ error: 'Faltan datos (user_id o password)' }), { status: 400, headers: jsonHeaders });
    }
    if (String(password).length < 6) {
      return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }), { status: 400, headers: jsonHeaders });
    }

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(user_id, { password });
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Error desconocido' }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
