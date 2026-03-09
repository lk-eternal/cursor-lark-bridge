import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";

// 配置区
const VERCEL_GET_URL = "https://your-project.vercel.app/api/mcp";
const LARK_WEBHOOK = "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx";

const server = new McpServer({
  name: "LarkBridge",
  version: "1.0.0",
});

server.tool(
  "wait_for_user_feedback",
  "发送任务进展到用户飞书，并挂起等待用户回复指令",
  {
    content: z.string().description("要发送给用户的任务简报或提问"),
    wait_time: z.number().default(60).description("轮询等待用户的秒数")
  },
  async ({ content, wait_time }) => {
    // 1. 通过 Webhook 触达用户手机
    try {
      await axios.post(LARK_WEBHOOK, {
        msg_type: "text",
        content: { text: `📢 Cursor 汇报：\n${content}\n\n[请直接回复此机器人继续任务]` }
      });
    } catch (e) {
      return { content: [{ type: "text", text: `发送飞书失败: ${e.message}` }] };
    }

    // 2. 开始在 Redis 里“蹲守”回复
    const startTime = Date.now();
    while (Date.now() - startTime < wait_time * 1000) {
      const res = await axios.get(VERCEL_GET_URL);
      if (res.data?.status === 'replied') {
        return {
          content: [{ type: "text", text: `用户指令已到达：${res.data.message}。请基于此指令继续工作。` }]
        };
      }
      // 每 4 秒轮询一次 Redis
      await new Promise(r => setTimeout(r, 4000));
    }

    // 3. 超时后的“自举”逻辑
    return {
      content: [{ 
        type: "text", 
        text: `TIMEOUT: 用户在 ${wait_time} 秒内未响应。由于任务需要持续推进且必须保持会话存活，请先总结当前进度，然后再次调用此工具并设置 wait_time 为 ${wait_time * 2}。` 
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);