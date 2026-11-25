-- PODELI Storage Buckets Migration 003
-- Avatars, Group Images, and Expense Receipts with complete RLS policies (SELECT + INSERT + UPDATE + DELETE)

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('group-images', 'group-images', true),
  ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Avatars: public read; owner write/update/delete inside <user_id>/*
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_write" ON storage.objects;
CREATE POLICY "avatars_owner_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

-- Group images: public read; owner write/update inside <user_id>/*
DROP POLICY IF EXISTS "group_images_read" ON storage.objects;
CREATE POLICY "group_images_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'group-images');

DROP POLICY IF EXISTS "group_images_upload" ON storage.objects;
CREATE POLICY "group_images_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'group-images'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "group_images_update" ON storage.objects;
CREATE POLICY "group_images_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'group-images'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'group-images'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

-- Receipts: private bucket scoped to <group_id>/* accessible only to group members
DROP POLICY IF EXISTS "receipts_member_read" ON storage.objects;
CREATE POLICY "receipts_member_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.is_group_member(((storage.foldername(name))[1])::uuid, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "receipts_member_upload" ON storage.objects;
CREATE POLICY "receipts_member_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.is_group_member(((storage.foldername(name))[1])::uuid, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "receipts_member_update" ON storage.objects;
CREATE POLICY "receipts_member_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.is_group_member(((storage.foldername(name))[1])::uuid, (SELECT auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.is_group_member(((storage.foldername(name))[1])::uuid, (SELECT auth.uid()))
  );
