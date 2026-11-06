import { Router } from 'express';
import { storesController } from '../controllers/storesController';

const router = Router();

router.get('/', storesController.list);

export default router;
