-- 1. Perfiles de usuario (Extensión de Auth.Users)
CREATE TABLE IF NOT EXISTS profiles (
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

-- Polìticas RLS para profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;

CREATE POLICY "Users can view own profile or admins/supervisors view all" ON profiles 
  FOR SELECT USING (
    auth.uid() = id OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
  );

CREATE POLICY "Users can update own profile or admins update any" ON profiles 
  FOR UPDATE USING (
    auth.uid() = id OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 2. Registros de Vehículos (Caseta)
CREATE TABLE IF NOT EXISTS vehicle_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'entrada',
  plates TEXT NOT NULL,
  entry_data JSONB NOT NULL,
  exit_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_records_plates ON vehicle_records(plates);
ALTER TABLE vehicle_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can see all records" ON vehicle_records;
DROP POLICY IF EXISTS "Authenticated users can insert records" ON vehicle_records;

CREATE POLICY "Authenticated users can see all records" ON vehicle_records 
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert records" ON vehicle_records 
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins, supervisors, or owners can update records" ON vehicle_records 
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
  );

-- 3. Inspecciones C-TPAT
CREATE TABLE IF NOT EXISTS inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID REFERENCES vehicle_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  inspection_type TEXT NOT NULL, -- '9_puntos_contenedor', '19_puntos'
  plates TEXT NOT NULL,
  status_general TEXT CHECK (status_general IN ('bueno', 'malo')),
  approval_status TEXT CHECK (approval_status IN ('pendiente', 'aprobada', 'rechazada')) DEFAULT 'pendiente',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspections_plates ON inspections(plates);
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can see all inspections" ON inspections;
DROP POLICY IF EXISTS "Authenticated users can insert inspections" ON inspections;

CREATE POLICY "Authenticated users can see all inspections" ON inspections 
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert inspections" ON inspections 
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins and supervisors can update or approve inspections" ON inspections 
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'supervisor') OR
    (auth.uid() = user_id AND approval_status = 'pendiente')
  );

-- 4. Tickets de Embarque
CREATE TABLE IF NOT EXISTS shipping_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID REFERENCES vehicle_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  plates TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shipping_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can see shipping tickets" ON shipping_tickets 
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert shipping tickets" ON shipping_tickets 
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Owners, supervisors or admins can update shipping tickets" ON shipping_tickets 
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
  );

-- 5. Mensajes de Chat
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  room TEXT DEFAULT 'GENERAL',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read chat" ON chat_messages 
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can send chat" ON chat_messages 
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 6. Notificaciones
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  kind TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own notifications" ON notifications 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System/Authenticated can create notifications" ON notifications 
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own notifications" ON notifications 
  FOR UPDATE USING (auth.uid() = user_id);

-- 7. Trigger para crear perfil automáticamente al registrarse en Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
