/**
 * Project: My Race Engineer
 * File: tools/liverc-sync-clubs.ts
 * Summary: CLI entry point that runs the LiveRC club catalogue sync service.
 */

import { liveRcClubCatalogueService } from '../src/dependencies/liverc';
import { applicationLogger } from '../src/dependencies/logger';

const main = async () => {
  applicationLogger.info('Starting LiveRC club sync tool run.', {
    event: 'tools.liverc.sync_clubs.start',
  });

  try {
    const result = await liveRcClubCatalogueService.syncCatalogue();
    applicationLogger.info('LiveRC club sync completed successfully.', {
      event: 'tools.liverc.sync_clubs.complete',
      outcome: 'success',
      ...result,
    });
  } catch (error) {
    // Bubble up the failure via logs and a non-zero exit code so schedulers can
    // alert on missed catalogue refreshes.
    applicationLogger.error('LiveRC club sync failed.', {
      event: 'tools.liverc.sync_clubs.error',
      outcome: 'failure',
      error,
    });
    process.exitCode = 1;
  }
};

void main();
