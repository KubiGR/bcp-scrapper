import { RulesStatusSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../api/client';

export const rulesQuery = queryOptions({
  queryKey: ['rules'],
  queryFn: () => apiGet('/api/rules', RulesStatusSchema),
});

/** Checks 39k.pro now (admins, when logins are on). */
export const refreshRules = () => apiPost('/api/rules/refresh', {}, RulesStatusSchema);
