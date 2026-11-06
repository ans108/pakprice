import { Router } from 'express';
import { searchHistoryController } from '../controllers/searchHistoryController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', searchHistoryController.getHistory);
router.post('/', searchHistoryController.addHistory);
router.delete('/:id', searchHistoryController.deleteHistoryItem);
router.delete('/', searchHistoryController.clearAllHistory);

export default router;
