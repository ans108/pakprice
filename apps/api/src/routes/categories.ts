import { Router } from 'express';
import { categoriesController } from '../controllers/categoriesController';

const router = Router();

// GET /api/v1/categories
router.get('/', categoriesController.list);

export default router;
