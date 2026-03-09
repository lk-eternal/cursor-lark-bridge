import Redis from 'ioredis';

// 直接使用你截图中的 REDIS_URL 变量
const redis = new Redis(process.env.REDIS_URL);

export default async function handler(req, res) {
  // 1. 优先处理飞书的 URL 验证，防止“3秒超时”
  if (req.body && req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  try {
    // 2. 接收飞书回复 (POST)
    if (req.method === 'POST') {
      const { event } = req.body;
      if (event?.message?.content) {
        const text = JSON.parse(event.message.content).text;
        
        // 存入 Redis，设置 2 小时过期
        await redis.set('cursor_lark_msg', JSON.stringify({
          status: 'replied',
          message: text,
          timestamp: Date.now()
        }), 'EX', 7200);
        
        return res.status(200).send("OK");
      }
    }

    // 3. 本地 MCP 轮询获取回复 (GET)
    if (req.method === 'GET') {
      const cached = await redis.get('cursor_lark_msg');
      
      if (cached) {
        const data = JSON.parse(cached);
        if (data.status === 'replied') {
          // 阅后即焚，重置状态
          await redis.set('cursor_lark_msg', JSON.stringify({ status: 'waiting' }));
          return res.status(200).json(data);
        }
      }
      return res.status(200).json({ status