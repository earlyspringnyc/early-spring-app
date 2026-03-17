export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, command } = req.body;

  // For now, return a formatted response
  // Full integration requires Supabase queries + Slack app setup
  const response = {
    response_type: "in_channel",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Morgan* — Production Management\n\nUse Morgan at ${process.env.VITE_APP_URL || 'https://early-spring-app.vercel.app'}\n\n_Slack integration coming soon. Set up your Slack app at api.slack.com and point the slash command to this endpoint._`
        }
      }
    ]
  };

  return res.status(200).json(response);
}
