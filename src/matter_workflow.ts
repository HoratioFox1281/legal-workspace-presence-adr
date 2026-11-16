import { z } from 'zod';
import { InfraiClient } from './infrai_client.js';

export const matterWorkflowSchema = z.object({
  matterId: z.string().min(1),
  clientName: z.string().min(1),
  staffClientId: z.string().min(1),
  action: z.enum(['matter_intake', 'signed_document_delivery', 'deadline_follow_up']),
  documentName: z.string().min(1).optional(),
  deadlineAt: z.string().datetime().optional()
}).superRefine((input, ctx) => {
  if (input.action === 'signed_document_delivery' && !input.documentName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'documentName is required for signed_document_delivery',
      path: ['documentName']
    });
  }

  if (input.action === 'deadline_follow_up' && !input.deadlineAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'deadlineAt is required for deadline_follow_up',
      path: ['deadlineAt']
    });
  }
});

export type MatterWorkflowInput = z.infer<typeof matterWorkflowSchema>;

export type WorkspaceStatus = 'live' | 'waiting_on_client' | 'follow_up_needed';

export type WorkflowDecision = {
  channel: string;
  event: string;
  status: WorkspaceStatus;
  summary: string;
  payload: Record<string, unknown>;
};

export function decideMatterWorkflow(input: MatterWorkflowInput): WorkflowDecision {
  const channel = `matter-${input.matterId}`;

  if (input.action === 'matter_intake') {
    return {
      channel,
      event: 'matter.intake.recorded',
      status: 'live',
      summary: `Intake recorded for ${input.clientName}`,
      payload: {
        matterId: input.matterId,
        clientName: input.clientName,
        action: input.action
      }
    };
  }

  if (input.action === 'signed_document_delivery') {
    return {
      channel,
      event: 'matter.document.signed.delivered',
      status: 'waiting_on_client',
      summary: `Signed document delivered: ${input.documentName}`,
      payload: {
        matterId: input.matterId,
        clientName: input.clientName,
        action: input.action,
        documentName: input.documentName as string
      }
    };
  }

  return {
    channel,
    event: 'matter.deadline.follow_up',
    status: 'follow_up_needed',
    summary: `Follow up before ${input.deadlineAt}`,
    payload: {
      matterId: input.matterId,
      clientName: input.clientName,
      action: input.action,
      deadlineAt: input.deadlineAt as string
    }
  };
}

export async function runMatterWorkflow(
  infrai: InfraiClient,
  input: MatterWorkflowInput
): Promise<{
  channel: string;
  status: WorkspaceStatus;
  summary: string;
  onlineNow: Array<Record<string, unknown>>;
  clientToken?: string;
}> {
  const decision = decideMatterWorkflow(input);

  await infrai.realtime.channel.create({
    channel: decision.channel,
    type: 'presence'
  });

  await infrai.realtime.publish({
    channel: decision.channel,
    event: decision.event,
    data: {
      ...decision.payload,
      requestKey: `${input.matterId}:${input.staffClientId}:${decision.event}`
    },
    account_id: input.staffClientId
  });

  const presence = await infrai.realtime.presence.get(decision.channel);
  const token = await infrai.realtime.token.issue({
    client_id: input.staffClientId,
    channels: [decision.channel],
    capabilities: ['subscribe', 'presence'],
    ttl_seconds: 900
  });

  return {
    channel: decision.channel,
    status: decision.status,
    summary: decision.summary,
    onlineNow: presence.users ?? [],
    clientToken: token.token
  };
}
