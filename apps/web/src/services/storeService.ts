import apiClient from '@/lib/axios';
import type { Store, ApiSuccessResponse } from '@/types';

export const storeService = {
  /**
   * Fetch all active stores from the PakPrice API.
   * Returns empty array if the API is not reachable or DB is not configured.
   */
  async getStores(): Promise<Store[]> {
    try {
      const response = await apiClient.get<ApiSuccessResponse<Store[]>>('/api/v1/stores');
      return response.data.data;
    } catch {
      // In Phase 1 the API might not be running or DB unconfigured —
      // return empty array rather than crashing the page.
      return [];
    }
  },
};
