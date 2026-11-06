import { Router } from 'express';
import { favoriteController } from '../controllers/favoriteController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', favoriteController.getFavorites);
router.post('/', favoriteController.addFavorite);
router.delete('/:variantId', favoriteController.removeFavorite);

export default router;
