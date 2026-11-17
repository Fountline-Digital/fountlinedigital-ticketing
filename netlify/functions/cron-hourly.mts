// Netlify runs this every hour (only on the published site, not deploy previews).
// It just calls the app's cron route, where the real work happens.
export default async () => {
  const res = await fetch(`${process.env.URL}/api/cron/hourly`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log("hourly jobs:", res.status, await res.text());
};

export const config = { schedule: "@hourly" };
