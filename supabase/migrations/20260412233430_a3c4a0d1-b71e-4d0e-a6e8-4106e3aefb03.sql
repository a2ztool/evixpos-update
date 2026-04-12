SELECT cron.schedule(
  'fetch-ads-metrics-every-5min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://vuuesqrdjuqnduhiihwz.supabase.co/functions/v1/fetch-ads-metrics',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dWVzcXJkanVxbmR1aGlpaHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDUxNDAsImV4cCI6MjA5MTEyMTE0MH0.VWuaxpk0t6UnkZTt8H7Z0t-JcsAVRdGoxfpu2OpI_ZM"}'::jsonb,
      body:='{"time": "now"}'::jsonb
    ) AS request_id;
  $$
);