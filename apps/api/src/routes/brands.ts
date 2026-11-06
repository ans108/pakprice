import { Router } from 'express';
import { brandsController } from '../controllers/brandsController';

const router = Router();

// GET /api/v1/brands
router.get('/', brandsController.list);

export default router;
