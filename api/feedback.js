import Redis from 'ioredis';

// 只有在非校验请求时才初始化 Redis
let redis = null;
if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
}

export default async function handler(req, res) {
  // --- 这里的优先级最高，用来过飞书的验证 ---
  if (req.body && req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // --- 如果 Redis 没配置好，至少给个提示而不是直接 500 ---
  if (!redis) {
    console.error("REDIS_URL is missing in env!");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  try {
    // 1. 接收飞书回复 (POST)
    if (req.method === 'POST') {
      const { event } = req.body;
      if (event?.message?.content) {
        const text = JSON.parse(event.message.content).text;
        await redis.set('cursor_lark_msg', JSON.stringify({
          status: 'replied',
          message: text,
          timestamp: Date.now()
        }), 'EX', 7200);
        return res.status(200).send("OK");
      }
    }

    // 2. 本地 MCP 获取回复 (GET)
    if (req.method === 'GET') {
      const cached = await redis.get('cursor_lark_msg');
      if (cached) {
        const data = JSON.parse(cached);
        if (data.status === 'replied') {
          await redis.set('cursor_lark_msg', JSON.stringify({ status: 'waiting' }));
          return res.status(200).json(data);
        }
      }
      return res.status(200).json({ status: 'waiting' });
    }
  } catch (error) {
    console.error("Runtime Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }

  return res.status(405).send("Method Not Allowed");
}
