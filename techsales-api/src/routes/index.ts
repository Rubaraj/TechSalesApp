import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { leadRouter } from './lead.routes.js';
import { authRouter } from './auth.routes.js';
import { userRouter } from './user.routes.js';
import { roleRouter } from './role.routes.js';
import { departmentRouter } from './department.routes.js';
import { enrollmentRouter } from './enrollment.routes.js';
import { memberRouter } from './member.routes.js';
import { targetRouter } from './target.routes.js';
import { complianceRuleRouter } from './complianceRule.routes.js';
import { aiRouter } from './ai.routes.js';
import { twilioRouter } from './twilio.routes.js';
import { presenceRouter } from './presence.routes.js';
import { injectTranscriptRouter } from './_debug/injectTranscript.routes.js';
import { getPresenceDebugSnapshot } from '../controllers/presence.controller.js';
import { env } from '../config/env.js';

/**
 * Root API router — mounts all `/api/*` sub-routers.
 * Phase 3 added /api/leads + /api/auth.
 * Phase 4 adds the remaining medhub_app resources.
 */
export const apiRouter: Router = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/leads', leadRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/roles', roleRouter);
apiRouter.use('/departments', departmentRouter);
apiRouter.use('/enrollments', enrollmentRouter);
apiRouter.use('/members', memberRouter);
apiRouter.use('/targets', targetRouter);
apiRouter.use('/compliance-rules', complianceRuleRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/twilio', twilioRouter);
apiRouter.use('/presence', presenceRouter);

// Phase 3a — dev-only fixture replay for the callAnalysisAgent. NEVER
// mounted in production (the router itself also blocks at request time as a
// belt + suspenders defense).
if (env.NODE_ENV !== 'production') {
  apiRouter.use('/_debug', injectTranscriptRouter);
  apiRouter.get('/_debug/presence', getPresenceDebugSnapshot);
}
