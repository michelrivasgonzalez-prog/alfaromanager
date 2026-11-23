-- Clave pública (no secreta): usada por iPhone y Android al suscribirse.
-- La pareja privada NO debe ponerse en SQL ni GitHub.
INSERT INTO public.alfaro_notif_config(id,vapid_public_key)
VALUES('global','BIhOol91wEtYZ0y6rsEVOzblUw9Pxer5gZDvbZrWN1SmCl1K86mU-xRRqPkSE-sVVAl7r6wZ69W3i3poU4bs9yg')
ON CONFLICT(id) DO UPDATE SET vapid_public_key=excluded.vapid_public_key;
