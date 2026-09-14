-- ============================================================================
-- SRIUC — Triggers de notificaciones de eventos operativos
-- Generado por Koda (agente) — 14 de septiembre de 2026
--
-- QUÉ HACE: al ocurrir cada uno de estos 5 eventos, crea automáticamente
-- una notificación para cada usuario activo (excepto quien realizó la acción).
-- La app ya está lista para recibirlas: Supabase Realtime dispara la alerta
-- con sonido y vibración en las tablets (implementado en NotificationsContext).
--
--   1. Registro de unidad en caseta        → INSERT en vehicle_records
--   2. Inspección registrada               → INSERT en inspections
--   3. Ticket de embarque generado         → INSERT en shipping_tickets
--   4. Salida de unidad                    → UPDATE de exit_data en vehicle_records
--   5. Autorización / rechazo de inspección → UPDATE de approval_status en inspections
--
-- CÓMO INSTALAR: pegar TODO este script en el SQL Editor del dashboard de
-- Supabase (https://supabase.com/dashboard → SQL Editor → New query → Run).
-- Es idempotente: se puede ejecutar varias veces sin duplicar nada.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 0) Columnas de aprobación que faltan en inspections
--    (la app escribe approval_note/approved_by/... pero la tabla desplegada
--     no las tiene — por eso el botón de autorizar fallaba)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS approval_note TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_by_name TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_signature TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Función que crea las notificaciones (una por usuario activo, bilingüe ES/中文)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_event_to_all_users()
RETURNS TRIGGER AS $$
DECLARE
  n_kind     TEXT;
  n_title    TEXT;
  n_message  TEXT;
  n_meta     JSONB;
  actor_id   UUID;
  v_plates   TEXT;
BEGIN
  -- ── Eventos de vehicle_records (caseta y salida) ──
  IF TG_TABLE_NAME = 'vehicle_records' THEN
    v_plates := COALESCE(NEW.plates, '');
    actor_id := NEW.user_id;
    IF TG_OP = 'INSERT' THEN
      n_kind    := 'entrada';
      n_title   := 'Unidad registrada en caseta / 车辆已在岗亭登记';
      n_message := 'Unidad ' || v_plates || ' registrada — lista para inspección / 车辆 ' || v_plates || ' 已登记，待检查';
      n_meta    := jsonb_build_object('plates', v_plates, 'record_id', NEW.id, 'event', 'entrada');
    ELSE
      n_kind    := 'salida';
      n_title   := 'Salida de unidad / 车辆出厂';
      n_message := 'Unidad ' || v_plates || ' completó su salida / 车辆 ' || v_plates || ' 已完成出厂';
      n_meta    := jsonb_build_object('plates', v_plates, 'record_id', NEW.id, 'event', 'salida');
    END IF;

  -- ── Eventos de inspections (registro y autorización/rechazo) ──
  ELSIF TG_TABLE_NAME = 'inspections' THEN
    v_plates := COALESCE(NEW.plates, '');
    IF TG_OP = 'INSERT' THEN
      actor_id  := NEW.user_id;
      n_kind    := 'inspeccion';
      n_title   := 'Inspección registrada / 检查已登记';
      n_message := 'Inspección de unidad ' || v_plates || ' (' || COALESCE(NEW.inspection_type, '') || ') registrada / 车辆 ' || v_plates || ' 检查已登记';
      n_meta    := jsonb_build_object('plates', v_plates, 'inspection_id', NEW.id, 'event', 'inspeccion');
    ELSE
      actor_id := COALESCE(NEW.approved_by, NEW.user_id);
      IF NEW.approval_status = 'aprobada' THEN
        n_kind    := 'autorizacion';
        n_title   := 'Inspección autorizada / 检查已批准';
        n_message := 'Inspección de unidad ' || v_plates || ' fue APROBADA / 车辆 ' || v_plates || ' 检查已批准';
      ELSE
        -- kind 'falla' → la app la muestra como URGENTE (alerta roja + vibración fuerte)
        n_kind    := 'falla';
        n_title   := 'Inspección rechazada / 检查已拒绝';
        n_message := 'Inspección de unidad ' || v_plates || ' fue RECHAZADA / 车辆 ' || v_plates || ' 检查被拒绝';
      END IF;
      n_meta := jsonb_build_object('plates', v_plates, 'inspection_id', NEW.id, 'event', n_kind);
    END IF;

  -- ── Eventos de shipping_tickets (embarque) ──
  ELSIF TG_TABLE_NAME = 'shipping_tickets' THEN
    v_plates  := COALESCE(NEW.plates, '');
    actor_id  := NEW.user_id;
    n_kind    := 'ticket';
    n_title   := 'Ticket de embarque generado / 装箱单已生成';
    n_message := 'Ticket de embarque de unidad ' || v_plates || ' generado / 车辆 ' || v_plates || ' 装箱单已生成';
    n_meta    := jsonb_build_object('plates', v_plates, 'ticket_id', NEW.id, 'event', 'ticket');
  END IF;

  -- Una notificación por usuario activo, excepto quien realizó la acción
  INSERT INTO public.notifications (user_id, title, message, kind, metadata, read)
  SELECT pr.id, n_title, n_message, n_kind, n_meta, false
  FROM public.profiles pr
  WHERE COALESCE(pr.active, true) AND pr.id <> actor_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Trigger: registro de unidad en caseta
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notify_entrada ON public.vehicle_records;
CREATE TRIGGER trg_notify_entrada
AFTER INSERT ON public.vehicle_records
FOR EACH ROW EXECUTE FUNCTION public.notify_event_to_all_users();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Trigger: salida de unidad (solo la PRIMERA vez que se llena exit_data)
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notify_salida ON public.vehicle_records;
CREATE TRIGGER trg_notify_salida
AFTER UPDATE OF exit_data ON public.vehicle_records
FOR EACH ROW
WHEN (NEW.exit_data IS NOT NULL AND OLD.exit_data IS NULL)
EXECUTE FUNCTION public.notify_event_to_all_users();

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Trigger: inspección registrada
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notify_inspeccion ON public.inspections;
CREATE TRIGGER trg_notify_inspeccion
AFTER INSERT ON public.inspections
FOR EACH ROW EXECUTE FUNCTION public.notify_event_to_all_users();

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Trigger: autorización o rechazo de inspección (solo si cambia el estado)
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notify_aprobacion ON public.inspections;
CREATE TRIGGER trg_notify_aprobacion
AFTER UPDATE OF approval_status ON public.inspections
FOR EACH ROW
WHEN (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
EXECUTE FUNCTION public.notify_event_to_all_users();

-- ─────────────────────────────────────────────────────────────────────────
-- 6) Trigger: ticket de embarque generado
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notify_ticket ON public.shipping_tickets;
CREATE TRIGGER trg_notify_ticket
AFTER INSERT ON public.shipping_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_event_to_all_users();

-- ─────────────────────────────────────────────────────────────────────────
-- 7) Activar Realtime en la tabla notifications
--    (la app escucha INSERTs vía Supabase Realtime para alertar al instante)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
