CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id),
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  loyalty boolean NOT NULL DEFAULT false,
  experiences boolean NOT NULL DEFAULT false,
  editorial boolean NOT NULL DEFAULT false,
  daily_limit integer NOT NULL DEFAULT 0 CHECK(daily_limit BETWEEN 0 AND 10),
  CHECK(NOT(loyalty OR experiences OR editorial) OR daily_limit>0)
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_preferences FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_preferences') THEN
    CREATE ROLE ghahvehto_preferences NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_preferences;

CREATE FUNCTION public.read_private_notification_preferences(token_hash bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; result jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  SELECT jsonb_build_object('revision',revision,'loyalty',loyalty,'experiences',experiences,'editorial',editorial,'dailyLimit',daily_limit)
    INTO result FROM public.notification_preferences WHERE user_id=actor;
  RETURN coalesce(result,jsonb_build_object('revision',0,'loyalty',false,'experiences',false,'editorial',false,'dailyLimit',0));
END $$;

CREATE FUNCTION public.set_private_notification_preferences(token_hash bytea,expected_revision integer,
  allow_loyalty boolean,allow_experiences boolean,allow_editorial boolean,max_per_day integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; prior public.notification_preferences%ROWTYPE;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  IF expected_revision IS NULL OR expected_revision NOT BETWEEN 0 AND 2147483646
    OR allow_loyalty IS NULL OR allow_experiences IS NULL OR allow_editorial IS NULL
    OR max_per_day IS NULL OR max_per_day NOT BETWEEN 0 AND 10
    OR (allow_loyalty OR allow_experiences OR allow_editorial) AND max_per_day=0 THEN
    RAISE EXCEPTION 'Invalid notification preferences' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.notification_preferences(user_id) VALUES(actor) ON CONFLICT DO NOTHING;
  SELECT * INTO prior FROM public.notification_preferences WHERE user_id=actor FOR UPDATE;
  IF (prior.loyalty,prior.experiences,prior.editorial,prior.daily_limit)
    IS NOT DISTINCT FROM (allow_loyalty,allow_experiences,allow_editorial,max_per_day) THEN
    RETURN public.read_private_notification_preferences(token_hash);
  END IF;
  IF prior.revision<>expected_revision THEN
    RAISE EXCEPTION 'Notification preferences changed' USING ERRCODE='40001';
  END IF;
  UPDATE public.notification_preferences SET revision=revision+1,loyalty=allow_loyalty,
    experiences=allow_experiences,editorial=allow_editorial,daily_limit=max_per_day WHERE user_id=actor;
  INSERT INTO public.audit_events(actor_id,action,reason,metadata)
    VALUES(actor,'notifications.preferences_changed','User updated in-app notification preferences',
      jsonb_build_object('revision',prior.revision+1,'dailyLimit',max_per_day,
        'loyalty',allow_loyalty,'experiences',allow_experiences,'editorial',allow_editorial));
  RETURN public.read_private_notification_preferences(token_hash);
END $$;
REVOKE ALL ON FUNCTION public.read_private_notification_preferences(bytea),
  public.set_private_notification_preferences(bytea,integer,boolean,boolean,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_notification_preferences(bytea),
  public.set_private_notification_preferences(bytea,integer,boolean,boolean,boolean,integer) TO ghahvehto_preferences;
