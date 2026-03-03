import cron from 'node-cron';
import { cleanupOrphanChunks } from './Gridfs.js';

export const initCronJobs = () => {
    cron.schedule('* * * * *', async () => {
        try {
            const deletedCount = await cleanupOrphanChunks();
            
            if (deletedCount > 0) {
                console.log(`Cleaned up ${deletedCount} data`);
            }
        } catch (error) {
            console.error('Cron job error:', error.message);
        }
    });    
};
