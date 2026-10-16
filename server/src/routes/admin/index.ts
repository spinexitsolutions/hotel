import { Router } from 'express';
import { requireStaff } from '../../middleware/auth';
import { catalogRouter } from './catalog.routes';
import { roomsRouter } from './rooms.routes';
import { adminBookingsRouter } from './bookings.routes';
import { peopleRouter } from './people.routes';
import { cmsRouter } from './cms.routes';
import { systemRouter } from './system.routes';

/** Every admin endpoint requires a staff session; each route additionally checks specific permissions. */
export const adminRouter = Router();
adminRouter.use(requireStaff);
adminRouter.use('/bookings', adminBookingsRouter);
adminRouter.use(systemRouter);
adminRouter.use(roomsRouter);
adminRouter.use(peopleRouter);
adminRouter.use('/cms', cmsRouter);
adminRouter.use(catalogRouter);
