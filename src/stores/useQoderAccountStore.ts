import {
  QoderAccount,
  getQoderAccountDisplayEmail,
  getQoderPlanBadge,
  getQoderUsage,
} from '../types/qoder';
import * as qoderService from '../services/qoderService';
import { createProviderAccountStore } from './createProviderAccountStore';

const QODER_ACCOUNTS_CACHE_KEY = 'agtools.qoder.accounts.cache';

export const useQoderAccountStore = createProviderAccountStore<QoderAccount>(
  QODER_ACCOUNTS_CACHE_KEY,
  {
    listAccounts: qoderService.listQoderAccounts,
    deleteAccount: qoderService.deleteQoderAccount,
    deleteAccounts: qoderService.deleteQoderAccounts,
    injectAccount: qoderService.injectQoderAccount,
    refreshToken: qoderService.refreshQoderToken,
    refreshAllTokens: qoderService.refreshAllQoderTokens,
    importFromJson: qoderService.importQoderFromJson,
    exportAccounts: qoderService.exportQoderAccounts,
    updateAccountTags: qoderService.updateQoderAccountTags,
  },
  {
    getDisplayEmail: getQoderAccountDisplayEmail,
    getPlanBadge: getQoderPlanBadge,
    getUsage: getQoderUsage,
  },
);
