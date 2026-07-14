
DROP POLICY IF EXISTS "audit_insert_any" ON public.auditoria;
CREATE POLICY "audit_insert_authenticated" ON public.auditoria
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
