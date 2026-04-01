import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'

admin.initializeApp()

// Game tick — runs every 60 seconds
// Full implementation added in Milestone 3
export const gameTick = onSchedule('every 1 minutes', async () => {
  // TODO: Milestone 3 — implement full game tick logic here
  logger.info('Game tick fired — placeholder')
})
