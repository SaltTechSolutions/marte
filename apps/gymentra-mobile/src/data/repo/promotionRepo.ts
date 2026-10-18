import * as api from '../api/promotionRepo';
import * as fb from '../firebase/promotionRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const createPromotion = impl.createPromotion;
export const updatePromotion = impl.updatePromotion;
export const setPromotionActive = impl.setPromotionActive;
export const getPromotion = impl.getPromotion;
export const watchPromotionsForTenant = impl.watchPromotionsForTenant;
export const isPromotionUsable = impl.isPromotionUsable;
export type { PromotionDraft } from '../firebase/promotionRepo';
