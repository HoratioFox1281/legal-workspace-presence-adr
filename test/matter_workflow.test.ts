import { describe, expect, it } from 'vitest';
import { decideMatterWorkflow, matterWorkflowSchema } from '../src/matter_workflow.js';

describe('decideMatterWorkflow', () => {
  it('marks deadline follow-up matters as follow_up_needed and uses the right event', () => {
    const input = matterWorkflowSchema.parse({
      matterId: 'MAT-9',
      clientName: 'Avery Chen',
      staffClientId: 'casey',
      action: 'deadline_follow_up',
      deadlineAt: '2026-01-10T12:00:00.000Z'
    });

    const decision = decideMatterWorkflow(input);

    expect(decision.channel).toBe('matter-MAT-9');
    expect(decision.status).toBe('follow_up_needed');
    expect(decision.event).toBe('matter.deadline.follow_up');
    expect(decision.payload).toEqual({
      matterId: 'MAT-9',
      clientName: 'Avery Chen',
      action: 'deadline_follow_up',
      deadlineAt: '2026-01-10T12:00:00.000Z'
    });
  });
});
