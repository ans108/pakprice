import { Router } from 'express';
import { couponController } from '../controllers/couponController';

const router = Router();

// Coupons are public
router.get('/', couponController.getCoupons);

export default router;
