import { stopAllPollers } from './poll';
import { forgetDetails, forgetLabels } from './membershipDto';
import { resetIdentity } from './membershipIdentity';
import { resetSchedulingCaches } from './classSupport';
import { forgetTenants } from './pkgTenant';

/**
 * Everything the API repos cache in memory about the signed-in person: id translation, `/me`, tenant and
 * label lookups, id-to-gym registries, plus every running poller. Called on sign-out next to
 * `resetSharedWatches()` so the next account on the device never sees (or polls as) the previous one.
 */
export function resetApiState(): void {
  stopAllPollers();
  resetIdentity();
  forgetDetails();
  forgetLabels();
  forgetTenants();
  resetSchedulingCaches();
}
