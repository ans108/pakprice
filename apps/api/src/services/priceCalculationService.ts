import type { FinalPriceBreakdown } from '@pakprice/shared';

interface CalculatePriceParams {
  basePrice: number;
  shippingFee?: number;
  allowStacking?: boolean;
  coupon?: {
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    min_order: number | null;
    max_discount: number | null;
    code: string;
    description?: string | null;
  } | null;
  bankOffer?: {
    discount_percent: number | null;
    cashback_percent: number | null;
    min_purchase: number | null;
    max_discount: number | null;
    bank_name: string;
    card_type?: string | null;
  } | null;
}

export class PriceCalculationService {
  /**
   * Authoritative calculation of final estimated price.
   * Differentiates guaranteed price (basePrice + shippingFee) from conditional offers.
   * By default, coupons and bank offers do NOT stack unless allowStacking === true.
   */
  calculateFinalPrice(params: CalculatePriceParams): FinalPriceBreakdown {
    const { basePrice, shippingFee = 0, allowStacking = false, coupon, bankOffer } = params;
    const guaranteedPrice = Math.round(basePrice + shippingFee);

    const availableOffers: FinalPriceBreakdown['availableOffers'] = [];

    let potentialCouponDiscount = 0;
    let potentialBankDiscount = 0;

    // 1. Evaluate Coupon
    if (coupon) {
      const meetsMinOrder = !coupon.min_order || basePrice >= coupon.min_order;
      if (meetsMinOrder) {
        if (coupon.discount_type === 'percent') {
          potentialCouponDiscount = (basePrice * coupon.discount_value) / 100;
          if (coupon.max_discount && potentialCouponDiscount > coupon.max_discount) {
            potentialCouponDiscount = coupon.max_discount;
          }
        } else {
          potentialCouponDiscount = coupon.discount_value;
        }
        potentialCouponDiscount = Math.min(potentialCouponDiscount, basePrice);
      }

      availableOffers.push({
        type: 'coupon',
        title: `Coupon: ${coupon.code}`,
        code: coupon.code,
        discountAmount: Math.round(potentialCouponDiscount),
        condition: coupon.min_order ? `Min. order Rs. ${coupon.min_order.toLocaleString()}` : undefined,
        isApplied: false,
      });
    }

    // 2. Evaluate Bank Offer
    if (bankOffer && bankOffer.discount_percent) {
      const meetsMinPurchase = !bankOffer.min_purchase || basePrice >= bankOffer.min_purchase;
      if (meetsMinPurchase) {
        potentialBankDiscount = (basePrice * bankOffer.discount_percent) / 100;
        if (bankOffer.max_discount && potentialBankDiscount > bankOffer.max_discount) {
          potentialBankDiscount = bankOffer.max_discount;
        }
        potentialBankDiscount = Math.min(potentialBankDiscount, basePrice);
      }

      availableOffers.push({
        type: 'bank_offer',
        title: `${bankOffer.bank_name}${bankOffer.card_type ? ` (${bankOffer.card_type})` : ''} Card Offer`,
        discountAmount: Math.round(potentialBankDiscount),
        condition: bankOffer.min_purchase ? `Min. spend Rs. ${bankOffer.min_purchase.toLocaleString()}` : undefined,
        isApplied: false,
      });
    }

    let couponDiscount = 0;
    let bankDiscount = 0;
    let appliedCoupon: string | null = null;
    let appliedBankOffer: string | null = null;

    if (allowStacking) {
      // Stacking permitted by offer rules
      if (potentialCouponDiscount > 0) {
        couponDiscount = potentialCouponDiscount;
        appliedCoupon = coupon!.code;
      }
      const priceAfterCoupon = Math.max(0, basePrice - couponDiscount);
      if (potentialBankDiscount > 0) {
        bankDiscount = Math.min(potentialBankDiscount, priceAfterCoupon);
        appliedBankOffer = bankOffer!.bank_name;
      }
    } else {
      // No stacking: apply the best single discount to maximize customer saving
      if (potentialCouponDiscount >= potentialBankDiscount && potentialCouponDiscount > 0) {
        couponDiscount = potentialCouponDiscount;
        appliedCoupon = coupon!.code;
      } else if (potentialBankDiscount > 0) {
        bankDiscount = potentialBankDiscount;
        appliedBankOffer = bankOffer!.bank_name;
      }
    }

    // Update isApplied flags on availableOffers
    for (const offer of availableOffers) {
      if (offer.type === 'coupon' && appliedCoupon && offer.code === appliedCoupon) {
        offer.isApplied = true;
      } else if (offer.type === 'bank_offer' && appliedBankOffer && offer.title.includes(appliedBankOffer)) {
        offer.isApplied = true;
      }
    }

    const totalDiscount = couponDiscount + bankDiscount;
    const finalPrice = Math.max(0, Math.round(basePrice + shippingFee - totalDiscount));
    const isEstimated = totalDiscount > 0;

    return {
      basePrice,
      shippingFee,
      guaranteedPrice,
      couponDiscount: Math.round(couponDiscount),
      bankDiscount: Math.round(bankDiscount),
      finalPrice,
      isEstimated,
      appliedCoupon,
      appliedBankOffer,
      availableOffers,
    };
  }
}

export const priceCalculationService = new PriceCalculationService();
