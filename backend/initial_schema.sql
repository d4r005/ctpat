-- 1. Perfiles de usuario (Extensión de Auth.Users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  role TEXT CHECK (role IN ('admin', 'supervisor', 'inspector')) DEFAULT 'inspector',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Registros de Vehículos (Caseta)
CREATE TABLE vehicle_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'entrada',
  plates TEXT NOT NULL,
  entry_data JSONB NOT NULL,
  exit_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda rápida de placas
CREATE INDEX idx_vehicle_records_plates ON vehicle_records(plates);
ALTER TABLE vehicle_records ENABLE ROW LEVEL SECURITY;

-- 3. Inspecciones C-TPAT
CREATE TABLE inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID REFERENCES vehicle_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  inspection_type TEXT NOT NULL, -- '9_puntos_contenedor', '19_puntos'
  plates TEXT NOT NULL,
  status_general TEXT CHECK (status_general IN ('bueno', 'malo')),
  approval_status TEXT CHECK (approval_status IN ('pendiente', 'aprobada', 'rechazada')) DEFAULT 'pendiente',
  data JSONB NOT NULL, -- Contiene los puntos, medidas, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inspections_plates ON inspections(plates);
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

-- 4. Tickets de Embarque
CREATE TABLE shipping_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID REFERENCES vehicle_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  plates TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shipping_tickets ENABLE ROW LEVEL SECURITY;

-- 5. Mensajes de Chat
CREATE TABLE chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  room TEXT DEFAULT 'GENERAL',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 6. Notificaciones
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  kind TEXT,
  metadata JSONB, -- record_id, inspection_id, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 7. Buckets de Almacenamiento (Esto se hace vía API/Dashboard, pero documentamos los nombres)
-- Bucket: 'evidence' (fotos de entrada, salida, sellos)
-- Bucket: 'inspections' (fotos de puntos de inspección)
-- Bucket: 'signatures' (firmas)

-- 8. Trigger para crear perfil automáticamente al registrarse en Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 9. Políticas RLS básicas (Permitir lectura a autenticados, escritura según rol)
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Authenticated users can see all records" ON vehicle_records FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert records" ON vehicle_records FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can see all inspections" ON inspections FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert inspections" ON inspections FOR INSERT WITH CHECK (auth.role() = 'authenticated');
