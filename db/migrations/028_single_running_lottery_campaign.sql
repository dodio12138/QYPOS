ALTER TABLE lottery_campaigns
  ADD CONSTRAINT lottery_campaigns_one_published_schedule
  EXCLUDE USING gist (
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status = 'published' AND deleted_at IS NULL);
