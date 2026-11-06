import { Router } from 'express';
import { bankOfferController } from '../controllers/bankOfferController';

const router = Router();

// Bank offers are public
router.get('/', bankOfferController.getOffers);

export default router;
