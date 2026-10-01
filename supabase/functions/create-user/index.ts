// Supabase Edge Function: create-user
// Crea un usuario de autenticación (Admin API) + fija su perfil (nombre, correo, rol) en public.profiles.
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
      return new Response(JSON.stringify({ error: 'No tienes permiso para crear usuarios' }), { status: 403, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const { name, email, password, role } = body;

    if (!name || !email || !password || !role) {
      return new Response(JSON.stringify({ error: 'Faltan datos (nombre, correo, contraseña o rol)' }), { status: 400, headers: jsonHeaders });
    }
    if (String(password).length < 6) {
      return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }), { status: 400, headers: jsonHeaders });
    }
    if (!['inspector', 'supervisor', 'almacenista', 'admin'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Rol inválido' }), { status: 400, headers: jsonHeaders });
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ error: createErr?.message || 'No se pudo crear el usuario' }), { status: 400, headers: jsonHeaders });
    }

    // El trigger de auth.users crea la fila en profiles; forzamos nombre/correo/rol definitivos.
    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({ full_name: name, email, role, active: true })
      .eq('id', created.user.id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ ok: true, user_id: created.user.id }), { status: 200, headers: jsonHeaders });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Error desconocido' }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
