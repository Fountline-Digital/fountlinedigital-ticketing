// Netlify runs this every night at 08:15 UTC (about 3-4am Eastern).
export default async () => {
  const res = await fetch(`${process.env.URL}/api/cron/nightly`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log("nightly jobs:", res.status, await res.text());
};

export const config = { schedule: "15 8 * * *" };
