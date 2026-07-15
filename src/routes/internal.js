/**
 * Internal (service-to-service) routes — never a user JWT, guarded by a
 * shared API key. Mounted at: /internal
 */
import { Router } from 'express';
import { requireInternalApiKey } from '../middleware/internalAuth.js';
import * as staffCtrl from '../controllers/internal/staffController.js';

const router = Router();

router.use(requireInternalApiKey);

router.patch('/staff/:iamUserId/deactivate', staffCtrl.deactivateStaff);

export default router;
