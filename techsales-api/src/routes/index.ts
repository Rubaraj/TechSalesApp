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
import { aiRouter } from './ai.routes.js';
import { twilioRouter } from './twilio.routes.js';

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
apiRouter.use('/ai', aiRouter);
apiRouter.use('/twilio', twilioRouter);
