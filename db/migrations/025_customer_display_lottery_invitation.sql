ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS customer_display_lottery_invitation_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_display_lottery_invitation_i18n JSONB NOT NULL DEFAULT '{"zh-CN":"留下 Google 评论即可参加幸运大转盘抽奖","en-GB":"Leave us a Google review to join the Lucky Wheel draw"}';
