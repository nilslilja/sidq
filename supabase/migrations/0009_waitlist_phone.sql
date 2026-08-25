-- ---------------------------------------------------------------------------
-- 0009 — somebody on a phone is not "unknown".
--
-- The site's primary button used to be a dead, greyed-out pill on any device
-- without a build, reading "Mac only for now". On a phone that is the worst
-- thing on the page: a link is mostly opened on a phone, so somebody reads the
-- whole thing, agrees with it, reaches for the only button, and nothing
-- happens. There was no next step at all.
--
-- They are not an unsupported user. They almost certainly own the right machine
-- — it is simply not the one in their hand — so the useful action is sending
-- them the link, and this is where that lands.
--
-- Worth separating from 'unknown', because the two want opposite emails. A
-- Linux visitor is waiting for a build that does not exist and hears from us
-- the day it does. Somebody on a phone wants the link now, at their desk, and
-- filed as 'unknown' they would sit in the wrong queue and never get it.
--
-- The site tolerates this migration not having run: it tries 'phone', and falls
-- back to 'unknown' on a check violation rather than showing a failed form.
-- ---------------------------------------------------------------------------

alter table public.waitlist
  drop constraint if exists waitlist_platform_check;

alter table public.waitlist
  add constraint waitlist_platform_check
  check (platform in ('windows', 'linux', 'phone', 'unknown'));
