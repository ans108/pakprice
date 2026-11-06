import { Router } from 'express';
import { profileController } from '../controllers/profileController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', profileController.getProfile);
router.patch('/', profileController.updateProfile);

export default router;
