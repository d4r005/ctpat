
-- Migrating d.trujillo@brancoindustries.com
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'd.trujillo@brancoindustries.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', 'f6677ddf-03de-4b97-aa82-4a21032fc1b9', 'authenticated', 'authenticated', 'd.trujillo@brancoindustries.com', '$2b$12$4/IroQIkPnxS4cQ1ijDnYe2S1rssV51v41/r/GzurjC5h0qbZh7dG',
            NOW(), NULL, NULL,
            '{"provider":"email","providers":["email"]}', '{"full_name":"Dario Robles"}', NOW(), NOW(),
            '', '', '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
        ) VALUES (
            gen_random_uuid(), 'f6677ddf-03de-4b97-aa82-4a21032fc1b9', json_build_object('sub', 'f6677ddf-03de-4b97-aa82-4a21032fc1b9', 'email', 'd.trujillo@brancoindustries.com'), 'email',
            NULL, NOW(), NOW(), 'f6677ddf-03de-4b97-aa82-4a21032fc1b9'
        );

        -- The profile will be created automatically by the trigger we already set up
        -- but we make sure the role is correct
        UPDATE public.profiles SET role = 'admin' WHERE id = 'f6677ddf-03de-4b97-aa82-4a21032fc1b9';
    END IF;
END $$;


-- Migrating seguridadnaf@gmail.com
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'seguridadnaf@gmail.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', 'f8953dce-3923-4ace-bf67-0b983fc12583', 'authenticated', 'authenticated', 'seguridadnaf@gmail.com', '$2b$12$xcgawVPnQnciZjaK8U.CZ.6OFZhuOvSBoKV540bYOozBBdk32IwlO',
            NOW(), NULL, NULL,
            '{"provider":"email","providers":["email"]}', '{"full_name":"Caseta"}', NOW(), NOW(),
            '', '', '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
        ) VALUES (
            gen_random_uuid(), 'f8953dce-3923-4ace-bf67-0b983fc12583', json_build_object('sub', 'f8953dce-3923-4ace-bf67-0b983fc12583', 'email', 'seguridadnaf@gmail.com'), 'email',
            NULL, NOW(), NOW(), 'f8953dce-3923-4ace-bf67-0b983fc12583'
        );

        -- The profile will be created automatically by the trigger we already set up
        -- but we make sure the role is correct
        UPDATE public.profiles SET role = 'inspector' WHERE id = 'f8953dce-3923-4ace-bf67-0b983fc12583';
    END IF;
END $$;


-- Migrating andrea.cortes@brancoindustries.com
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'andrea.cortes@brancoindustries.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', '77d60848-2c48-4810-ae10-19cc16eb16cb', 'authenticated', 'authenticated', 'andrea.cortes@brancoindustries.com', '$2b$12$fhfnC1X5T3UDsUJn68XUPOWtcliuOjPatsYURzjbnvbBe0o0p1LhK',
            NOW(), NULL, NULL,
            '{"provider":"email","providers":["email"]}', '{"full_name":"Andrea Cortes"}', NOW(), NOW(),
            '', '', '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
        ) VALUES (
            gen_random_uuid(), '77d60848-2c48-4810-ae10-19cc16eb16cb', json_build_object('sub', '77d60848-2c48-4810-ae10-19cc16eb16cb', 'email', 'andrea.cortes@brancoindustries.com'), 'email',
            NULL, NOW(), NOW(), '77d60848-2c48-4810-ae10-19cc16eb16cb'
        );

        -- The profile will be created automatically by the trigger we already set up
        -- but we make sure the role is correct
        UPDATE public.profiles SET role = 'supervisor' WHERE id = '77d60848-2c48-4810-ae10-19cc16eb16cb';
    END IF;
END $$;


-- Migrating liliana.elizabeth@brancoindustries.com
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'liliana.elizabeth@brancoindustries.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', '9f1e65fc-b71b-4867-ac0d-cb2510a97d5d', 'authenticated', 'authenticated', 'liliana.elizabeth@brancoindustries.com', '$2b$12$wOuZLJM.x6pNv84VuHpTbeUqrClkKz2QzL8Sk.1ewzd8YnNBHMrta',
            NOW(), NULL, NULL,
            '{"provider":"email","providers":["email"]}', '{"full_name":"Liliana Rosales"}', NOW(), NOW(),
            '', '', '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
        ) VALUES (
            gen_random_uuid(), '9f1e65fc-b71b-4867-ac0d-cb2510a97d5d', json_build_object('sub', '9f1e65fc-b71b-4867-ac0d-cb2510a97d5d', 'email', 'liliana.elizabeth@brancoindustries.com'), 'email',
            NULL, NOW(), NOW(), '9f1e65fc-b71b-4867-ac0d-cb2510a97d5d'
        );

        -- The profile will be created automatically by the trigger we already set up
        -- but we make sure the role is correct
        UPDATE public.profiles SET role = 'supervisor' WHERE id = '9f1e65fc-b71b-4867-ac0d-cb2510a97d5d';
    END IF;
END $$;


-- Migrating vigilancia.naf@brancoindustries.com
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'vigilancia.naf@brancoindustries.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', '7abdab0f-c700-4074-86cb-64b46e08537f', 'authenticated', 'authenticated', 'vigilancia.naf@brancoindustries.com', '$2b$12$MIDm6eaKJ6zdK25NhguWluTEPacYeojsezR648nEdQtAW3vwYHYa6',
            NOW(), NULL, NULL,
            '{"provider":"email","providers":["email"]}', '{"full_name":"CASETA"}', NOW(), NOW(),
            '', '', '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
        ) VALUES (
            gen_random_uuid(), '7abdab0f-c700-4074-86cb-64b46e08537f', json_build_object('sub', '7abdab0f-c700-4074-86cb-64b46e08537f', 'email', 'vigilancia.naf@brancoindustries.com'), 'email',
            NULL, NOW(), NOW(), '7abdab0f-c700-4074-86cb-64b46e08537f'
        );

        -- The profile will be created automatically by the trigger we already set up
        -- but we make sure the role is correct
        UPDATE public.profiles SET role = 'inspector' WHERE id = '7abdab0f-c700-4074-86cb-64b46e08537f';
    END IF;
END $$;


-- Migrating diag.temp@test.local
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'diag.temp@test.local') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', 'da8a4dfc-bc0d-4f79-87c9-2799fa088f9f', 'authenticated', 'authenticated', 'diag.temp@test.local', '$2b$12$Uyz3qCiuze0Y0LPWr4orG.T.C6wuzFpNWfmRRzzgkgSNW1oHMSbYq',
            NOW(), NULL, NULL,
            '{"provider":"email","providers":["email"]}', '{"full_name":"Diag Temp"}', NOW(), NOW(),
            '', '', '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
        ) VALUES (
            gen_random_uuid(), 'da8a4dfc-bc0d-4f79-87c9-2799fa088f9f', json_build_object('sub', 'da8a4dfc-bc0d-4f79-87c9-2799fa088f9f', 'email', 'diag.temp@test.local'), 'email',
            NULL, NOW(), NOW(), 'da8a4dfc-bc0d-4f79-87c9-2799fa088f9f'
        );

        -- The profile will be created automatically by the trigger we already set up
        -- but we make sure the role is correct
        UPDATE public.profiles SET role = 'admin' WHERE id = 'da8a4dfc-bc0d-4f79-87c9-2799fa088f9f';
    END IF;
END $$;
