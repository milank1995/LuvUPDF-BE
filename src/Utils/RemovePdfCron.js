import cron from 'node-cron';
import { cleanupExpiredFiles } from './Gridfs.js';

export const initCronJobs = () => {
    cron.schedule('*/5 * * * *', async () => {
        try {
            const deletedCount = await cleanupExpiredFiles();
            
            if (deletedCount > 0) {
                console.log(`Cleaned up ${deletedCount} expired file(s)`);
            }
        } catch (error) {
            console.error('Cron job error:', error.message);
        }
    });    
};
