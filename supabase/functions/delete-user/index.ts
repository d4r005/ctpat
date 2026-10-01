// Supabase Edge Function: delete-user
// Elimina un usuario de autenticación (Admin API); el perfil se borra en cascada.
// Solo puede ser invocada por un usuario autenticado con rol admin o supervisor,
// y no permite que alguien se borre a sí mismo.
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
      return new Response(JSON.stringify({ error: 'No tienes permiso para eliminar usuarios' }), { status: 403, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const { user_id } = body;
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Falta user_id' }), { status: 400, headers: jsonHeaders });
    }
    if (user_id === callerData.user.id) {
      return new Response(JSON.stringify({ error: 'No puedes eliminar tu propio usuario' }), { status: 400, headers: jsonHeaders });
    }

    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user_id);
    if (deleteErr) {
      return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: jsonHeaders });
    }

    // Por si no existe cascade en la FK, limpiamos el perfil explícitamente.
    await adminClient.from('profiles').delete().eq('id', user_id);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Error desconocido' }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
