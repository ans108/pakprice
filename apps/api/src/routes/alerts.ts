import { Router } from 'express';
import { alertController } from '../controllers/alertController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', alertController.getAlerts);
router.post('/', alertController.createAlert);
router.patch('/:id', alertController.updateAlert);
router.delete('/:id', alertController.deleteAlert);

export default router;
