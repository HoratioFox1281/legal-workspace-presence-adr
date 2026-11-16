import http from 'node:http';
import { ZodError } from 'zod';
import { InfraiClient, InfraiApiError } from './infrai_client.js';
import { matterWorkflowSchema, runMatterWorkflow, decideMatterWorkflow } from './matter_workflow.js';

const infrai = new InfraiClient();

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/matter/workflow') {
      const body = await readJson(req);
      const input = matterWorkflowSchema.parse(body);
      const result = await runMatterWorkflow(infrai, input);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && req.url) {
      const match = req.url.match(/^\/matter\/([^/]+)\/online$/);
      if (match) {
        const matterId = decodeURIComponent(match[1]);
        const channel = `matter-${matterId}`;
        const presence = await infrai.realtime.presence.get(channel);
        const onlineNow = presence.users ?? [];
        const status = onlineNow.length > 0 ? 'live' : 'waiting_on_client';
        sendJson(res, 200, { channel, status, onlineNow });
        return;
      }
    }

    if (req.method === 'GET' && req.url === '/demo') {
      const demoInput = matterWorkflowSchema.parse({
        matterId: 'MAT-1042',
        clientName: 'Jordan Lee',
        staffClientId: 'paralegal-ana',
        action: 'deadline_follow_up',
        deadlineAt: '2026-02-14T17:00:00.000Z'
      });
      const preview = decideMatterWorkflow(demoInput);
      const result = await runMatterWorkflow(infrai, demoInput);
      sendJson(res, 200, { preview, result });
      return;
    }

    sendJson(res, 404, { message: 'Not found' });
  } catch (error) {
    if (error instanceof ZodError) {
      sendJson(res, 400, { message: 'Invalid request body', issues: error.issues });
      return;
    }

    if (error instanceof InfraiApiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(res, status, { message: error.message, details: error.details });
      return;
    }

    sendJson(res, 500, { message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`legal workspace server listening on http://localhost:${port}`);
  console.log('try GET /demo or POST /matter/workflow');
});
