import { Router } from 'express';
import assets from './assets.routes';
import movements from './movements.routes';
import dashboard from './dashboard.routes';
import audit from './audit.routes';
import reports from './reports.routes';
import users from './users.routes';
import purchaseRequests from './purchaseRequests.routes';
import metrics from './metrics.routes';
import activity from './activity.routes';
import inventory from './inventory.routes';
import units from './units.routes';
import acelerato from './acelerato.routes';
import pendencies from './pendencies.routes';

const api = Router();

api.use('/assets', assets);
api.use('/assets', movements); // /:serial/movements, /movements/:id, /:serial/discard
api.use('/dashboard', dashboard);
api.use('/audit', audit);
api.use('/reports', reports);
api.use('/users', users);
api.use('/purchase-requests', purchaseRequests);
api.use('/metrics', metrics);
api.use('/activity', activity);
api.use('/inventory', inventory);
api.use('/units', units);
api.use('/acelerato', acelerato);
api.use('/pendencies', pendencies);

export default api;









